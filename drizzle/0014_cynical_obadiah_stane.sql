CREATE TABLE `deviceRecordings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deviceId` int NOT NULL,
	`filename` varchar(255) NOT NULL,
	`category` varchar(32) NOT NULL DEFAULT 'recording',
	`sizeBytes` int NOT NULL DEFAULT 0,
	`contentType` varchar(64) NOT NULL DEFAULT 'audio/wav',
	`data` text,
	`transcription` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `deviceRecordings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `alarmConfigs` ADD `soundId` varchar(64) DEFAULT 'drumming';--> statement-breakpoint
ALTER TABLE `devices` ADD `stacksJson` text;