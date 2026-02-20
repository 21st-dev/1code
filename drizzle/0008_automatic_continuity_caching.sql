CREATE TABLE IF NOT EXISTS `continuity_file_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`repo_root` text NOT NULL,
	`file_path` text NOT NULL,
	`content_hash` text NOT NULL,
	`summary` text NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `continuity_search_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`repo_root` text NOT NULL,
	`query` text NOT NULL,
	`commit_hash` text NOT NULL,
	`scope` text NOT NULL,
	`result_json` text NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `continuity_pack_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`task_fingerprint` text NOT NULL,
	`changed_files_hash` text NOT NULL,
	`head_commit` text NOT NULL,
	`provider` text NOT NULL,
	`mode` text NOT NULL,
	`budget_bytes` integer NOT NULL,
	`pack` text NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `continuity_state` (
	`sub_chat_id` text PRIMARY KEY NOT NULL,
	`last_changed_files_hash` text DEFAULT '' NOT NULL,
	`turns_since_snapshot` integer DEFAULT 0 NOT NULL,
	`total_injected_bytes` integer DEFAULT 0 NOT NULL,
	`last_snapshot_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `continuity_artifact` (
	`id` text PRIMARY KEY NOT NULL,
	`sub_chat_id` text NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`provenance_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`sub_chat_id`) REFERENCES `sub_chats`(`id`) ON UPDATE no action ON DELETE cascade
);
