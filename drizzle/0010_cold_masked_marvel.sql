CREATE TABLE `model_profile_settings` (
	`id` text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	`last_used_profile_id` text,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `model_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`config` text NOT NULL,
	`models` text DEFAULT '[]' NOT NULL,
	`is_offline` integer DEFAULT false NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
ALTER TABLE `chats` ADD `model_profile_id` text;--> statement-breakpoint
ALTER TABLE `chats` ADD `selected_model_id` text;