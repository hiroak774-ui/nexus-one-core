(() => {
  const STAFF_OVERLAYS = ['#sheet','#notifyPanel','#transportPanel','#locationConfirm','#done','#pending'];

  function closeOverlay(el){
    if (!el) return;
    el.classList.remove('show','confirm-pop','soft-pop');
  }

  function closeStaffOverlays(doc, except = null){
    STAFF_OVERLAYS.forEach(selector => {
      doc.querySelectorAll(selector).forEach(el => {
        if (el !== except) closeOverlay(el);
      });
    });
    if (!except || except.id !== 'sheet') doc.getElementById('sheetBackdrop')?.classList.remove('show');
  }

  function bindCompanySheet(doc){
    const original = doc.querySelector('[data-sheet="company"]');
    if (!original || original.dataset.nexusSingleHandler === '1') return;

    const trigger = original.cloneNode(true);
    trigger.dataset.nexusSingleHandler = '1';
    trigger.dataset.nexusD1 = '1';
    original.replaceWith(trigger);

    trigger.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const sheet = doc.getElementById('sheet');
      const backdrop = doc.getElementById('sheetBackdrop');
      const title = doc.getElementById('sheetTitle');
      const options = doc.getElementById('sheetOptions');
      const target = doc.getElementById('companyValue');
      if (!sheet || !options || !target) return;

      closeStaffOverlays(doc, sheet);
      if (title) title.textContent = '所属会社';
      options.innerHTML = '';

      [
        ['HRC','HR COMPANY株式会社'],
        ['GANBARU','株式会社がんばる']
      ].forEach(([id,label]) => {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'option';
        button.textContent = label;
        if (target.dataset.id === id) button.classList.add('active');
        button.addEventListener('click', selectEvent => {
          selectEvent.preventDefault();
          selectEvent.stopPropagation();
          target.dataset.id = id;
          target.textContent = label;
          closeOverlay(sheet);
          backdrop?.classList.remove('show');
        }, { once:true });
        options.appendChild(button);
      });

      sheet.classList.add('show');
      backdrop?.classList.add('show');
    }, true);
  }

  function bindSingleClose(doc, id){
    const original = doc.getElementById(id);
    if (!original || original.dataset.nexusSingleClose === '1') return;
    const fresh = original.cloneNode(true);
    fresh.dataset.nexusSingleClose = '1';
    original.replaceWith(fresh);
    fresh.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      closeStaffOverlays(doc);
    });
  }

  function installOverlayObserver(doc){
    if (doc.documentElement.dataset.nexusOverlayGuard === '1') return;
    doc.documentElement.dataset.nexusOverlayGuard = '1';
    let active = null;
    const observer = new MutationObserver(records => {
      for (const record of records){
        const el = record.target;
        if (!(el instanceof doc.defaultView.Element)) continue;
        if (!el.classList.contains('show')) continue;
        if (!STAFF_OVERLAYS.some(selector => el.matches(selector))) continue;
        if (active && active !== el && active.isConnected) closeOverlay(active);
        active = el;
      }
    });
    STAFF_OVERLAYS.forEach(selector => doc.querySelectorAll(selector).forEach(el => observer.observe(el,{attributes:true,attributeFilter:['class']})));
  }

  function install(frame){
    try{
      const doc = frame.contentDocument;
      const key = frame.contentWindow?.__NEXUS_VIEW_KEY || '';
      if (!doc || !key) return;
      if (key === 'setup') bindCompanySheet(doc);
      bindSingleClose(doc,'closeSheet');
      installOverlayObserver(doc);
    }catch(_){}
  }

  function scan(){
    document.querySelectorAll('#nexus-root iframe').forEach(frame => {
      install(frame);
      if (frame.dataset.nexusUiDedupeBound === '1') return;
      frame.dataset.nexusUiDedupeBound = '1';
      frame.addEventListener('load', () => setTimeout(() => install(frame),0));
    });
  }

  new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('DOMContentLoaded',scan);
  window.addEventListener('hashchange',()=>setTimeout(scan,0));
  scan();
})();
