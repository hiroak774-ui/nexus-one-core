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
        .replace(/\bITC\b/g, 'GANBARU')
        .replace(/HR COMPANY(?!株式会社)/g, 'HR COMPANY株式会社');
      if (before !== after) node.nodeValue = after;
    });

    doc.querySelectorAll('[data-id="ITC"], [data-company-id="ITC"], [data-value="ITC"]').forEach(el => {
      if (el.dataset.id === 'ITC') el.dataset.id = 'GANBARU';
      if (el.dataset.companyId === 'ITC') el.dataset.companyId = 'GANBARU';
      if (el.dataset.value === 'ITC') el.dataset.value = 'GANBARU';
    });

    const companyValue = doc.getElementById('companyValue');
    if (companyValue) {
      if (companyValue.dataset?.id === 'ITC') companyValue.dataset.id = 'GANBARU';
      if ((companyValue.textContent || '').trim() === 'HR COMPANY') companyValue.textContent = 'HR COMPANY株式会社';
    }
  }

  function addAddressFields(doc) {
    if (doc.getElementById('nexusAddressSection')) return;
    const emailInput = doc.getElementById('emailInput');
    const anchor = emailInput?.closest('.row');
    if (!anchor) return;

    const style = doc.createElement('style');
    style.id = 'nexusSetupFormStyle';
    style.textContent = `
      #nexusAddressSection{padding:14px 0 4px;border-top:1px solid rgba(148,163,184,.16);margin-top:4px}
      #nexusAddressSection .nexus-address-note{margin:0 0 12px;padding:0 2px;color:rgba(96,165,250,.92);font-size:11px;line-height:1.65;font-weight:700}
      #nexusAddressSection .nexus-address-grid{display:grid;grid-template-columns:1fr;gap:10px}
      #nexusAddressSection .nexus-address-field{display:block;width:100%}
      #nexusAddressSection .nexus-address-label{display:block;margin:0 0 6px;color:rgba(203,213,225,.72);font-size:10px;font-weight:800;letter-spacing:.08em}
      #nexusAddressSection .nexus-address-input{box-sizing:border-box;display:block;width:100%;height:44px;padding:0 13px;border:1px solid rgba(148,163,184,.18);border-radius:12px;background:rgba(15,23,42,.45);color:#f8fafc;font:inherit;font-size:14px;font-weight:700;letter-spacing:.01em;outline:none;appearance:none;-webkit-appearance:none}
      #nexusAddressSection .nexus-address-input::placeholder{color:rgba(148,163,184,.42);font-weight:600}
      #nexusAddressSection .nexus-address-input:focus{border-color:rgba(56,189,248,.7);box-shadow:0 0 0 3px rgba(56,189,248,.10)}
      #nexusAddressSection .nexus-address-half{display:grid;grid-template-columns:110px 1fr;gap:10px}
      @media(max-width:420px){#nexusAddressSection .nexus-address-half{grid-template-columns:1fr}}
    `;
    doc.head.appendChild(style);

    const section = doc.createElement('section');
    section.id = 'nexusAddressSection';
    section.innerHTML = `
      <p class="nexus-address-note" id="googleAddressNote">現住所を入力してください。Googleに住所が登録されている場合は自動入力されます。</p>
      <div class="nexus-address-grid">
        <div class="nexus-address-half">
          <label class="nexus-address-field">
            <span class="nexus-address-label">郵便番号</span>
            <input class="nexus-address-input" id="postalCodeInput" type="text" autocomplete="postal-code" inputmode="numeric" placeholder="123-4567">
          </label>
          <label class="nexus-address-field">
            <span class="nexus-address-label">都道府県</span>
            <input class="nexus-address-input" id="prefectureInput" type="text" autocomplete="address-level1" placeholder="神奈川県">
          </label>
        </div>
        <label class="nexus-address-field">
          <span class="nexus-address-label">市区町村</span>
          <input class="nexus-address-input" id="cityAddressInput" type="text" autocomplete="address-level2" placeholder="横浜市戸塚区">
        </label>
        <label class="nexus-address-field">
          <span class="nexus-address-label">番地</span>
          <input class="nexus-address-input" id="streetAddressInput" type="text" autocomplete="address-line1" placeholder="戸塚町1-2-3">
        </label>
        <label class="nexus-address-field">
          <span class="nexus-address-label">建物名・部屋番号</span>
          <input class="nexus-address-input" id="buildingInput" type="text" autocomplete="address-line2" placeholder="NEXUSレジデンス101">
        </label>
      </div>
    `;
    anchor.after(section);

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
        const note = doc.getElementById('googleAddressNote');
        if (note) note.textContent = 'Googleアカウントの住所を自動入力しました。内容は編集できます。';
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
