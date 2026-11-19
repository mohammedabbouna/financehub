SET NAMES utf8mb4;
-- Business mode toggle on users
ALTER TABLE `users`
  ADD COLUMN `business_mode` BOOLEAN NOT NULL DEFAULT FALSE AFTER `totp_enabled`;

-- Clients / suppliers
CREATE TABLE IF NOT EXISTS `clients` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT UNSIGNED NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `email` VARCHAR(255) NULL,
    `phone` VARCHAR(50) NULL,
    `address` TEXT NULL,
    `tax_id` VARCHAR(100) NULL,
    `is_supplier` BOOLEAN NOT NULL DEFAULT FALSE,
    `notes` TEXT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_clients_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Invoices
CREATE TABLE IF NOT EXISTS `invoices` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT UNSIGNED NOT NULL,
    `client_id` INT UNSIGNED NULL,
    `number` VARCHAR(50) NOT NULL,
    `issue_date` DATE NOT NULL,
    `due_date` DATE NULL,
    `status` ENUM('draft','sent','paid','overdue','cancelled') NOT NULL DEFAULT 'draft',
    `subtotal` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    `vat_rate` DECIMAL(5,2) NOT NULL DEFAULT 19.00,
    `vat_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    `total` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    `notes` TEXT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON DELETE SET NULL,
    UNIQUE KEY `uniq_user_number` (`user_id`, `number`),
    INDEX `idx_inv_user` (`user_id`),
    INDEX `idx_inv_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Invoice line items
CREATE TABLE IF NOT EXISTS `invoice_items` (
    `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `invoice_id` INT UNSIGNED NOT NULL,
    `description` VARCHAR(500) NOT NULL,
    `quantity` DECIMAL(15,4) NOT NULL DEFAULT 1.0000,
    `unit_price` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    `vat_rate` DECIMAL(5,2) NOT NULL DEFAULT 19.00,
    `line_total` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
