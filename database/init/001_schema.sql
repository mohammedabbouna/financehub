-- Force utf8mb4 on the connection: the init entrypoint may run with a
-- latin1 client charset, which would store Arabic literals double-encoded.
SET NAMES utf8mb4;
-- =============================================================================
-- FinanceHub - Full Database Schema
-- Version: 1.0.0
-- Description: Complete schema for the Financial OS platform
-- =============================================================================

-- ─── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `users` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(100) NOT NULL,
    `email` VARCHAR(255) NOT NULL UNIQUE,
    `password_hash` VARCHAR(255) NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Categories ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `categories` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT UNSIGNED DEFAULT NULL,
    `name` VARCHAR(100) NOT NULL,
    `type` ENUM('income', 'expense') NOT NULL,
    `icon` VARCHAR(50) DEFAULT '📁',
    `color` VARCHAR(7) DEFAULT '#6b7280',
    `is_system` BOOLEAN DEFAULT FALSE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_categories_user` (`user_id`),
    INDEX `idx_categories_type` (`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Wallets ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `wallets` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT UNSIGNED NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `type` ENUM('cash', 'bank', 'investment', 'savings', 'emergency') NOT NULL DEFAULT 'cash',
    `currency` VARCHAR(3) NOT NULL DEFAULT 'DZD',
    `balance` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    `icon` VARCHAR(50) DEFAULT '💰',
    `color` VARCHAR(7) DEFAULT '#3b82f6',
    `is_archived` BOOLEAN DEFAULT FALSE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_wallets_user` (`user_id`),
    INDEX `idx_wallets_type` (`type`),
    INDEX `idx_wallets_archived` (`is_archived`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Actions (Financial Transactions) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `actions` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT UNSIGNED NOT NULL,
    `wallet_id` INT UNSIGNED NOT NULL,
    `target_wallet_id` INT UNSIGNED DEFAULT NULL,
    `type` ENUM('deposit', 'withdraw', 'transfer', 'invest', 'borrow', 'repay') NOT NULL,
    `amount` DECIMAL(15,2) NOT NULL,
    `category_id` INT UNSIGNED DEFAULT NULL,
    `description` TEXT DEFAULT NULL,
    `date` DATE NOT NULL,
    `tag` VARCHAR(50) DEFAULT NULL,
    `receipt_url` VARCHAR(500) DEFAULT NULL,
    `transfer_group_id` VARCHAR(36) DEFAULT NULL,
    `is_recurring` BOOLEAN DEFAULT FALSE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`target_wallet_id`) REFERENCES `wallets`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL,
    INDEX `idx_actions_user` (`user_id`),
    INDEX `idx_actions_wallet` (`wallet_id`),
    INDEX `idx_actions_category` (`category_id`),
    INDEX `idx_actions_type` (`type`),
    INDEX `idx_actions_date` (`date`),
    INDEX `idx_actions_tag` (`tag`),
    INDEX `idx_actions_transfer_group` (`transfer_group_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Budgets ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `budgets` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT UNSIGNED NOT NULL,
    `category_id` INT UNSIGNED NOT NULL,
    `period` ENUM('monthly', 'weekly', 'yearly') NOT NULL DEFAULT 'monthly',
    `amount` DECIMAL(15,2) NOT NULL,
    `is_percentage` BOOLEAN DEFAULT FALSE,
    `auto_suggested` BOOLEAN DEFAULT FALSE,
    `is_active` BOOLEAN DEFAULT TRUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE CASCADE,
    INDEX `idx_budgets_user` (`user_id`),
    INDEX `idx_budgets_category` (`category_id`),
    INDEX `idx_budgets_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Goals ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `goals` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT UNSIGNED NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `target_amount` DECIMAL(15,2) NOT NULL,
    `current_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    `target_date` DATE DEFAULT NULL,
    `linked_wallet_id` INT UNSIGNED DEFAULT NULL,
    `icon` VARCHAR(50) DEFAULT '🎯',
    `color` VARCHAR(7) DEFAULT '#8b5cf6',
    `is_completed` BOOLEAN DEFAULT FALSE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`linked_wallet_id`) REFERENCES `wallets`(`id`) ON DELETE SET NULL,
    INDEX `idx_goals_user` (`user_id`),
    INDEX `idx_goals_completed` (`is_completed`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Income Allocation Rules ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `income_allocation_rules` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT UNSIGNED NOT NULL,
    `target_type` ENUM('wallet', 'category') NOT NULL DEFAULT 'wallet',
    `target_id` INT UNSIGNED NOT NULL,
    `allocation_type` ENUM('percentage', 'fixed') NOT NULL DEFAULT 'percentage',
    `allocation_value` DECIMAL(15,2) NOT NULL,
    `is_active` BOOLEAN DEFAULT TRUE,
    `priority` INT DEFAULT 0,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_allocation_user` (`user_id`),
    INDEX `idx_allocation_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Allocation Decisions Log ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `allocation_decisions_log` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT UNSIGNED NOT NULL,
    `action_id` INT UNSIGNED DEFAULT NULL,
    `proposed_allocation` JSON NOT NULL,
    `status` ENUM('pending', 'approved', 'rejected', 'modified') NOT NULL DEFAULT 'pending',
    `user_feedback` TEXT DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`action_id`) REFERENCES `actions`(`id`) ON DELETE SET NULL,
    INDEX `idx_allocation_log_user` (`user_id`),
    INDEX `idx_allocation_log_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Investments ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `investments` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT UNSIGNED NOT NULL,
    `wallet_id` INT UNSIGNED DEFAULT NULL,
    `asset_type` ENUM('stock', 'crypto', 'gold', 'realestate', 'other') NOT NULL DEFAULT 'other',
    `name` VARCHAR(200) NOT NULL,
    `quantity` DECIMAL(15,4) NOT NULL DEFAULT 0.0000,
    `purchase_price` DECIMAL(15,2) NOT NULL,
    `current_price` DECIMAL(15,2) NOT NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'DZD',
    `notes` TEXT DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON DELETE SET NULL,
    INDEX `idx_investments_user` (`user_id`),
    INDEX `idx_investments_type` (`asset_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Recurring Transactions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `recurring_transactions` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT UNSIGNED NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `action_template` JSON NOT NULL,
    `frequency` ENUM('daily', 'weekly', 'monthly', 'yearly') NOT NULL DEFAULT 'monthly',
    `next_run_date` DATE NOT NULL,
    `is_active` BOOLEAN DEFAULT TRUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_recurring_user` (`user_id`),
    INDEX `idx_recurring_next` (`next_run_date`),
    INDEX `idx_recurring_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Bills ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `bills` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT UNSIGNED NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `amount` DECIMAL(15,2) NOT NULL,
    `due_date` DATE NOT NULL,
    `category_id` INT UNSIGNED DEFAULT NULL,
    `wallet_id` INT UNSIGNED DEFAULT NULL,
    `is_paid` BOOLEAN DEFAULT FALSE,
    `reminder_days_before` INT DEFAULT 3,
    `is_recurring` BOOLEAN DEFAULT FALSE,
    `recurring_frequency` ENUM('monthly', 'yearly', 'quarterly') DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON DELETE SET NULL,
    INDEX `idx_bills_user` (`user_id`),
    INDEX `idx_bills_due` (`due_date`),
    INDEX `idx_bills_paid` (`is_paid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Financial Health Scores ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `financial_health_scores` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT UNSIGNED NOT NULL,
    `score` TINYINT UNSIGNED NOT NULL,
    `breakdown` JSON NOT NULL,
    `calculated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_health_user` (`user_id`),
    INDEX `idx_health_date` (`calculated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Insights ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `insights` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT UNSIGNED NOT NULL,
    `type` VARCHAR(50) NOT NULL,
    `message` TEXT NOT NULL,
    `supporting_data` JSON DEFAULT NULL,
    `is_read` BOOLEAN DEFAULT FALSE,
    `is_dismissed` BOOLEAN DEFAULT FALSE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_insights_user` (`user_id`),
    INDEX `idx_insights_type` (`type`),
    INDEX `idx_insights_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── AI Chat History ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ai_chat_history` (
    `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT UNSIGNED NOT NULL,
    `role` ENUM('user', 'assistant') NOT NULL,
    `message` TEXT NOT NULL,
    `context_data` JSON DEFAULT NULL,
    `tokens_used` INT UNSIGNED DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_chat_user` (`user_id`),
    INDEX `idx_chat_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Anomalies ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `anomalies` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT UNSIGNED NOT NULL,
    `action_id` INT UNSIGNED DEFAULT NULL,
    `reason` TEXT NOT NULL,
    `severity` ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'medium',
    `supporting_data` JSON DEFAULT NULL,
    `is_read` BOOLEAN DEFAULT FALSE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`action_id`) REFERENCES `actions`(`id`) ON DELETE SET NULL,
    INDEX `idx_anomalies_user` (`user_id`),
    INDEX `idx_anomalies_severity` (`severity`),
    INDEX `idx_anomalies_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Refresh Tokens ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `refresh_tokens` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT UNSIGNED NOT NULL,
    `token_hash` VARCHAR(255) NOT NULL,
    `expires_at` TIMESTAMP NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_refresh_user` (`user_id`),
    INDEX `idx_refresh_token` (`token_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

