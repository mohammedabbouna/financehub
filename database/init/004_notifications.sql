-- Force utf8mb4 on the connection: the init entrypoint may run with a
-- latin1 client charset, which would store Arabic literals double-encoded.
SET NAMES utf8mb4;
-- =============================================================================
-- FinanceHub - Notifications (Phase 2)
-- Description: In-app notification inbox fed by the background worker
--              (recurring generation, bill reminders, budget warnings,
--               debt due dates, anomalies) and by user-facing events.
--
-- ref_key is the deduplication key: one logical event (e.g. "bill #12 due on
-- 2026-12-05") may be evaluated by the worker every few minutes, but only
-- creates a row while no row with the same key exists.
-- =============================================================================

CREATE TABLE IF NOT EXISTS `notifications` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT UNSIGNED NOT NULL,
    `type` VARCHAR(50) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `body` VARCHAR(500) NOT NULL,
    `link` VARCHAR(200) DEFAULT NULL,
    `ref_key` VARCHAR(120) DEFAULT NULL,
    `is_read` BOOLEAN NOT NULL DEFAULT FALSE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_notifications_user` (`user_id`),
    INDEX `idx_notifications_unread` (`user_id`, `is_read`),
    INDEX `idx_notifications_ref` (`user_id`, `ref_key`),
    INDEX `idx_notifications_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

