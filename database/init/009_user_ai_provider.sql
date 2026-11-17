SET NAMES utf8mb4;
ALTER TABLE `users`
  ADD COLUMN `ai_provider` VARCHAR(32) NULL AFTER `ai_api_key`,
  ADD COLUMN `ai_base_url` VARCHAR(255) NULL AFTER `ai_provider`,
  ADD COLUMN `ai_model` VARCHAR(128) NULL AFTER `ai_base_url`;
