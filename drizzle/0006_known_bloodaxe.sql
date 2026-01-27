CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`prompt` text NOT NULL,
	`tools` text,
	`disallowed_tools` text,
	`model` text,
	`source` text NOT NULL,
	`project_id` text,
	`file_path` text NOT NULL,
	`created_via_chat` integer DEFAULT false NOT NULL,
	`creation_chat_ids` text DEFAULT '[]' NOT NULL,
	`modification_chat_ids` text DEFAULT '[]' NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agents_name_unique` ON `agents` (`name`);--> statement-breakpoint
CREATE TABLE `model_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`config` text NOT NULL,
	`models` text NOT NULL,
	`is_offline` integer DEFAULT false,
	`created_at` integer,
	`updated_at` integer
);
