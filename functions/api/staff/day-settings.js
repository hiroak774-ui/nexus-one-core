import { verifyGoogleAccessToken, jsonResponse, getBearerToken } from '../../_lib/googleAuth.js';

async function ensureTable(db) {
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
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_employee_day_settings_employee_date
      ON employee_day_settings(employee_id, work_date)
  `).run();
}

async function loadApprovedEmployee(db, googleSub) {
  return db.prepare(`
    SELECT e.employee_id, e.company_id
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

function validateMonth(year, month) {
  return Number.isInteger(year) && year >= 2000 && year <= 2100 && Number.isInteger(month) && month >= 1 && month <= 12;
}

function validDateForMonth(date, year, month) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return false;
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  if (!String(date).startsWith(prefix)) return false;
  const parsed = new Date(`${date}T00:00:00+09:00`);
  return !Number.isNaN(parsed.getTime()) && parsed.getFullYear() === year && parsed.getMonth() + 1 === month;
}

async function auth(request, env) {
  if (!env.DB) throw new Error('DB binding is not configured');
  const token = getBearerToken(request);
  if (!token) throw new Error('Bearer token is required');
  const google = await verifyGoogleAccessToken(token, env);
  const employee = await loadApprovedEmployee(env.DB, google.sub);
  if (!employee) {
    const error = new Error('Approved employee is required');
    error.status = 403;
    throw error;
  }
  await ensureTable(env.DB);
  return employee;
}

export async function onRequestGet({ request, env }) {
  try {
    const employee = await auth(request, env);
    const url = new URL(request.url);
    const now = new Date();
    const year = Number(url.searchParams.get('year') || now.getFullYear());
    const month = Number(url.searchParams.get('month') || (now.getMonth() + 1));
    if (!validateMonth(year, month)) return jsonResponse({ ok: false, error: 'Invalid year or month' }, 400);

    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const result = await env.DB.prepare(`
      SELECT work_date, day_type
      FROM employee_day_settings
      WHERE employee_id = ?
        AND substr(work_date, 1, 7) = ?
      ORDER BY work_date
    `).bind(employee.employee_id, monthKey).all();

    return jsonResponse({
      ok: true,
      data: {
        year,
        month,
        holidays: (result.results || []).filter(row => row.day_type === '休日').map(row => row.work_date)
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load day settings';
    const status = error?.status || (/token|audience|verified|Bearer/i.test(message) ? 401 : 500);
    return jsonResponse({ ok: false, error: message }, status);
  }
}

export async function onRequestPut({ request, env }) {
  try {
    const employee = await auth(request, env);
    const body = await request.json().catch(() => ({}));
    const now = new Date();
    const year = Number(body.year || now.getFullYear());
    const month = Number(body.month || (now.getMonth() + 1));
    if (!validateMonth(year, month)) return jsonResponse({ ok: false, error: 'Invalid year or month' }, 400);

    const holidays = Array.isArray(body.holidays) ? [...new Set(body.holidays.map(String))] : [];
    if (holidays.some(date => !validDateForMonth(date, year, month))) {
      return jsonResponse({ ok: false, error: 'Invalid holiday date' }, 400);
    }

    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    await env.DB.prepare(`
      DELETE FROM employee_day_settings
      WHERE employee_id = ?
        AND substr(work_date, 1, 7) = ?
    `).bind(employee.employee_id, monthKey).run();

    if (holidays.length) {
      const statements = holidays.map(date => env.DB.prepare(`
        INSERT INTO employee_day_settings (
          setting_id, company_id, employee_id, work_date, day_type, created_at, updated_at
        ) VALUES (?, ?, ?, ?, '休日', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).bind(
        `DAY_${employee.employee_id}_${date.replaceAll('-', '')}`,
        employee.company_id,
        employee.employee_id,
        date
      ));
      await env.DB.batch(statements);
    }

    return jsonResponse({ ok: true, data: { year, month, holidays } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save day settings';
    const status = error?.status || (/token|audience|verified|Bearer/i.test(message) ? 401 : 500);
    return jsonResponse({ ok: false, error: message }, status);
  }
}

export function onRequestPost() {
  return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
}
