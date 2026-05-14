CREATE TABLE `local_api_provider_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`model` text NOT NULL,
	`base_url` text NOT NULL,
	`encrypted_token` text NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
