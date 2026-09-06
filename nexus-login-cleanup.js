(() => {
  function cleanLoginDoc(doc){
    if(!doc) return;
    const ids=['loginBtn','emailBtn','emailInput'];
    ids.forEach(id=>{
      const el=doc.getElementById(id);
      if(!el) return;
      const holder=el.closest('.input-group,.row,.field,.form-group,label');
      (holder||el).remove();
    });
    doc.querySelectorAll('.divider').forEach(el=>el.remove());
    [...doc.querySelectorAll('div,span,p,label')].forEach(el=>{
      const text=(el.textContent||'').trim().toLowerCase();
      if(text==='or' || text==='メールアドレス' || text==='mail address') el.remove();
    });
  }

  function scan(){
    document.querySelectorAll('#nexus-root iframe').forEach(frame=>{
      try{
        if(frame.contentWindow?.__NEXUS_VIEW_KEY==='login') cleanLoginDoc(frame.contentDocument);
      }catch(_){}
    });
  }

  new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('DOMContentLoaded',scan);
  window.addEventListener('hashchange',scan);
  setInterval(scan,500);
})();
