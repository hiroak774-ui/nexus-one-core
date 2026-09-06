(() => {
  const SESSION_KEY = 'nexusGoogleAccessToken';
  const PERSIST_KEY = 'nexusGoogleAccessTokenPersistent';
  let lastSessionToken = '';

  function get(storage, key) {
    try { return storage.getItem(key) || ''; } catch (_) { return ''; }
  }

  function set(storage, key, value) {
    try {
      if (value) storage.setItem(key, value);
      else storage.removeItem(key);
    } catch (_) {}
  }

  function restore() {
    const sessionToken = get(sessionStorage, SESSION_KEY);
    const persistentToken = get(localStorage, PERSIST_KEY);

    if (!sessionToken && persistentToken) {
      set(sessionStorage, SESSION_KEY, persistentToken);
      lastSessionToken = persistentToken;
      return;
    }

    lastSessionToken = sessionToken;
    if (sessionToken && sessionToken !== persistentToken) {
      set(localStorage, PERSIST_KEY, sessionToken);
    }
  }

  function sync() {
    const sessionToken = get(sessionStorage, SESSION_KEY);
    const persistentToken = get(localStorage, PERSIST_KEY);

    if (sessionToken) {
      if (persistentToken !== sessionToken) set(localStorage, PERSIST_KEY, sessionToken);
      lastSessionToken = sessionToken;
      return;
    }

    // A token existed in this live page and was explicitly cleared by logout/401.
    // In that case, clear the persistent copy too.
    if (lastSessionToken) {
      set(localStorage, PERSIST_KEY, '');
      lastSessionToken = '';
    }
  }

  restore();
  const timer = setInterval(sync, 250);
  window.addEventListener('pagehide', sync);
  window.addEventListener('beforeunload', sync);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') sync();
  });

  window.NEXUS_AUTH_PERSISTENCE = {
    restore,
    sync,
    clear() {
      set(sessionStorage, SESSION_KEY, '');
      set(localStorage, PERSIST_KEY, '');
      lastSessionToken = '';
    },
    stop() { clearInterval(timer); }
  };
})();
