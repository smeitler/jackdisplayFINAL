CREATE TABLE `teamPostComments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`postId` int NOT NULL,
	`userId` int NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `teamPostComments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `teamPostReactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`postId` int NOT NULL,
	`userId` int NOT NULL,
	`emoji` varchar(8) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `teamPostReactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `teamPostReactions_postId_userId_idx` UNIQUE(`postId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `teamPosts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamId` int NOT NULL,
	`userId` int NOT NULL,
	`type` enum('text','checkin','photo') NOT NULL DEFAULT 'text',
	`content` text,
	`imageUrl` text,
	`checkinScore` int,
	`checkinDate` varchar(10),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `teamPosts_id` PRIMARY KEY(`id`)
);
