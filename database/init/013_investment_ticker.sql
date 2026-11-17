SET NAMES utf8mb4;
ALTER TABLE `investments`
  ADD COLUMN `ticker` VARCHAR(64) NULL AFTER `name`,
  ADD COLUMN `price_updated_at` TIMESTAMP NULL AFTER `current_price`,
  ADD INDEX `idx_investments_ticker` (`ticker`);
