SET NAMES utf8mb4;
ALTER TABLE `users`
  ADD COLUMN `totp_secret` VARCHAR(64) NULL AFTER `ai_model`,
  ADD COLUMN `totp_enabled` BOOLEAN NOT NULL DEFAULT FALSE AFTER `totp_secret`,
  ADD COLUMN `recovery_codes` TEXT NULL AFTER `totp_enabled`;
