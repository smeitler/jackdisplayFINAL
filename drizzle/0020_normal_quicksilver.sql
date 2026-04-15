ALTER TABLE `tasks` ADD `category` varchar(32);--> statement-breakpoint
ALTER TABLE `tasks` ADD `subtasks` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `recurring` varchar(16);--> statement-breakpoint
ALTER TABLE `tasks` ADD `sortOrder` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `completedAt` varchar(32);