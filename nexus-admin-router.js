(() => {
  const TOKEN_KEY = 'nexusGoogleAccessToken';
  const ME_URL = '/api/me';
  const BOOTSTRAP_URL = '/api/admin/bootstrap';
  const MOBILE_QUERY = '(max-width: 820px)';
  let checking = false;

  function token() {
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (_) { return ''; }
  }

  function isDesktop() {
    return !window.matchMedia(MOBILE_QUERY).matches;
  }

  function route() {
    return (location.hash || '').replace(/^#/, '') || 'entry';
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token()}`,
        ...(options.headers || {})
      },
      cache: 'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) return null;
    return payload.data ?? payload;
  }

  async function routeAdmin() {
    if (checking || !isDesktop() || !token()) return;
    const current = route();
    if (current !== 'home') return;

    checking = true;
    try {
      let me = await fetchJson(ME_URL);
      if (!me || me.authState !== 'approved') return;

      if (me.permissions?.canOpenAdmin) {
        location.replace('/admin.html');
        return;
      }

      const bootstrap = await fetchJson(BOOTSTRAP_URL);
      if (!bootstrap?.bootstrapAvailable) return;

      const created = await fetchJson(BOOTSTRAP_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' }
      });
      if (!created) return;

      me = await fetchJson(ME_URL);
      if (me?.permissions?.canOpenAdmin) {
        location.replace('/admin.html');
      }
    } catch (error) {
      console.error('[NEXUS admin router]', error);
    } finally {
      checking = false;
    }
  }

  window.addEventListener('DOMContentLoaded', () => setTimeout(routeAdmin, 0));
  window.addEventListener('hashchange', () => setTimeout(routeAdmin, 0));
  window.addEventListener('pageshow', () => setTimeout(routeAdmin, 0));
  setTimeout(routeAdmin, 0);
})();
