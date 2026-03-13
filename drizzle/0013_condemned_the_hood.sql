ALTER TABLE `devices` ADD `voiceId` varchar(32) DEFAULT 'rachel' NOT NULL;--> statement-breakpoint
ALTER TABLE `devices` ADD `audioEnabled` tinyint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `devices` ADD `voiceEnabled` tinyint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `devices` ADD `lowEmfMode` tinyint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `devices` ADD `wifiOffHour` int DEFAULT 22 NOT NULL;--> statement-breakpoint
ALTER TABLE `devices` ADD `wifiOnHour` int DEFAULT 6 NOT NULL;