CREATE TABLE `dev_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`email` text NOT NULL,
	`encrypted_password` text NOT NULL,
	`domain` text,
	`created_at` integer,
	`updated_at` integer
);
