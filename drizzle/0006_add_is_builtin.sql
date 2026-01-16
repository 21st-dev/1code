ALTER TABLE `ai_providers` ADD COLUMN `is_builtin` integer DEFAULT 0 NOT NULL;
ALTER TABLE `ai_providers` ADD COLUMN `user_id` text;
