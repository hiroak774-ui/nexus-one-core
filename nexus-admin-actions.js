(() => {
  const TOKEN_KEY = 'nexusGoogleAccessToken';
  const ACTION_URL = '/api/admin/action';
  let installed = false;

  function token() {
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (_) { return ''; }
  }

  async function post(action, payload = {}) {
    const accessToken = token();
    if (!accessToken) throw new Error('ログイン情報がありません。');
    const response = await fetch(ACTION_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action, ...payload })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || '更新できませんでした。');
    return data.data;
  }

  async function reload() {
    if (window.NEXUS_ADMIN_D1?.reload) await window.NEXUS_ADMIN_D1.reload();
  }

  function install() {
    if (installed) return;
    if (typeof employeeDetailHtml !== 'function' || typeof updateApplicationStatus !== 'function') {
      setTimeout(install, 40);
      return;
    }
    installed = true;

    try { adminHasApi = () => true; } catch (_) {}

    const visibleEmployees = () => employees.filter(employee => employee.employment !== '退職' && (activeCompanyId === 'all' || employee.companyId === activeCompanyId));
    const employeeStatusLabel = employee => {
      if (employee.registration === '承認待ち') return '承認待ち';
      if (employee.registration === '差戻し') return '差戻し';
      if (employee.registration === '却下') return '却下';
      return employee.account === '有効' ? '利用中' : '停止中';
    };
    const employeeStatusClass = employee => employee.registration === '承認済' ? (employee.account === '有効' ? 'green' : 'orange') : 'orange';
    window.empVisibleBase = visibleEmployees;
    window.empStatusLabel = employeeStatusLabel;
    window.empStatusClass = employeeStatusClass;
    try { empVisibleBase=visibleEmployees; empStatusLabel=employeeStatusLabel; empStatusClass=employeeStatusClass; } catch (_) {}

    const syncApplication = async (id, nextStatus, comment) => {
      const result = await post('updateApplicationStatus', { applicationId:id, status:nextStatus, comment });
      await reload();
      return result;
    };
    window.adminSyncApplicationStatus = syncApplication;
    try { adminSyncApplicationStatus = syncApplication; } catch (_) {}

    const syncEmployee = async employee => {
      const result = await post('updateEmployee', {
        employeeId:employee.id, name:employee.name, email:employee.email, companyId:employee.companyId,
        roleId:employee.roleId === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : employee.roleId,
        account:employee.account, workType:employee.type, pattern:employee.pattern,
        paidTotal:employee.paidTotal, paidUsed:employee.paidUsed, joined:employee.joined,
        postalCode:employee.postalCode || '', address:employee.address || '', building:employee.building || '',
        clientName:employee.clientName || ''
      });
      await reload();
      return result;
    };
    window.adminSyncEmployee = syncEmployee;
    try { adminSyncEmployee = syncEmployee; } catch (_) {}

    const syncAttendanceRequest = async (employee, message, dayLabel) => post('sendAttendanceCheckRequest', { employeeId:employee.id, message, relatedId:dayLabel || '' });
    window.adminSyncAttendanceRequest = syncAttendanceRequest;
    try { adminSyncAttendanceRequest = syncAttendanceRequest; } catch (_) {}

    const syncCloseMonthly = async employee => {
      const month = `${attCurrentYear}-${String(attCurrentMonth + 1).padStart(2,'0')}`;
      return post('closeMonthlyAttendance', { employeeId:employee.id, month });
    };
    window.adminSyncCloseMonthly = syncCloseMonthly;
    try { adminSyncCloseMonthly = syncCloseMonthly; } catch (_) {}

    const originalDetail = employeeDetailHtml;
    const d1EmployeeDetail = employee => {
      const html = originalDetail(employee);
      if (employee?.registration !== '承認待ち') return html;
      return html + `<div class="drawer-section"><h4>初回登録申請</h4><div class="summary-note">この社員は登録承認待ちです。内容を確認して承認してください。</div><div class="drawer-actions"><button class="action primary" onclick="nexusApproveEmployee('${employee.id}')">登録を承認する</button></div></div>`;
    };
    window.employeeDetailHtml = d1EmployeeDetail;
    try { employeeDetailHtml = d1EmployeeDetail; } catch (_) {}

    window.nexusApproveEmployee = async employeeId => {
      try {
        const ok = typeof modal === 'function' ? await modal('登録を承認しますか','承認後、この社員はスタッフ画面を利用できます。','承認') : true;
        if (!ok) return;
        await post('approveEmployee', { employeeId });
        if (typeof closeDrawer === 'function') closeDrawer();
        if (typeof toast === 'function') toast();
        await reload();
      } catch (error) {
        console.error('[NEXUS approve employee]', error);
        alert(error.message || '承認できませんでした。');
      }
    };

    const d1ToggleEmployeeAccount = async id => {
      const employee = employees.find(item => item.id === id);
      if (!employee) return;
      const next = employee.account === '有効' ? '無効' : '有効';
      const ok = typeof modal === 'function' ? await modal(next === '無効' ? '利用を停止しますか' : '利用を再開しますか',`${employee.name} さんのアカウント状態を変更します。`,'実行') : true;
      if (!ok) return;
      try {
        await post('setEmployeeAccount', { employeeId:id, account:next });
        if (typeof closeDrawer === 'function') closeDrawer();
        if (typeof toast === 'function') toast();
        await reload();
      } catch (error) {
        console.error('[NEXUS employee account]', error);
        alert(error.message || '更新できませんでした。');
      }
    };
    window.toggleEmployeeAccount = d1ToggleEmployeeAccount;
    try { toggleEmployeeAccount = d1ToggleEmployeeAccount; } catch (_) {}

    const d1RetireEmployee = async id => {
      const employee = employees.find(item => item.id === id);
      if (!employee) return;
      const ok = typeof modal === 'function' ? await modal('退職扱いにしますか',`${employee.name} さんを退職扱いにします。過去データは保持します。`,'退職扱い') : true;
      if (!ok) return;
      try {
        await post('retireEmployee', { employeeId:id });
        if (typeof closeDrawer === 'function') closeDrawer();
        if (typeof toast === 'function') toast();
        await reload();
      } catch (error) {
        console.error('[NEXUS retire employee]', error);
        alert(error.message || '更新できませんでした。');
      }
    };
    window.retireEmployee = d1RetireEmployee;
    try { retireEmployee = d1RetireEmployee; } catch (_) {}

    if (typeof renderEmployeeRows === 'function') renderEmployeeRows();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
})();
