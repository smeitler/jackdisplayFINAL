CREATE TABLE `teamGoalProposals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamId` int NOT NULL,
	`creatorId` int NOT NULL,
	`habitName` varchar(100) NOT NULL,
	`habitEmoji` varchar(16) NOT NULL DEFAULT '⭐',
	`habitDescription` text,
	`categoryLabel` varchar(100) NOT NULL,
	`categoryEmoji` varchar(16) NOT NULL DEFAULT '📋',
	`lifeArea` varchar(32),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `teamGoalProposals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `teamGoalVotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`proposalId` int NOT NULL,
	`userId` int NOT NULL,
	`vote` enum('accept','decline') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `teamGoalVotes_id` PRIMARY KEY(`id`),
	CONSTRAINT `teamGoalVotes_proposalId_userId_idx` UNIQUE(`proposalId`,`userId`)
);
