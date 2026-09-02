(() => {
  const TOKEN_KEY = 'nexusGoogleAccessToken';
  const PROFILE_URL = '/api/staff/profile';

  function token() {
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (_) { return ''; }
  }

  function setText(doc, id, value, fallback = '—') {
    const el = doc.getElementById(id);
    if (el) el.textContent = value === null || value === undefined || value === '' ? fallback : String(value);
  }

  function formatAddress(address = {}) {
    const postal = address.postalCode ? `〒${address.postalCode}` : '';
    const body = [address.prefecture, address.cityAddress, address.streetAddress, address.building]
      .filter(Boolean)
      .join('');
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
      list.innerHTML = `
        <div class="place">
          <div class="place-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          </div>
          <div>
            <div class="place-name">現住所</div>
            <div class="place-meta">${escapeHtml(text)}</div>
          </div>
        </div>`;
    }
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[ch]);
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
  }

  function openAddressEditor(doc, profile) {
    const sheet = doc.getElementById('sheet');
    const backdrop = doc.getElementById('sheetBackdrop');
    const title = doc.getElementById('sheetTitle');
    const body = doc.getElementById('sheetBody');
    if (!sheet || !body) return;

    const address = profile.address || {};
    if (title) title.textContent = '住所を編集';
    body.innerHTML = `
      <div class="request-form">
        <div class="form-line"><div class="form-label">郵便番号</div><div class="input-shell"><input class="form-control" id="editPostalCode" autocomplete="postal-code" value="${escapeHtml(address.postalCode)}" placeholder="123-4567"></div></div>
        <div class="form-line"><div class="form-label required">都道府県</div><div class="input-shell"><input class="form-control" id="editPrefecture" autocomplete="address-level1" value="${escapeHtml(address.prefecture)}" placeholder="神奈川県"></div></div>
        <div class="form-line"><div class="form-label required">市区町村</div><div class="input-shell"><input class="form-control" id="editCityAddress" autocomplete="address-level2" value="${escapeHtml(address.cityAddress)}" placeholder="横浜市戸塚区"></div></div>
        <div class="form-line"><div class="form-label required">番地</div><div class="input-shell"><input class="form-control" id="editStreetAddress" autocomplete="address-line1" value="${escapeHtml(address.streetAddress)}" placeholder="戸塚町1-2-3"></div></div>
        <div class="form-line"><div class="form-label">建物名・部屋番号</div><div class="input-shell"><input class="form-control" id="editBuilding" autocomplete="address-line2" value="${escapeHtml(address.building)}" placeholder="NEXUSレジデンス101"></div></div>
      </div>
      <div class="request-spacer"></div>
      <div class="sheet-actions single-action"><button class="submit-btn" id="nexusSaveAddress" type="button">保存する</button></div>`;

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

      const response = await fetch(PROFILE_URL, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
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

  async function loadProfile(doc) {
    if (!doc || doc.documentElement.dataset.nexusD1ProfileLoading === '1') return;
    const accessToken = token();
    if (!accessToken) return;

    doc.documentElement.dataset.nexusD1ProfileLoading = '1';
    setStatus(doc, '勤務情報を取得しています...');
    try {
      const response = await fetch(PROFILE_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store'
      });
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
