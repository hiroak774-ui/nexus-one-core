(() => {
  let installed = false;
  let pending = null;

  function install(){
    if (installed) return;
    const current = window.modal;
    if (typeof current !== 'function') {
      setTimeout(install,40);
      return;
    }
    installed = true;

    const guarded = (...args) => {
      if (pending) return pending;
      pending = Promise.resolve(current(...args)).finally(() => {
        pending = null;
      });
      return pending;
    };

    window.modal = guarded;
    try { modal = guarded; } catch (_) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
