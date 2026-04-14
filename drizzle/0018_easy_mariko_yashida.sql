CREATE TABLE `rewardClaims` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`habitId` varchar(64) NOT NULL,
	`periodKey` varchar(16) NOT NULL,
	`claimedAt` varchar(32) NOT NULL,
	CONSTRAINT `rewardClaims_id` PRIMARY KEY(`id`),
	CONSTRAINT `rewardClaims_userId_habitId_periodKey_idx` UNIQUE(`userId`,`habitId`,`periodKey`)
);
