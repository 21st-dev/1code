-- Migration: Add model_profiles table
-- Description: Stores custom model configurations for API integrations

CREATE TABLE `model_profiles` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `description` text,
  `config` text NOT NULL,
  `models` text NOT NULL,
  `is_offline` integer DEFAULT 0 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint

CREATE INDEX `model_profiles_name_idx` ON `model_profiles` (`name`);
--> statement-breakpoint

CREATE INDEX `model_profiles_is_offline_idx` ON `model_profiles` (`is_offline`);
