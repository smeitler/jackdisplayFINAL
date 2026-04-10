CREATE TABLE `journalEntries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`clientId` varchar(64) NOT NULL,
	`date` varchar(10) NOT NULL,
	`title` varchar(255) NOT NULL DEFAULT '',
	`body` text NOT NULL DEFAULT (''),
	`template` varchar(32) NOT NULL DEFAULT 'blank',
	`mood` varchar(32),
	`tagsJson` text,
	`gratitudesJson` text,
	`transcriptionStatus` varchar(16),
	`transcriptionText` text,
	`attachmentsJson` text,
	`locationJson` text,
	`deletedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `journalEntries_id` PRIMARY KEY(`id`),
	CONSTRAINT `journalEntries_userId_clientId_idx` UNIQUE(`userId`,`clientId`),
	CONSTRAINT `journalEntries_userId_date_clientId_idx` UNIQUE(`userId`,`date`,`clientId`)
);
--> statement-breakpoint
CREATE TABLE `visionBoardImages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`categoryClientId` varchar(64) NOT NULL,
	`imageUrl` text NOT NULL,
	`order` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `visionBoardImages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `visionMotivations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`categoryClientId` varchar(64) NOT NULL,
	`text` text NOT NULL,
	`order` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `visionMotivations_id` PRIMARY KEY(`id`)
);
