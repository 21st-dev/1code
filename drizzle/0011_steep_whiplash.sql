CREATE TABLE `agent_provider_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`preset_id` text,
	`protocol` text NOT NULL,
	`base_url` text NOT NULL,
	`default_model` text NOT NULL,
	`auth_mode` text DEFAULT 'bearer' NOT NULL,
	`encrypted_token` text,
	`headers_json` text DEFAULT '{}' NOT NULL,
	`target_runtimes_json` text DEFAULT '[]' NOT NULL,
	`capabilities_json` text DEFAULT '{}' NOT NULL,
	`last_test_status_json` text,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `agent_provider_defaults` (
	`purpose` text PRIMARY KEY NOT NULL,
	`profile_id` text,
	`model_override` text,
	`updated_at` integer,
	FOREIGN KEY (`profile_id`) REFERENCES `agent_provider_profiles`(`id`) ON UPDATE no action ON DELETE set null
);
