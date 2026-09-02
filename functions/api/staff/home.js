import { verifyGoogleAccessToken, jsonResponse, getBearerToken } from '../../_lib/googleAuth.js';

function jstDateParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    month: `${values.year}-${values.month}`
  };
}

async function loadApprovedEmployee(db, googleSub) {
  return db.prepare(`
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
      wp.display_name AS base_work_pattern_name,
      wp.start_time AS base_work_pattern_start_time,
      wp.end_time AS base_work_pattern_end_time
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

export async function onRequestGet({ request, env }) {
  try {
    if (!env.DB) return jsonResponse({ ok: false, error: 'DB binding is not configured' }, 500);

    const token = getBearerToken(request);
    if (!token) return jsonResponse({ ok: false, error: 'Bearer token is required' }, 401);

    const google = await verifyGoogleAccessToken(token, env);
    const employee = await loadApprovedEmployee(env.DB, google.sub);
    if (!employee) return jsonResponse({ ok: false, error: 'Approved employee is required' }, 403);

    const { date, month } = jstDateParts();

    const todayAttendance = await env.DB.prepare(`
      SELECT
        attendance_id,
        work_date,
        work_type,
        work_style,
        work_pattern_id,
        work_pattern_name,
        scheduled_start_time,
        scheduled_end_time,
        break_minutes,
        clock_in_at,
        clock_out_at,
        work_minutes,
        clock_in_area,
        clock_out_area
      FROM attendance
      WHERE employee_id = ? AND work_date = ?
      LIMIT 1
    `).bind(employee.employee_id, date).first();

    const monthly = await env.DB.prepare(`
      SELECT
        SUM(CASE WHEN clock_in_at IS NOT NULL THEN 1 ELSE 0 END) AS work_days,
        COALESCE(SUM(COALESCE(work_minutes, 0)), 0) AS work_minutes
      FROM attendance
      WHERE employee_id = ? AND substr(work_date, 1, 7) = ?
    `).bind(employee.employee_id, month).first();

    const applicationResult = await env.DB.prepare(`
      SELECT
        application_id,
        application_type,
        target_date,
        requested_at,
        status,
        reason,
        approver_comment
      FROM applications
      WHERE employee_id = ?
      ORDER BY requested_at DESC
      LIMIT 10
    `).bind(employee.employee_id).all();

    const expenseSummary = await env.DB.prepare(`
      SELECT
        COUNT(*) AS expense_count,
        COALESCE(SUM(amount), 0) AS expense_total
      FROM transportation_expenses
      WHERE employee_id = ? AND substr(expense_date, 1, 7) = ?
    `).bind(employee.employee_id, month).first();

    const notificationResult = await env.DB.prepare(`
      SELECT
        notification_id,
        notification_type,
        title,
        body,
        related_type,
        related_id,
        is_read,
        sent_at,
        read_at,
        created_at
      FROM notifications
      WHERE employee_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `).bind(employee.employee_id).all();

    const workPatternResult = await env.DB.prepare(`
      SELECT work_pattern_id, display_name, start_time, end_time, break_minutes, display_order
      FROM work_patterns
      WHERE is_active = 1 AND (company_id IS NULL OR company_id = ?)
      ORDER BY display_order, start_time
    `).bind(employee.company_id).all();

    const workMinutes = Number(monthly?.work_minutes || 0);
    const attendance = todayAttendance ? {
      attendanceId: todayAttendance.attendance_id,
      workDate: todayAttendance.work_date,
      workType: todayAttendance.work_type,
      workStyle: todayAttendance.work_style,
      workPatternId: todayAttendance.work_pattern_id,
      workPatternName: todayAttendance.work_pattern_name,
      scheduledStartTime: todayAttendance.scheduled_start_time,
      scheduledEndTime: todayAttendance.scheduled_end_time,
      breakMinutes: todayAttendance.break_minutes,
      clockInAt: todayAttendance.clock_in_at,
      clockOutAt: todayAttendance.clock_out_at,
      workMinutes: todayAttendance.work_minutes,
      clockInArea: todayAttendance.clock_in_area,
      clockOutArea: todayAttendance.clock_out_area
    } : null;

    return jsonResponse({
      ok: true,
      data: {
        employee: {
          employeeId: employee.employee_id,
          employeeNumber: employee.employee_number,
          name: employee.official_name,
          companyId: employee.company_id,
          companyName: employee.company_name,
          workType: employee.work_type,
          baseWorkPatternId: employee.base_work_pattern_id,
          baseWorkPatternName: employee.base_work_pattern_name,
          baseWorkPatternStartTime: employee.base_work_pattern_start_time,
          baseWorkPatternEndTime: employee.base_work_pattern_end_time,
          currentClientName: employee.current_client_name,
          postalCode: employee.postal_code,
          prefecture: employee.prefecture,
          cityAddress: employee.city_address,
          streetAddress: employee.street_address,
          building: employee.building
        },
        todayAttendance: attendance,
        summary: {
          workDays: Number(monthly?.work_days || 0),
          workMinutes,
          workHours: Math.round((workMinutes / 60) * 10) / 10,
          transportationExpenseCount: Number(expenseSummary?.expense_count || 0),
          transportationExpenseTotal: Number(expenseSummary?.expense_total || 0)
        },
        applications: applicationResult.results || [],
        notifications: notificationResult.results || [],
        workPatterns: (workPatternResult.results || []).map(pattern => ({
          id: pattern.work_pattern_id,
          workPatternId: pattern.work_pattern_id,
          name: pattern.display_name,
          displayName: pattern.display_name,
          startTime: pattern.start_time,
          endTime: pattern.end_time,
          breakMinutes: pattern.break_minutes
        }))
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load staff home data';
    const status = /token|audience|verified|Bearer/i.test(message) ? 401 : 500;
    return jsonResponse({ ok: false, error: message }, status);
  }
}
