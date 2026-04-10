/**
 * One-time migration: create dayNotes, gratitudeEntries, and tasks tables.
 * Safe to run multiple times (uses CREATE TABLE IF NOT EXISTS).
 */
import "./load-env.js";
import mysql from "mysql2/promise";

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

async function main() {
  const conn = await mysql.createConnection(DB_URL!);
  console.log("Connected. Running migrations...");

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS \`dayNotes\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`userId\` int NOT NULL,
      \`habitId\` varchar(64) NOT NULL,
      \`date\` varchar(10) NOT NULL,
      \`note\` text NOT NULL,
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`dayNotes_id\` PRIMARY KEY(\`id\`),
      UNIQUE INDEX \`dayNotes_userId_habitId_date_idx\`(\`userId\`, \`habitId\`, \`date\`)
    )
  `);
  console.log("✓ dayNotes table ready");

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS \`gratitudeEntries\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`userId\` int NOT NULL,
      \`clientId\` varchar(64) NOT NULL,
      \`date\` varchar(10) NOT NULL,
      \`itemsJson\` text NOT NULL,
      \`createdAt\` varchar(32) NOT NULL,
      \`deletedAt\` timestamp NULL,
      CONSTRAINT \`gratitudeEntries_id\` PRIMARY KEY(\`id\`),
      UNIQUE INDEX \`gratitudeEntries_userId_clientId_idx\`(\`userId\`, \`clientId\`)
    )
  `);
  console.log("✓ gratitudeEntries table ready");

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS \`tasks\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`userId\` int NOT NULL,
      \`clientId\` varchar(64) NOT NULL,
      \`title\` varchar(512) NOT NULL,
      \`notes\` text NOT NULL,
      \`priority\` enum('high','medium','low') NOT NULL DEFAULT 'medium',
      \`dueDate\` varchar(10) NULL,
      \`completed\` tinyint NOT NULL DEFAULT 0,
      \`createdAt\` varchar(32) NOT NULL,
      \`deletedAt\` timestamp NULL,
      CONSTRAINT \`tasks_id\` PRIMARY KEY(\`id\`),
      UNIQUE INDEX \`tasks_userId_clientId_idx\`(\`userId\`, \`clientId\`)
    )
  `);
  console.log("✓ tasks table ready");

  await conn.end();
  console.log("Migration complete.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
