ALTER TABLE `sub_chats` ADD `file_stats_additions` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sub_chats` ADD `file_stats_deletions` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sub_chats` ADD `file_stats_file_count` integer DEFAULT 0 NOT NULL;