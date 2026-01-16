CREATE TABLE `ai_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`model` text NOT NULL,
	`provider_type` text NOT NULL,
	`oauth_token` text,
	`api_key` text,
	`base_url` text,
	`is_active` integer DEFAULT false NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	`user_id` text
);
