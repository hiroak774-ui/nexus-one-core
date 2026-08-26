-- NEXUS ONE / Cloudflare D1 schema v1
-- SQLite compatible
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS companies (
  company_id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  domain TEXT,
  status TEXT NOT NULL DEFAULT '有効'
    CHECK (status IN ('有効','無効')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note TEXT
);

CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  google_sub TEXT UNIQUE,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT,
  account_status TEXT NOT NULL DEFAULT '有効'
    CHECK (account_status IN ('有効','無効')),
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS work_patterns (
  work_pattern_id TEXT PRIMARY KEY,
  company_id TEXT,
  display_name TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  break_minutes INTEGER NOT NULL DEFAULT 60,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
    CHECK (is_active IN (0,1)),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(company_id)
);

CREATE TABLE IF NOT EXISTS employees (
  employee_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  employee_number TEXT,
  official_name TEXT NOT NULL,

  employment_status TEXT NOT NULL DEFAULT '在籍'
    CHECK (employment_status IN ('在籍','休職','退職')),
  registration_status TEXT NOT NULL DEFAULT '未登録'
    CHECK (registration_status IN ('未登録','承認待ち','承認済','差戻し','却下')),

  work_type TEXT NOT NULL DEFAULT '固定勤務'
    CHECK (work_type IN ('固定勤務','シフト勤務')),
  base_work_pattern_id TEXT,

  postal_code TEXT,
  prefecture TEXT,
  city_address TEXT,
  street_address TEXT,
  building TEXT,

  current_client_name TEXT,

  paid_leave_total REAL NOT NULL DEFAULT 0,
  paid_leave_used REAL NOT NULL DEFAULT 0,
  paid_leave_remaining REAL NOT NULL DEFAULT 0,
  paid_leave_updated_at TEXT,

  first_registered_at TEXT,
  approved_by_user_id TEXT,
  approved_at TEXT,
  joined_on TEXT,
  retired_on TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note TEXT,

  UNIQUE(company_id, employee_number),
  UNIQUE(user_id, company_id),

  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (company_id) REFERENCES companies(company_id),
  FOREIGN KEY (base_work_pattern_id) REFERENCES work_patterns(work_pattern_id),
  FOREIGN KEY (approved_by_user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS admin_company_access (
  access_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  admin_role TEXT NOT NULL DEFAULT 'ADMIN'
    CHECK (admin_role IN ('ADMIN','HR_ADMIN','SUPER_ADMIN')),
  is_active INTEGER NOT NULL DEFAULT 1
    CHECK (is_active IN (0,1)),
  granted_by_user_id TEXT,
  granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(user_id, company_id),

  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (company_id) REFERENCES companies(company_id),
  FOREIGN KEY (granted_by_user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS attendance (
  attendance_id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  work_date TEXT NOT NULL,

  work_type TEXT NOT NULL
    CHECK (work_type IN ('固定勤務','シフト勤務')),
  work_style TEXT
    CHECK (work_style IN ('出社','在宅')),

  work_pattern_id TEXT,
  work_pattern_name TEXT,
  scheduled_start_time TEXT,
  scheduled_end_time TEXT,
  break_minutes INTEGER NOT NULL DEFAULT 60,

  clock_in_at TEXT,
  clock_out_at TEXT,
  work_minutes INTEGER,

  clock_in_lat REAL,
  clock_in_lng REAL,
  clock_in_accuracy REAL,
  clock_in_location_status TEXT
    CHECK (clock_in_location_status IN ('取得','未取得') OR clock_in_location_status IS NULL),
  clock_in_area TEXT,

  clock_out_lat REAL,
  clock_out_lng REAL,
  clock_out_accuracy REAL,
  clock_out_location_status TEXT
    CHECK (clock_out_location_status IN ('取得','未取得') OR clock_out_location_status IS NULL),
  clock_out_area TEXT,

  device_info TEXT,
  note TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(employee_id, work_date),

  FOREIGN KEY (company_id) REFERENCES companies(company_id),
  FOREIGN KEY (employee_id) REFERENCES employees(employee_id),
  FOREIGN KEY (work_pattern_id) REFERENCES work_patterns(work_pattern_id)
);

CREATE TABLE IF NOT EXISTS transportation_expenses (
  expense_id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  attendance_id TEXT,
  expense_date TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  route TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (company_id) REFERENCES companies(company_id),
  FOREIGN KEY (employee_id) REFERENCES employees(employee_id),
  FOREIGN KEY (attendance_id) REFERENCES attendance(attendance_id)
);

CREATE TABLE IF NOT EXISTS applications (
  application_id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  application_type TEXT NOT NULL
    CHECK (application_type IN (
      '初回登録',
      '打刻修正',
      '有給',
      '半休',
      '遅刻',
      '早退',
      '欠勤',
      '勤務時間変更',
      '勤務パターン追加',
      'その他'
    )),

  target_date TEXT,
  attendance_id TEXT,

  edit_item TEXT,
  before_value TEXT,
  after_value TEXT,
  leave_type TEXT,
  requested_work_pattern TEXT,
  reason TEXT,

  status TEXT NOT NULL DEFAULT '承認待ち'
    CHECK (status IN ('承認待ち','承認済','差戻し','却下')),

  approver_user_id TEXT,
  approved_at TEXT,
  approver_comment TEXT,

  payload_json TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (company_id) REFERENCES companies(company_id),
  FOREIGN KEY (employee_id) REFERENCES employees(employee_id),
  FOREIGN KEY (attendance_id) REFERENCES attendance(attendance_id),
  FOREIGN KEY (approver_user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  notification_id TEXT PRIMARY KEY,
  company_id TEXT,
  user_id TEXT,
  employee_id TEXT,

  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,

  related_type TEXT,
  related_id TEXT,

  is_read INTEGER NOT NULL DEFAULT 0
    CHECK (is_read IN (0,1)),
  gmail_status TEXT
    CHECK (gmail_status IN ('未送信','送信済','送信失敗') OR gmail_status IS NULL),

  sent_at TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (company_id) REFERENCES companies(company_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  audit_id TEXT PRIMARY KEY,
  company_id TEXT,
  actor_user_id TEXT,
  actor_employee_id TEXT,
  action_type TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  detail TEXT,
  device_info TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (company_id) REFERENCES companies(company_id),
  FOREIGN KEY (actor_user_id) REFERENCES users(user_id),
  FOREIGN KEY (actor_employee_id) REFERENCES employees(employee_id)
);

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key TEXT NOT NULL,
  company_id TEXT,
  setting_value TEXT,
  description TEXT,
  updated_by_user_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (setting_key, company_id),

  FOREIGN KEY (company_id) REFERENCES companies(company_id),
  FOREIGN KEY (updated_by_user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS mail_templates (
  template_id TEXT PRIMARY KEY,
  company_id TEXT,
  purpose TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
    CHECK (is_active IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (company_id) REFERENCES companies(company_id)
);

CREATE TABLE IF NOT EXISTS monthly_exports (
  export_id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  target_month TEXT NOT NULL,
  exported_by_user_id TEXT NOT NULL,
  export_type TEXT NOT NULL
    CHECK (export_type IN ('CSV','PDF')),
  exported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note TEXT,

  FOREIGN KEY (company_id) REFERENCES companies(company_id),
  FOREIGN KEY (exported_by_user_id) REFERENCES users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_employees_company
  ON employees(company_id);

CREATE INDEX IF NOT EXISTS idx_employees_user
  ON employees(user_id);

CREATE INDEX IF NOT EXISTS idx_admin_access_user
  ON admin_company_access(user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_attendance_company_date
  ON attendance(company_id, work_date);

CREATE INDEX IF NOT EXISTS idx_attendance_employee_date
  ON attendance(employee_id, work_date);

CREATE INDEX IF NOT EXISTS idx_applications_company_status
  ON applications(company_id, status, requested_at);

CREATE INDEX IF NOT EXISTS idx_applications_employee
  ON applications(employee_id, requested_at);

CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON notifications(user_id, is_read, created_at);

CREATE INDEX IF NOT EXISTS idx_audit_company_date
  ON audit_logs(company_id, created_at);
