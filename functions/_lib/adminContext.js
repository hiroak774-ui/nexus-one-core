import { verifyGoogleAccessToken, jsonResponse, getBearerToken } from './googleAuth.js';

export { jsonResponse };

export async function requireAdmin(request, env) {
  if (!env.DB) throw Object.assign(new Error('DB binding is not configured'), { status: 500 });
  const token = getBearerToken(request);
  if (!token) throw Object.assign(new Error('Bearer token is required'), { status: 401 });

  const google = await verifyGoogleAccessToken(token, env);
  const user = await env.DB.prepare(`
    SELECT user_id, email, display_name, account_status
    FROM users
    WHERE google_sub = ?
    LIMIT 1
  `).bind(google.sub).first();

  if (!user || user.account_status !== '有効') {
    throw Object.assign(new Error('Active user account is required'), { status: 403 });
  }

  const accessResult = await env.DB.prepare(`
    SELECT a.company_id, a.admin_role, c.company_name
    FROM admin_company_access a
    JOIN companies c ON c.company_id = a.company_id
    WHERE a.user_id = ? AND a.is_active = 1
    ORDER BY c.company_name
  `).bind(user.user_id).all();

  const access = accessResult.results || [];
  if (!access.length) throw Object.assign(new Error('Administrator permission is required'), { status: 403 });

  const isSuperAdmin = access.some(row => row.admin_role === 'SUPER_ADMIN');
  let companies = access;
  if (isSuperAdmin) {
    const all = await env.DB.prepare(`
      SELECT company_id, company_name, 'SUPER_ADMIN' AS admin_role
      FROM companies
      WHERE status = '有効'
      ORDER BY company_name
    `).all();
    companies = all.results || access;
  }

  return { google, user, access, companies, isSuperAdmin };
}

export function adminError(error, fallback = 'Admin request failed') {
  const message = error instanceof Error ? error.message : fallback;
  const status = Number(error?.status) || (/token|Bearer|audience|verified/i.test(message) ? 401 : 500);
  return jsonResponse({ ok: false, error: message }, status);
}
