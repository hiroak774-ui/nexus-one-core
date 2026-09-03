import { verifyGoogleAccessToken, jsonResponse, getBearerToken } from '../../_lib/googleAuth.js';

async function loadUser(db, googleSub) {
  return db.prepare(`
    SELECT u.user_id, e.employee_id, e.company_id, e.registration_status, e.employment_status
    FROM users u
    JOIN employees e ON e.user_id = u.user_id
    WHERE u.google_sub = ?
      AND u.account_status = '有効'
    ORDER BY e.company_id
    LIMIT 1
  `).bind(googleSub).first();
}

async function adminCount(db) {
  const row = await db.prepare(`
    SELECT COUNT(*) AS count
    FROM admin_company_access
    WHERE is_active = 1
  `).first();
  return Number(row?.count || 0);
}

export async function onRequestGet({ request, env }) {
  try {
    if (!env.DB) return jsonResponse({ ok: false, error: 'DB binding is not configured' }, 500);
    const token = getBearerToken(request);
    if (!token) return jsonResponse({ ok: false, error: 'Bearer token is required' }, 401);
    const google = await verifyGoogleAccessToken(token, env);
    const user = await loadUser(env.DB, google.sub);
    if (!user) return jsonResponse({ ok: false, error: 'Employee account is required' }, 403);

    const count = await adminCount(env.DB);
    return jsonResponse({
      ok: true,
      data: {
        bootstrapAvailable: count === 0 && user.registration_status === '承認済' && user.employment_status === '在籍',
        adminCount: count,
        companyId: user.company_id
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to check admin bootstrap';
    return jsonResponse({ ok: false, error: message }, /token|audience|verified|Bearer/i.test(message) ? 401 : 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB) return jsonResponse({ ok: false, error: 'DB binding is not configured' }, 500);
    const token = getBearerToken(request);
    if (!token) return jsonResponse({ ok: false, error: 'Bearer token is required' }, 401);
    const google = await verifyGoogleAccessToken(token, env);
    const user = await loadUser(env.DB, google.sub);
    if (!user) return jsonResponse({ ok: false, error: 'Employee account is required' }, 403);
    if (user.registration_status !== '承認済' || user.employment_status !== '在籍') {
      return jsonResponse({ ok: false, error: 'Approved active employee is required' }, 403);
    }

    const count = await adminCount(env.DB);
    if (count > 0) {
      return jsonResponse({ ok: false, error: 'Initial admin has already been configured' }, 409);
    }

    await env.DB.prepare(`
      INSERT INTO admin_company_access (
        user_id, company_id, admin_role, is_active, granted_by_user_id, granted_at, updated_at
      ) VALUES (?, ?, 'SUPER_ADMIN', 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(user.user_id, user.company_id, user.user_id).run();

    return jsonResponse({
      ok: true,
      data: {
        companyId: user.company_id,
        adminRole: 'SUPER_ADMIN'
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to bootstrap admin';
    return jsonResponse({ ok: false, error: message }, /token|audience|verified|Bearer/i.test(message) ? 401 : 500);
  }
}
