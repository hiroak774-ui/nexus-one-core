(() => {
  const TOKEN_KEY = 'nexusGoogleAccessToken';
  const ATTENDANCE_URL = '/api/staff/attendance';
  const HOME_URL = '/api/staff/home';

  function token() {
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (_) { return ''; }
  }

  async function api(url) {
    const accessToken = token();
    if (!accessToken) throw new Error('ログイン情報がありません。');
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store'
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || 'データを取得できませんでした。');
    return data.data || data;
  }

  function installAttendance(frame) {
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win || win.__NEXUS_VIEW_KEY !== 'attendance') return;
    if (doc.documentElement.dataset.nexusD1Attendance === '1') return;
    doc.documentElement.dataset.nexusD1Attendance = '1';

    const script = doc.createElement('script');
    script.textContent = `
      (() => {
        const escD1 = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
        async function loadAttendanceFromD1(){
          const listEl = document.getElementById('attendanceList');
          if (listEl) listEl.innerHTML = '<div class="loading">勤怠データを読み込んでいます</div>';
          try {
            const accessToken = parent.sessionStorage.getItem('nexusGoogleAccessToken') || '';
            if (!accessToken) throw new Error('ログイン情報がありません。');
            const query = new URLSearchParams({ year: String(selectedYear), month: String(selectedMonth) });
            const response = await fetch('/api/staff/attendance?' + query.toString(), {
              headers: { Authorization: 'Bearer ' + accessToken },
              cache: 'no-store'
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || !payload.ok) throw new Error(payload.error || '勤怠データを取得できませんでした。');
            attendanceData = payload.data || { year:selectedYear, month:selectedMonth, summary:{attendanceDays:0,totalWorkText:'0h',attentionCount:0}, firstIssue:null, records:[] };
            renderList(attendanceData);
          } catch (error) {
            console.error('[NEXUS D1 attendance]', error);
            if (listEl) listEl.innerHTML = '<div class="empty-state">' + escD1(error.message || '勤怠データを取得できませんでした。') + '</div>';
          }
        }
        loadAttendanceData = loadAttendanceFromD1;
        window.loadAttendanceData = loadAttendanceFromD1;
        window.refreshAttendanceData = loadAttendanceFromD1;
        loadAttendanceFromD1();
      })();
    `;
    doc.body.appendChild(script);
  }

  function makeNotice(doc, item) {
    const notice = doc.createElement('div');
    notice.className = `notice${Number(item.is_read || 0) === 0 ? ' warn' : ''}`;

    const icon = doc.createElement('div');
    icon.className = 'notice-icon';
    icon.innerHTML = Number(item.is_read || 0) === 0
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 6 9 17l-5-5"/></svg>';

    const body = doc.createElement('div');
    const title = doc.createElement('div');
    title.className = 'notice-title';
    title.textContent = item.title || '通知';
    const text = doc.createElement('div');
    text.className = 'notice-text';
    text.textContent = item.body || '';
    body.append(title, text);
    notice.append(icon, body);
    return notice;
  }

  async function renderNotifications(frame) {
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win || win.__NEXUS_VIEW_KEY !== 'home') return;
    if (doc.documentElement.dataset.nexusD1Notifications === '1') return;
    doc.documentElement.dataset.nexusD1Notifications = '1';

    const panel = doc.getElementById('notifyPanel');
    if (!panel) return;

    [...panel.children].forEach(child => {
      if (!child.classList.contains('sheet-head')) child.remove();
    });

    try {
      const data = await api(HOME_URL);
      const notifications = Array.isArray(data.notifications) ? data.notifications : [];
      const unread = notifications.filter(item => Number(item.is_read || 0) === 0).length;
      const badge = doc.querySelector('#notifyBtn .badge');
      if (badge) badge.style.display = unread > 0 ? '' : 'none';

      if (!notifications.length) {
        const empty = doc.createElement('div');
        empty.className = 'notice';
        empty.innerHTML = '<div><div class="notice-title">データがありません</div><div class="notice-text">現在、新しい通知はありません。</div></div>';
        panel.appendChild(empty);
        return;
      }

      notifications.forEach(item => panel.appendChild(makeNotice(doc, item)));
    } catch (error) {
      console.error('[NEXUS D1 notifications]', error);
      const badge = doc.querySelector('#notifyBtn .badge');
      if (badge) badge.style.display = 'none';
      const empty = doc.createElement('div');
      empty.className = 'notice';
      empty.innerHTML = '<div><div class="notice-title">通知を取得できませんでした</div><div class="notice-text"></div></div>';
      empty.querySelector('.notice-text').textContent = error.message || '';
      panel.appendChild(empty);
    }
  }

  function bind(frame) {
    try {
      const key = frame.contentWindow?.__NEXUS_VIEW_KEY || '';
      if (key === 'attendance') installAttendance(frame);
      if (key === 'home') renderNotifications(frame);
    } catch (_) {}
  }

  function scan() {
    document.querySelectorAll('#nexus-root iframe').forEach(frame => {
      bind(frame);
      if (frame.dataset.nexusStaffRuntimeBound === '1') return;
      frame.dataset.nexusStaffRuntimeBound = '1';
      frame.addEventListener('load', () => setTimeout(() => bind(frame), 0));
    });
  }

  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('DOMContentLoaded', scan);
  window.addEventListener('hashchange', () => setTimeout(scan, 0));
  scan();
})();
