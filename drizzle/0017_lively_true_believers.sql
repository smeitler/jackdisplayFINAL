CREATE TABLE `dayNotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`habitId` varchar(64) NOT NULL,
	`date` varchar(10) NOT NULL,
	`note` text NOT NULL DEFAULT (''),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dayNotes_id` PRIMARY KEY(`id`),
	CONSTRAINT `dayNotes_userId_habitId_date_idx` UNIQUE(`userId`,`habitId`,`date`)
);
--> statement-breakpoint
CREATE TABLE `gratitudeEntries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`clientId` varchar(64) NOT NULL,
	`date` varchar(10) NOT NULL,
	`itemsJson` text NOT NULL DEFAULT ('[]'),
	`createdAt` varchar(32) NOT NULL,
	`deletedAt` timestamp,
	CONSTRAINT `gratitudeEntries_id` PRIMARY KEY(`id`),
	CONSTRAINT `gratitudeEntries_userId_clientId_idx` UNIQUE(`userId`,`clientId`)
);
--> statement-breakpoint
CREATE TABLE `rewards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`clientId` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`emoji` varchar(16) NOT NULL DEFAULT '',
	`habitId` varchar(64) NOT NULL DEFAULT 'any',
	`milestoneCount` int NOT NULL DEFAULT 1,
	`claimedAt` varchar(32),
	`color` varchar(32),
	`createdAt` varchar(32) NOT NULL,
	`deletedAt` varchar(32),
	CONSTRAINT `rewards_id` PRIMARY KEY(`id`),
	CONSTRAINT `rewards_userId_clientId_idx` UNIQUE(`userId`,`clientId`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`clientId` varchar(64) NOT NULL,
	`title` varchar(512) NOT NULL,
	`notes` text NOT NULL DEFAULT (''),
	`priority` enum('high','medium','low') NOT NULL DEFAULT 'medium',
	`dueDate` varchar(10),
	`completed` tinyint NOT NULL DEFAULT 0,
	`createdAt` varchar(32) NOT NULL,
	`deletedAt` timestamp,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`),
	CONSTRAINT `tasks_userId_clientId_idx` UNIQUE(`userId`,`clientId`)
);
