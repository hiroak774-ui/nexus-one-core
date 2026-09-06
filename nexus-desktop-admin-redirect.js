(() => {
  const TOKEN_KEY='nexusGoogleAccessToken';
  const DESKTOP='(min-width: 821px)';
  let running=false;
  let lastToken='';

  function token(){try{return sessionStorage.getItem(TOKEN_KEY)||''}catch(_){return''}}
  function isDesktop(){return window.matchMedia(DESKTOP).matches}

  async function check(){
    if(running||!isDesktop()) return;
    const t=token();
    if(!t){lastToken='';return}
    if(location.pathname.startsWith('/admin')) return;
    if(t===lastToken && location.hash!=='#login') return;
    running=true;
    try{
      const r=await fetch('/api/me',{headers:{Authorization:`Bearer ${t}`},cache:'no-store'});
      const j=await r.json().catch(()=>({}));
      if(r.ok&&j.ok&&j.authState==='approved'&&j.permissions?.canOpenAdmin){
        location.replace('/admin.html');
        return;
      }
      lastToken=t;
    }catch(_){
      lastToken=t;
    }finally{
      running=false;
    }
  }

  window.addEventListener('DOMContentLoaded',check);
  window.addEventListener('hashchange',check);
  window.addEventListener('pageshow',check);
  window.addEventListener('resize',check);
  setInterval(check,250);
  check();
})();
