ALTER TABLE `alarmConfigs` ADD `snoozeMinutes` int DEFAULT 10;--> statement-breakpoint
ALTER TABLE `alarmConfigs` ADD `assignedStackId` varchar(64) DEFAULT null;--> statement-breakpoint
ALTER TABLE `alarmConfigs` ADD `label` varchar(64) DEFAULT null;--> statement-breakpoint
ALTER TABLE `alarmConfigs` ADD `requireCheckin` boolean DEFAULT false;