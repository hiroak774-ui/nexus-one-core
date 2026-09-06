(() => {
  const TOKEN_KEY='nexusGoogleAccessToken';
  const PROFILE_URL='/api/staff/profile';
  function token(){try{return sessionStorage.getItem(TOKEN_KEY)||''}catch(_){return''}}
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  async function save(doc,input,button,status){
    const accessToken=token(); if(!accessToken)return;
    button.disabled=true; status.textContent='保存しています...';
    try{
      const r=await fetch(PROFILE_URL,{method:'PATCH',headers:{Authorization:`Bearer ${accessToken}`,'content-type':'application/json'},body:JSON.stringify({currentClientName:input.value.trim()})});
      const j=await r.json().catch(()=>({})); if(!r.ok||!j.ok)throw new Error(j.error||'保存できませんでした。');
      input.value=j.data.currentClientName||''; status.textContent='更新しました。';
      if(doc.documentElement.__nexusStaffProfile)doc.documentElement.__nexusStaffProfile.currentClientName=j.data.currentClientName||'';
      setTimeout(()=>status.textContent='',1500);
    }catch(e){status.textContent=e.message||'保存できませんでした。'}finally{button.disabled=false}
  }
  function install(doc){
    if(doc.getElementById('nexusClientCard'))return;
    const workType=doc.getElementById('workType');
    const card=workType?.closest('.card');
    if(!card?.parentElement)return;
    const section=doc.createElement('section'); section.className='card'; section.id='nexusClientCard';
    section.innerHTML=`<div class="card-kicker">Workplace</div><div class="card-title">現在のクライアント先</div><div style="margin-top:12px"><input id="nexusClientInput" value="" placeholder="例：楽天グループ株式会社 / 自社勤務 / 待機中" style="width:100%;box-sizing:border-box;border:1px solid rgba(148,163,184,.25);border-radius:14px;padding:12px 14px;font:inherit;background:transparent;color:inherit"></div><button id="nexusClientSave" type="button" class="submit-btn" style="width:100%;margin-top:12px">保存する</button><div id="nexusClientStatus" style="min-height:18px;margin-top:8px;text-align:center;font-size:12px;color:#64748b"></div>`;
    card.after(section);
    const input=section.querySelector('#nexusClientInput'),button=section.querySelector('#nexusClientSave'),status=section.querySelector('#nexusClientStatus');
    const profile=doc.documentElement.__nexusStaffProfile; if(profile)input.value=profile.currentClientName||'';
    button.addEventListener('click',()=>save(doc,input,button,status));
    const observer=new MutationObserver(()=>{const p=doc.documentElement.__nexusStaffProfile;if(p&&document.activeElement!==input)input.value=p.currentClientName||''}); observer.observe(doc.documentElement,{childList:true,subtree:true});
  }
  function scan(){document.querySelectorAll('#nexus-root iframe').forEach(frame=>{try{const doc=frame.contentDocument;if(doc&&frame.contentWindow?.__NEXUS_VIEW_KEY==='mypage')install(doc)}catch(_){}})}
  new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true}); window.addEventListener('DOMContentLoaded',scan); setInterval(scan,1000);
})();
