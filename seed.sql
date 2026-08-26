-- NEXUS ONE / initial seed v1
PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO companies
(company_id, company_name, domain, status)
VALUES
('HRC', 'HR COMPANY', NULL, '有効'),
('ITC', 'ITキャリアアップシステム', NULL, '有効');

INSERT OR IGNORE INTO work_patterns
(work_pattern_id, company_id, display_name, start_time, end_time, break_minutes, display_order, is_active)
VALUES
('WP001', NULL, '8:00-17:00',  '08:00', '17:00', 60, 1, 1),
('WP002', NULL, '9:00-18:00',  '09:00', '18:00', 60, 2, 1),
('WP003', NULL, '10:00-19:00', '10:00', '19:00', 60, 3, 1),
('WP004', NULL, '11:00-20:00', '11:00', '20:00', 60, 4, 1),
('WP005', NULL, '12:00-21:00', '12:00', '21:00', 60, 5, 1),
('WP006', NULL, '13:00-22:00', '13:00', '22:00', 60, 6, 1);

INSERT OR IGNORE INTO system_settings
(setting_key, company_id, setting_value, description)
VALUES
('timezone', NULL, 'Asia/Tokyo', 'システム標準タイムゾーン'),
('location_required', NULL, 'TRUE', '打刻時の位置情報取得'),
('location_address_level', NULL, '市区町村・町名程度', 'Admin/本人画面で表示する位置情報粒度'),
('google_login_enabled', NULL, 'TRUE', 'Googleログインを利用'),
('initial_registration_approval', NULL, 'TRUE', '初回登録は管理者承認後に利用可能');
