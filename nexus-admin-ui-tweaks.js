(() => {
  function removeTrack(grid,index){
    const style=getComputedStyle(grid); const cols=style.gridTemplateColumns.split(' '); if(cols.length<=index)return;
    cols.splice(index,1); grid.style.gridTemplateColumns=cols.join(' ');
  }
  function apply(){
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
  new MutationObserver(apply).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('DOMContentLoaded',apply); setInterval(apply,800);
})();
