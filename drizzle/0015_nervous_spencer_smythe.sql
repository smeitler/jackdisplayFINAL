ALTER TABLE `deviceRecordings` ADD `status` varchar(32) DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `deviceRecordings` ADD `journalEntries` text;--> statement-breakpoint
ALTER TABLE `deviceRecordings` ADD `gratitudeItems` text;--> statement-breakpoint
ALTER TABLE `deviceRecordings` ADD `habitResults` text;--> statement-breakpoint
ALTER TABLE `deviceRecordings` ADD `extractedTasks` text;--> statement-breakpoint
ALTER TABLE `deviceRecordings` ADD `audioUrl` varchar(512);--> statement-breakpoint
ALTER TABLE `deviceRecordings` ADD `acked` tinyint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `deviceRecordings` ADD `ackedAt` timestamp;