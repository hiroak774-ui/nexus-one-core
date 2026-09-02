(() => {
  const AUTH_CONFIG_URL = '/api/auth/config';
  const GOOGLE_AUTH_URL = '/api/auth/google';
  const INITIAL_REG_URL = '/api/registrations/initial';
  const GOOGLE_SCRIPT = 'https://accounts.google.com/gsi/client';
  const TOKEN_KEY = 'nexusGoogleAccessToken';
  const ADDRESS_KEY = 'nexusGoogleAddress';

  let googleScriptPromise;
  let tokenClient;
  let authConfig;

  function loadGoogleScript() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    if (googleScriptPromise) return googleScriptPromise;
    googleScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${GOOGLE_SCRIPT}"]`);
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = GOOGLE_SCRIPT;
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Google認証ライブラリを読み込めませんでした。'));
      document.head.appendChild(script);
    });
    return googleScriptPromise;
  }

  async function getAuthConfig() {
    if (authConfig) return authConfig;
    const res = await fetch(AUTH_CONFIG_URL, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Google認証設定を取得できませんでした。');
    authConfig = data;
    return data;
  }

  function setFrameStatus(win, message, type = '') {
    try {
      if (typeof win.setStatus === 'function') return win.setStatus(message, type);
      const el = win.document.getElementById('statusText');
      if (el) {
        el.textContent = message || '';
        el.className = 'status' + (type ? ` ${type}` : '');
      }
    } catch (_) {}
  }

  function setStored(key, value) {
    try { window.sessionStorage.setItem(key, value); } catch (_) {}
  }

  function saveBasicGoogleProfile(data) {
    const google = data.google || {};
    const values = {
      nexusUserEmail: google.email || '',
      nexusLoginEmail: google.email || '',
      nexusGoogleEmail: google.email || '',
      nexusUserName: google.name || '',
      nexusGoogleName: google.name || '',
      nexusDisplayName: google.name || ''
    };
    Object.entries(values).forEach(([key, value]) => {
      if (!value) return;
      try {
        sessionStorage.setItem(key, value);
        localStorage.setItem(key, value);
      } catch (_) {}
    });
    if (google.address) setStored(ADDRESS_KEY, JSON.stringify(google.address));
    else {
      try { sessionStorage.removeItem(ADDRESS_KEY); } catch (_) {}
    }
  }

  function saveEmployee(employee) {
    if (!employee?.employee_id) return;
    ['nexusEmployeeId', 'nexusCurrentEmployeeId', 'employeeId'].forEach(key => {
      try {
        sessionStorage.setItem(key, employee.employee_id);
        localStorage.setItem(key, employee.employee_id);
      } catch (_) {}
    });
  }

  async function finishGoogleLogin(win, accessToken) {
    setFrameStatus(win, 'Googleアカウントを確認しています。');
    const res = await fetch(GOOGLE_AUTH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ access_token: accessToken })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Google認証に失敗しました。');

    setStored(TOKEN_KEY, accessToken);
    saveBasicGoogleProfile(data);

    const approved = (data.employees || []).find(e => e.registration_status === '承認済' && e.employment_status === '在籍');
    const pending = (data.employees || []).find(e => e.registration_status === '承認待ち');

    if (approved) {
      saveEmployee(approved);
      setFrameStatus(win, 'ログインしました。', 'success');
      window.NEXUS?.navigate('NEXUS_ONE_Home_v6_mobile_optimized.html');
      return;
    }

    if (pending) {
      saveEmployee(pending);
      setFrameStatus(win, '初回登録は承認待ちです。', 'warning');
      window.NEXUS?.navigate('NEXUS_ONE_Initial_Setup_Unified_v3_mobile_optimized.html?status=pending');
      return;
    }

    setFrameStatus(win, '初回登録情報を入力してください。', 'warning');
    window.NEXUS?.navigate('NEXUS_ONE_Initial_Setup_Unified_v3_mobile_optimized.html');
  }

  async function startGoogleLogin(win) {
    try {
      setFrameStatus(win, 'Googleログインを準備しています。');
      const [config] = await Promise.all([getAuthConfig(), loadGoogleScript()]);

      if (!tokenClient) {
        tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: config.clientId,
          scope: config.scope,
          include_granted_scopes: true,
          prompt: 'consent',
          callback: async response => {
            try {
              if (response.error) throw new Error(response.error_description || response.error);
              await finishGoogleLogin(win, response.access_token);
            } catch (error) {
              console.error(error);
              setFrameStatus(win, error.message || 'Googleログインに失敗しました。', 'error');
            }
          }
        });
      } else {
        tokenClient.callback = async response => {
          try {
            if (response.error) throw new Error(response.error_description || response.error);
            await finishGoogleLogin(win, response.access_token);
          } catch (error) {
            console.error(error);
            setFrameStatus(win, error.message || 'Googleログインに失敗しました。', 'error');
          }
        };
      }

      tokenClient.requestAccessToken({ prompt: 'consent' });
    } catch (error) {
      console.error(error);
      setFrameStatus(win, error.message || 'Googleログインを開始できませんでした。', 'error');
    }
  }

  function bindLoginFrame(frame) {
    const win = frame.contentWindow;
    const doc = frame.contentDocument;
    if (!win || !doc || doc.documentElement.dataset.nexusAuthBound) return;
    doc.documentElement.dataset.nexusAuthBound = '1';

    const btn = doc.getElementById('googleBtn');
    if (!btn) return;
    btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      startGoogleLogin(win);
    }, true);
  }

  function createAddressRow(doc, id, label, placeholder, autocomplete = '') {
    const row = doc.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <div class="row-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
      </div>
      <div class="meta">
        <div class="label">${label}</div>
        <input class="text-input" id="${id}" type="text" ${autocomplete ? `autocomplete="${autocomplete}"` : ''} placeholder="${placeholder}">
      </div>`;
    return row;
  }

  function prefillAddress(doc) {
    let address = null;
    try { address = JSON.parse(sessionStorage.getItem(ADDRESS_KEY) || 'null'); } catch (_) {}
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
    const note = doc.getElementById('googleAddressNote');
    if (note) note.textContent = 'Googleアカウントの住所を自動入力しました。内容は編集できます。';
  }

  function patchCompanySelector(win, doc) {
    const trigger = doc.querySelector('[data-sheet="company"]');
    if (!trigger || trigger.dataset.ganbaruBound) return;
    trigger.dataset.ganbaruBound = '1';
    trigger.addEventListener('click', () => {
      setTimeout(() => {
        const options = [...doc.querySelectorAll('#sheetOptions .option')];
        const old = options.find(o => /ITキャリア|ITC/.test(o.textContent || ''));
        if (!old) return;
        old.textContent = '株式会社がんばる';
        old.onclick = () => {
          const target = doc.getElementById('companyValue');
          if (target) {
            target.textContent = '株式会社がんばる';
            target.dataset.id = 'GANBARU';
          }
          if (typeof win.hideSheet === 'function') win.hideSheet();
          else {
            doc.getElementById('sheet')?.classList.remove('show');
            doc.getElementById('sheetBackdrop')?.classList.remove('show');
          }
        };
      }, 0);
    });
  }

  function injectAddressFields(doc) {
    if (doc.getElementById('postalCodeInput')) return;
    const emailInput = doc.getElementById('emailInput');
    const emailRow = emailInput?.closest('.row');
    if (!emailRow) return;

    const block = doc.createDocumentFragment();
    const note = doc.createElement('div');
    note.id = 'googleAddressNote';
    note.style.cssText = 'padding:10px 18px 2px;color:rgba(96,165,250,.82);font-size:11px;line-height:1.6;font-weight:650;';
    note.textContent = '現住所を入力してください。Googleに住所が登録されている場合は自動入力されます。';
    block.appendChild(note);
    block.appendChild(createAddressRow(doc, 'postalCodeInput', '郵便番号', '123-4567', 'postal-code'));
    block.appendChild(createAddressRow(doc, 'prefectureInput', '都道府県', '神奈川県', 'address-level1'));
    block.appendChild(createAddressRow(doc, 'cityAddressInput', '市区町村', '横浜市戸塚区', 'address-level2'));
    block.appendChild(createAddressRow(doc, 'streetAddressInput', '番地', '戸塚町1-2-3', 'address-line1'));
    block.appendChild(createAddressRow(doc, 'buildingInput', '建物名・部屋番号', 'NEXUSレジデンス101', 'address-line2'));
    emailRow.after(block);
    prefillAddress(doc);
  }

  async function submitD1Registration(win, doc, event) {
    const token = sessionStorage.getItem(TOKEN_KEY) || '';
    if (!token) return false;

    event.preventDefault();
    event.stopImmediatePropagation();

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

    if (!payload.name) {
      setFrameStatus(win, '氏名を入力してください。', 'warning');
      doc.getElementById('nameInput')?.focus();
      return true;
    }
    if (!payload.prefecture || !payload.cityAddress || !payload.streetAddress) {
      setFrameStatus(win, '現住所（都道府県・市区町村・番地）を入力してください。', 'warning');
      return true;
    }

    const btn = doc.getElementById('submitBtn');
    if (btn) btn.disabled = true;
    setFrameStatus(win, '登録申請を送信しています。');

    try {
      const res = await fetch(INITIAL_REG_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || '登録申請に失敗しました。');

      const employee = { employee_id: data.employeeId };
      saveEmployee(employee);
      setFrameStatus(win, '登録申請を受け付けました。', 'success');
      doc.getElementById('done')?.classList.add('show');
    } catch (error) {
      console.error(error);
      setFrameStatus(win, error.message || '登録申請に失敗しました。', 'error');
      if (btn) btn.disabled = false;
    }
    return true;
  }

  function bindSetupFrame(frame) {
    const win = frame.contentWindow;
    const doc = frame.contentDocument;
    if (!win || !doc || doc.documentElement.dataset.nexusSetupBound) return;
    doc.documentElement.dataset.nexusSetupBound = '1';

    injectAddressFields(doc);
    patchCompanySelector(win, doc);

    const btn = doc.getElementById('submitBtn');
    btn?.addEventListener('click', event => { submitD1Registration(win, doc, event); }, true);
  }

  function bindFrame(frame) {
    try {
      const key = frame.contentWindow?.__NEXUS_VIEW_KEY;
      if (key === 'login') bindLoginFrame(frame);
      if (key === 'setup') bindSetupFrame(frame);
    } catch (_) {}
  }

  function scan() {
    document.querySelectorAll('#nexus-root iframe').forEach(frame => {
      if (!frame.dataset.nexusAuthListener) {
        frame.dataset.nexusAuthListener = '1';
        frame.addEventListener('load', () => setTimeout(() => bindFrame(frame), 0));
      }
      bindFrame(frame);
    });
  }

  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('DOMContentLoaded', scan);
  scan();
})();
