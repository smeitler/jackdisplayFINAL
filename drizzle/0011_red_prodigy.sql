CREATE TABLE `blockedUsers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`blockerId` int NOT NULL,
	`blockedId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `blockedUsers_id` PRIMARY KEY(`id`),
	CONSTRAINT `blockedUsers_blocker_blocked_idx` UNIQUE(`blockerId`,`blockedId`)
);
--> statement-breakpoint
CREATE TABLE `contentReports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reporterId` int NOT NULL,
	`contentType` enum('message','post') NOT NULL,
	`contentId` int NOT NULL,
	`reason` enum('spam','harassment','hate_speech','inappropriate','other') NOT NULL,
	`details` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contentReports_id` PRIMARY KEY(`id`),
	CONSTRAINT `contentReports_reporter_content_idx` UNIQUE(`reporterId`,`contentType`,`contentId`)
);
--> statement-breakpoint
ALTER TABLE `devices` ADD `scheduleVersion` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `devices` ADD `lastScheduleVersionSeen` int DEFAULT 0 NOT NULL;