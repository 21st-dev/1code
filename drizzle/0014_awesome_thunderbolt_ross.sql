CREATE TABLE `agent_schedule_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`schedule_id` text,
	`job_id` text,
	`trigger` text NOT NULL,
	`scheduled_for` integer,
	`created_at` integer,
	FOREIGN KEY (`schedule_id`) REFERENCES `agent_schedules`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`job_id`) REFERENCES `agent_jobs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `agent_schedule_runs_schedule_id_idx` ON `agent_schedule_runs` (`schedule_id`);--> statement-breakpoint
CREATE INDEX `agent_schedule_runs_job_id_idx` ON `agent_schedule_runs` (`job_id`);--> statement-breakpoint
CREATE INDEX `agent_schedule_runs_created_at_idx` ON `agent_schedule_runs` (`created_at`);--> statement-breakpoint
CREATE TABLE `agent_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'enabled' NOT NULL,
	`runtime` text NOT NULL,
	`mode` text DEFAULT 'agent' NOT NULL,
	`cwd` text NOT NULL,
	`project_id` text,
	`prompt_preview` text,
	`input_json` text DEFAULT '{}' NOT NULL,
	`interval_seconds` integer NOT NULL,
	`timezone` text DEFAULT 'local' NOT NULL,
	`next_run_at` integer,
	`last_run_at` integer,
	`last_job_id` text,
	`created_at` integer,
	`updated_at` integer,
	`disabled_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`last_job_id`) REFERENCES `agent_jobs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `agent_schedules_status_idx` ON `agent_schedules` (`status`);--> statement-breakpoint
CREATE INDEX `agent_schedules_next_run_at_idx` ON `agent_schedules` (`next_run_at`);--> statement-breakpoint
CREATE INDEX `agent_schedules_project_id_idx` ON `agent_schedules` (`project_id`);--> statement-breakpoint
CREATE INDEX `agent_schedules_last_job_id_idx` ON `agent_schedules` (`last_job_id`);