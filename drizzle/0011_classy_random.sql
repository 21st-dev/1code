CREATE TABLE `mcp_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`credentials` text DEFAULT '{}' NOT NULL,
	`updated_at` integer
);
