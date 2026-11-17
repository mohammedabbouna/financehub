-- Force utf8mb4 on the connection: the init entrypoint may run with a
-- latin1 client charset, which would store Arabic literals double-encoded.
SET NAMES utf8mb4;
-- =============================================================================
-- FinanceHub - Contacts & Debts (Phase 1)
-- Description: Contacts directory + lending/borrowing tracking with payments
-- =============================================================================

-- ─── Contacts ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `contacts` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT UNSIGNED NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `phone` VARCHAR(30) DEFAULT NULL,
    `notes` VARCHAR(500) DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    UNIQUE KEY `uq_contacts_user_name` (`user_id`, `name`),
    INDEX `idx_contacts_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Debts (one row per loan) ─────────────────────────────────────────────────
-- direction:
--   lent_to       → أنا سلّفت (المبلغ خرج من محفظتي، الطرف يدين لي)
--   borrowed_from → أنا استلفت (المبلغ دخل محفظتي، أنا أدين للطرف)
-- The outstanding balance is ALWAYS derived from debt_payments:
--   remaining = amount - SUM(debt_payments.amount)   (floored at 0 for display)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `debts` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT UNSIGNED NOT NULL,
    `contact_id` INT UNSIGNED NOT NULL,
    `direction` ENUM('lent_to', 'borrowed_from') NOT NULL,
    `amount` DECIMAL(15,2) NOT NULL,
    `due_date` DATE DEFAULT NULL,
    `notes` VARCHAR(500) DEFAULT NULL,
    `action_id` INT UNSIGNED DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`action_id`) REFERENCES `actions`(`id`) ON DELETE SET NULL,
    INDEX `idx_debts_user` (`user_id`),
    INDEX `idx_debts_contact` (`contact_id`),
    INDEX `idx_debts_direction` (`direction`),
    INDEX `idx_debts_due` (`due_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Debt Payments (settlements against a debt) ───────────────────────────────
CREATE TABLE IF NOT EXISTS `debt_payments` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT UNSIGNED NOT NULL,
    `debt_id` INT UNSIGNED NOT NULL,
    `amount` DECIMAL(15,2) NOT NULL,
    `payment_date` DATE NOT NULL,
    `notes` VARCHAR(255) DEFAULT NULL,
    `action_id` INT UNSIGNED DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`debt_id`) REFERENCES `debts`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`action_id`) REFERENCES `actions`(`id`) ON DELETE SET NULL,
    INDEX `idx_debt_payments_debt` (`debt_id`),
    INDEX `idx_debt_payments_user` (`user_id`),
    INDEX `idx_debt_payments_date` (`payment_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

