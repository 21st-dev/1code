CREATE TABLE `worktree_setup_trust_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`config_source` text NOT NULL,
	`config_path` text NOT NULL,
	`command_hash` text NOT NULL,
	`decision` text DEFAULT 'approved' NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `worktree_setup_trust_project_hash_idx` ON `worktree_setup_trust_decisions` (`project_id`,`command_hash`);--> statement-breakpoint
CREATE INDEX `worktree_setup_trust_project_idx` ON `worktree_setup_trust_decisions` (`project_id`);