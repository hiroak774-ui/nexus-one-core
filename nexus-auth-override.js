(() => {
  const LOGIN_VIEW = 'NEXUS_ONE_Login_Unified_v3_mobile_optimized.html';
  const SETUP_VIEW = 'NEXUS_ONE_Initial_Setup_Unified_v3_mobile_optimized.html';
  const HOME_VIEW = 'NEXUS_ONE_Home_v6_mobile_optimized.html';
  const TOKEN_KEY = 'nexusGoogleAccessToken';
  const ADDRESS_KEY = 'nexusGoogleAddress';
  let configPromise;
  let googlePromise;
  let tokenClient;

  function ensureGoogle() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    if (googlePromise) return googlePromise;
    googlePromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Google認証ライブラリを読み込めませんでした。'));
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

  function setStatus(doc, message) {
    const el = doc?.getElementById('statusText');
    if (el) el.textContent = message || '';
  }

  function storeProfile(data, accessToken) {
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
    const employees = data.employees || [];
    const approved = employees.find(e => e.registration_status === '承認済' && e.employment_status === '在籍');
    const pending = employees.find(e => e.registration_status === '承認待ち');

    if (approved) {
      if (approved.employee_id) {
        sessionStorage.setItem('nexusEmployeeId', approved.employee_id);
        localStorage.setItem('nexusEmployeeId', approved.employee_id);
      }
      window.NEXUS?.navigate(HOME_VIEW);
      return;
    }

    if (pending) {
      if (pending.employee_id) {
        sessionStorage.setItem('nexusEmployeeId', pending.employee_id);
        localStorage.setItem('nexusEmployeeId', pending.employee_id);
      }
      window.NEXUS?.navigate(`${SETUP_VIEW}?status=pending`);
      return;
    }

    window.NEXUS?.navigate(SETUP_VIEW);
  }

  async function authenticate(doc) {
    try {
      setStatus(doc, 'Googleログインを準備しています。');
      const [config] = await Promise.all([getConfig(), ensureGoogle()]);
      const callback = async response => {
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
          console.error(error);
          setStatus(doc, error.message || 'Googleログインに失敗しました。');
        }
      };

      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: config.clientId,
        scope: config.scope,
        include_granted_scopes: true,
        prompt: 'consent',
        callback
      });
      tokenClient.requestAccessToken({ prompt: 'consent' });
    } catch (error) {
      console.error(error);
      setStatus(doc, error.message || 'Googleログインを開始できませんでした。');
    }
  }

  function makeGoogleOnly(doc) {
    const googleBtn = doc?.getElementById('googleBtn');
    if (!googleBtn || googleBtn.dataset.nexusOverrideBound === '1') return;

    const fresh = googleBtn.cloneNode(true);
    fresh.dataset.nexusOverrideBound = '1';
    googleBtn.replaceWith(fresh);
    fresh.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      authenticate(doc);
    }, true);

    const emailInput = doc.getElementById('emailInput');
    const emailRow = emailInput?.closest('.field, .form-group, .input-wrap, label, div');
    if (emailRow) emailRow.style.display = 'none';
    else if (emailInput) emailInput.style.display = 'none';

    const emailBtn = doc.getElementById('loginBtn') || doc.getElementById('emailBtn');
    if (emailBtn && emailBtn !== fresh) emailBtn.style.display = 'none';

    [...doc.querySelectorAll('*')].forEach(el => {
      const text = (el.textContent || '').trim();
      if ((text === 'OR' || text === 'MAIL ADDRESS') && el.children.length === 0) el.style.display = 'none';
      if (/初回利用・端末変更・再認証時に使用します/.test(text) && el.children.length === 0) {
        el.textContent = 'Googleアカウントでログインしてください。';
      }
    });
  }

  function scan() {
    document.querySelectorAll('#nexus-root iframe').forEach(frame => {
      try {
        const doc = frame.contentDocument;
        if (doc?.getElementById('googleBtn')) makeGoogleOnly(doc);
      } catch (_) {}
      if (!frame.dataset.nexusOverrideListener) {
        frame.dataset.nexusOverrideListener = '1';
        frame.addEventListener('load', () => {
          try {
            const doc = frame.contentDocument;
            if (doc?.getElementById('googleBtn')) makeGoogleOnly(doc);
          } catch (_) {}
        });
      }
    });
  }

  function forceLoginWhenUnauthenticated() {
    if (sessionStorage.getItem(TOKEN_KEY)) return;
    const started = Date.now();
    const timer = setInterval(() => {
      if (window.NEXUS?.navigate) {
        clearInterval(timer);
        window.NEXUS.navigate(LOGIN_VIEW);
        history.replaceState(null, '', `${location.pathname}${location.search}#login`);
      } else if (Date.now() - started > 5000) {
        clearInterval(timer);
      }
    }, 50);
  }

  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('DOMContentLoaded', () => {
    scan();
    forceLoginWhenUnauthenticated();
  });
  scan();
  forceLoginWhenUnauthenticated();
})();
