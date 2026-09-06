(() => {
  function removeTrack(grid,index){
    const style=getComputedStyle(grid); const cols=style.gridTemplateColumns.split(' '); if(cols.length<=index)return;
    cols.splice(index,1); grid.style.gridTemplateColumns=cols.join(' ');
  }

  function normalizeCompanyId(value){return value==='ITC'?'GANBARU':value}

  function activeCompany(){
    try{return normalizeCompanyId(typeof activeCompanyId==='string'?activeCompanyId:'all')}catch(_){return'all'}
  }

  function visibleActiveEmployees(){
    try{
      if(!Array.isArray(employees))return[];
      const company=activeCompany();
      return employees.filter(e=>
        e &&
        e.registration==='承認済' &&
        e.employment==='在籍' &&
        e.account==='有効' &&
        (company==='all'||normalizeCompanyId(e.companyId)===company)
      );
    }catch(_){return[]}
  }

  function visibleScheduledToday(){
    try{
      if(!Array.isArray(todayRows))return[];
      const company=activeCompany();
      return todayRows.filter(r=>r&&(company==='all'||normalizeCompanyId(r.companyId)===company));
    }catch(_){return[]}
  }

  function ensureOffTodayCard(){
    const labels=[...document.querySelectorAll('.summary-card .label')];
    const baseLabel=labels.find(el=>['勤務中','退勤済','未打刻'].includes(el.textContent.trim()));
    const grid=baseLabel?.closest('.summary-grid');
    if(!grid)return;

    grid.classList.remove('three');
    grid.style.gridTemplateColumns='repeat(4,minmax(0,1fr))';

    let card=document.getElementById('nexusOffTodayCard');
    if(!card){
      card=document.createElement('div');
      card.className='summary-card';
      card.id='nexusOffTodayCard';
      card.innerHTML='<div class="label">勤務対象外</div><div class="summary-value"><span class="value violet" id="nexusOffTodayValue">0</span><span class="unit">人</span></div>';
      grid.appendChild(card);
    }else if(card.parentElement!==grid){
      grid.appendChild(card);
    }

    const active=visibleActiveEmployees().length;
    const scheduled=visibleScheduledToday().length;
    const offToday=Math.max(0,active-scheduled);
    const value=document.getElementById('nexusOffTodayValue');
    if(value)value.textContent=String(offToday);
  }

  function hideAttendanceLocationColumn(){
    const rows=[...document.querySelectorAll('.trow')];
    for(const row of rows){
      const cells=[...row.children];
      const idx=cells.findIndex(c=>c.textContent.trim()==='位置');
      if(idx<0)continue;
      cells[idx].style.display='none'; removeTrack(row,idx);
      const parent=row.parentElement; if(!parent)continue;
      for(const sibling of parent.children){
        if(sibling===row)continue;
        const children=[...sibling.children];
        if(children[idx])children[idx].style.display='none';
        removeTrack(sibling,idx);
      }
    }
  }

  function apply(){
    hideAttendanceLocationColumn();
    ensureOffTodayCard();
  }

  new MutationObserver(apply).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('DOMContentLoaded',apply);
  window.addEventListener('change',()=>setTimeout(apply,0),true);
  setInterval(apply,500);
})();
