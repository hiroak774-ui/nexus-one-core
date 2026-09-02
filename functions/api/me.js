import { verifyGoogleAccessToken, jsonResponse, getBearerToken } from '../_lib/googleAuth.js';

async function loadUserContext(db, googleSub) {
  const user = await db.prepare(`
    SELECT user_id, google_sub, email, display_name, account_status, last_login_at
    FROM users
    WHERE google_sub = ?
    LIMIT 1
  `).bind(googleSub).first();

  if (!user) return null;

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
  `).bind(user.user_id).all();

  const adminResult = await db.prepare(`
    SELECT
      a.company_id,
      a.admin_role,
      c.company_name
    FROM admin_company_access a
    JOIN companies c ON c.company_id = a.company_id
    WHERE a.user_id = ? AND a.is_active = 1
    ORDER BY c.company_name
  `).bind(user.user_id).all();

  return {
    user,
    employees: employeeResult.results || [],
    adminCompanies: adminResult.results || []
  };
}

function buildState(ctx) {
  const employees = ctx?.employees || [];
  const approved = employees.find(
    employee => employee.registration_status === '承認済' && employee.employment_status === '在籍'
  ) || null;
  const pending = employees.find(employee => employee.registration_status === '承認待ち') || null;

  if (approved) return { status: 'approved', employee: approved };
  if (pending) return { status: 'pending', employee: pending };
  return { status: 'unregistered', employee: null };
}

export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    if (!env.DB) {
      return jsonResponse({ ok: false, error: 'DB binding is not configured' }, 500);
    }

    const token = getBearerToken(request);
    if (!token) {
      return jsonResponse({ ok: false, error: 'Bearer token is required' }, 401);
    }

    const google = await verifyGoogleAccessToken(token, env);
    const ctx = await loadUserContext(env.DB, google.sub);

    if (!ctx) {
      return jsonResponse({
        ok: true,
        authenticated: true,
        google,
        registered: false,
        user: null,
        employees: [],
        adminCompanies: [],
        currentEmployee: null,
        authState: 'unregistered',
        permissions: {
          isEmployee: false,
          isAdmin: false,
          canOpenStaff: false,
          canOpenAdmin: false
        },
        onboarding: {
          registrationRequired: true,
          approvalPending: false
        }
      });
    }

    if (ctx.user.account_status !== '有効') {
      return jsonResponse({ ok: false, error: 'Account is disabled' }, 403);
    }

    const state = buildState(ctx);

    return jsonResponse({
      ok: true,
      authenticated: true,
      google,
      registered: ctx.employees.length > 0,
      user: ctx.user,
      employees: ctx.employees,
      adminCompanies: ctx.adminCompanies,
      currentEmployee: state.employee,
      authState: state.status,
      permissions: {
        isEmployee: state.status === 'approved',
        isAdmin: ctx.adminCompanies.length > 0,
        canOpenStaff: state.status === 'approved',
        canOpenAdmin: ctx.adminCompanies.length > 0
      },
      onboarding: {
        registrationRequired: ctx.employees.length === 0,
        approvalPending: state.status === 'pending'
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Authentication failed';
    const status = /configured/.test(message) ? 500 : 401;
    return jsonResponse({ ok: false, error: message }, status);
  }
}

export function onRequestPost() {
  return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
}
