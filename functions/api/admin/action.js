import { requireAdmin, adminError, jsonResponse } from '../../_lib/adminContext.js';

async function canManageCompany(ctx, companyId) {
  return ctx.isSuperAdmin || ctx.companies.some(row => row.company_id === companyId);
}

async function loadEmployee(db, employeeId) {
  return db.prepare(`SELECT e.*, u.user_id FROM employees e JOIN users u ON u.user_id=e.user_id WHERE e.employee_id=? LIMIT 1`).bind(employeeId).first();
}

export async function onRequestPost({ request, env }) {
  try {
    const ctx = await requireAdmin(request, env);
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || '');

    if (action === 'updateApplicationStatus') {
      const row = await env.DB.prepare(`SELECT application_id, company_id, employee_id FROM applications WHERE application_id=? LIMIT 1`).bind(body.applicationId).first();
      if (!row || !(await canManageCompany(ctx,row.company_id))) return jsonResponse({ok:false,error:'Application not found'},404);
      const statusMap = {'承認済み':'承認済','承認済':'承認済','差戻し中':'差戻し','差戻し':'差戻し','却下':'却下','承認待ち':'承認待ち'};
      const next = statusMap[body.status] || '承認待ち';
      await env.DB.prepare(`UPDATE applications SET status=?, approver_user_id=?, approved_at=CASE WHEN ?='承認済' THEN CURRENT_TIMESTAMP ELSE approved_at END, approver_comment=?, updated_at=CURRENT_TIMESTAMP WHERE application_id=?`)
        .bind(next,ctx.user.user_id,next,String(body.comment||''),row.application_id).run();
      return jsonResponse({ok:true,data:{applicationId:row.application_id,status:next}});
    }

    if (['updateEmployee','setEmployeeAccount','retireEmployee','approveEmployee'].includes(action)) {
      const e = await loadEmployee(env.DB, body.employeeId);
      if (!e || !(await canManageCompany(ctx,e.company_id))) return jsonResponse({ok:false,error:'Employee not found'},404);

      if (action === 'approveEmployee') {
        await env.DB.prepare(`UPDATE employees SET registration_status='承認済', employment_status='在籍', approved_by_user_id=?, approved_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE employee_id=?`)
          .bind(ctx.user.user_id,e.employee_id).run();
      } else if (action === 'setEmployeeAccount') {
        await env.DB.prepare(`UPDATE users SET account_status=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?`)
          .bind(body.account === '無効' ? '無効' : '有効',e.user_id).run();
      } else if (action === 'retireEmployee') {
        await env.DB.prepare(`UPDATE employees SET employment_status='退職', retired_on=COALESCE(retired_on,date('now')), updated_at=CURRENT_TIMESTAMP WHERE employee_id=?`).bind(e.employee_id).run();
        await env.DB.prepare(`UPDATE users SET account_status='無効', updated_at=CURRENT_TIMESTAMP WHERE user_id=?`).bind(e.user_id).run();
      } else {
        const companyId = ['HRC','GANBARU'].includes(body.companyId) ? body.companyId : e.company_id;
        if (!(await canManageCompany(ctx,companyId))) return jsonResponse({ok:false,error:'Company permission is required'},403);
        let patternId = null;
        if (body.workType !== 'シフト勤務' && body.pattern) {
          const p = await env.DB.prepare(`SELECT work_pattern_id FROM work_patterns WHERE display_name=? AND is_active=1 ORDER BY company_id IS NULL DESC LIMIT 1`).bind(body.pattern).first();
          patternId = p?.work_pattern_id || null;
        }
        await env.DB.prepare(`UPDATE employees SET official_name=?, company_id=?, work_type=?, base_work_pattern_id=?, postal_code=?, city_address=?, building=?, current_client_name=?, paid_leave_total=?, paid_leave_used=?, paid_leave_remaining=?, joined_on=?, updated_at=CURRENT_TIMESTAMP WHERE employee_id=?`)
          .bind(String(body.name||e.official_name),companyId,body.workType==='シフト勤務'?'シフト勤務':'固定勤務',patternId,String(body.postalCode||''),String(body.address||''),String(body.building||''),String(body.clientName||''),Number(body.paidTotal||0),Number(body.paidUsed||0),Math.max(0,Number(body.paidTotal||0)-Number(body.paidUsed||0)),String(body.joined||'')||null,e.employee_id).run();
        await env.DB.prepare(`UPDATE users SET email=?, account_status=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?`).bind(String(body.email||''),body.account==='無効'?'無効':'有効',e.user_id).run();
        const wantsAdmin = body.roleId === 'ADMIN' || body.roleId === 'SUPER_ADMIN';
        if (wantsAdmin) {
          await env.DB.prepare(`INSERT INTO admin_company_access(user_id,company_id,admin_role,is_active,granted_by_user_id,granted_at,updated_at) VALUES(?,?,?,1,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(user_id,company_id) DO UPDATE SET admin_role=excluded.admin_role,is_active=1,updated_at=CURRENT_TIMESTAMP`)
            .bind(e.user_id,companyId,body.roleId==='SUPER_ADMIN'?'SUPER_ADMIN':'ADMIN',ctx.user.user_id).run();
        } else {
          await env.DB.prepare(`UPDATE admin_company_access SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND company_id=?`).bind(e.user_id,companyId).run();
        }
      }
      return jsonResponse({ok:true,data:{employeeId:e.employee_id}});
    }

    return jsonResponse({ok:false,error:'Unsupported admin action'},400);
  } catch (error) {
    return adminError(error,'Admin action failed');
  }
}
