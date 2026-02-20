CREATE TABLE IF NOT EXISTS `continuity_settings` (
	`id` text PRIMARY KEY NOT NULL DEFAULT 'singleton',
	`artifact_policy` text NOT NULL DEFAULT 'auto-write-manual-commit',
	`auto_commit_to_memory_branch` integer NOT NULL DEFAULT false,
	`memory_branch` text NOT NULL DEFAULT 'memory/continuity',
	`updated_at` integer
);
