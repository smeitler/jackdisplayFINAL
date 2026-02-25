CREATE TABLE `deviceEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deviceId` int NOT NULL,
	`type` enum('alarm_fired','alarm_dismissed','snooze','heartbeat') NOT NULL,
	`alarmId` varchar(64),
	`firedAt` timestamp,
	`dismissedAt` timestamp,
	`snoozedCount` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `deviceEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `devices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`macAddress` varchar(17) NOT NULL,
	`apiKey` varchar(64) NOT NULL,
	`pairingToken` varchar(64),
	`pairingTokenExpiresAt` timestamp,
	`firmwareVersion` varchar(16),
	`lastSeenAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `devices_id` PRIMARY KEY(`id`),
	CONSTRAINT `devices_macAddress_unique` UNIQUE(`macAddress`),
	CONSTRAINT `devices_apiKey_unique` UNIQUE(`apiKey`)
);
--> statement-breakpoint
ALTER TABLE `habits` ADD `frequencyType` varchar(16);--> statement-breakpoint
ALTER TABLE `habits` ADD `monthlyGoal` int;