CREATE TABLE `anthropic_auth_settings` (
	`id` text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	`auth_mode` text DEFAULT 'oauth' NOT NULL,
	`aws_region` text DEFAULT 'us-east-1',
	`aws_profile` text,
	`updated_at` integer
);
