CREATE TABLE `agency_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`password_version` integer NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `members` ADD `name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `role` text DEFAULT 'viewer' NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `permissions` text;--> statement-breakpoint
ALTER TABLE `members` ADD `revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `password_hash` text;--> statement-breakpoint
ALTER TABLE `members` ADD `password_salt` text;--> statement-breakpoint
ALTER TABLE `members` ADD `password_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `force_password_change` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `failed_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `locked_until` text;