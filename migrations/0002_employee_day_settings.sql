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
);

CREATE INDEX IF NOT EXISTS idx_employee_day_settings_employee_date
  ON employee_day_settings(employee_id, work_date);
