(() => {
  const TOKEN_KEY = 'nexusGoogleAccessToken';
  const GOOGLE_ADDRESS_KEY = 'nexusGoogleAddress';
  const GOOGLE_SCRIPT = 'https://accounts.google.com/gsi/client';
  const AUTH_CONFIG_URL = '/api/auth/config';
  const GOOGLE_AUTH_URL = '/api/auth/google';
  const ME_URL = '/api/me';
  const INITIAL_REG_URL = '/api/registrations/initial';
  const STAFF_ROUTES = new Set(['home', 'attendance', 'application', 'mypage']);
  const LEGACY_EMPLOYEE_KEYS = ['nexusEmployeeId', 'nexusCurrentEmployeeId', 'employeeId'];

  let authContext = null;
  let authPromise = null;
  let googlePromise = null;
  let authConfigPromise = null;
  let tokenClient = null;
  let guarding = false;

  function safeGet(storage, key) {
    try { return storage.getItem(key) || ''; } catch (_) { return ''; }
  }

  function safeSet(storage, key, value) {
    try {
      if (value) storage.setItem(key, value);
      else storage.removeItem(key);
    } catch (_) {}
  }

  function clearLegacyEmployeeState() {
    LEGACY_EMPLOYEE_KEYS.forEach(key => {
      safeSet(sessionStorage, key, '');
      safeSet(localStorage, key, '');
    });
    ['nexusMobileInitialData', 'nexusMobileInitialDataAt', 'nexusHomeLoaded', 'nexusHomeData', 'nexusAttendanceData', 'nexusApplicationData', 'nexusMyPageData', 'nexusGasApiUrl']
      .forEach(key => {
        safeSet(sessionStorage, key, '');
        safeSet(localStorage, key, '');
      });
  }

  function clearAuth() {
    safeSet(sessionStorage, TOKEN_KEY, '');
    safeSet(sessionStorage, GOOGLE_ADDRESS_KEY, '');
    authContext = null;
    authPromise = null;
    clearLegacyEmployeeState();
  }

  function currentRoute() {
    return (location.hash || '').replace(/^#/, '') || 'entry';
  }

  function replaceRoute(route) {
    const hash = `#${route}`;
    if (location.hash === hash) {
      if (window.NEXUS?.navigate) window.NEXUS.navigate(route);
      return;
    }
    history.replaceState(null, '', `${location.pathname}${location.search}${hash}`);
    if (window.NEXUS?.navigate) window.NEXUS.navigate(route);
    else window.dispatchEvent(new HashChangeEvent('hashchange'));
  }

  function resolveState(ctx) {
    if (!ctx?.authenticated) return 'unauthenticated';
    if (ctx.authState === 'approved') return 'approved';
    if (ctx.authState === 'pending') return 'pending';
    return 'unregistered';
  }

  async function fetchMe(force = false) {
    const token = safeGet(sessionStorage, TOKEN_KEY);
    if (!token) {
      authContext = null;
      return null;
    }
    if (!force && authContext) return authContext;
    if (!force && authPromise) return authPromise;

    authPromise = (async () => {
      const response = await fetch(ME_URL, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) {
        clearAuth();
        return null;
      }
      if (!response.ok || !data.ok) throw new Error(data.error || 'ユーザー情報を取得できませんでした。');
      authContext = data;
      return data;
    })().finally(() => { authPromise = null; });

    return authPromise;
  }

  async function guardRoute() {
    if (guarding) return;
    guarding = true;
    try {
      const requested = currentRoute();
      const token = safeGet(sessionStorage, TOKEN_KEY);

      if (!token) {
        if (requested !== 'login') replaceRoute('login');
        return;
      }

      let ctx;
      try {
        ctx = await fetchMe();
      } catch (error) {
        console.error('[NEXUS auth context]', error);
        clearAuth();
        replaceRoute('login');
        return;
      }

      const state = resolveState(ctx);
      if (state === 'unauthenticated') {
        replaceRoute('login');
        return;
      }

      if (state === 'approved') {
        if (requested === 'entry' || requested === 'login' || requested === 'setup') replaceRoute('home');
        return;
      }

      if (requested !== 'setup') replaceRoute('setup');
    } finally {
      guarding = false;
      setTimeout(scanFrames, 0);
    }
  }

  function setFrameStatus(doc, message, type = '') {
    try {
      const el = doc?.getElementById('statusText');
      if (!el) return;
      el.textContent = message || '';
      if (type) el.dataset.status = type;
    } catch (_) {}
  }

  function ensureGoogle() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    if (googlePromise) return googlePromise;
    googlePromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${GOOGLE_SCRIPT}"]`);
      if (existing) {
        if (window.google?.accounts?.oauth2) return resolve();
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
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

  function getAuthConfig() {
    if (!authConfigPromise) {
      authConfigPromise = fetch(AUTH_CONFIG_URL, { cache: 'no-store' })
        .then(async response => {
          const data = await response.json();
          if (!response.ok || !data.ok) throw new Error(data.error || 'Google認証設定を取得できませんでした。');
          return data;
        });
    }
    return authConfigPromise;
  }

  function rememberGoogleProfile(data) {
    const google = data?.google || {};
    if (google.email) {
      safeSet(sessionStorage, 'nexusUserEmail', google.email);
      safeSet(localStorage, 'nexusUserEmail', google.email);
    }
    if (google.name) {
      safeSet(sessionStorage, 'nexusUserName', google.name);
      safeSet(localStorage, 'nexusUserName', google.name);
    }
    if (google.address) safeSet(sessionStorage, GOOGLE_ADDRESS_KEY, JSON.stringify(google.address));
    else safeSet(sessionStorage, GOOGLE_ADDRESS_KEY, '');
  }

  async function finishGoogleLogin(doc, accessToken) {
    setFrameStatus(doc, 'Googleアカウントを確認しています。');
    const response = await fetch(GOOGLE_AUTH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ access_token: accessToken })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || 'Google認証に失敗しました。');

    clearLegacyEmployeeState();
    safeSet(sessionStorage, TOKEN_KEY, accessToken);
    rememberGoogleProfile(data);
    authContext = null;
    await fetchMe(true);
    await guardRoute();
  }

  async function startGoogleLogin(doc) {
    try {
      setFrameStatus(doc, 'Googleログインを準備しています。');
      const [config] = await Promise.all([getAuthConfig(), ensureGoogle()]);
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: config.clientId,
        scope: config.scope,
        include_granted_scopes: true,
        prompt: 'consent',
        callback: async response => {
          try {
            if (response.error) throw new Error(response.error_description || response.error);
            await finishGoogleLogin(doc, response.access_token);
          } catch (error) {
            console.error('[NEXUS Google login]', error);
            setFrameStatus(doc, error.message || 'Googleログインに失敗しました。', 'error');
          }
        }
      });
      tokenClient.requestAccessToken({ prompt: 'consent' });
    } catch (error) {
      console.error('[NEXUS Google login start]', error);
      setFrameStatus(doc, error.message || 'Googleログインを開始できませんでした。', 'error');
    }
  }

  function bindLoginFrame(doc) {
    const googleBtn = doc?.getElementById('googleBtn');
    if (!googleBtn || googleBtn.dataset.nexusD1AuthBound === '1') return;

    const fresh = googleBtn.cloneNode(true);
    fresh.dataset.nexusD1AuthBound = '1';
    googleBtn.replaceWith(fresh);
    fresh.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      startGoogleLogin(doc);
    }, true);

    ['loginBtn', 'emailBtn'].forEach(id => {
      const el = doc.getElementById(id);
      if (el) el.style.display = 'none';
    });
    const emailInput = doc.getElementById('emailInput');
    if (emailInput) {
      const row = emailInput.closest('.row, .field, .form-group, label, div');
      if (row) row.style.display = 'none';
      else emailInput.style.display = 'none';
    }
  }

  function officialCompanyOptions(doc) {
    const companyValue = doc.getElementById('companyValue');
    if (companyValue && !companyValue.dataset.id) companyValue.dataset.id = 'HRC';
    if (companyValue?.dataset.id === 'ITC') companyValue.dataset.id = 'GANBARU';
    if (companyValue?.dataset.id === 'HRC') companyValue.textContent = 'HR COMPANY株式会社';
    if (companyValue?.dataset.id === 'GANBARU') companyValue.textContent = '株式会社がんばる';

    const trigger = doc.querySelector('[data-sheet="company"]');
    if (!trigger || trigger.dataset.nexusCompanyBound === '1') return;
    trigger.dataset.nexusCompanyBound = '1';
    trigger.addEventListener('click', () => {
      setTimeout(() => {
        const options = [...doc.querySelectorAll('#sheetOptions .option')];
        if (options.length < 2) return;
        const values = [
          { id: 'HRC', label: 'HR COMPANY株式会社' },
          { id: 'GANBARU', label: '株式会社がんばる' }
        ];
        options.slice(0, 2).forEach((option, index) => {
          const value = values[index];
          option.textContent = value.label;
          option.onclick = () => {
            const target = doc.getElementById('companyValue');
            if (target) {
              target.textContent = value.label;
              target.dataset.id = value.id;
            }
            doc.getElementById('sheet')?.classList.remove('show');
            doc.getElementById('sheetBackdrop')?.classList.remove('show');
          };
        });
        options.slice(2).forEach(option => option.remove());
      }, 0);
    }, true);
  }

  function makeAddressField(doc, id, label, placeholder, autocomplete) {
    const row = doc.createElement('div');
    row.className = 'row nexus-address-row';
    row.innerHTML = `<div class="row-icon"></div><div class="meta"><div class="label">${label}</div><input class="text-input" id="${id}" type="text" autocomplete="${autocomplete}" placeholder="${placeholder}"></div>`;
    return row;
  }

  function ensureAddressFields(doc) {
    if (doc.getElementById('postalCodeInput')) return;
    const emailInput = doc.getElementById('emailInput');
    const emailRow = emailInput?.closest('.row');
    if (!emailRow) return;

    const fragment = doc.createDocumentFragment();
    fragment.appendChild(makeAddressField(doc, 'postalCodeInput', '郵便番号', '123-4567', 'postal-code'));
    fragment.appendChild(makeAddressField(doc, 'prefectureInput', '都道府県', '神奈川県', 'address-level1'));
    fragment.appendChild(makeAddressField(doc, 'cityAddressInput', '市区町村', '横浜市戸塚区', 'address-level2'));
    fragment.appendChild(makeAddressField(doc, 'streetAddressInput', '番地', '戸塚町1-2-3', 'address-line1'));
    fragment.appendChild(makeAddressField(doc, 'buildingInput', '建物名・部屋番号', 'NEXUSレジデンス101', 'address-line2'));
    emailRow.after(fragment);

    try {
      const address = JSON.parse(safeGet(sessionStorage, GOOGLE_ADDRESS_KEY) || 'null');
      if (!address) return;
      const values = {
        postalCodeInput: address.postalCode,
        prefectureInput: address.prefecture,
        cityAddressInput: address.cityAddress,
        streetAddressInput: address.streetAddress,
        buildingInput: address.building
      };
      Object.entries(values).forEach(([id, value]) => {
        const input = doc.getElementById(id);
        if (input && value) input.value = value;
      });
    } catch (_) {}
  }

  function renderSetupState(doc) {
    const state = resolveState(authContext);
    const nameInput = doc.getElementById('nameInput');
    const emailInput = doc.getElementById('emailInput');
    const google = authContext?.google || {};
    if (nameInput && !nameInput.value) nameInput.value = google.name || safeGet(sessionStorage, 'nexusUserName');
    if (emailInput) {
      emailInput.value = google.email || safeGet(sessionStorage, 'nexusUserEmail');
      emailInput.readOnly = true;
    }

    if (state === 'pending') {
      setFrameStatus(doc, '初回登録は承認待ちです。承認後にスタッフ画面を利用できます。', 'warning');
      const submit = doc.getElementById('submitBtn');
      if (submit) submit.style.display = 'none';
      doc.getElementById('done')?.classList.add('show');
    }
  }

  async function submitInitialRegistration(doc, event) {
    event.preventDefault();
    event.stopImmediatePropagation();

    const token = safeGet(sessionStorage, TOKEN_KEY);
    if (!token) {
      clearAuth();
      replaceRoute('login');
      return;
    }

    const name = doc.getElementById('nameInput')?.value.trim() || '';
    const company = doc.getElementById('companyValue');
    const workTypeEl = doc.getElementById('workTypeValue');
    const pattern = doc.getElementById('patternValue');
    const workType = workTypeEl?.dataset.type || workTypeEl?.textContent.trim() || '固定勤務';
    const payload = {
      name,
      companyId: company?.dataset.id || '',
      workType,
      baseWorkPatternId: workType === 'シフト勤務' ? '' : (pattern?.dataset.id || ''),
      postalCode: doc.getElementById('postalCodeInput')?.value.trim() || '',
      prefecture: doc.getElementById('prefectureInput')?.value.trim() || '',
      cityAddress: doc.getElementById('cityAddressInput')?.value.trim() || '',
      streetAddress: doc.getElementById('streetAddressInput')?.value.trim() || '',
      building: doc.getElementById('buildingInput')?.value.trim() || ''
    };

    if (!payload.name) return setFrameStatus(doc, '氏名を入力してください。', 'warning');
    if (!['HRC', 'GANBARU'].includes(payload.companyId)) return setFrameStatus(doc, '所属会社を選択してください。', 'warning');
    if (!payload.prefecture || !payload.cityAddress || !payload.streetAddress) return setFrameStatus(doc, '現住所を入力してください。', 'warning');

    const btn = doc.getElementById('submitBtn');
    if (btn) btn.disabled = true;
    setFrameStatus(doc, '登録申請を送信しています。');

    try {
      const response = await fetch(INITIAL_REG_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || '登録申請に失敗しました。');
      authContext = null;
      await fetchMe(true);
      setFrameStatus(doc, '登録申請を受け付けました。承認までお待ちください。', 'success');
      doc.getElementById('done')?.classList.add('show');
      if (btn) btn.style.display = 'none';
      await guardRoute();
    } catch (error) {
      console.error('[NEXUS initial registration]', error);
      if (btn) btn.disabled = false;
      setFrameStatus(doc, error.message || '登録申請に失敗しました。', 'error');
    }
  }

  function bindSetupFrame(doc) {
    if (!doc || doc.documentElement.dataset.nexusD1SetupBound === '1') {
      renderSetupState(doc);
      return;
    }
    doc.documentElement.dataset.nexusD1SetupBound = '1';
    officialCompanyOptions(doc);
    ensureAddressFields(doc);
    renderSetupState(doc);

    const submit = doc.getElementById('submitBtn');
    if (submit) {
      const fresh = submit.cloneNode(true);
      submit.replaceWith(fresh);
      fresh.addEventListener('click', event => submitInitialRegistration(doc, event), true);
    }
  }

  function bindStaffFrame(doc) {
    if (!doc || doc.documentElement.dataset.nexusD1StaffBound === '1') return;
    doc.documentElement.dataset.nexusD1StaffBound = '1';
    const ctx = authContext;
    if (resolveState(ctx) !== 'approved') return;
    const employee = ctx.currentEmployee || null;
    if (!employee) return;

    const nameTargets = ['userName', 'employeeName', 'profileName'];
    nameTargets.forEach(id => {
      const el = doc.getElementById(id);
      if (el) el.textContent = employee.official_name || ctx.google?.name || '';
    });

    const companyTargets = ['companyName', 'companyValue', 'profileCompany'];
    companyTargets.forEach(id => {
      const el = doc.getElementById(id);
      if (el) el.textContent = employee.company_name || '';
    });
  }

  function bindFrame(frame) {
    try {
      const doc = frame.contentDocument;
      if (!doc) return;
      const key = frame.contentWindow?.__NEXUS_VIEW_KEY || '';
      if (key === 'login' || doc.getElementById('googleBtn')) bindLoginFrame(doc);
      if (key === 'setup' || (doc.getElementById('submitBtn') && doc.getElementById('nameInput'))) bindSetupFrame(doc);
      if (STAFF_ROUTES.has(key)) bindStaffFrame(doc);
    } catch (_) {}
  }

  function scanFrames() {
    document.querySelectorAll('#nexus-root iframe').forEach(frame => {
      if (!frame.dataset.nexusD1Listener) {
        frame.dataset.nexusD1Listener = '1';
        frame.addEventListener('load', () => setTimeout(() => bindFrame(frame), 0));
      }
      bindFrame(frame);
    });
  }

  async function boot() {
    clearLegacyEmployeeState();
    scanFrames();
    await guardRoute();
  }

  window.NEXUS_AUTH = {
    get context() { return authContext; },
    refresh: () => fetchMe(true),
    guard: guardRoute,
    logout() {
      clearAuth();
      replaceRoute('login');
    }
  };

  new MutationObserver(scanFrames).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('DOMContentLoaded', boot, { once: true });
  window.addEventListener('hashchange', () => { guardRoute(); });
  window.addEventListener('pageshow', () => { guardRoute(); });
  scanFrames();
  boot();
})();
