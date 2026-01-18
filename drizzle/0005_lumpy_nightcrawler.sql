CREATE TABLE `tool_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`sub_chat_id` text NOT NULL,
	`chat_name` text NOT NULL,
	`tool_name` text NOT NULL,
	`summary` text NOT NULL,
	`state` text NOT NULL,
	`input` text,
	`output` text,
	`error_text` text,
	`created_at` integer
);
