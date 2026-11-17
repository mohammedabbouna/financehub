-- Force utf8mb4 on the connection: the init entrypoint may run with a
-- latin1 client charset, which would store Arabic literals double-encoded.
SET NAMES utf8mb4;
-- =============================================================================
-- FinanceHub - Phase 3: Zakat · Gold · Tontine (Algerian features)
-- =============================================================================

-- ─── Zakat snapshots ─────────────────────────────────────────────────────────
-- Every row is produced server-side by recalculating the user's wealth at save
-- time (cash + gold + investments + receivables − debts) — values are never
-- accepted from the client, so history cannot be tampered with.
CREATE TABLE IF NOT EXISTS `zakat_snapshots` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT UNSIGNED NOT NULL,
    `snapshot_date` DATE NOT NULL,
    `cash` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    `gold_value` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    `investments_value` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    `receivables` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    `liabilities` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    `net_wealth` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    `nisab_value` DECIMAL(15,2) DEFAULT NULL,
    `nisab_grams` DECIMAL(10,2) NOT NULL DEFAULT 85.00,
    `zakat_due` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    `gold_price_dzd_gram` DECIMAL(12,2) DEFAULT NULL,
    `notes` VARCHAR(500) DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_zakat_user` (`user_id`),
    INDEX `idx_zakat_date` (`snapshot_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Gold price cache ────────────────────────────────────────────────────────
-- One row per calendar day, refreshed on demand (GET /gold/price) and by the
-- background worker — price_dzd_per_gram is what every consumer reads.
CREATE TABLE IF NOT EXISTS `gold_prices` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `price_date` DATE NOT NULL,
    `price_usd_oz` DECIMAL(12,4) NOT NULL,
    `usd_dzd` DECIMAL(10,4) NOT NULL,
    `price_dzd_gram` DECIMAL(12,2) NOT NULL,
    `source` VARCHAR(60) NOT NULL DEFAULT 'gold-api.com',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `uniq_gold_price_date` (`price_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Tontine (العمارية) ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `tontines` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT UNSIGNED NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `amount` DECIMAL(15,2) NOT NULL,
    `frequency` ENUM('weekly', 'monthly') NOT NULL DEFAULT 'monthly',
    `start_date` DATE NOT NULL,
    `manager_name` VARCHAR(100) DEFAULT NULL,
    `notes` VARCHAR(500) DEFAULT NULL,
    `status` ENUM('active', 'completed', 'cancelled') NOT NULL DEFAULT 'active',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_tontine_user` (`user_id`),
    INDEX `idx_tontine_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tontine_members` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `tontine_id` INT UNSIGNED NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `phone` VARCHAR(30) DEFAULT NULL,
    -- Receiving order inside the rotation (1 = receives the first pot).
    `position` SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    -- True when the member is the account owner paying their own share.
    `is_self` BOOLEAN NOT NULL DEFAULT FALSE,
    `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`tontine_id`) REFERENCES `tontines`(`id`) ON DELETE CASCADE,
    INDEX `idx_tontine_member_tontine` (`tontine_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tontine_payments` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `tontine_id` INT UNSIGNED NOT NULL,
    `member_id` INT UNSIGNED NOT NULL,
    `due_date` DATE NOT NULL,
    `amount` DECIMAL(15,2) NOT NULL,
    `wallet_id` INT UNSIGNED DEFAULT NULL,
    `action_id` INT UNSIGNED DEFAULT NULL,
    `notes` VARCHAR(255) DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`tontine_id`) REFERENCES `tontines`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`member_id`) REFERENCES `tontine_members`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON DELETE SET NULL,
    FOREIGN KEY (`action_id`) REFERENCES `actions`(`id`) ON DELETE SET NULL,
    -- One payment per member per cycle — re-submitting is a no-op.
    UNIQUE KEY `uniq_tontine_payment` (`tontine_id`, `member_id`, `due_date`),
    INDEX `idx_tontine_payment_tontine` (`tontine_id`, `due_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

