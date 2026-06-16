PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_chats` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`project_id` text,
	`created_at` integer,
	`updated_at` integer,
	`archived_at` integer,
	`worktree_path` text,
	`branch` text,
	`base_branch` text,
	`pr_url` text,
	`pr_number` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_chats`("id", "name", "project_id", "created_at", "updated_at", "archived_at", "worktree_path", "branch", "base_branch", "pr_url", "pr_number") SELECT "id", "name", "project_id", "created_at", "updated_at", "archived_at", "worktree_path", "branch", "base_branch", "pr_url", "pr_number" FROM `chats`;--> statement-breakpoint
DROP TABLE `chats`;--> statement-breakpoint
ALTER TABLE `__new_chats` RENAME TO `chats`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `chats_worktree_path_idx` ON `chats` (`worktree_path`);