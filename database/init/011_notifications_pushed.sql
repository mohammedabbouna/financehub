SET NAMES utf8mb4;
ALTER TABLE `notifications`
  ADD COLUMN `pushed_at` TIMESTAMP NULL AFTER `is_read`;
