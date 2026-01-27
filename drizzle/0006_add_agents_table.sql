CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL UNIQUE,
	`description` text,
	`prompt` text NOT NULL,
	`tools` text,
	`disallowed_tools` text,
	`model` text,
	`source` text NOT NULL,
	`project_id` text,
	`file_path` text NOT NULL,
	`created_via_chat` integer DEFAULT 0 NOT NULL,
	`creation_chat_ids` text DEFAULT '[]' NOT NULL,
	`modification_chat_ids` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `agents_name_idx` ON `agents` (`name`);--> statement-breakpoint
CREATE INDEX `agents_project_id_idx` ON `agents` (`project_id`);--> statement-breakpoint
CREATE INDEX `agents_source_idx` ON `agents` (`source`);
