(() => {
  const TOKEN_KEY = 'nexusGoogleAccessToken';
  const ADDRESS_KEY = 'nexusGoogleAddress';
  const GOOGLE_SCRIPT = 'https://accounts.google.com/gsi/client';
  const AUTH_CONFIG_URL = '/api/auth/config';
  const GOOGLE_AUTH_URL = '/api/auth/google';
  const ME_URL = '/api/me';
  const INITIAL_REG_URL = '/api/registrations/initial';
  const STAFF_HOME_URL = '/api/staff/home';
  const STAFF_ROUTES = new Set(['home', 'attendance', 'application', 'mypage']);
  const EMPLOYEE_KEYS = ['nexusEmployeeId', 'nexusCurrentEmployeeId', 'employeeId'];

  let context = null;
  let contextPromise = null;
  let googlePromise = null;
  let configPromise = null;
  let guarding = false;

  const get = (storage, key) => {
    try { return storage.getItem(key) || ''; } catch (_) { return ''; }
  };
  const set = (storage, key, value) => {
    try { value ? storage.setItem(key, value) : storage.removeItem(key); } catch (_) {}
  };

  function clearEmployeeCompatibility() {
    EMPLOYEE_KEYS.forEach(key => {
      set(sessionStorage, key, '');
      set(localStorage, key, '');
    });
  }

  function disableLegacyGas() {
    try { localStorage.setItem('nexusGasApiUrl', 'about:blank'); } catch (_) {}
    ['nexusMobileInitialData', 'nexusMobileInitialDataAt', 'nexusHomeLoaded', 'nexusHomeData', 'nexusAttendanceData', 'nexusApplicationData', 'nexusMyPageData']
      .forEach(key => {
        set(sessionStorage, key, '');
        set(localStorage, key, '');
      });
  }

  function syncCompatibilityEmployee() {
    clearEmployeeCompatibility();
    if (context?.authState === 'approved' && context.currentEmployee?.employee_id) {
      set(sessionStorage, 'nexusEmployeeId', context.currentEmployee.employee_id);
    }
  }

  function clearAuth() {
    set(sessionStorage, TOKEN_KEY, '');
    set(sessionStorage, ADDRESS_KEY, '');
    context = null;
    contextPromise = null;
    clearEmployeeCompatibility();
  }

  function route() {
    return (location.hash || '').replace(/^#/, '') || 'entry';
  }

  function go(target) {
    const hash = `#${target}`;
    if (location.hash !== hash) history.replaceState(null, '', `${location.pathname}${location.search}${hash}`);
    if (window.NEXUS?.navigate) window.NEXUS.navigate(target);
    else window.dispatchEvent(new HashChangeEvent('hashchange'));
  }

  async function me(force = false) {
    const token = get(sessionStorage, TOKEN_KEY);
    if (!token) return null;
    if (!force && context) return context;
    if (!force && contextPromise) return contextPromise;

    contextPromise = (async () => {
      const response = await fetch(ME_URL, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) {
        clearAuth();
        return null;
      }
      if (!response.ok || !data.ok) throw new Error(data.error || 'ユーザー情報を取得できませんでした。');
      context = data;
      syncCompatibilityEmployee();
      return data;
    })().finally(() => { contextPromise = null; });

    return contextPromise;
  }

  async function guard() {
    if (guarding) return;
    guarding = true;
    try {
      const requested = route();
      if (!get(sessionStorage, TOKEN_KEY)) {
        clearEmployeeCompatibility();
        if (requested !== 'login') go('login');
        return;
      }

      let ctx;
      try { ctx = await me(); }
      catch (error) {
        console.error('[NEXUS auth]', error);
        clearAuth();
        go('login');
        return;
      }

      if (!ctx) {
        go('login');
        return;
      }

      if (ctx.authState === 'approved') {
        syncCompatibilityEmployee();
        if (requested === 'entry' || requested === 'login' || requested === 'setup') go('home');
        return;
      }

      clearEmployeeCompatibility();
      if (requested !== 'setup') go('setup');
    } finally {
      guarding = false;
      setTimeout(scan, 0);
    }
  }

  function status(doc, message) {
    const el = doc?.getElementById('statusText');
    if (el) el.textContent = message || '';
  }

  function ensureGoogle() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    if (googlePromise) return googlePromise;
    googlePromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GOOGLE_SCRIPT;
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return googlePromise;
  }

  function config() {
    if (!configPromise) {
      configPromise = fetch(AUTH_CONFIG_URL, { cache: 'no-store' }).then(async response => {
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || 'Google認証設定を取得できませんでした。');
        return data;
      });
    }
    return configPromise;
  }

  function rememberGoogle(data) {
    const google = data?.google || {};
    if (google.email) {
      set(sessionStorage, 'nexusUserEmail', google.email);
      set(localStorage, 'nexusUserEmail', google.email);
    }
    if (google.name) {
      set(sessionStorage, 'nexusUserName', google.name);
      set(localStorage, 'nexusUserName', google.name);
    }
    if (google.address) set(sessionStorage, ADDRESS_KEY, JSON.stringify(google.address));
  }

  async function googleLogin(doc) {
    try {
      status(doc, 'Googleログインを準備しています。');
      const [cfg] = await Promise.all([config(), ensureGoogle()]);
      const client = google.accounts.oauth2.initTokenClient({
        client_id: cfg.clientId,
        scope: cfg.scope,
        include_granted_scopes: true,
        prompt: 'consent',
        callback: async result => {
          try {
            if (result.error) throw new Error(result.error_description || result.error);
            status(doc, 'Googleアカウントを確認しています。');
            const response = await fetch(GOOGLE_AUTH_URL, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ access_token: result.access_token })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.ok) throw new Error(data.error || 'Google認証に失敗しました。');
            clearEmployeeCompatibility();
            set(sessionStorage, TOKEN_KEY, result.access_token);
            rememberGoogle(data);
            context = null;
            await me(true);
            await guard();
          } catch (error) {
            console.error('[NEXUS Google login]', error);
            status(doc, error.message || 'Googleログインに失敗しました。');
          }
        }
      });
      client.requestAccessToken({ prompt: 'consent' });
    } catch (error) {
      console.error('[NEXUS Google login start]', error);
      status(doc, error.message || 'Googleログインを開始できませんでした。');
    }
  }

  function bindLogin(doc) {
    const button = doc?.getElementById('googleBtn');
    if (!button || button.dataset.nexusD1 === '1') return;
    const fresh = button.cloneNode(true);
    fresh.dataset.nexusD1 = '1';
    button.replaceWith(fresh);
    fresh.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      googleLogin(doc);
    }, true);
    ['loginBtn', 'emailBtn'].forEach(id => {
      const el = doc.getElementById(id);
      if (el) el.style.display = 'none';
    });
    const email = doc.getElementById('emailInput');
    if (email) {
      const holder = email.closest('.row, .field, .form-group, label');
      if (holder) holder.style.display = 'none';
      else email.style.display = 'none';
    }
  }

  function ensureAddressFields(doc) {
    if (doc.getElementById('postalCodeInput')) return;
    const emailRow = doc.getElementById('emailInput')?.closest('.row');
    if (!emailRow) return;
    const fields = [
      ['postalCodeInput', '郵便番号', '123-4567', 'postal-code'],
      ['prefectureInput', '都道府県', '神奈川県', 'address-level1'],
      ['cityAddressInput', '市区町村', '横浜市戸塚区', 'address-level2'],
      ['streetAddressInput', '番地', '戸塚町1-2-3', 'address-line1'],
      ['buildingInput', '建物名・部屋番号', 'NEXUSレジデンス101', 'address-line2']
    ];
    let anchor = emailRow;
    fields.forEach(([id, label, placeholder, autocomplete]) => {
      const row = doc.createElement('div');
      row.className = 'row';
      row.innerHTML = `<div class="row-icon"></div><div class="meta"><div class="label">${label}</div><input class="text-input" id="${id}" type="text" autocomplete="${autocomplete}" placeholder="${placeholder}"></div>`;
      anchor.after(row);
      anchor = row;
    });
    try {
      const address = JSON.parse(get(sessionStorage, ADDRESS_KEY) || 'null');
      if (!address) return;
      const map = {
        postalCodeInput: address.postalCode,
        prefectureInput: address.prefecture,
        cityAddressInput: address.cityAddress,
        streetAddressInput: address.streetAddress,
        buildingInput: address.building
      };
      Object.entries(map).forEach(([id, value]) => {
        const input = doc.getElementById(id);
        if (input && value) input.value = value;
      });
    } catch (_) {}
  }

  function bindCompanies(doc) {
    const value = doc.getElementById('companyValue');
    if (value) {
      if (value.dataset.id === 'ITC') value.dataset.id = 'GANBARU';
      if (!value.dataset.id) value.dataset.id = 'HRC';
      value.textContent = value.dataset.id === 'GANBARU' ? '株式会社がんばる' : 'HR COMPANY株式会社';
    }
    const trigger = doc.querySelector('[data-sheet="company"]');
    if (!trigger || trigger.dataset.nexusD1 === '1') return;
    trigger.dataset.nexusD1 = '1';
    trigger.addEventListener('click', () => {
      setTimeout(() => {
        const options = [...doc.querySelectorAll('#sheetOptions .option')];
        const companies = [
          ['HRC', 'HR COMPANY株式会社'],
          ['GANBARU', '株式会社がんばる']
        ];
        options.forEach((option, index) => {
          if (index >= 2) return option.remove();
          const [id, label] = companies[index];
          option.textContent = label;
          option.onclick = () => {
            const target = doc.getElementById('companyValue');
            if (target) {
              target.dataset.id = id;
              target.textContent = label;
            }
            doc.getElementById('sheet')?.classList.remove('show');
            doc.getElementById('sheetBackdrop')?.classList.remove('show');
          };
        });
      }, 0);
    }, true);
  }

  function renderSetup(doc) {
    const google = context?.google || {};
    const name = doc.getElementById('nameInput');
    const email = doc.getElementById('emailInput');
    if (name && !name.value) name.value = google.name || get(sessionStorage, 'nexusUserName');
    if (email) {
      email.value = google.email || get(sessionStorage, 'nexusUserEmail');
      email.readOnly = true;
    }
    if (context?.authState === 'pending') {
      status(doc, '登録申請は承認待ちです。承認後にスタッフ画面を利用できます。');
      const submit = doc.getElementById('submitBtn');
      if (submit) submit.style.display = 'none';
      doc.getElementById('done')?.classList.add('show');
    }
  }

  async function submitRegistration(doc, event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const token = get(sessionStorage, TOKEN_KEY);
    if (!token) return go('login');

    const company = doc.getElementById('companyValue');
    const workTypeEl = doc.getElementById('workTypeValue');
    const pattern = doc.getElementById('patternValue');
    const workType = workTypeEl?.dataset.type || workTypeEl?.textContent.trim() || '固定勤務';
    const payload = {
      name: doc.getElementById('nameInput')?.value.trim() || '',
      companyId: company?.dataset.id || '',
      workType,
      baseWorkPatternId: workType === 'シフト勤務' ? '' : (pattern?.dataset.id || ''),
      postalCode: doc.getElementById('postalCodeInput')?.value.trim() || '',
      prefecture: doc.getElementById('prefectureInput')?.value.trim() || '',
      cityAddress: doc.getElementById('cityAddressInput')?.value.trim() || '',
      streetAddress: doc.getElementById('streetAddressInput')?.value.trim() || '',
      building: doc.getElementById('buildingInput')?.value.trim() || ''
    };

    if (!payload.name) return status(doc, '氏名を入力してください。');
    if (!['HRC', 'GANBARU'].includes(payload.companyId)) return status(doc, '所属会社を選択してください。');
    if (!payload.prefecture || !payload.cityAddress || !payload.streetAddress) return status(doc, '現住所を入力してください。');

    const button = doc.getElementById('submitBtn');
    if (button) button.disabled = true;
    status(doc, '登録申請を送信しています。');
    try {
      const response = await fetch(INITIAL_REG_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || '登録申請に失敗しました。');
      context = null;
      await me(true);
      status(doc, '登録申請を受け付けました。承認までお待ちください。');
      doc.getElementById('done')?.classList.add('show');
      if (button) button.style.display = 'none';
      await guard();
    } catch (error) {
      if (button) button.disabled = false;
      status(doc, error.message || '登録申請に失敗しました。');
    }
  }

  function bindSetup(doc) {
    if (!doc || doc.documentElement.dataset.nexusD1Setup === '1') {
      renderSetup(doc);
      return;
    }
    doc.documentElement.dataset.nexusD1Setup = '1';
    ensureAddressFields(doc);
    bindCompanies(doc);
    renderSetup(doc);
    const submit = doc.getElementById('submitBtn');
    if (submit) {
      const fresh = submit.cloneNode(true);
      submit.replaceWith(fresh);
      fresh.addEventListener('click', event => submitRegistration(doc, event), true);
    }
  }

  async function loadHome(doc) {
    const token = get(sessionStorage, TOKEN_KEY);
    if (!token || context?.authState !== 'approved') return;
    try {
      const response = await fetch(STAFF_HOME_URL, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Homeデータを取得できませんでした。');
      const win = doc.defaultView;
      if (typeof win?.applyHomeData === 'function') win.applyHomeData(payload);
      else {
        const employee = payload.data?.employee || {};
        const summary = payload.data?.summary || {};
        const attendance = payload.data?.todayAttendance || {};
        const text = (id, value) => { const el = doc.getElementById(id); if (el) el.textContent = value; };
        text('userName', employee.name || '');
        text('monthlyWorkDays', `${summary.workDays || 0}日`);
        text('monthlyWorkHours', `${summary.workHours || 0}h`);
        text('inSub', attendance.clockInAt || '未打刻');
        text('outSub', attendance.clockOutAt || '未打刻');
      }
      EMPLOYEE_KEYS.forEach(key => set(localStorage, key, ''));
      if (win) win.setApiStatus = () => {};
    } catch (error) {
      console.error('[NEXUS staff home]', error);
      const text = (id, value) => { const el = doc.getElementById(id); if (el) el.textContent = value; };
      text('monthlyWorkDays', '0日');
      text('monthlyWorkHours', '0h');
      text('inSub', '未打刻');
      text('outSub', '未打刻');
    }
  }

  function bindStaff(doc, key) {
    if (!doc || context?.authState !== 'approved') return;
    const employee = context.currentEmployee || {};
    ['userName', 'employeeName', 'profileName'].forEach(id => {
      const el = doc.getElementById(id);
      if (el) el.textContent = employee.official_name || context.google?.name || '';
    });
    ['companyName', 'companyValue', 'profileCompany'].forEach(id => {
      const el = doc.getElementById(id);
      if (el) el.textContent = employee.company_name || '';
    });
    if (key === 'home' && doc.documentElement.dataset.nexusD1Home !== '1') {
      doc.documentElement.dataset.nexusD1Home = '1';
      loadHome(doc);
    }
  }

  function bindFrame(frame) {
    try {
      const doc = frame.contentDocument;
      if (!doc) return;
      const key = frame.contentWindow?.__NEXUS_VIEW_KEY || '';
      if (key === 'login' || doc.getElementById('googleBtn')) bindLogin(doc);
      if (key === 'setup' || (doc.getElementById('nameInput') && doc.getElementById('submitBtn'))) bindSetup(doc);
      if (STAFF_ROUTES.has(key)) bindStaff(doc, key);
    } catch (_) {}
  }

  function scan() {
    document.querySelectorAll('#nexus-root iframe').forEach(frame => {
      if (!frame.dataset.nexusD1Listener) {
        frame.dataset.nexusD1Listener = '1';
        frame.addEventListener('load', () => setTimeout(() => bindFrame(frame), 0));
      }
      bindFrame(frame);
    });
  }

  async function boot() {
    disableLegacyGas();
    clearEmployeeCompatibility();
    scan();
    await guard();
  }

  window.NEXUS_AUTH = {
    get context() { return context; },
    refresh: () => me(true),
    guard,
    logout() { clearAuth(); go('login'); }
  };

  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('DOMContentLoaded', boot, { once: true });
  window.addEventListener('hashchange', guard);
  window.addEventListener('pageshow', guard);
  scan();
  boot();
})();
