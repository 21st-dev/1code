CREATE INDEX `chats_project_id_idx` ON `chats` (`project_id`);--> statement-breakpoint
CREATE INDEX `sub_chats_chat_id_idx` ON `sub_chats` (`chat_id`);--> statement-breakpoint
CREATE INDEX `sub_chats_stream_id_idx` ON `sub_chats` (`stream_id`);