CREATE TABLE `claude_provider_config` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`model` text NOT NULL,
	`base_url` text NOT NULL,
	`auth_mode` text DEFAULT 'auth_token' NOT NULL,
	`encrypted_token` text NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
