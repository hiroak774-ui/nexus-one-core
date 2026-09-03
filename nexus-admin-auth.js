(() => {
  const TOKEN_KEY = 'nexusGoogleAccessToken';
  const ME_URL = '/api/me';
  const BOOTSTRAP_URL = '/api/admin/bootstrap';
  const MOBILE_QUERY = '(max-width: 820px)';

  function token(){try{return sessionStorage.getItem(TOKEN_KEY)||''}catch(_){return''}}
  function isMobile(){return window.matchMedia(MOBILE_QUERY).matches}
  function reveal(){document.getElementById('nexusAdminAuthHide')?.remove();document.documentElement.style.visibility=''}
  function redirectStaff(hash='home'){location.replace(`/${hash?'#'+hash:''}`)}

  async function request(url,options={}){
    const accessToken=token();
    if(!accessToken)throw Object.assign(new Error('LOGIN_REQUIRED'),{code:'LOGIN_REQUIRED'});
    const response=await fetch(url,{...options,headers:{...(options.headers||{}),Authorization:`Bearer ${accessToken}`},cache:'no-store'});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||!payload.ok){const error=new Error(payload.error||'管理者認証に失敗しました。');error.status=response.status;throw error}
    return payload.data??payload;
  }

  function bootstrapScreen(data){
    reveal();
    document.body.innerHTML=`<div style="min-height:100vh;display:grid;place-items:center;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans JP',sans-serif;background:linear-gradient(155deg,#01040f,#071127 42%,#0b1f49);color:#e5f0ff"><div style="width:min(520px,100%);padding:30px;border-radius:28px;border:1px solid rgba(148,163,184,.2);background:rgba(15,23,42,.72);box-shadow:0 24px 70px rgba(0,0,0,.38);backdrop-filter:blur(24px)"><div style="font-size:11px;letter-spacing:.14em;font-weight:900;color:#7dd3fc">NEXUS ONE / INITIAL ADMIN</div><h1 style="margin:12px 0 8px;font-size:25px">初期管理者を設定</h1><p style="margin:0;color:#94a3b8;line-height:1.8;font-size:13px">現在、管理者がまだ登録されていません。ログイン中のあなたを <b style="color:#e5f0ff">SUPER_ADMIN</b> として設定します。</p><div style="margin-top:18px;padding:13px 15px;border-radius:16px;background:rgba(37,99,235,.10);color:#bae6fd;font-size:12px;font-weight:800">対象会社：${String(data.companyId||'')}</div><button id="nexusBootstrapAdmin" type="button" style="width:100%;height:48px;margin-top:20px;border:0;border-radius:16px;background:linear-gradient(135deg,#1e40af,#2563eb,#38bdf8);color:white;font-size:13px;font-weight:900;cursor:pointer">SUPER_ADMINとして開始</button><div id="nexusBootstrapStatus" style="min-height:20px;margin-top:12px;text-align:center;color:#94a3b8;font-size:12px"></div></div></div>`;
    const button=document.getElementById('nexusBootstrapAdmin');const status=document.getElementById('nexusBootstrapStatus');
    button?.addEventListener('click',async()=>{button.disabled=true;if(status)status.textContent='管理者権限を設定しています...';try{await request(BOOTSTRAP_URL,{method:'POST'});if(status)status.textContent='設定しました。管理画面を開きます。';setTimeout(()=>location.reload(),350)}catch(error){if(status)status.textContent=error.message||'設定できませんでした。';button.disabled=false}});
  }

  async function boot(){
    if(isMobile()){redirectStaff('home');return}
    if(!token()){location.replace('/#login');return}
    try{
      const me=await request(ME_URL);const ctx=me?.permissions?me:{...me,permissions:me?.permissions||{}};
      if(ctx.permissions?.canOpenAdmin){window.NEXUS_ADMIN_CONTEXT=ctx;window.dispatchEvent(new CustomEvent('nexus-admin-authorized',{detail:ctx}));return}
      const bootstrap=await request(BOOTSTRAP_URL);
      if(bootstrap.bootstrapAvailable){bootstrapScreen(bootstrap);return}
      location.replace('/#home');
    }catch(error){console.error('[NEXUS admin auth]',error);if(error.code==='LOGIN_REQUIRED'||error.status===401){location.replace('/#login');return}location.replace('/#home')}
  }

  window.addEventListener('DOMContentLoaded',boot,{once:true});
  if(document.readyState!=='loading')boot();
})();
