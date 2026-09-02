import {
  verifyGoogleIdToken,
  verifyGoogleAccessToken,
  fetchGoogleAddress,
  jsonResponse
} from '../../_lib/googleAuth.js';

function makeUserId(sub) {
  return `USR_${sub}`;
}

async function ensureCompanyMaster(db) {
  await db.prepare(`
    INSERT INTO companies (company_id, company_name, domain, status)
    VALUES ('HRC', 'HR COMPANY株式会社', NULL, '有効')
    ON CONFLICT(company_id) DO UPDATE SET
      company_name = 'HR COMPANY株式会社',
      status = '有効',
      updated_at = CURRENT_TIMESTAMP
  `).run();

  await db.prepare(`
    INSERT INTO companies (company_id, company_name, domain, status)
    VALUES ('GANBARU', '株式会社がんばる', NULL, '有効')
    ON CONFLICT(company_id) DO UPDATE SET
      company_name = '株式会社がんばる',
      status = '有効',
      updated_at = CURRENT_TIMESTAMP
  `).run();
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
      c.company_name,
      wp.display_name AS work_pattern_name,
      wp.start_time AS work_pattern_start_time,
      wp.end_time AS work_pattern_end_time
    FROM employees e
    JOIN companies c ON c.company_id = e.company_id
    LEFT JOIN work_patterns wp ON wp.work_pattern_id = e.base_work_pattern_id
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

    await ensureCompanyMaster(env.DB);

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
    const approvedEmployee = access.employees.find(e => e.registration_status === '承認済' && e.employment_status === '在籍') || null;
    const pendingEmployee = access.employees.find(e => e.registration_status === '承認待ち') || null;
    const authState = approvedEmployee ? 'approved' : pendingEmployee ? 'pending' : 'unregistered';

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
      currentEmployee: approvedEmployee || pendingEmployee,
      authState,
      adminCompanies: access.adminCompanies,
      permissions: {
        isEmployee: Boolean(approvedEmployee),
        isAdmin: access.adminCompanies.length > 0,
        canOpenStaff: Boolean(approvedEmployee),
        canOpenAdmin: access.adminCompanies.length > 0
      },
      onboarding: {
        registrationRequired: access.employees.length === 0,
        approvalPending: Boolean(pendingEmployee)
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
