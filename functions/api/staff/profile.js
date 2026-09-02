import { verifyGoogleAccessToken, jsonResponse, getBearerToken } from '../../_lib/googleAuth.js';

async function loadApprovedEmployee(db, googleSub) {
  return db.prepare(`
    SELECT
      u.email,
      e.employee_id,
      e.company_id,
      e.employee_number,
      e.official_name,
      e.employment_status,
      e.registration_status,
      e.work_type,
      e.base_work_pattern_id,
      e.current_client_name,
      e.postal_code,
      e.prefecture,
      e.city_address,
      e.street_address,
      e.building,
      c.company_name,
      wp.display_name AS work_pattern_name,
      wp.start_time AS work_pattern_start_time,
      wp.end_time AS work_pattern_end_time,
      wp.break_minutes AS work_pattern_break_minutes
    FROM users u
    JOIN employees e ON e.user_id = u.user_id
    JOIN companies c ON c.company_id = e.company_id
    LEFT JOIN work_patterns wp ON wp.work_pattern_id = e.base_work_pattern_id
    WHERE u.google_sub = ?
      AND u.account_status = '有効'
      AND e.registration_status = '承認済'
      AND e.employment_status = '在籍'
    ORDER BY e.company_id
    LIMIT 1
  `).bind(googleSub).first();
}

function toProfile(employee) {
  return {
    employeeId: employee.employee_id,
    employeeNumber: employee.employee_number,
    name: employee.official_name,
    email: employee.email,
    companyId: employee.company_id,
    companyName: employee.company_name,
    employmentStatus: employee.employment_status,
    registrationStatus: employee.registration_status,
    workType: employee.work_type,
    currentClientName: employee.current_client_name,
    baseWorkPatternId: employee.base_work_pattern_id,
    workPatternName: employee.work_pattern_name,
    workPatternStartTime: employee.work_pattern_start_time,
    workPatternEndTime: employee.work_pattern_end_time,
    breakMinutes: employee.work_pattern_break_minutes,
    address: {
      postalCode: employee.postal_code || '',
      prefecture: employee.prefecture || '',
      cityAddress: employee.city_address || '',
      streetAddress: employee.street_address || '',
      building: employee.building || ''
    }
  };
}

async function authenticate(request, env) {
  if (!env.DB) throw new Error('DB binding is not configured');
  const token = getBearerToken(request);
  if (!token) {
    const error = new Error('Bearer token is required');
    error.status = 401;
    throw error;
  }
  const google = await verifyGoogleAccessToken(token, env);
  const employee = await loadApprovedEmployee(env.DB, google.sub);
  if (!employee) {
    const error = new Error('Approved employee is required');
    error.status = 403;
    throw error;
  }
  return { google, employee };
}

export async function onRequestGet({ request, env }) {
  try {
    const { employee } = await authenticate(request, env);
    return jsonResponse({ ok: true, data: toProfile(employee) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load staff profile';
    const status = error?.status || (/token|audience|verified|Bearer/i.test(message) ? 401 : 500);
    return jsonResponse({ ok: false, error: message }, status);
  }
}

export async function onRequestPatch({ request, env }) {
  try {
    const { employee } = await authenticate(request, env);
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400);
    }

    const postalCode = String(body.postalCode || '').trim();
    const prefecture = String(body.prefecture || '').trim();
    const cityAddress = String(body.cityAddress || '').trim();
    const streetAddress = String(body.streetAddress || '').trim();
    const building = String(body.building || '').trim();

    if (!prefecture || !cityAddress || !streetAddress) {
      return jsonResponse({ ok: false, error: '都道府県・市区町村・番地は必須です。' }, 400);
    }

    await env.DB.prepare(`
      UPDATE employees
      SET postal_code = ?,
          prefecture = ?,
          city_address = ?,
          street_address = ?,
          building = ?,
          updated_at = ?
      WHERE employee_id = ?
    `).bind(
      postalCode,
      prefecture,
      cityAddress,
      streetAddress,
      building,
      new Date().toISOString(),
      employee.employee_id
    ).run();

    const updated = await env.DB.prepare(`
      SELECT
        u.email,
        e.employee_id,
        e.company_id,
        e.employee_number,
        e.official_name,
        e.employment_status,
        e.registration_status,
        e.work_type,
        e.base_work_pattern_id,
        e.current_client_name,
        e.postal_code,
        e.prefecture,
        e.city_address,
        e.street_address,
        e.building,
        c.company_name,
        wp.display_name AS work_pattern_name,
        wp.start_time AS work_pattern_start_time,
        wp.end_time AS work_pattern_end_time,
        wp.break_minutes AS work_pattern_break_minutes
      FROM users u
      JOIN employees e ON e.user_id = u.user_id
      JOIN companies c ON c.company_id = e.company_id
      LEFT JOIN work_patterns wp ON wp.work_pattern_id = e.base_work_pattern_id
      WHERE e.employee_id = ?
      LIMIT 1
    `).bind(employee.employee_id).first();

    return jsonResponse({ ok: true, data: toProfile(updated) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update staff profile';
    const status = error?.status || (/token|audience|verified|Bearer/i.test(message) ? 401 : 500);
    return jsonResponse({ ok: false, error: message }, status);
  }
}

export function onRequestPost() {
  return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
}
