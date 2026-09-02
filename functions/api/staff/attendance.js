import { verifyGoogleAccessToken, jsonResponse, getBearerToken } from '../../_lib/googleAuth.js';

async function ensureDaySettingsTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS employee_day_settings (
      setting_id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      work_date TEXT NOT NULL,
      day_type TEXT NOT NULL DEFAULT '休日'
        CHECK (day_type IN ('休日')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(employee_id, work_date),
      FOREIGN KEY (company_id) REFERENCES companies(company_id),
      FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
    )
  `).run();
}

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

function monthDates(year, month) {
  const last = new Date(year, month, 0).getDate();
  return Array.from({ length: last }, (_, index) => `${year}-${String(month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`);
}

export async function onRequestGet({ request, env }) {
  try {
    if (!env.DB) return jsonResponse({ ok: false, error: 'DB binding is not configured' }, 500);

    const token = getBearerToken(request);
    if (!token) return jsonResponse({ ok: false, error: 'Bearer token is required' }, 401);

    const google = await verifyGoogleAccessToken(token, env);
    const employee = await loadApprovedEmployee(env.DB, google.sub);
    if (!employee) return jsonResponse({ ok: false, error: 'Approved employee is required' }, 403);

    await ensureDaySettingsTable(env.DB);

    const url = new URL(request.url);
    const now = new Date();
    const year = Number(url.searchParams.get('year') || now.getFullYear());
    const month = Number(url.searchParams.get('month') || (now.getMonth() + 1));

    if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
      return jsonResponse({ ok: false, error: 'Invalid year or month' }, 400);
    }

    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const [attendanceResult, settingsResult] = await Promise.all([
      env.DB.prepare(`
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
          clock_in_location_status,
          clock_in_area,
          clock_out_location_status,
          clock_out_area,
          note
        FROM attendance
        WHERE employee_id = ?
          AND substr(work_date, 1, 7) = ?
        ORDER BY work_date ASC
      `).bind(employee.employee_id, monthKey).all(),
      env.DB.prepare(`
        SELECT work_date, day_type
        FROM employee_day_settings
        WHERE employee_id = ?
          AND substr(work_date, 1, 7) = ?
      `).bind(employee.employee_id, monthKey).all()
    ]);

    const attendanceByDate = new Map((attendanceResult.results || []).map(row => [row.work_date, row]));
    const holidaySet = new Set((settingsResult.results || []).filter(row => row.day_type === '休日').map(row => row.work_date));

    let totalMinutes = 0;
    let attendanceDays = 0;
    let attentionCount = 0;
    let firstIssue = null;

    const records = monthDates(year, month).map(date => {
      const row = attendanceByDate.get(date) || null;
      const weekday = weekdayInfo(date);
      const isHoliday = holidaySet.has(date);
      const hasClock = Boolean(row?.clock_in_at || row?.clock_out_at);
      const hasIssue = Boolean(row?.note);
      const minutes = Number(row?.work_minutes || 0);

      if (row?.clock_in_at) attendanceDays += 1;
      totalMinutes += minutes;
      if (hasIssue) attentionCount += 1;

      const record = {
        attendanceId: row?.attendance_id || '',
        date,
        weekday: weekday.label,
        isSunday: weekday.isSunday,
        isSaturday: weekday.isSaturday,
        isHoliday,
        dayType: isHoliday ? '休日' : '',
        workType: row?.work_type || '',
        workStyle: row?.work_style || '',
        workPatternId: row?.work_pattern_id || '',
        workPatternName: row?.work_pattern_name || '',
        scheduledStartTime: hhmm(row?.scheduled_start_time),
        scheduledEndTime: hhmm(row?.scheduled_end_time),
        breakMinutes: row?.break_minutes ?? '',
        clockIn: hhmm(row?.clock_in_at),
        clockOut: hhmm(row?.clock_out_at),
        clockInLocationStatus: row?.clock_in_location_status || '',
        clockOutLocationStatus: row?.clock_out_location_status || '',
        clockInArea: row?.clock_in_area || '',
        clockOutArea: row?.clock_out_area || '',
        workMinutes: workText(minutes),
        workMinutesRaw: minutes,
        workLocationName: row?.work_style || row?.clock_in_area || '',
        addressMemo: '',
        issueType: '',
        issueText: row?.note || '',
        status: isHoliday ? 'holiday' : (hasIssue ? 'attention' : (hasClock ? 'ok' : 'blank')),
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
