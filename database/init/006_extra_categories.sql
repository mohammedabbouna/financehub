-- Force utf8mb4 on the connection: the init entrypoint may run with a
-- latin1 client charset, which would store Arabic literals double-encoded.
SET NAMES utf8mb4;
-- ─── Additional detailed system categories ──────────────────────────────────
-- Broader and more granular than the base set so budgets, reports and imports
-- can be tracked at the level of detail users actually need.

INSERT IGNORE INTO `categories` (`id`, `name`, `type`, `icon`, `color`, `is_system`) VALUES
-- Income
(21, 'راتب إضافي',       'income',  '💵', '#22c55e', TRUE),
(22, 'عمولة',             'income',  '💰', '#16a34a', TRUE),
(23, 'إيجار مقبوض',       'income',  '🏠', '#15803d', TRUE),
(24, 'بيع أصل',           'income',  '📈', '#166534', TRUE),
(25, 'هبة',               'income',  '🎁', '#0f766e', TRUE),
(26, 'عائد استثمار',      'income',  '📊', '#0e7490', TRUE),
(27, 'دخل غير متكرر',     'income',  '💵', '#0369a1', TRUE),
(28, 'منحة',              'income',  '🎓', '#1d4ed8', TRUE),

-- Food & drink (granular)
(29, 'بقالة',             'expense', '🛒', '#dc2626', TRUE),
(30, 'لحوم ودواجن',       'expense', '🍗', '#b91c1c', TRUE),
(31, 'مخبز',              'expense', '🥖', '#991b1b', TRUE),
(32, 'ماء ومشروبات',      'expense', '🥤', '#7f1d1d', TRUE),
(33, 'مطاعم سريعة',       'expense', '🍔', '#ea580c', TRUE),
(34, 'مقهى وقهوة',         'expense', '☕', '#c2410c', TRUE),

-- Health (granular)
(35, 'أدوية',             'expense', '💊', '#0891b2', TRUE),
(36, 'أطباء',             'expense', '🩺', '#0e7490', TRUE),
(37, 'تحاليل',            'expense', '🔬', '#155e75', TRUE),
(38, 'أسنان',             'expense', '🦷', '#164e63', TRUE),
(39, 'تأمين صحي',         'expense', '🏥', '#1e3a8a', TRUE),

-- Transport (granular)
(40, 'وقود',              'expense', '⛽', '#ea580c', TRUE),
(41, 'صيانة سيارة',       'expense', '🔧', '#c2410c', TRUE),
(42, 'تأجير سيارة',       'expense', '🚕', '#9a3412', TRUE),
(43, 'تأمين سيارة',       'expense', '🛡️', '#7c2d12', TRUE),
(44, 'رخص و وثائق',        'expense', '📄', '#78350f', TRUE),

-- Housing & utilities (granular)
(45, 'كهرباء',            'expense', '💡', '#16a34a', TRUE),
(46, 'غاز',               'expense', '🔥', '#15803d', TRUE),
(47, 'ماء',               'expense', '💧', '#166534', TRUE),
(48, 'إنترنت',            'expense', '🌐', '#0f766e', TRUE),
(49, 'اتصالات',           'expense', '📱', '#0e7490', TRUE),
(50, 'كرت الاتصال',       'expense', '📲', '#155e75', TRUE),
(51, 'صيانة منزل',        'expense', '🛠️', '#1e3a8a', TRUE),
(52, 'أثاث',              'expense', '🛋️', '#1d4ed8', TRUE),
(53, 'أجهزة منزلية',      'expense', '📺', '#2563eb', TRUE),

-- Education (granular)
(54, 'رسوم مدرسية',       'expense', '🏫', '#7c3aed', TRUE),
(55, 'كتب',               'expense', '📖', '#6d28d9', TRUE),
(56, 'دورات',             'expense', '🎓', '#5b21b6', TRUE),
(57, 'لوازم مدرسية',      'expense', '✏️', '#4c1d95', TRUE),

-- Entertainment (granular)
(58, 'سينما',             'expense', '🎬', '#db2777', TRUE),
(59, 'ألعاب',             'expense', '🎮', '#be185d', TRUE),
(60, 'رياضة',             'expense', '🏋️', '#9d174d', TRUE),
(61, 'اشتراكات',          'expense', '🔄', '#831843', TRUE),

-- Personal care & family
(62, 'تجميل',             'expense', '💄', '#c026d3', TRUE),
(63, 'عناية شخصية',       'expense', '🧴', '#a21caf', TRUE),
(64, 'حيوانات',           'expense', '🐾', '#86198f', TRUE),
(65, 'أطفال',             'expense', '👶', '#701a75', TRUE),
(66, 'لوازم أطفال',       'expense', '🧸', '#4a044e', TRUE),

-- Giving & other
(67, 'تبرعات',            'expense', '❤️', '#e11d48', TRUE),
(68, 'زكاة',              'expense', '🕌', '#be123c', TRUE),
(69, 'أخرى',              'expense', '📌', '#6b7280', TRUE);
