CREATE TABLE `platform_agencies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`namespace` text NOT NULL,
	`admin_email` text NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`payment_status` text DEFAULT 'unpaid' NOT NULL,
	`fee_minor` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`paid_on` text DEFAULT '' NOT NULL,
	`due_on` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `platform_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`agency_id` text NOT NULL,
	`action` text NOT NULL,
	`before_value` text NOT NULL,
	`after_value` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `platform_memberships` (
	`agency_id` text NOT NULL,
	`email` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_platform_membership` ON `platform_memberships` (`agency_id`,`email`);--> statement-breakpoint
CREATE TABLE `platform_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL
);

--> statement-breakpoint
INSERT OR IGNORE INTO platform_settings (id,owner_id) SELECT 1,owner_id FROM system_settings WHERE id=1;
--> statement-breakpoint
INSERT OR IGNORE INTO platform_agencies (id,name,namespace,admin_email,state,payment_status,fee_minor,currency,paid_on,due_on,notes,revision,created_at,updated_at)
SELECT '00000000-0000-4000-8000-000000000001',json_extract(payload,'$.companyName'),'legacy','',CASE WHEN json_extract(payload,'$.globalLocked')=1 THEN 'suspended' ELSE 'active' END,COALESCE(json_extract(payload,'$.paymentStatus'),'unpaid'),CAST(COALESCE(json_extract(payload,'$.licenseAmount'),0)*100 AS INTEGER),COALESCE(json_extract(payload,'$.defaultCurrency'),'USD'),'','','',1,updated_at,updated_at FROM system_settings WHERE id=1;
--> statement-breakpoint
INSERT OR IGNORE INTO platform_memberships (agency_id,email,active) SELECT '00000000-0000-4000-8000-000000000001',email,active FROM members;
