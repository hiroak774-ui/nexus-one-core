import { requireAdmin, adminError, jsonResponse } from '../../_lib/adminContext.js';

function normalizeCompanyId(value) {
  return value === 'ITC' ? 'GANBARU' : value;
}

function officialCompanyName(companyId, fallback = '') {
  if (companyId === 'HRC') return 'HR COMPANY株式会社';
  if (companyId === 'GANBARU') return '株式会社がんばる';
  return fallback || companyId || '';
}

function placeholders(ids) {
  return ids.map(() => '?').join(',');
}

export async function onRequestGet({ request, env }) {
  try {
    const ctx = await requireAdmin(request, env);
    const companyIds = (ctx.companies || []).map(row => normalizeCompanyId(row.company_id));
    const uniqueCompanyIds = [...new Set(companyIds.filter(Boolean))];

    const scopeSql = uniqueCompanyIds.length
      ? `OR (CASE WHEN e.company_id='ITC' THEN 'GANBARU' ELSE e.company_id END) IN (${placeholders(uniqueCompanyIds)})`
      : '';

    const result = await env.DB.prepare(`
      SELECT
        e.*,
        u.email,
        u.account_status,
        COALESCE(c.company_name, '') AS joined_company_name,
        wp.display_name AS pattern_name,
        COALESCE(a.admin_role, '') AS admin_role
      FROM employees e
      JOIN users u ON u.user_id = e.user_id
      LEFT JOIN companies c
        ON c.company_id = CASE WHEN e.company_id='ITC' THEN 'GANBARU' ELSE e.company_id END
      LEFT JOIN work_patterns wp ON wp.work_pattern_id = e.base_work_pattern_id
      LEFT JOIN admin_company_access a
        ON a.user_id = e.user_id
       AND a.company_id = CASE WHEN e.company_id='ITC' THEN 'GANBARU' ELSE e.company_id END
       AND a.is_active = 1
      WHERE e.user_id = ? ${scopeSql}
      ORDER BY
        CASE WHEN e.user_id = ? THEN 0 ELSE 1 END,
        CASE WHEN e.company_id='ITC' THEN 'GANBARU' ELSE e.company_id END,
        e.official_name
    `).bind(ctx.user.user_id, ...uniqueCompanyIds, ctx.user.user_id).all();

    const rows = (result.results || []).map(e => {
      const companyId = normalizeCompanyId(e.company_id);
      return {
        id: e.employee_id,
        number: e.employee_number || '',
        name: e.official_name || '',
        email: e.email || '',
        companyId,
        company: officialCompanyName(companyId, e.joined_company_name),
        roleId: e.admin_role || 'USER',
        role: e.admin_role ? (e.admin_role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : '管理者') : '社員',
        employment: e.employment_status || '',
        registration: e.registration_status || '',
        account: e.account_status || '有効',
        type: e.work_type || '',
        patternId: e.base_work_pattern_id || '',
        pattern: e.pattern_name || '',
        paidTotal: Number(e.paid_leave_total || 0),
        paidUsed: Number(e.paid_leave_used || 0),
        paidRemain: Number(e.paid_leave_remaining || 0),
        joined: e.joined_on || '',
        approvedAt: e.approved_at || '',
        postalCode: e.postal_code || '',
        address: [e.prefecture, e.city_address, e.street_address].filter(Boolean).join(''),
        building: e.building || '',
        clientName: e.current_client_name || ''
      };
    });

    return jsonResponse({
      ok: true,
      data: {
        rows,
        companies: (ctx.companies || []).map(row => ({
          companyId: normalizeCompanyId(row.company_id),
          companyName: officialCompanyName(normalizeCompanyId(row.company_id), row.company_name)
        }))
      }
    });
  } catch (error) {
    return adminError(error, 'Failed to load admin employees');
  }
}
