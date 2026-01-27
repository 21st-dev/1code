-- Migration: Add feedback table
-- Description: Stores user feedback with type, priority, and optional screenshots

CREATE TABLE `feedback` (
  `id` text PRIMARY KEY NOT NULL,
  `type` text NOT NULL,
  `priority` text NOT NULL,
  `description` text NOT NULL,
  `screenshots` text NOT NULL DEFAULT '[]',
  `resolved` integer DEFAULT 0 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE INDEX `feedback_type_idx` ON `feedback` (`type`);
CREATE INDEX `feedback_priority_idx` ON `feedback` (`priority`);
CREATE INDEX `feedback_resolved_idx` ON `feedback` (`resolved`);
