import { verifyGoogleAccessToken, jsonResponse, getBearerToken } from '../../_lib/googleAuth.js';

function makeEmployeeId() {
  return `EMP_${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
}

function makeUserId(sub) {
  return `USR_${sub}`;
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB) return jsonResponse({ ok: false, error: 'DB binding is not configured' }, 500);

    const accessToken = getBearerToken(request);
    if (!accessToken) return jsonResponse({ ok: false, error: 'Bearer token is required' }, 401);

    const google = await verifyGoogleAccessToken(accessToken, env);
    const body = await request.json();
    const companyId = String(body.companyId || '').trim();
    const officialName = String(body.name || body.fullName || google.name || '').trim();
    const workType = body.workType === 'シフト勤務' ? 'シフト勤務' : '固定勤務';
    const baseWorkPatternId = workType === 'シフト勤務' ? null : (body.baseWorkPatternId || null);

    if (!companyId) return jsonResponse({ ok: false, error: 'companyId is required' }, 400);
    if (!officialName) return jsonResponse({ ok: false, error: 'name is required' }, 400);

    const company = await env.DB.prepare('SELECT company_id FROM companies WHERE company_id = ? AND status = ? LIMIT 1')
      .bind(companyId, '有効').first();
    if (!company) return jsonResponse({ ok: false, error: 'Invalid company' }, 400);

    if (baseWorkPatternId) {
      const pattern = await env.DB.prepare('SELECT work_pattern_id FROM work_patterns WHERE work_pattern_id = ? AND is_active = 1 LIMIT 1')
        .bind(baseWorkPatternId).first();
      if (!pattern) return jsonResponse({ ok: false, error: 'Invalid work pattern' }, 400);
    }

    const userId = makeUserId(google.sub);
    const now = new Date().toISOString();

    await env.DB.prepare(`
      INSERT INTO users (user_id, google_sub, email, display_name, account_status, last_login_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, '有効', ?, ?, ?)
      ON CONFLICT(google_sub) DO UPDATE SET
        email = excluded.email,
        display_name = excluded.display_name,
        last_login_at = excluded.last_login_at,
        updated_at = excluded.updated_at
    `).bind(userId, google.sub, google.email, google.name, now, now, now).run();

    const actualUser = await env.DB.prepare('SELECT user_id FROM users WHERE google_sub = ? LIMIT 1')
      .bind(google.sub).first();
    if (!actualUser) throw new Error('User creation failed');

    const existing = await env.DB.prepare('SELECT employee_id, registration_status FROM employees WHERE user_id = ? AND company_id = ? LIMIT 1')
      .bind(actualUser.user_id, companyId).first();
    if (existing) {
      return jsonResponse({ ok: true, employeeId: existing.employee_id, registrationStatus: existing.registration_status, existed: true });
    }

    const employeeId = makeEmployeeId();
    await env.DB.prepare(`
      INSERT INTO employees (
        employee_id, user_id, company_id, official_name,
        employment_status, registration_status, work_type, base_work_pattern_id,
        postal_code, prefecture, city_address, street_address, building,
        current_client_name, first_registered_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, '在籍', '承認待ち', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      employeeId,
      actualUser.user_id,
      companyId,
      officialName,
      workType,
      baseWorkPatternId,
      String(body.postalCode || '').trim(),
      String(body.prefecture || '').trim(),
      String(body.cityAddress || '').trim(),
      String(body.streetAddress || '').trim(),
      String(body.building || '').trim(),
      String(body.currentClientName || '').trim(),
      now,
      now,
      now
    ).run();

    return jsonResponse({
      ok: true,
      employeeId,
      registrationStatus: '承認待ち',
      email: google.email,
      name: officialName
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Initial registration failed';
    const status = /token|audience|verified|Bearer/i.test(message) ? 401 : 500;
    return jsonResponse({ ok: false, error: message }, status);
  }
}

export function onRequestGet() {
  return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
}
