import { verifyGoogleAccessToken, jsonResponse, getBearerToken } from '../../_lib/googleAuth.js';

async function loadApprovedEmployee(db, googleSub) {
  return db.prepare(`
    SELECT e.employee_id
    FROM users u
    JOIN employees e ON e.user_id = u.user_id
    WHERE u.google_sub = ?
      AND u.account_status = '有効'
      AND e.registration_status = '承認済'
      AND e.employment_status = '在籍'
    ORDER BY e.company_id
    LIMIT 1
  `).bind(googleSub).first();
}

function weekdayInfo(dateText) {
  const d = new Date(`${dateText}T00:00:00+09:00`);
  const day = d.getDay();
  return {
    label: ['日','月','火','水','木','金','土'][day],
    isSunday: day === 0,
    isSaturday: day === 6
  };
}

function hhmm(value) {
  if (!value) return '';
  const match = String(value).match(/(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : String(value);
}

function workText(minutes) {
  const total = Number(minutes || 0);
  if (!total) return '';
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function totalWorkText(minutes) {
  const total = Number(minutes || 0);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export async function onRequestGet({ request, env }) {
  try {
    if (!env.DB) return jsonResponse({ ok: false, error: 'DB binding is not configured' }, 500);

    const token = getBearerToken(request);
    if (!token) return jsonResponse({ ok: false, error: 'Bearer token is required' }, 401);

    const google = await verifyGoogleAccessToken(token, env);
    const employee = await loadApprovedEmployee(env.DB, google.sub);
    if (!employee) return jsonResponse({ ok: false, error: 'Approved employee is required' }, 403);

    const url = new URL(request.url);
    const now = new Date();
    const year = Number(url.searchParams.get('year') || now.getFullYear());
    const month = Number(url.searchParams.get('month') || (now.getMonth() + 1));

    if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
      return jsonResponse({ ok: false, error: 'Invalid year or month' }, 400);
    }

    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const result = await env.DB.prepare(`
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
        clock_out_area,
        note
      FROM attendance
      WHERE employee_id = ?
        AND substr(work_date, 1, 7) = ?
      ORDER BY work_date ASC
    `).bind(employee.employee_id, monthKey).all();

    let totalMinutes = 0;
    let attendanceDays = 0;
    let attentionCount = 0;
    let firstIssue = null;

    const records = (result.results || []).map(row => {
      const weekday = weekdayInfo(row.work_date);
      const hasClock = Boolean(row.clock_in_at || row.clock_out_at);
      const hasIssue = Boolean(row.note);
      const minutes = Number(row.work_minutes || 0);

      if (row.clock_in_at) attendanceDays += 1;
      totalMinutes += minutes;
      if (hasIssue) attentionCount += 1;

      const record = {
        attendanceId: row.attendance_id,
        date: row.work_date,
        weekday: weekday.label,
        isSunday: weekday.isSunday,
        isSaturday: weekday.isSaturday,
        workType: row.work_type || '',
        workStyle: row.work_style || '',
        workPatternId: row.work_pattern_id || '',
        workPatternName: row.work_pattern_name || '',
        scheduledStartTime: hhmm(row.scheduled_start_time),
        scheduledEndTime: hhmm(row.scheduled_end_time),
        breakMinutes: row.break_minutes ?? '',
        clockIn: hhmm(row.clock_in_at),
        clockOut: hhmm(row.clock_out_at),
        workMinutes: workText(minutes),
        workMinutesRaw: minutes,
        workLocationName: row.work_style || row.clock_in_area || '',
        addressMemo: '',
        issueType: '',
        issueText: row.note || '',
        status: hasIssue ? 'attention' : (hasClock ? 'ok' : 'blank'),
        transportation: []
      };

      if (!firstIssue && hasIssue) firstIssue = record;
      return record;
    });

    return jsonResponse({
      ok: true,
      data: {
        year,
        month,
        summary: {
          attendanceDays,
          totalWorkText: totalWorkText(totalMinutes),
          attentionCount
        },
        firstIssue,
        records
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load attendance data';
    const status = /token|audience|verified|Bearer/i.test(message) ? 401 : 500;
    return jsonResponse({ ok: false, error: message }, status);
  }
}

export function onRequestPost() {
  return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
}
