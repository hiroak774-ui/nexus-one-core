(() => {
  const DESKTOP = '(min-width: 821px) and (hover: hover) and (pointer: fine)';

  function isDesktop(){ return window.matchMedia(DESKTOP).matches; }
  function route(){ return (location.hash || '').replace(/^#/, '') || 'entry'; }

  function resetTopFrame(frame){
    if (!frame || frame.dataset.nexusPcLoginFrame !== '1') return;
    frame.style.position = '';
    frame.style.inset = '';
    frame.style.width = '';
    frame.style.height = '';
    frame.style.maxWidth = '';
    frame.style.maxHeight = '';
    frame.style.border = '';
    frame.style.borderRadius = '';
    frame.style.boxShadow = '';
    frame.style.zIndex = '';
    frame.dataset.nexusPcLoginFrame = '';
  }

  function styleLoginDoc(doc){
    if (!doc || doc.getElementById('nexusPcLoginStyles')) return;
    const style = doc.createElement('style');
    style.id = 'nexusPcLoginStyles';
    style.textContent = `
      @media (min-width: 821px) and (hover:hover) and (pointer:fine){
        html,body{width:100%!important;min-height:100%!important;overflow:hidden!important}
        body{display:block!important;padding:0!important;margin:0!important}
        .phone{
          width:100vw!important;max-width:none!important;height:100vh!important;min-height:0!important;max-height:none!important;
          border-radius:0!important;border:0!important;box-shadow:none!important;background:transparent!important;backdrop-filter:none!important;
        }
        .content{
          width:min(430px,calc(100vw - 48px))!important;height:100vh!important;margin:0 auto!important;
          padding:54px 0 28px!important;
        }
        .brand{margin-top:20px!important}
        .login-card{width:100%!important;margin-top:auto!important;margin-bottom:30px!important}
        .input-group,#loginBtn,.divider{display:none!important}
      }
    `;
    doc.head.appendChild(style);
  }

  function cleanLegacyLogin(doc){
    doc.querySelector('.input-group')?.remove();
    doc.getElementById('loginBtn')?.remove();
    doc.querySelectorAll('.divider').forEach(el => el.remove());
  }

  function apply(){
    const frames = [...document.querySelectorAll('#nexus-root iframe')];
    if (!isDesktop() || route() !== 'login') {
      frames.forEach(resetTopFrame);
      return;
    }

    frames.forEach(frame => {
      try {
        if (frame.contentWindow?.__NEXUS_VIEW_KEY !== 'login') {
          resetTopFrame(frame);
          return;
        }
        frame.dataset.nexusPcLoginFrame = '1';
        frame.style.position = 'fixed';
        frame.style.inset = '0';
        frame.style.width = '100vw';
        frame.style.height = '100vh';
        frame.style.maxWidth = 'none';
        frame.style.maxHeight = 'none';
        frame.style.border = '0';
        frame.style.borderRadius = '0';
        frame.style.boxShadow = 'none';
        frame.style.zIndex = '9999';
        const doc = frame.contentDocument;
        styleLoginDoc(doc);
        cleanLegacyLogin(doc);
      } catch (_) {}
    });
  }

  new MutationObserver(apply).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('DOMContentLoaded', apply);
  window.addEventListener('hashchange', apply);
  window.addEventListener('resize', apply);
  window.addEventListener('pageshow', apply);
  setInterval(apply, 800);
})();
