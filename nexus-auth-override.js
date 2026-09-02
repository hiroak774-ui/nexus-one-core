(() => {
  const TOKEN_KEY = 'nexusGoogleAccessToken';
  const ADDRESS_KEY = 'nexusGoogleAddress';
  const GOOGLE_SCRIPT = 'https://accounts.google.com/gsi/client';
  let googlePromise;
  let configPromise;
  let tokenClient;

  function setStatus(doc, message) {
    try {
      const el = doc?.getElementById('statusText');
      if (el) el.textContent = message || '';
    } catch (_) {}
  }

  function go(hash) {
    const target = `#${hash}`;
    if (location.hash !== target) location.hash = hash;
    else window.dispatchEvent(new HashChangeEvent('hashchange'));
  }

  function clearLegacyState() {
    [
      'nexusMobileInitialData','nexusMobileInitialDataAt','nexusHomeLoaded','nexusHomeData',
      'nexusAttendanceData','nexusApplicationData','nexusMyPageData','nexusGasApiUrl',
      'nexusCurrentEmployeeId','employeeId'
    ].forEach(key => {
      try { localStorage.removeItem(key); } catch (_) {}
      try { sessionStorage.removeItem(key); } catch (_) {}
    });
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

  async function getConfig() {
    if (!configPromise) {
      configPromise = fetch('/api/auth/config', { cache: 'no-store' }).then(async res => {
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Google認証設定を取得できませんでした。');
        return data;
      });
    }
    return configPromise;
  }

  function storeProfile(data, accessToken) {
    clearLegacyState();
    sessionStorage.setItem(TOKEN_KEY, accessToken);
    if (data?.google?.address) sessionStorage.setItem(ADDRESS_KEY, JSON.stringify(data.google.address));
    else sessionStorage.removeItem(ADDRESS_KEY);

    const email = data?.google?.email || '';
    const name = data?.google?.name || '';
    if (email) {
      sessionStorage.setItem('nexusUserEmail', email);
      localStorage.setItem('nexusUserEmail', email);
    }
    if (name) {
      sessionStorage.setItem('nexusUserName', name);
      localStorage.setItem('nexusUserName', name);
    }
  }

  function routeAfterAuth(data) {
    const employees = Array.isArray(data?.employees) ? data.employees : [];
    const approved = employees.find(e => e.registration_status === '承認済' && e.employment_status === '在籍');
    const pending = employees.find(e => e.registration_status === '承認待ち');

    if (approved) {
      if (approved.employee_id) {
        sessionStorage.setItem('nexusEmployeeId', approved.employee_id);
        localStorage.setItem('nexusEmployeeId', approved.employee_id);
      }
      sessionStorage.removeItem('nexusRegistrationStatus');
      go('home');
      return;
    }

    sessionStorage.removeItem('nexusEmployeeId');
    localStorage.removeItem('nexusEmployeeId');
    sessionStorage.setItem('nexusRegistrationStatus', pending ? '承認待ち' : '未登録');
    go('setup');
  }

  async function authenticate(doc) {
    try {
      setStatus(doc, 'Googleログインを準備しています。');
      const [config] = await Promise.all([getConfig(), ensureGoogle()]);
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: config.clientId,
        scope: config.scope,
        include_granted_scopes: true,
        prompt: 'consent',
        callback: async response => {
          try {
            if (response.error) throw new Error(response.error_description || response.error);
            setStatus(doc, 'Googleアカウントを確認しています。');
            const res = await fetch('/api/auth/google', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ access_token: response.access_token })
            });
            const data = await res.json();
            if (!res.ok || !data.ok) throw new Error(data.error || 'Google認証に失敗しました。');
            storeProfile(data, response.access_token);
            routeAfterAuth(data);
          } catch (error) {
            console.error('[NEXUS auth]', error);
            setStatus(doc, error.message || 'Googleログインに失敗しました。');
          }
        }
      });
      tokenClient.requestAccessToken({ prompt: 'consent' });
    } catch (error) {
      console.error('[NEXUS auth start]', error);
      setStatus(doc, error.message || 'Googleログインを開始できませんでした。');
    }
  }

  function simplifyLogin(doc) {
    const googleBtn = doc?.getElementById('googleBtn');
    if (!googleBtn || googleBtn.dataset.nexusOverrideBound === '1') return;

    const fresh = googleBtn.cloneNode(true);
    fresh.dataset.nexusOverrideBound = '1';
    googleBtn.replaceWith(fresh);
    fresh.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      authenticate(doc);
    }, true);

    const emailInput = doc.getElementById('emailInput');
    if (emailInput) {
      const block = emailInput.closest('.field, .form-group, .input-wrap, label, div');
      if (block) block.style.display = 'none';
      else emailInput.style.display = 'none';
    }
    ['loginBtn','emailBtn'].forEach(id => {
      const el = doc.getElementById(id);
      if (el && el !== fresh) el.style.display = 'none';
    });
    [...doc.querySelectorAll('*')].forEach(el => {
      const text = (el.textContent || '').trim();
      if ((text === 'OR' || text === 'MAIL ADDRESS') && el.children.length === 0) el.style.display = 'none';
      if (/初回利用・端末変更・再認証時に使用します/.test(text) && el.children.length === 0) {
        el.textContent = 'Googleアカウントでログインしてください。';
      }
    });
  }

  function patchCompanyNames(doc) {
    if (!doc) return;
    const walker = doc.createTreeWalker(doc.body || doc.documentElement, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      const before = node.nodeValue || '';
      const after = before
        .replace(/ITキャリアアップシステム/g, '株式会社がんばる')
        .replace(/ITキャリア/g, '株式会社がんばる')
        .replace(/\bITC\b/g, 'GANBARU');
      if (before !== after) node.nodeValue = after;
    });
    const companyValue = doc.getElementById('companyValue');
    if (companyValue?.dataset?.id === 'ITC') companyValue.dataset.id = 'GANBARU';
  }

  function addAddressFields(doc) {
    if (doc.getElementById('postalCodeInput')) return;
    const emailInput = doc.getElementById('emailInput');
    const anchor = emailInput?.closest('.row');
    if (!anchor) return;

    const make = (id, label, placeholder, autocomplete) => {
      const row = doc.createElement('div');
      row.className = 'row';
      row.innerHTML = `<div class="meta" style="width:100%"><div class="label">${label}</div><input class="text-input" id="${id}" type="text" autocomplete="${autocomplete}" placeholder="${placeholder}"></div>`;
      return row;
    };

    const frag = doc.createDocumentFragment();
    const note = doc.createElement('div');
    note.id = 'googleAddressNote';
    note.style.cssText = 'padding:10px 18px 2px;color:rgba(96,165,250,.82);font-size:11px;line-height:1.6;font-weight:650;';
    note.textContent = '現住所を入力してください。Googleに住所が登録されている場合は自動入力されます。';
    frag.appendChild(note);
    frag.appendChild(make('postalCodeInput','郵便番号','123-4567','postal-code'));
    frag.appendChild(make('prefectureInput','都道府県','神奈川県','address-level1'));
    frag.appendChild(make('cityAddressInput','市区町村','横浜市戸塚区','address-level2'));
    frag.appendChild(make('streetAddressInput','番地','戸塚町1-2-3','address-line1'));
    frag.appendChild(make('buildingInput','建物名・部屋番号','NEXUSレジデンス101','address-line2'));
    anchor.after(frag);

    try {
      const address = JSON.parse(sessionStorage.getItem(ADDRESS_KEY) || 'null');
      if (address) {
        const map = {
          postalCodeInput: address.postalCode,
          prefectureInput: address.prefecture,
          cityAddressInput: address.cityAddress,
          streetAddressInput: address.streetAddress,
          buildingInput: address.building
        };
        Object.entries(map).forEach(([id,value]) => {
          const el = doc.getElementById(id);
          if (el && value) el.value = value;
        });
        note.textContent = 'Googleアカウントの住所を自動入力しました。内容は編集できます。';
      }
    } catch (_) {}
  }

  function bindSetup(doc) {
    if (!doc || doc.documentElement.dataset.nexusSetupBound === '1') return;
    const submitBtn = doc.getElementById('submitBtn');
    const nameInput = doc.getElementById('nameInput');
    if (!submitBtn || !nameInput) return;
    doc.documentElement.dataset.nexusSetupBound = '1';
    patchCompanyNames(doc);
    addAddressFields(doc);

    const fresh = submitBtn.cloneNode(true);
    submitBtn.replaceWith(fresh);
    fresh.addEventListener('click', async event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const token = sessionStorage.getItem(TOKEN_KEY) || '';
      if (!token) return go('login');

      const company = doc.getElementById('companyValue');
      const workTypeEl = doc.getElementById('workTypeValue');
      const pattern = doc.getElementById('patternValue');
      const workType = workTypeEl?.dataset.type || workTypeEl?.textContent.trim() || '固定勤務';
      const payload = {
        name: nameInput.value.trim(),
        companyId: company?.dataset.id || '',
        workType,
        baseWorkPatternId: workType === 'シフト勤務' ? '' : (pattern?.dataset.id || ''),
        postalCode: doc.getElementById('postalCodeInput')?.value.trim() || '',
        prefecture: doc.getElementById('prefectureInput')?.value.trim() || '',
        cityAddress: doc.getElementById('cityAddressInput')?.value.trim() || '',
        streetAddress: doc.getElementById('streetAddressInput')?.value.trim() || '',
        building: doc.getElementById('buildingInput')?.value.trim() || ''
      };

      if (!payload.name) return setStatus(doc, '氏名を入力してください。');
      if (!payload.companyId) return setStatus(doc, '所属会社を選択してください。');
      if (!payload.prefecture || !payload.cityAddress || !payload.streetAddress) return setStatus(doc, '現住所を入力してください。');

      try {
        fresh.disabled = true;
        setStatus(doc, '登録申請を送信しています。');
        const res = await fetch('/api/registrations/initial', {
          method: 'POST',
          headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || '登録申請に失敗しました。');
        sessionStorage.setItem('nexusRegistrationStatus', '承認待ち');
        setStatus(doc, '登録申請を受け付けました。');
        doc.getElementById('done')?.classList.add('show');
      } catch (error) {
        console.error('[NEXUS registration]', error);
        fresh.disabled = false;
        setStatus(doc, error.message || '登録申請に失敗しました。');
      }
    }, true);
  }

  function scan() {
    document.querySelectorAll('iframe').forEach(frame => {
      try {
        const doc = frame.contentDocument;
        if (!doc) return;
        patchCompanyNames(doc);
        if (doc.getElementById('googleBtn')) simplifyLogin(doc);
        if (doc.getElementById('submitBtn') && doc.getElementById('nameInput')) bindSetup(doc);
      } catch (_) {}
      if (!frame.dataset.nexusOverrideListener) {
        frame.dataset.nexusOverrideListener = '1';
        frame.addEventListener('load', scan);
      }
    });
  }

  function enforceStartRoute() {
    if (!sessionStorage.getItem(TOKEN_KEY)) {
      clearLegacyState();
      go('login');
    }
  }

  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('DOMContentLoaded', () => { scan(); enforceStartRoute(); });
  scan();
  enforceStartRoute();
})();
