ALTER TABLE `agent_jobs` ADD `api_consumer_id` text;--> statement-breakpoint
ALTER TABLE `agent_jobs` ADD `api_consumer_run_id` text;--> statement-breakpoint
ALTER TABLE `agent_jobs` ADD `artifact_base_dir` text;--> statement-breakpoint
ALTER TABLE `agent_jobs` ADD `artifact_manifest_path` text;--> statement-breakpoint
CREATE INDEX `agent_jobs_api_consumer_id_idx` ON `agent_jobs` (`api_consumer_id`);--> statement-breakpoint
CREATE INDEX `agent_jobs_api_consumer_run_id_idx` ON `agent_jobs` (`api_consumer_run_id`);
