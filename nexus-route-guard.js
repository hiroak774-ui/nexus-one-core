(() => {
  const TOKEN_KEY = 'nexusGoogleAccessToken';
  const STATUS_KEY = 'nexusRegistrationStatus';

  function desiredHash() {
    const token = sessionStorage.getItem(TOKEN_KEY) || '';
    if (!token) return '#login';
    const status = sessionStorage.getItem(STATUS_KEY) || '';
    if (status === '未登録' || status === '承認待ち') return '#setup';
    return '';
  }

  function enforce() {
    const target = desiredHash();
    if (!target || location.hash === target) return;
    history.replaceState(null, '', `${location.pathname}${location.search}${target}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }

  window.addEventListener('DOMContentLoaded', enforce);
  window.addEventListener('hashchange', () => setTimeout(enforce, 0));
  window.addEventListener('pageshow', enforce);
  setTimeout(enforce, 0);
  setTimeout(enforce, 100);
  setTimeout(enforce, 500);
})();
