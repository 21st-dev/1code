CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`priority` text NOT NULL,
	`description` text NOT NULL,
	`screenshots` text DEFAULT '[]' NOT NULL,
	`resolved` integer DEFAULT false NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
