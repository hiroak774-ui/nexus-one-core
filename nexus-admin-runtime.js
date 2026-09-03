(() => {
  const TOKEN_KEY = 'nexusGoogleAccessToken';
  const DATA_URL = '/api/admin/data';
  let loading = false;
  let installed = false;

  function token() {
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (_) { return ''; }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[ch]);
  }

  function hideLegacyAuth() {
    document.body.classList.remove('auth-locked');
    const login = document.getElementById('adminLoginScreen');
    const loadingScreen = document.getElementById('adminLoadingScreen');
    if (login) login.style.display = 'none';
    if (loadingScreen) loadingScreen.style.display = 'none';
  }

  function clearSamples() {
    try {
      if (typeof clearAdminRuntimeData === 'function') clearAdminRuntimeData();
      if (typeof applyAdminDashboardData === 'function') {
        applyAdminDashboardData({ summary:{working:0,completed:0,notClocked:0,pendingApplications:0}, todayRows:[], timeline:[] });
      }
      if (typeof applyAdminAttendanceData === 'function') applyAdminAttendanceData({ rows:[] });
      if (typeof applyAdminApplicationsData === 'function') applyAdminApplicationsData({ rows:[] });
      if (typeof applyAdminEmployeesData === 'function') applyAdminEmployeesData({ rows:[] });
      if (typeof applyAdminWorkPatternsData === 'function') applyAdminWorkPatternsData({ rows:[] });
      if (typeof render === 'function') render();
    } catch (error) {
      console.error('[NEXUS admin clear samples]', error);
    }
  }

  function setAdminProfile(admin = {}) {
    const name = document.querySelector('.admin-name');
    const status = document.querySelector('.admin-status');
    if (name) name.textContent = admin.name || admin.email || '管理者';
    if (status) status.textContent = admin.role || '管理者';
  }

  function workText(minutes) {
    const n = Number(minutes || 0);
    if (!n) return '-';
    const h = Math.floor(n / 60);
    const m = n % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }

  function d1DailyRows(employee) {
    const lastDay = new Date(attCurrentYear, attCurrentMonth + 1, 0).getDate();
    const weekNames = ['日','月','火','水','木','金','土'];
    const pad = n => String(n).padStart(2,'0');
    const records = new Map((Array.isArray(employee?.dailyRecords) ? employee.dailyRecords : []).map(row => [row.date, row]));
    const holidays = new Set(Array.isArray(employee?.holidays) ? employee.holidays : []);
    const rows = [];

    for (let day = 1; day <= lastDay; day++) {
      const date = new Date(attCurrentYear, attCurrentMonth, day);
      const iso = `${attCurrentYear}-${pad(attCurrentMonth + 1)}-${pad(day)}`;
      const week = weekNames[date.getDay()];
      const record = records.get(iso);
      const holiday = holidays.has(iso);

      if (holiday) {
        rows.push({
          d:`${pad(attCurrentMonth+1)}/${pad(day)}(${week})`, dayOnly:pad(day), iso, week,
          in:'休', out:'休', work:'-', main:'休日', tag:'blue', comment:'休日設定', workStyle:'-',
          clockInGps:false, clockOutGps:false, clockInArea:'-', clockOutArea:'-'
        });
        continue;
      }

      if (!record) {
        rows.push({
          d:`${pad(attCurrentMonth+1)}/${pad(day)}(${week})`, dayOnly:pad(day), iso, week,
          in:'-', out:'-', work:'-', main:'記録なし', tag:'', comment:'', workStyle:'-',
          clockInGps:false, clockOutGps:false, clockInArea:'-', clockOutArea:'-'
        });
        continue;
      }

      const gpsMissing = (record.clockIn && !record.clockInGps) || (record.clockOut && !record.clockOutGps);
      rows.push({
        d:`${pad(attCurrentMonth+1)}/${pad(day)}(${week})`, dayOnly:pad(day), iso, week,
        in:record.clockIn || '-', out:record.clockOut || '-', work:workText(record.workMinutes),
        main:record.note ? '要確認' : (gpsMissing ? '位置情報未取得' : '勤務'),
        tag:(record.note || gpsMissing) ? 'orange' : 'green', comment:record.note || '',
        workStyle:record.workStyle || '-',
        clockInGps:record.clockInGps === true, clockOutGps:record.clockOutGps === true,
        clockInArea:record.clockInArea || (record.clockIn ? '取得できませんでした' : '-'),
        clockOutArea:record.clockOutArea || (record.clockOut ? '取得できませんでした' : '-')
      });
    }
    return rows;
  }

  async function fetchData() {
    const accessToken = token();
    if (!accessToken) throw new Error('ログイン情報がありません。');
    const year = Number(typeof attCurrentYear !== 'undefined' ? attCurrentYear : new Date().getFullYear());
    const monthIndex = Number(typeof attCurrentMonth !== 'undefined' ? attCurrentMonth : new Date().getMonth());
    const query = new URLSearchParams({ year:String(year), month:String(monthIndex + 1) });
    const response = await fetch(`${DATA_URL}?${query}`, {
      headers:{ Authorization:`Bearer ${accessToken}` },
      cache:'no-store'
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      location.replace('/index.html#login');
      throw new Error(payload.error || '管理者権限を確認できませんでした。');
    }
    if (!response.ok || !payload.ok) throw new Error(payload.error || '管理画面データを取得できませんでした。');
    return payload.data;
  }

  async function loadD1(options = {}) {
    if (loading) return;
    loading = true;
    const silent = !!options.silent;
    try {
      hideLegacyAuth();
      if (!silent) document.body.classList.add('admin-loading');
      const data = await fetchData();
      setAdminProfile(data.admin || {});
      if (typeof applyAdminDashboardData === 'function') applyAdminDashboardData(data.dashboard || {summary:{},todayRows:[],timeline:[]});
      if (typeof applyAdminAttendanceData === 'function') applyAdminAttendanceData(data.attendance || {rows:[]});
      if (typeof applyAdminApplicationsData === 'function') applyAdminApplicationsData(data.applications || {rows:[]});
      if (typeof applyAdminEmployeesData === 'function') applyAdminEmployeesData(data.employees || {rows:[]});
      if (typeof applyAdminWorkPatternsData === 'function') applyAdminWorkPatternsData(data.workPatterns || {rows:[]});
      if (typeof setUpdatedAtNow === 'function') setUpdatedAtNow();
      if (typeof render === 'function') render();
      document.body.classList.remove('admin-loading','auth-locked');
      hideLegacyAuth();
    } catch (error) {
      console.error('[NEXUS admin D1]', error);
      document.body.classList.remove('admin-loading');
      const errorBox = document.getElementById('adminLoginError');
      if (errorBox) {
        errorBox.textContent = error.message || '管理画面データを取得できませんでした。';
        errorBox.classList.add('show');
      }
    } finally {
      loading = false;
    }
  }

  function install() {
    if (installed) return;
    if (typeof render !== 'function' || typeof applyAdminEmployeesData !== 'function') {
      setTimeout(install, 30);
      return;
    }
    installed = true;

    hideLegacyAuth();
    try { localStorage.removeItem('nexusOneAdminSession'); } catch (_) {}
    try {
      const now = new Date();
      attCurrentYear = now.getFullYear();
      attCurrentMonth = now.getMonth();
    } catch (_) {}

    clearSamples();

    window.loadAdminInitialData = loadD1;
    window.refreshAdminData = () => loadD1({silent:true});
    window.makeDailyRows = d1DailyRows;
    try { makeDailyRows = d1DailyRows; } catch (_) {}

    window.nextAttMonth = async delta => {
      attCurrentMonth += delta;
      if (attCurrentMonth < 0) { attCurrentMonth = 11; attCurrentYear--; }
      if (attCurrentMonth > 11) { attCurrentMonth = 0; attCurrentYear++; }
      await loadD1({silent:true});
    };
    try { nextAttMonth = window.nextAttMonth; } catch (_) {}

    const refresh = document.querySelector('.refresh, [data-action="refresh"], #refreshBtn');
    if (refresh && refresh.dataset.nexusD1Refresh !== '1') {
      refresh.dataset.nexusD1Refresh = '1';
      refresh.addEventListener('click', event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        loadD1({silent:true});
      }, true);
    }

    loadD1();
  }

  window.NEXUS_ADMIN_D1 = { reload: () => loadD1({silent:true}) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
})();
