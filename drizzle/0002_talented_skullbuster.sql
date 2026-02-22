ALTER TABLE `categories` ADD CONSTRAINT `categories_userId_clientId_idx` UNIQUE(`userId`,`clientId`);--> statement-breakpoint
ALTER TABLE `checkIns` ADD CONSTRAINT `checkIns_userId_habitClientId_date_idx` UNIQUE(`userId`,`habitClientId`,`date`);--> statement-breakpoint
ALTER TABLE `habits` ADD CONSTRAINT `habits_userId_clientId_idx` UNIQUE(`userId`,`clientId`);