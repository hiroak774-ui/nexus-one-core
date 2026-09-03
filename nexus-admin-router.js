(() => {
  const TOKEN_KEY = 'nexusGoogleAccessToken';
  const ME_URL = '/api/me';
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

  async function routeAdmin() {
    if (checking || !isDesktop() || !token()) return;
    const current = route();
    if (current !== 'home') return;

    checking = true;
    try {
      const response = await fetch(ME_URL, {
        headers: { Authorization: `Bearer ${token()}` },
        cache: 'no-store'
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) return;
      if (payload.authState === 'approved' && payload.permissions?.canOpenAdmin) {
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
