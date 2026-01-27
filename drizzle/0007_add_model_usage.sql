-- Model usage tracking table
-- Records token usage for each Claude API call
CREATE TABLE `model_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`sub_chat_id` text NOT NULL REFERENCES `sub_chats`(`id`) ON DELETE CASCADE,
	`chat_id` text NOT NULL REFERENCES `chats`(`id`) ON DELETE CASCADE,
	`project_id` text NOT NULL REFERENCES `projects`(`id`) ON DELETE CASCADE,
	`model` text NOT NULL,
	`input_tokens` integer NOT NULL DEFAULT 0,
	`output_tokens` integer NOT NULL DEFAULT 0,
	`total_tokens` integer NOT NULL DEFAULT 0,
	`cost_usd` text,
	`session_id` text,
	`message_uuid` text,
	`mode` text,
	`duration_ms` integer,
	`created_at` integer
);--> statement-breakpoint

-- Indexes for query optimization
CREATE INDEX `model_usage_created_at_idx` ON `model_usage` (`created_at`);--> statement-breakpoint
CREATE INDEX `model_usage_model_idx` ON `model_usage` (`model`);--> statement-breakpoint
CREATE INDEX `model_usage_project_id_idx` ON `model_usage` (`project_id`);--> statement-breakpoint
CREATE INDEX `model_usage_chat_id_idx` ON `model_usage` (`chat_id`);--> statement-breakpoint
CREATE INDEX `model_usage_sub_chat_id_idx` ON `model_usage` (`sub_chat_id`);--> statement-breakpoint
-- Unique index for deduplication by message UUID
CREATE UNIQUE INDEX `model_usage_message_uuid_idx` ON `model_usage` (`message_uuid`);
