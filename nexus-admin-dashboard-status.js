(() => {
  function eligibleEmployees() {
    if (!Array.isArray(window.employees)) return [];
    const companyId = typeof window.activeCompanyId === 'string' ? window.activeCompanyId : 'all';
    return window.employees.filter(employee => {
      const inCompany = companyId === 'all' || employee.companyId === companyId;
      return inCompany && employee.registration === '承認済' && employee.employment === '在籍' && employee.account === '有効';
    });
  }

  function visibleTodayRows() {
    if (!Array.isArray(window.todayRows)) return [];
    const companyId = typeof window.activeCompanyId === 'string' ? window.activeCompanyId : 'all';
    return window.todayRows.filter(row => companyId === 'all' || row.companyId === companyId);
  }

  function ensureCard() {
    const grid = document.querySelector('.today-summary-grid');
    if (!grid) return null;
    grid.style.gridTemplateColumns = 'repeat(4,minmax(0,1fr))';
    let card = document.getElementById('nexusOffTodayCard');
    if (!card) {
      card = document.createElement('div');
      card.className = 'summary-card today-summary-card';
      card.id = 'nexusOffTodayCard';
      card.innerHTML = '<div><div class="label">勤務対象外</div><div class="summary-value"><span class="value violet" id="dashOffTodayCount">0</span><span class="unit">名</span></div></div>';
      grid.appendChild(card);
    }
    return card;
  }

  function render() {
    ensureCard();
    const rows = visibleTodayRows();
    const eligible = eligibleEmployees();
    const scheduledIds = new Set(rows.map(row => row.employeeId || row.id).filter(Boolean));
    const working = rows.filter(row => row.status === '勤務中').length;
    const completed = rows.filter(row => row.status === '退勤済').length;
    const notClocked = rows.filter(row => row.status === '未打刻').length;
    const offToday = Math.max(0, eligible.filter(employee => !scheduledIds.has(employee.id)).length);

    const set = (selector, value) => {
      const element = document.querySelector(selector);
      if (element) element.textContent = String(value);
    };
    set('#dashWorkingCount', working);
    set('#dashCompletedCount', completed);
    set('#dashNotClockedCount', notClocked);
    set('#dashOffTodayCount', offToday);

    const notClockedFocus = document.querySelector('#dashNotClockedFocus');
    if (notClockedFocus) notClockedFocus.textContent = `未打刻 ${notClocked}名`;
  }

  function bindCompanySwitch() {
    const select = document.getElementById('globalCompanySwitch');
    if (!select || select.dataset.nexusStatusBound === '1') return;
    select.dataset.nexusStatusBound = '1';
    select.addEventListener('change', () => setTimeout(render, 0));
  }

  function install() {
    ensureCard();
    bindCompanySwitch();
    render();
  }

  new MutationObserver(() => install()).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('DOMContentLoaded', install);
  window.addEventListener('load', install);
  setInterval(render, 500);
})();
