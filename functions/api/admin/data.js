import { requireAdmin, adminError, jsonResponse } from '../../_lib/adminContext.js';

function companyScope(ctx) {
  return ctx.companies.map(row => row.company_id);
}

function placeholders(ids) {
  return ids.map(() => '?').join(',');
}

function hhmm(value) {
  if (!value) return '';
  const m = String(value).match(/(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : String(value);
}

function hoursText(minutes) {
  const n = Number(minutes || 0);
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function statusClass(status) {
  if (['承認待ち','差戻し'].includes(status)) return 'orange';
  if (status === '却下') return 'red';
  if (status === '承認済') return 'green';
  return 'blue';
}

function applicationUiStatus(status) {
  if (status === '承認済') return '承認済み';
  if (status === '差戻し') return '差戻し中';
  return status || '承認待ち';
}

async function loadDaySettings(db, employeeIds, monthKey) {
  if (!employeeIds.length) return new Map();
  try {
    const result = await db.prepare(`
      SELECT employee_id, work_date, day_type
      FROM employee_day_settings
      WHERE employee_id IN (${placeholders(employeeIds)})
        AND substr(work_date,1,7) = ?
    `).bind(...employeeIds, monthKey).all();
    const map = new Map();
    for (const row of result.results || []) map.set(`${row.employee_id}|${row.work_date}`, row.day_type);
    return map;
  } catch (_) {
    return new Map();
  }
}

export async function onRequestGet({ request, env }) {
  try {
    const ctx = await requireAdmin(request, env);
    const ids = companyScope(ctx);
    const url = new URL(request.url);
    const now = new Date();
    const year = Number(url.searchParams.get('year') || now.getFullYear());
    const month = Number(url.searchParams.get('month') || (now.getMonth() + 1));
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return jsonResponse({ ok: false, error: 'Invalid year or month' }, 400);
    }
    const monthKey = `${year}-${String(month).padStart(2,'0')}`;
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
    const scope = placeholders(ids);

    const employeesResult = await env.DB.prepare(`
      SELECT e.*, u.email, u.account_status, c.company_name,
             wp.display_name AS pattern_name, wp.start_time AS pattern_start, wp.end_time AS pattern_end,
             wp.break_minutes AS pattern_break,
             COALESCE(a.admin_role,'') AS admin_role
      FROM employees e
      JOIN users u ON u.user_id = e.user_id
      JOIN companies c ON c.company_id = e.company_id
      LEFT JOIN work_patterns wp ON wp.work_pattern_id = e.base_work_pattern_id
      LEFT JOIN admin_company_access a ON a.user_id = e.user_id AND a.company_id = e.company_id AND a.is_active = 1
      WHERE e.company_id IN (${scope})
      ORDER BY c.company_name, e.official_name
    `).bind(...ids).all();
    const employeesRaw = employeesResult.results || [];
    const employeeIds = employeesRaw.map(r => r.employee_id);

    const attendanceResult = employeeIds.length ? await env.DB.prepare(`
      SELECT * FROM attendance
      WHERE employee_id IN (${placeholders(employeeIds)})
        AND substr(work_date,1,7) = ?
      ORDER BY employee_id, work_date
    `).bind(...employeeIds, monthKey).all() : { results: [] };
    const attendanceRaw = attendanceResult.results || [];

    const applicationsResult = await env.DB.prepare(`
      SELECT a.*, e.official_name, e.employee_number, c.company_name
      FROM applications a
      JOIN employees e ON e.employee_id = a.employee_id
      JOIN companies c ON c.company_id = a.company_id
      WHERE a.company_id IN (${scope})
      ORDER BY a.requested_at DESC
      LIMIT 500
    `).bind(...ids).all();

    const patternsResult = await env.DB.prepare(`
      SELECT wp.*, c.company_name,
        (SELECT COUNT(*) FROM employees e WHERE e.base_work_pattern_id = wp.work_pattern_id AND e.employment_status='在籍') AS users
      FROM work_patterns wp
      LEFT JOIN companies c ON c.company_id = wp.company_id
      WHERE wp.company_id IS NULL OR wp.company_id IN (${scope})
      ORDER BY wp.display_order, wp.start_time
    `).bind(...ids).all();

    const todayAttendanceResult = employeeIds.length ? await env.DB.prepare(`
      SELECT a.*, e.official_name, e.employee_number, e.work_type, u.email, c.company_name
      FROM attendance a
      JOIN employees e ON e.employee_id = a.employee_id
      JOIN users u ON u.user_id = e.user_id
      JOIN companies c ON c.company_id = e.company_id
      WHERE a.employee_id IN (${placeholders(employeeIds)}) AND a.work_date = ?
      ORDER BY e.official_name
    `).bind(...employeeIds, today).all() : { results: [] };

    const pendingRow = await env.DB.prepare(`
      SELECT COUNT(*) AS count FROM applications
      WHERE company_id IN (${scope}) AND status='承認待ち'
    `).bind(...ids).first();

    const daySettings = await loadDaySettings(env.DB, employeeIds, monthKey);
    const attByEmployee = new Map();
    for (const row of attendanceRaw) {
      if (!attByEmployee.has(row.employee_id)) attByEmployee.set(row.employee_id, []);
      attByEmployee.get(row.employee_id).push(row);
    }

    const attendance = employeesRaw
      .filter(e => e.registration_status === '承認済' && e.employment_status === '在籍')
      .map(e => {
        const rows = attByEmployee.get(e.employee_id) || [];
        const days = rows.filter(r => r.clock_in_at).length;
        const totalMinutes = rows.reduce((sum,r) => sum + Number(r.work_minutes || 0), 0);
        const gpsMissing = rows.filter(r => (r.clock_in_at && r.clock_in_location_status !== '取得') || (r.clock_out_at && r.clock_out_location_status !== '取得')).length;
        const noteCount = rows.filter(r => r.note).length;
        const needs = gpsMissing + noteCount;
        const dailyRecords = rows.map(r => ({
          date:r.work_date,
          clockIn:hhmm(r.clock_in_at), clockOut:hhmm(r.clock_out_at), workMinutes:Number(r.work_minutes||0),
          workStyle:r.work_style||'', clockInGps:r.clock_in_location_status==='取得', clockOutGps:r.clock_out_location_status==='取得',
          clockInArea:r.clock_in_area||'', clockOutArea:r.clock_out_area||'', note:r.note||'',
          dayType:daySettings.get(`${e.employee_id}|${r.work_date}`)||''
        }));
        return {
          id:e.employee_id, name:e.official_name, email:e.email||'', companyId:e.company_id, company:e.company_name,
          type:e.work_type, patternId:e.base_work_pattern_id||'', pattern:e.pattern_name||'', days,
          total:hoursText(totalMinutes), ot:'0h', late:0, early:0, corrections:0, leave:0, needs,
          gps: rows.length === 0 ? '未取得' : needs ? '一部未取得' : '取得',
          clockInGps: rows.some(r=>r.clock_in_location_status==='取得'), clockOutGps:rows.some(r=>r.clock_out_location_status==='取得'),
          clockInArea:rows.at(-1)?.clock_in_area||'', clockOutArea:rows.at(-1)?.clock_out_area||'',
          status:needs?'要確認':'正常', cls:needs?'orange':'green', closed:'未締め',
          paidUsed:Number(e.paid_leave_used||0), paidRemain:Number(e.paid_leave_remaining||0), paidExpire:0,
          notes:'', dailyRecords,
          holidays:Array.from(daySettings.entries()).filter(([k,v])=>k.startsWith(`${e.employee_id}|`)&&v==='休日').map(([k])=>k.split('|')[1])
        };
      });

    const employees = employeesRaw.map(e => ({
      id:e.employee_id, number:e.employee_number||'', name:e.official_name, email:e.email||'',
      companyId:e.company_id, company:e.company_name,
      roleId:e.admin_role||'USER', role:e.admin_role ? (e.admin_role==='SUPER_ADMIN'?'SUPER_ADMIN':'管理者') : '社員',
      employment:e.employment_status, registration:e.registration_status, account:e.account_status,
      type:e.work_type, patternId:e.base_work_pattern_id||'', pattern:e.pattern_name||'',
      paidTotal:Number(e.paid_leave_total||0), paidUsed:Number(e.paid_leave_used||0), paidRemain:Number(e.paid_leave_remaining||0),
      joined:e.joined_on||'', approvedAt:e.approved_at||'', postalCode:e.postal_code||'',
      address:[e.prefecture,e.city_address,e.street_address].filter(Boolean).join(''), building:e.building||'',
      clientName:e.current_client_name||''
    }));

    const applications = (applicationsResult.results || []).map(a => ({
      id:a.application_id, employeeId:a.employee_id, name:a.official_name, companyId:a.company_id, company:a.company_name,
      type:a.application_type, date:a.target_date||'', requested:a.requested_at||'',
      body:a.after_value||a.leave_type||a.requested_work_pattern||'', reason:a.reason||'',
      related:a.attendance_id?`対象勤怠ID：${a.attendance_id}`:'', status:applicationUiStatus(a.status), cls:statusClass(a.status),
      updated:a.updated_at||'', processed:a.approved_at||'', adminComment:a.approver_comment||'', history:[]
    }));

    const workPatterns = (patternsResult.results || []).map(w => ({
      id:w.work_pattern_id, companyId:w.company_id||'', company:w.company_name||'共通', name:w.display_name,
      type:'固定勤務', start:hhmm(w.start_time), end:hhmm(w.end_time), break:`${Number(w.break_minutes||0)}分`,
      users:Number(w.users||0), status:Number(w.is_active)===1?'有効':'無効', cls:Number(w.is_active)===1?'green':'red',
      late:'開始時刻基準', early:'終了時刻基準', overtime:'所定超過分'
    }));

    const todayRows = (todayAttendanceResult.results || []).map(r => ({
      id:r.employee_id, name:r.official_name, employeeId:r.employee_id, employeeName:r.official_name,
      companyId:r.company_id, company:r.company_name, companyName:r.company_name, type:r.work_type,
      in:hhmm(r.clock_in_at), out:hhmm(r.clock_out_at), clockIn:hhmm(r.clock_in_at), clockOut:hhmm(r.clock_out_at),
      location:r.work_style||'', workStyle:r.work_style||'', status:r.clock_out_at?'退勤済':r.clock_in_at?'勤務中':'未打刻',
      email:r.email||''
    }));
    const working = todayRows.filter(r => r.status==='勤務中').length;
    const completed = todayRows.filter(r => r.status==='退勤済').length;
    const activeEmployees = employeesRaw.filter(e => e.registration_status==='承認済'&&e.employment_status==='在籍').length;

    return jsonResponse({ ok:true, data:{
      year, month,
      admin:{ userId:ctx.user.user_id, name:ctx.user.display_name||ctx.user.email, email:ctx.user.email, role:ctx.isSuperAdmin?'SUPER_ADMIN':ctx.access[0].admin_role },
      companies:ctx.companies,
      dashboard:{ summary:{ working, completed, notClocked:Math.max(0,activeEmployees-working-completed), pendingApplications:Number(pendingRow?.count||0) }, todayRows, timeline:[] },
      attendance:{ rows:attendance }, applications:{ rows:applications }, employees:{ rows:employees }, workPatterns:{ rows:workPatterns }
    }});
  } catch (error) {
    return adminError(error, 'Failed to load admin data');
  }
}
