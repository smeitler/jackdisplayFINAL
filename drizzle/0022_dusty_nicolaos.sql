CREATE TABLE `rewardClaims` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`habitId` varchar(64) NOT NULL,
	`periodKey` varchar(16) NOT NULL,
	`claimedAt` varchar(32) NOT NULL,
	CONSTRAINT `rewardClaims_id` PRIMARY KEY(`id`),
	CONSTRAINT `rewardClaims_userId_habitId_periodKey_idx` UNIQUE(`userId`,`habitId`,`periodKey`)
);
--> statement-breakpoint
ALTER TABLE `deviceRecordings` ADD `audioKey` varchar(512);--> statement-breakpoint
ALTER TABLE `tasks` ADD `category` varchar(32);--> statement-breakpoint
ALTER TABLE `tasks` ADD `subtasks` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `recurring` varchar(16);--> statement-breakpoint
ALTER TABLE `tasks` ADD `sortOrder` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `completedAt` varchar(32);--> statement-breakpoint
ALTER TABLE `visionBoardImages` ADD `imageKey` text;