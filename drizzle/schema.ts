import {
  boolean,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Goals / Categories — one row per user-defined goal.
 * lifeArea is one of the 8 fixed life areas.
 */
export const categories = mysqlTable("categories", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  clientId: varchar("clientId", { length: 64 }).notNull(), // local UUID used by the app
  label: varchar("label", { length: 100 }).notNull(),
  emoji: varchar("emoji", { length: 16 }).notNull(),
  order: int("order").notNull().default(0),
  lifeArea: varchar("lifeArea", { length: 32 }),
  deadline: varchar("deadline", { length: 10 }), // YYYY-MM-DD
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Category = typeof categories.$inferSelect;
export type InsertCategory = typeof categories.$inferInsert;

/**
 * Habits — one row per habit belonging to a user.
 */
export const habits = mysqlTable("habits", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  clientId: varchar("clientId", { length: 64 }).notNull(), // local UUID used by the app
  categoryClientId: varchar("categoryClientId", { length: 64 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  emoji: varchar("emoji", { length: 16 }).notNull().default("⭐"),
  description: text("description"),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Habit = typeof habits.$inferSelect;
export type InsertHabit = typeof habits.$inferInsert;

/**
 * Check-in entries — one row per habit per day rating.
 */
export const checkIns = mysqlTable("checkIns", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  habitClientId: varchar("habitClientId", { length: 64 }).notNull(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  rating: mysqlEnum("rating", ["none", "red", "yellow", "green"]).notNull().default("none"),
  loggedAt: timestamp("loggedAt").defaultNow().notNull(),
});

export type CheckIn = typeof checkIns.$inferSelect;
export type InsertCheckIn = typeof checkIns.$inferInsert;

/**
 * Alarm config — one row per user.
 */
export const alarmConfigs = mysqlTable("alarmConfigs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  hour: int("hour").notNull().default(9),
  minute: int("minute").notNull().default(0),
  days: varchar("days", { length: 20 }).notNull().default("1,2,3,4,5,6,0"), // comma-separated day numbers
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AlarmConfig = typeof alarmConfigs.$inferSelect;
export type InsertAlarmConfig = typeof alarmConfigs.$inferInsert;
