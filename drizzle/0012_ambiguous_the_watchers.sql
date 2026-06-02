CREATE TABLE `agent_job_events` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`type` text NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`job_id`) REFERENCES `agent_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_job_events_job_sequence_idx` ON `agent_job_events` (`job_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `agent_job_events_job_created_at_idx` ON `agent_job_events` (`job_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `agent_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`retry_of_job_id` text,
	`attempt` integer DEFAULT 1 NOT NULL,
	`source` text NOT NULL,
	`runtime` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`mode` text DEFAULT 'agent' NOT NULL,
	`cwd` text NOT NULL,
	`project_id` text,
	`chat_id` text,
	`sub_chat_id` text,
	`prompt_preview` text,
	`created_at` integer,
	`started_at` integer,
	`finished_at` integer,
	`exit_code` integer,
	`error_code` text,
	`error_message` text,
	`result_json` text,
	`created_by_version` text,
	`worker_id` text,
	`worker_pid` integer,
	`worker_started_at` integer,
	`heartbeat_at` integer,
	`cancel_requested_at` integer,
	`cancel_requested_by` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`sub_chat_id`) REFERENCES `sub_chats`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `agent_jobs_status_idx` ON `agent_jobs` (`status`);--> statement-breakpoint
CREATE INDEX `agent_jobs_source_idx` ON `agent_jobs` (`source`);--> statement-breakpoint
CREATE INDEX `agent_jobs_runtime_idx` ON `agent_jobs` (`runtime`);--> statement-breakpoint
CREATE INDEX `agent_jobs_cwd_idx` ON `agent_jobs` (`cwd`);--> statement-breakpoint
CREATE INDEX `agent_jobs_created_at_idx` ON `agent_jobs` (`created_at`);--> statement-breakpoint
CREATE INDEX `agent_jobs_heartbeat_at_idx` ON `agent_jobs` (`heartbeat_at`);