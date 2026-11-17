-- Force utf8mb4 on the connection: the init entrypoint may run with a
-- latin1 client charset, which would store Arabic literals double-encoded.
SET NAMES utf8mb4;
-- ─── System Categories (shared across all users) ─────────────────────────────

-- Income Categories
INSERT IGNORE INTO `categories` (`id`, `name`, `type`, `icon`, `color`, `is_system`) VALUES
(1,  'الراتب',            'income',  '💼', '#10b981', TRUE),
(2,  'عمل حر',            'income',  '💻', '#14b8a6', TRUE),
(3,  'استثمارات',         'income',  '📈', '#8b5cf6', TRUE),
(4,  'هدية',              'income',  '🎁', '#f59e0b', TRUE),
(5,  'دخل إضافي',         'income',  '💵', '#3b82f6', TRUE);

-- Expense Categories
INSERT IGNORE INTO `categories` (`id`, `name`, `type`, `icon`, `color`, `is_system`) VALUES
(6,  'طعام ومشروبات',     'expense', '🍽️', '#ef4444', TRUE),
(7,  'مواصلات',           'expense', '🚗', '#f97316', TRUE),
(8,  'سكن وإيجار',        'expense', '🏠', '#eab308', TRUE),
(9,  'فواتير',            'expense', '💡', '#22c55e', TRUE),
(10, 'ترفيه',             'expense', '🎮', '#ec4899', TRUE),
(11, 'صحة',               'expense', '🏥', '#06b6d4', TRUE),
(12, 'تعليم',             'expense', '📚', '#a855f7', TRUE),
(13, 'ملابس',             'expense', '👕', '#6366f1', TRUE),
(14, 'سفر',               'expense', '✈️', '#14b8a6', TRUE),
(15, 'هدايا',             'expense', '🎀', '#f43f5e', TRUE),
(16, 'تأمين',             'expense', '🛡️', '#64748b', TRUE),
(17, 'التزامات بنكية',    'expense', '🏦', '#0ea5e9', TRUE),
(18, 'مطاعم',             'expense', '🍕', '#fb923c', TRUE),
(19, 'تسوق',              'expense', '🛒', '#d946ef', TRUE),
(20, 'أخرى',              'expense', '📌', '#6b7280', TRUE);

