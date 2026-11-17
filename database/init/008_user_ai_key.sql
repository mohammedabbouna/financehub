SET NAMES utf8mb4;
ALTER TABLE `users`
  ADD COLUMN `ai_api_key` VARCHAR(255) NULL AFTER `password_hash`;
