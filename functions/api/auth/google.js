import {
  verifyGoogleIdToken,
  verifyGoogleAccessToken,
  fetchGoogleAddress,
  jsonResponse
} from '../../_lib/googleAuth.js';

function makeUserId(sub) {
  return `USR_${sub}`;
}

async function loadAccess(db, userId) {
  const employeeResult = await db.prepare(`
    SELECT
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
      c.company_name
    FROM employees e
    JOIN companies c ON c.company_id = e.company_id
    WHERE e.user_id = ?
    ORDER BY e.company_id
  `).bind(userId).all();

  const adminResult = await db.prepare(`
    SELECT
      a.company_id,
      a.admin_role,
      c.company_name
    FROM admin_company_access a
    JOIN companies c ON c.company_id = a.company_id
    WHERE a.user_id = ? AND a.is_active = 1
    ORDER BY c.company_name
  `).bind(userId).all();

  return {
    employees: employeeResult.results || [],
    adminCompanies: adminResult.results || []
  };
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    if (!env.DB) {
      return jsonResponse({ ok: false, error: 'DB binding is not configured' }, 500);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400);
    }

    const accessToken = body.access_token || body.accessToken || '';
    const google = accessToken
      ? await verifyGoogleAccessToken(accessToken, env)
      : await verifyGoogleIdToken(body.credential, env);

    const googleAddress = accessToken ? await fetchGoogleAddress(accessToken) : null;
    const userId = makeUserId(google.sub);
    const now = new Date().toISOString();

    await env.DB.prepare(`
      INSERT INTO users (
        user_id,
        google_sub,
        email,
        display_name,
        account_status,
        last_login_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, '有効', ?, ?, ?)
      ON CONFLICT(google_sub) DO UPDATE SET
        email = excluded.email,
        display_name = excluded.display_name,
        last_login_at = excluded.last_login_at,
        updated_at = excluded.updated_at
    `).bind(
      userId,
      google.sub,
      google.email,
      google.name,
      now,
      now,
      now
    ).run();

    const user = await env.DB.prepare(`
      SELECT user_id, google_sub, email, display_name, account_status, last_login_at
      FROM users
      WHERE google_sub = ?
      LIMIT 1
    `).bind(google.sub).first();

    if (!user || user.account_status !== '有効') {
      return jsonResponse({ ok: false, error: 'Account is disabled' }, 403);
    }

    const access = await loadAccess(env.DB, user.user_id);
    const approvedEmployees = access.employees.filter(e => e.registration_status === '承認済' && e.employment_status === '在籍');
    const pendingEmployees = access.employees.filter(e => e.registration_status === '承認待ち');

    return jsonResponse({
      ok: true,
      google: {
        email: google.email,
        name: google.name,
        picture: google.picture,
        address: googleAddress
      },
      user,
      employees: access.employees,
      adminCompanies: access.adminCompanies,
      permissions: {
        isEmployee: approvedEmployees.length > 0,
        isAdmin: access.adminCompanies.length > 0,
        canOpenStaff: approvedEmployees.length > 0,
        canOpenAdmin: access.adminCompanies.length > 0
      },
      onboarding: {
        registrationRequired: access.employees.length === 0,
        approvalPending: pendingEmployees.length > 0
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Authentication failed';
    const status = /configured/.test(message) ? 500 : 401;
    return jsonResponse({ ok: false, error: message }, status);
  }
}

export function onRequestGet() {
  return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
}
