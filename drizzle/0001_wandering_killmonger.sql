CREATE TABLE `alarmConfigs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`hour` int NOT NULL DEFAULT 9,
	`minute` int NOT NULL DEFAULT 0,
	`days` varchar(20) NOT NULL DEFAULT '1,2,3,4,5,6,0',
	`enabled` boolean NOT NULL DEFAULT true,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `alarmConfigs_id` PRIMARY KEY(`id`),
	CONSTRAINT `alarmConfigs_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`clientId` varchar(64) NOT NULL,
	`label` varchar(100) NOT NULL,
	`emoji` varchar(16) NOT NULL,
	`order` int NOT NULL DEFAULT 0,
	`lifeArea` varchar(32),
	`deadline` varchar(10),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `checkIns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`habitClientId` varchar(64) NOT NULL,
	`date` varchar(10) NOT NULL,
	`rating` enum('none','red','yellow','green') NOT NULL DEFAULT 'none',
	`loggedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `checkIns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `habits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`clientId` varchar(64) NOT NULL,
	`categoryClientId` varchar(64) NOT NULL,
	`name` varchar(100) NOT NULL,
	`emoji` varchar(16) NOT NULL DEFAULT '⭐',
	`description` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `habits_id` PRIMARY KEY(`id`)
);
