CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`action` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_owner` ON `audit` (`owner`);--> statement-breakpoint
CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`source` text NOT NULL,
	`date` text NOT NULL,
	`account` text NOT NULL,
	`party` text DEFAULT '' NOT NULL,
	`currency` text NOT NULL,
	`debit` integer NOT NULL,
	`credit` integer NOT NULL,
	`memo` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `entries_owner_date` ON `entries` (`owner`,`date`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`kind` text NOT NULL,
	`number` text NOT NULL,
	`date` text NOT NULL,
	`currency` text NOT NULL,
	`sale` integer NOT NULL,
	`cost` integer NOT NULL,
	`customer` text NOT NULL,
	`supplier` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`detail` text NOT NULL,
	`created` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `orders_owner_date` ON `orders` (`owner`,`date`);--> statement-breakpoint
CREATE TABLE `parties` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `parties_owner` ON `parties` (`owner`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`kind` text NOT NULL,
	`party` text NOT NULL,
	`date` text NOT NULL,
	`currency` text NOT NULL,
	`amount` integer NOT NULL,
	`memo` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `payments_owner` ON `payments` (`owner`);--> statement-breakpoint
CREATE TABLE `settings` (
	`owner` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
