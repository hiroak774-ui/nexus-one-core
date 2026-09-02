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

    const style = doc.createElement('style');
    style.textContent = `
      .nexus-location-mark{font-size:10px;font-weight:800;margin-left:5px;vertical-align:1px}
      .nexus-location-mark.ok{color:#16a34a}.nexus-location-mark.ng{color:#f59e0b}.nexus-location-mark.none{color:#a3a3a3}
      .nexus-holiday-label{font-size:13px;font-weight:850;color:#64748b;letter-spacing:.04em}
      .att-row.nexus-holiday{opacity:.78}
    `;
    doc.head.appendChild(style);

    const script = doc.createElement('script');
    script.textContent = `
      (() => {
        const escD1 = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
        const locMark = status => {
          if(status === '取得') return '<span class="nexus-location-mark ok" title="位置情報取得済み">✓位置</span>';
          if(status === '未取得') return '<span class="nexus-location-mark ng" title="位置情報未取得">△位置</span>';
          return '<span class="nexus-location-mark none">-</span>';
        };
        const statusMark = r => {
          if(r.isHoliday) return '<span class="nexus-holiday-label">休</span>';
          if(r.status === 'attention') return '<span class="status warn">申請</span>';
          if(r.status === 'blank') return '<span class="status blank">—</span>';
          return '<span class="status" aria-label="チェック済み"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>';
        };
        function renderD1List(data){
          document.getElementById('monthValue').innerHTML = monthLabel(data.year,data.month);
          document.getElementById('sumDays').textContent = data.summary.attendanceDays;
          document.getElementById('sumHours').textContent = data.summary.totalWorkText;
          document.getElementById('sumIssues').textContent = data.summary.attentionCount;
          const alert = document.getElementById('alertCard');
          if(data.firstIssue){
            alert.classList.add('show');
            document.getElementById('alertText').textContent = displayDate(data.firstIssue.date) + ' ' + data.firstIssue.issueText;
          } else {
            alert.classList.remove('show');
          }

          const list = document.getElementById('attendanceList');
          list.innerHTML = data.records.map(r => {
            const rowClass = r.isHoliday ? 'att-row nexus-holiday' : ('att-row ' + (r.status === 'attention' ? 'focusable' : ''));
            const inTime = r.isHoliday ? '—' : (r.clockIn || '--:--');
            const outTime = r.isHoliday ? '—' : (r.clockOut || '--:--');
            const inLoc = r.isHoliday ? '' : locMark(r.clockInLocationStatus);
            const outLoc = r.isHoliday ? '' : locMark(r.clockOutLocationStatus);
            const work = r.isHoliday ? '休' : (r.workMinutes || '--');
            return '<button class="' + rowClass + '" data-date="' + escD1(r.date) + '" ' + (r.attendanceId ? '' : 'data-empty="1"') + '>' +
              '<div class="att-date"><div class="att-date-main">' + displayDate(r.date) + '</div><div class="att-date-sub ' + (r.isSaturday?'sat':r.isSunday?'sun':'') + '">' + escD1(r.weekday) + '</div></div>' +
              '<div class="att-time"><div class="att-time-line"><div class="att-time-label">IN</div><div class="att-time-value ' + (r.clockIn?'':'empty') + '">' + escD1(inTime) + inLoc + '</div></div>' +
              '<div class="att-time-line"><div class="att-time-label">OUT</div><div class="att-time-value ' + (r.clockOut?'':'empty') + '">' + escD1(outTime) + outLoc + '</div></div></div>' +
              '<div class="att-work ' + (r.workMinutes?'':'empty') + '">' + escD1(work) + '</div><div class="att-status">' + statusMark(r) + '</div>' +
              '</button>';
          }).join('');
          list.querySelectorAll('.att-row').forEach(btn => {
            btn.onclick = () => {
              const record = attendanceData?.records?.find(r => r.date === btn.dataset.date);
              if(!record || !record.attendanceId) return;
              showDetail(btn.dataset.date);
            };
          });
        }
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
            attendanceData = payload.data;
            renderD1List(attendanceData);
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
    [...panel.children].forEach(child => { if (!child.classList.contains('sheet-head')) child.remove(); });
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
