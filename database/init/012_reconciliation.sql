SET NAMES utf8mb4;
CREATE TABLE IF NOT EXISTS `reconciliation_sessions` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT UNSIGNED NOT NULL,
    `filename` VARCHAR(255) NULL,
    `status` ENUM('open','completed') NOT NULL DEFAULT 'open',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `completed_at` TIMESTAMP NULL,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_recon_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `reconciliation_rows` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `session_id` INT UNSIGNED NOT NULL,
    `row_date` DATE NOT NULL,
    `description` VARCHAR(500) NULL,
    `amount` DECIMAL(15,2) NOT NULL,
    `direction` ENUM('in','out') NOT NULL DEFAULT 'out',
    `matched_action_id` INT UNSIGNED NULL,
    `status` ENUM('unmatched','matched','ambiguous','ignored','created') NOT NULL DEFAULT 'unmatched',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`session_id`) REFERENCES `reconciliation_sessions`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`matched_action_id`) REFERENCES `actions`(`id`) ON DELETE SET NULL,
    INDEX `idx_recon_session` (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
