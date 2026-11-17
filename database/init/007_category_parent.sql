SET NAMES utf8mb4;
-- Add parent_id for main/secondary (primary/sub) categories.
ALTER TABLE `categories`
  ADD COLUMN `parent_id` INT UNSIGNED NULL AFTER `type`;

ALTER TABLE `categories`
  ADD INDEX `idx_categories_parent` (`parent_id`);

ALTER TABLE `categories`
  ADD CONSTRAINT `fk_categories_parent`
    FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL;
