(() => {
  const TOKEN_KEY = 'nexusGoogleAccessToken';
  const PROFILE_URL = '/api/staff/profile';
  const DAY_SETTINGS_URL = '/api/staff/day-settings';

  function token() {
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (_) { return ''; }
  }

  function setText(doc, id, value, fallback = '—') {
    const el = doc.getElementById(id);
    if (el) el.textContent = value === null || value === undefined || value === '' ? fallback : String(value);
  }

  function formatAddress(address = {}) {
    const postal = address.postalCode ? `〒${address.postalCode}` : '';
    const body = [address.prefecture, address.cityAddress, address.streetAddress, address.building].filter(Boolean).join('');
    return [postal, body].filter(Boolean).join(' ');
  }

  function formatTime(start, end) {
    if (!start && !end) return '';
    return `${start || '—'} - ${end || '—'}`;
  }

  function setStatus(doc, message) {
    const el = doc.getElementById('mypageStatus');
    if (el) el.textContent = message || '';
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[ch]);
  }

  function ensureAddressProfileRow(doc) {
    if (doc.getElementById('profileAddress')) return;
    const email = doc.getElementById('profileEmail');
    const row = email?.closest('.info-row');
    if (!row) return;
    const addressRow = doc.createElement('div');
    addressRow.className = 'info-row';
    addressRow.innerHTML = '<div class="label">現住所</div><div class="value" id="profileAddress">—</div>';
    row.after(addressRow);
  }

  function renderAddressCard(doc, address) {
    const card = doc.getElementById('placeList')?.closest('.card');
    if (card) {
      const title = card.querySelector('.card-title');
      const kicker = card.querySelector('.card-kicker');
      if (title) title.textContent = '現住所';
      if (kicker) kicker.textContent = 'Address';
    }
    const list = doc.getElementById('placeList');
    if (list) {
      const text = formatAddress(address) || '住所未登録';
      list.innerHTML = `<div class="place"><div class="place-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></div><div><div class="place-name">現住所</div><div class="place-meta">${escapeHtml(text)}</div></div></div>`;
    }
  }

  function renderProfile(doc, profile) {
    ensureAddressProfileRow(doc);
    setText(doc, 'employeeChip', profile.employeeNumber || profile.employeeId);
    setText(doc, 'profileName', profile.name);
    setText(doc, 'profileEmployeeId', profile.employeeNumber || profile.employeeId);
    setText(doc, 'profileCompany', profile.companyName);
    setText(doc, 'profileEmail', profile.email);
    setText(doc, 'profileAddress', formatAddress(profile.address), '未登録');
    setText(doc, 'workType', profile.workType);
    setText(doc, 'workPattern', profile.workPatternName || profile.baseWorkPatternId);
    setText(doc, 'workTime', formatTime(profile.workPatternStartTime, profile.workPatternEndTime));
    setText(doc, 'breakMinutes', profile.breakMinutes !== null && profile.breakMinutes !== undefined ? `${profile.breakMinutes}分` : '');
    renderAddressCard(doc, profile.address);
    bindAddressButton(doc, profile);
    ensureHolidayCard(doc);
  }

  function openAddressEditor(doc, profile) {
    const sheet = doc.getElementById('sheet');
    const backdrop = doc.getElementById('sheetBackdrop');
    const title = doc.getElementById('sheetTitle');
    const body = doc.getElementById('sheetBody');
    if (!sheet || !body) return;
    const address = profile.address || {};
    if (title) title.textContent = '住所を編集';
    body.innerHTML = `<div class="request-form"><div class="form-line"><div class="form-label">郵便番号</div><div class="input-shell"><input class="form-control" id="editPostalCode" autocomplete="postal-code" value="${escapeHtml(address.postalCode)}" placeholder="123-4567"></div></div><div class="form-line"><div class="form-label required">都道府県</div><div class="input-shell"><input class="form-control" id="editPrefecture" autocomplete="address-level1" value="${escapeHtml(address.prefecture)}" placeholder="神奈川県"></div></div><div class="form-line"><div class="form-label required">市区町村</div><div class="input-shell"><input class="form-control" id="editCityAddress" autocomplete="address-level2" value="${escapeHtml(address.cityAddress)}" placeholder="横浜市戸塚区"></div></div><div class="form-line"><div class="form-label required">番地</div><div class="input-shell"><input class="form-control" id="editStreetAddress" autocomplete="address-line1" value="${escapeHtml(address.streetAddress)}" placeholder="戸塚町1-2-3"></div></div><div class="form-line"><div class="form-label">建物名・部屋番号</div><div class="input-shell"><input class="form-control" id="editBuilding" autocomplete="address-line2" value="${escapeHtml(address.building)}" placeholder="NEXUSレジデンス101"></div></div></div><div class="request-spacer"></div><div class="sheet-actions single-action"><button class="submit-btn" id="nexusSaveAddress" type="button">保存する</button></div>`;
    sheet.classList.add('show');
    backdrop?.classList.add('show');
    doc.getElementById('nexusSaveAddress')?.addEventListener('click', () => saveAddress(doc));
  }

  function bindAddressButton(doc, profile) {
    const button = doc.getElementById('openAddPlace');
    if (!button) return;
    let target = button;
    if (button.dataset.nexusAddressEditor !== '1') {
      target = button.cloneNode(true);
      target.dataset.nexusAddressEditor = '1';
      button.replaceWith(target);
      target.addEventListener('click', event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        openAddressEditor(doc, doc.documentElement.__nexusStaffProfile || profile);
      }, true);
    }
    target.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>住所を編集';
  }

  async function saveAddress(doc) {
    const accessToken = token();
    if (!accessToken) return;
    const button = doc.getElementById('nexusSaveAddress');
    if (button) button.disabled = true;
    setStatus(doc, '住所を保存しています...');
    try {
      const payload = {
        postalCode: doc.getElementById('editPostalCode')?.value.trim() || '',
        prefecture: doc.getElementById('editPrefecture')?.value.trim() || '',
        cityAddress: doc.getElementById('editCityAddress')?.value.trim() || '',
        streetAddress: doc.getElementById('editStreetAddress')?.value.trim() || '',
        building: doc.getElementById('editBuilding')?.value.trim() || ''
      };
      const response = await fetch(PROFILE_URL, { method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || '住所を保存できませんでした。');
      doc.documentElement.__nexusStaffProfile = result.data;
      renderProfile(doc, result.data);
      doc.getElementById('sheet')?.classList.remove('show');
      doc.getElementById('sheetBackdrop')?.classList.remove('show');
      setStatus(doc, '住所を更新しました。');
      setTimeout(() => setStatus(doc, ''), 1600);
    } catch (error) {
      setStatus(doc, error.message || '住所を保存できませんでした。');
      if (button) button.disabled = false;
    }
  }

  function ensureHolidayStyles(doc) {
    if (doc.getElementById('nexusHolidayStyles')) return;
    const style = doc.createElement('style');
    style.id = 'nexusHolidayStyles';
    style.textContent = `.nexus-holiday-card{margin-top:16px}.nexus-holiday-note{font-size:12px;color:#64748b;line-height:1.55;margin:8px 0 14px}.nexus-holiday-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}.nexus-holiday-week{font-size:10px;text-align:center;color:#94a3b8;font-weight:800;padding-bottom:2px}.nexus-holiday-day{appearance:none;border:1px solid rgba(148,163,184,.24);background:#fff;border-radius:12px;min-height:42px;font-size:13px;font-weight:800;color:#334155;position:relative}.nexus-holiday-day.sun{color:#ef4444}.nexus-holiday-day.sat{color:#2563eb}.nexus-holiday-day.active{background:rgba(37,99,235,.10);border-color:rgba(37,99,235,.38);color:#2563eb}.nexus-holiday-day.active::after{content:'休';position:absolute;right:4px;bottom:2px;font-size:9px;font-weight:900}.nexus-holiday-day.empty{visibility:hidden}.nexus-holiday-save{width:100%;margin-top:14px}.nexus-holiday-status{font-size:12px;color:#64748b;margin-top:8px;text-align:center;min-height:18px}`;
    doc.head.appendChild(style);
  }

  function ensureHolidayCard(doc) {
    if (doc.getElementById('nexusHolidayCard')) return;
    ensureHolidayStyles(doc);
    const anchor = doc.getElementById('placeList')?.closest('.card');
    if (!anchor?.parentElement) return;
    const card = doc.createElement('section');
    card.className = 'card nexus-holiday-card';
    card.id = 'nexusHolidayCard';
    card.innerHTML = `<div class="card-kicker">Schedule</div><div class="card-title">今月の休日設定</div><div class="nexus-holiday-note">当月の休みを選択してください。選択した日は勤怠確認で「休」と表示されます。</div><div id="nexusHolidayMonth"></div><div class="nexus-holiday-grid" id="nexusHolidayGrid"></div><button type="button" class="submit-btn nexus-holiday-save" id="nexusHolidaySave">休日を保存</button><div class="nexus-holiday-status" id="nexusHolidayStatus"></div>`;
    anchor.after(card);
    loadHolidaySettings(doc);
  }

  function currentMonthInfo() {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }

  function dateKey(year, month, day) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function renderHolidayCalendar(doc, data) {
    const { year, month } = data;
    const selected = new Set(data.holidays || []);
    doc.documentElement.__nexusHolidaySelection = selected;
    doc.documentElement.__nexusHolidayYear = year;
    doc.documentElement.__nexusHolidayMonth = month;
    const label = doc.getElementById('nexusHolidayMonth');
    if (label) label.innerHTML = `<div style="font-size:20px;font-weight:900;margin-bottom:10px">${year}<span style="opacity:.45">.</span>${String(month).padStart(2, '0')}</div>`;
    const grid = doc.getElementById('nexusHolidayGrid');
    if (!grid) return;
    const weekdays = ['日','月','火','水','木','金','土'];
    const first = new Date(year, month - 1, 1).getDay();
    const last = new Date(year, month, 0).getDate();
    let html = weekdays.map((w, i) => `<div class="nexus-holiday-week" style="${i===0?'color:#ef4444':i===6?'color:#2563eb':''}">${w}</div>`).join('');
    for (let i = 0; i < first; i++) html += '<button class="nexus-holiday-day empty" tabindex="-1"></button>';
    for (let day = 1; day <= last; day++) {
      const key = dateKey(year, month, day);
      const wd = new Date(year, month - 1, day).getDay();
      html += `<button type="button" class="nexus-holiday-day ${wd===0?'sun':wd===6?'sat':''} ${selected.has(key)?'active':''}" data-date="${key}">${day}</button>`;
    }
    grid.innerHTML = html;
    grid.querySelectorAll('[data-date]').forEach(button => button.addEventListener('click', () => {
      const key = button.dataset.date;
      if (selected.has(key)) selected.delete(key); else selected.add(key);
      button.classList.toggle('active', selected.has(key));
    }));
    doc.getElementById('nexusHolidaySave')?.addEventListener('click', () => saveHolidaySettings(doc), { once: true });
  }

  async function loadHolidaySettings(doc) {
    const accessToken = token();
    if (!accessToken) return;
    const { year, month } = currentMonthInfo();
    const status = doc.getElementById('nexusHolidayStatus');
    if (status) status.textContent = '休日設定を取得しています...';
    try {
      const query = new URLSearchParams({ year: String(year), month: String(month) });
      const response = await fetch(`${DAY_SETTINGS_URL}?${query}`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || '休日設定を取得できませんでした。');
      renderHolidayCalendar(doc, result.data);
      if (status) status.textContent = '';
    } catch (error) {
      if (status) status.textContent = error.message || '休日設定を取得できませんでした。';
    }
  }

  async function saveHolidaySettings(doc) {
    const accessToken = token();
    if (!accessToken) return;
    const button = doc.getElementById('nexusHolidaySave');
    const status = doc.getElementById('nexusHolidayStatus');
    if (button) button.disabled = true;
    if (status) status.textContent = '休日を保存しています...';
    try {
      const year = doc.documentElement.__nexusHolidayYear;
      const month = doc.documentElement.__nexusHolidayMonth;
      const holidays = [...(doc.documentElement.__nexusHolidaySelection || new Set())].sort();
      const response = await fetch(DAY_SETTINGS_URL, { method: 'PUT', headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ year, month, holidays }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || '休日を保存できませんでした。');
      renderHolidayCalendar(doc, result.data);
      if (status) status.textContent = '休日を保存しました。';
      setTimeout(() => { if (status) status.textContent = ''; }, 1800);
    } catch (error) {
      if (status) status.textContent = error.message || '休日を保存できませんでした。';
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function loadProfile(doc) {
    if (!doc || doc.documentElement.dataset.nexusD1ProfileLoading === '1') return;
    const accessToken = token();
    if (!accessToken) return;
    doc.documentElement.dataset.nexusD1ProfileLoading = '1';
    setStatus(doc, '勤務情報を取得しています...');
    try {
      const response = await fetch(PROFILE_URL, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || 'マイページを取得できませんでした。');
      doc.documentElement.__nexusStaffProfile = result.data;
      renderProfile(doc, result.data);
      setStatus(doc, '');
      doc.documentElement.dataset.nexusD1ProfileLoaded = '1';
    } catch (error) {
      setStatus(doc, error.message || 'マイページを取得できませんでした。');
    } finally {
      delete doc.documentElement.dataset.nexusD1ProfileLoading;
    }
  }

  function bindFrame(frame) {
    try {
      const key = frame.contentWindow?.__NEXUS_VIEW_KEY || '';
      if (key !== 'mypage') return;
      loadProfile(frame.contentDocument);
    } catch (_) {}
  }

  function scan() {
    document.querySelectorAll('#nexus-root iframe').forEach(frame => {
      if (!frame.dataset.nexusStaffProfileListener) {
        frame.dataset.nexusStaffProfileListener = '1';
        frame.addEventListener('load', () => setTimeout(() => bindFrame(frame), 0));
      }
      bindFrame(frame);
    });
  }

  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('hashchange', () => setTimeout(scan, 0));
  window.addEventListener('DOMContentLoaded', scan);
  scan();
})();
