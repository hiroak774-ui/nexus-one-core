(() => {
  const TOKEN_KEY = 'nexusGoogleAccessToken';
  const PROFILE_URL = '/api/staff/profile';

  function token(){try{return sessionStorage.getItem(TOKEN_KEY)||''}catch(_){return''}}
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

  function ensureStyles(doc){
    if(doc.getElementById('nexusClientCardStyles')) return;
    const style = doc.createElement('style');
    style.id = 'nexusClientCardStyles';
    style.textContent = `
      #nexusClientCard{
        --nexus-client-text:#111827;
        --nexus-client-muted:#64748b;
        --nexus-client-border:rgba(15,23,42,.24);
        --nexus-client-placeholder:rgba(71,85,105,.72);
        color:var(--nexus-client-text)!important;
      }
      html.nexus-theme-dark #nexusClientCard{
        --nexus-client-text:#f8fafc;
        --nexus-client-muted:#cbd5e1;
        --nexus-client-border:rgba(226,232,240,.34);
        --nexus-client-placeholder:rgba(203,213,225,.72);
      }
      #nexusClientCard .card-title,
      #nexusClientCard .nexus-client-label,
      #nexusClientCard .nexus-client-value,
      #nexusClientCard input,
      #nexusClientCard textarea{color:var(--nexus-client-text)!important}
      html.nexus-theme-dark #nexusClientCard .card-title{color:#fff!important}
      #nexusClientCard .card-kicker,
      #nexusClientCard .nexus-client-muted,
      #nexusClientCard .nexus-client-status{color:var(--nexus-client-muted)!important}
      #nexusClientCard .nexus-client-summary{margin-top:14px;padding:14px;border:1px solid var(--nexus-client-border);border-radius:16px;background:rgba(255,255,255,.015);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
      #nexusClientCard .nexus-client-row{display:grid;grid-template-columns:84px minmax(0,1fr);gap:10px;padding:8px 0;border-bottom:1px solid var(--nexus-client-border)}
      #nexusClientCard .nexus-client-row:last-child{border-bottom:0}
      #nexusClientCard .nexus-client-label{font-size:11px;font-weight:800;opacity:.74}
      #nexusClientCard .nexus-client-value{font-size:13px;font-weight:800;line-height:1.6;word-break:break-word}
      #nexusClientCard .nexus-client-form{margin-top:14px}
      #nexusClientCard .nexus-client-field{margin-top:11px}
      #nexusClientCard .nexus-client-field:first-child{margin-top:0}
      #nexusClientCard .nexus-client-field label{display:block;margin-bottom:6px;font-size:11px;font-weight:800;color:var(--nexus-client-text)!important}
      #nexusClientCard input,#nexusClientCard textarea{width:100%;box-sizing:border-box;border:1px solid var(--nexus-client-border);border-radius:14px;padding:12px 14px;font:inherit;background:rgba(255,255,255,.015)!important;outline:none;color:var(--nexus-client-text)!important;caret-color:var(--nexus-client-text);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
      html.nexus-theme-dark #nexusClientCard input,html.nexus-theme-dark #nexusClientCard textarea{background:rgba(255,255,255,.035)!important}
      #nexusClientCard input:focus,#nexusClientCard textarea:focus{border-color:rgba(96,165,250,.72);box-shadow:0 0 0 3px rgba(59,130,246,.10)}
      #nexusClientCard textarea{min-height:84px;resize:vertical;line-height:1.55}
      #nexusClientCard input::placeholder,#nexusClientCard textarea::placeholder{color:var(--nexus-client-placeholder)!important;opacity:1}
      #nexusClientCard .nexus-client-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
      #nexusClientCard .nexus-client-edit{width:100%;margin-top:12px}
      #nexusClientCard .nexus-client-cancel{border:1px solid var(--nexus-client-border);background:transparent;color:var(--nexus-client-text);border-radius:14px;font-weight:800}
      #nexusClientCard .nexus-client-status{min-height:18px;margin-top:8px;text-align:center;font-size:12px}
    `;
    doc.head.appendChild(style);
  }

  function parseRgb(value){
    const m = String(value||'').match(/rgba?\((\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/i);
    return m ? [Number(m[1]),Number(m[2]),Number(m[3])] : null;
  }

  function syncTheme(doc){
    const root=doc.documentElement;
    const body=doc.body;
    const explicit=[root?.dataset?.theme,body?.dataset?.theme,root?.getAttribute('data-mode'),body?.getAttribute('data-mode'),root?.className,body?.className].filter(Boolean).join(' ').toLowerCase();
    let dark=/dark|night/.test(explicit);
    if(!dark){
      const bodyColor=body ? getComputedStyle(body).color : '';
      const textRgb=parseRgb(bodyColor);
      if(textRgb){
        const textLum=(0.2126*textRgb[0]+0.7152*textRgb[1]+0.0722*textRgb[2])/255;
        if(textLum>.68) dark=true;
      }
    }
    if(!dark){
      const candidates=[body,root].filter(Boolean);
      for(const el of candidates){
        const value=getComputedStyle(el).backgroundColor;
        const rgb=parseRgb(value);
        if(!rgb) continue;
        const luminance=(0.2126*rgb[0]+0.7152*rgb[1]+0.0722*rgb[2])/255;
        if(luminance<0.45){dark=true;break}
      }
    }
    if(!dark && window.matchMedia?.('(prefers-color-scheme: dark)').matches) dark=true;
    root.classList.toggle('nexus-theme-dark',dark);
  }

  function hasSaved(profile={}){
    return !!(profile.currentClientName && profile.currentClientWorkDescription && profile.currentClientNearestStation);
  }

  function summaryHtml(profile={}){
    return `<div class="nexus-client-summary" id="nexusClientSummary">
      <div class="nexus-client-row"><div class="nexus-client-label">会社名</div><div class="nexus-client-value">${esc(profile.currentClientName||'未登録')}</div></div>
      <div class="nexus-client-row"><div class="nexus-client-label">業務内容</div><div class="nexus-client-value">${esc(profile.currentClientWorkDescription||'未登録')}</div></div>
      <div class="nexus-client-row"><div class="nexus-client-label">最寄駅</div><div class="nexus-client-value">${esc(profile.currentClientNearestStation||'未登録')}</div></div>
    </div>`;
  }

  function formHtml(profile={}){
    return `<div class="nexus-client-form" id="nexusClientForm">
      <div class="nexus-client-field"><label for="nexusClientName">会社名</label><input id="nexusClientName" value="${esc(profile.currentClientName||'')}" placeholder="例：株式会社サンプル"></div>
      <div class="nexus-client-field"><label for="nexusClientWork">業務内容</label><textarea id="nexusClientWork" placeholder="例：社内システムの運用サポート">${esc(profile.currentClientWorkDescription||'')}</textarea></div>
      <div class="nexus-client-field"><label for="nexusClientStation">最寄駅</label><input id="nexusClientStation" value="${esc(profile.currentClientNearestStation||'')}" placeholder="例：東京駅"></div>
      <div class="nexus-client-actions"><button type="button" class="nexus-client-cancel" id="nexusClientCancel">キャンセル</button><button type="button" class="submit-btn" id="nexusClientSave">保存する</button></div>
    </div>`;
  }

  function render(doc,profile,editing=false){
    const card=doc.getElementById('nexusClientCard'); if(!card) return;
    doc.documentElement.__nexusClientProfile=profile;
    const saved=hasSaved(profile);
    card.innerHTML=`<div class="card-kicker">Workplace</div><div class="card-title">現在のクライアント先</div>
      ${saved ? summaryHtml(profile) : '<div class="nexus-client-muted" style="margin-top:10px;font-size:12px">クライアント先情報は未登録です。</div>'}
      ${(editing||!saved) ? formHtml(profile) : '<button type="button" class="submit-btn nexus-client-edit" id="nexusClientEdit">編集する</button>'}
      <div id="nexusClientStatus" class="nexus-client-status"></div>`;

    card.querySelector('#nexusClientEdit')?.addEventListener('click',()=>render(doc,profile,true));
    card.querySelector('#nexusClientCancel')?.addEventListener('click',()=>render(doc,profile,false));
    card.querySelector('#nexusClientSave')?.addEventListener('click',()=>save(doc));
    syncTheme(doc);
  }

  async function save(doc){
    const accessToken=token(); if(!accessToken) return;
    const button=doc.getElementById('nexusClientSave');
    const status=doc.getElementById('nexusClientStatus');
    const payload={
      currentClientName:doc.getElementById('nexusClientName')?.value.trim()||'',
      currentClientWorkDescription:doc.getElementById('nexusClientWork')?.value.trim()||'',
      currentClientNearestStation:doc.getElementById('nexusClientStation')?.value.trim()||''
    };
    if(button) button.disabled=true;
    if(status) status.textContent='保存しています...';
    try{
      const response=await fetch(PROFILE_URL,{method:'PATCH',headers:{Authorization:`Bearer ${accessToken}`,'content-type':'application/json'},body:JSON.stringify(payload)});
      const result=await response.json().catch(()=>({}));
      if(!response.ok||!result.ok) throw new Error(result.error||'保存できませんでした。');
      doc.documentElement.__nexusStaffProfile=result.data;
      render(doc,result.data,false);
      const nextStatus=doc.getElementById('nexusClientStatus');
      if(nextStatus){nextStatus.textContent='更新しました。';setTimeout(()=>{if(nextStatus.isConnected)nextStatus.textContent=''},1500)}
    }catch(error){
      if(status) status.textContent=error.message||'保存できませんでした。';
      if(button) button.disabled=false;
    }
  }

  async function fetchProfile(doc){
    const accessToken=token(); if(!accessToken) return null;
    const response=await fetch(PROFILE_URL,{headers:{Authorization:`Bearer ${accessToken}`},cache:'no-store'});
    const result=await response.json().catch(()=>({}));
    if(!response.ok||!result.ok) throw new Error(result.error||'勤務情報を取得できませんでした。');
    doc.documentElement.__nexusStaffProfile=result.data;
    return result.data;
  }

  async function install(doc){
    if(doc.getElementById('nexusClientCard')) return;
    const workType=doc.getElementById('workType');
    const anchor=workType?.closest('.card');
    if(!anchor?.parentElement) return;
    ensureStyles(doc);
    const section=doc.createElement('section');
    section.className='card';
    section.id='nexusClientCard';
    section.innerHTML='<div class="card-kicker">Workplace</div><div class="card-title">現在のクライアント先</div><div class="nexus-client-muted" style="margin-top:10px;font-size:12px">読み込んでいます...</div>';
    anchor.after(section);
    syncTheme(doc);

    const observer=new MutationObserver(()=>syncTheme(doc));
    observer.observe(doc.documentElement,{attributes:true,attributeFilter:['class','style','data-theme','data-mode']});
    observer.observe(doc.body,{attributes:true,attributeFilter:['class','style','data-theme','data-mode']});

    try{
      const profile=doc.documentElement.__nexusStaffProfile || await fetchProfile(doc);
      render(doc,profile||{},false);
    }catch(error){
      section.innerHTML=`<div class="card-kicker">Workplace</div><div class="card-title">現在のクライアント先</div><div class="nexus-client-status">${esc(error.message||'勤務情報を取得できませんでした。')}</div>`;
    }
  }

  function scan(){
    document.querySelectorAll('#nexus-root iframe').forEach(frame=>{
      try{
        const doc=frame.contentDocument;
        if(doc&&frame.contentWindow?.__NEXUS_VIEW_KEY==='mypage') install(doc);
      }catch(_){}
    });
  }
  new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('DOMContentLoaded',scan);
  setInterval(scan,1000);
})();
