import {
  boolean,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
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
 * Unique constraint on (userId, clientId) so upserts work correctly.
 */
export const categories = mysqlTable("categories", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  clientId: varchar("clientId", { length: 64 }).notNull(),
  label: varchar("label", { length: 100 }).notNull(),
  emoji: varchar("emoji", { length: 16 }).notNull(),
  order: int("order").notNull().default(0),
  lifeArea: varchar("lifeArea", { length: 32 }),
  deadline: varchar("deadline", { length: 10 }), // YYYY-MM-DD
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  userClientIdx: uniqueIndex("categories_userId_clientId_idx").on(t.userId, t.clientId),
}));

export type Category = typeof categories.$inferSelect;
export type InsertCategory = typeof categories.$inferInsert;

/**
 * Habits — one row per habit belonging to a user.
 * Unique constraint on (userId, clientId) so upserts work correctly.
 */
export const habits = mysqlTable("habits", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  clientId: varchar("clientId", { length: 64 }).notNull(),
  categoryClientId: varchar("categoryClientId", { length: 64 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  emoji: varchar("emoji", { length: 16 }).notNull().default("⭐"),
  description: text("description"),
  isActive: boolean("isActive").notNull().default(true),
  order: int("order").notNull().default(0),
  weeklyGoal: int("weeklyGoal"), // target days per week (1-7), nullable = no goal set
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  userClientIdx: uniqueIndex("habits_userId_clientId_idx").on(t.userId, t.clientId),
}));

export type Habit = typeof habits.$inferSelect;
export type InsertHabit = typeof habits.$inferInsert;

/**
 * Check-in entries — one row per habit per day rating.
 * Unique constraint on (userId, habitClientId, date) so upserts work correctly.
 */
export const checkIns = mysqlTable("checkIns", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  habitClientId: varchar("habitClientId", { length: 64 }).notNull(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  rating: mysqlEnum("rating", ["none", "red", "yellow", "green"]).notNull().default("none"),
  loggedAt: timestamp("loggedAt").defaultNow().notNull(),
}, (t) => ({
  userHabitDateIdx: uniqueIndex("checkIns_userId_habitClientId_date_idx").on(t.userId, t.habitClientId, t.date),
}));

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
  days: varchar("days", { length: 20 }).notNull().default("1,2,3,4,5,6,0"),
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AlarmConfig = typeof alarmConfigs.$inferSelect;
export type InsertAlarmConfig = typeof alarmConfigs.$inferInsert;

/**
 * Teams — accountability groups created by users.
 * joinCode is a short unique code others use to join.
 */
export const teams = mysqlTable("teams", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  joinCode: varchar("joinCode", { length: 12 }).notNull().unique(),
  creatorId: int("creatorId").notNull(), // userId of creator
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Team = typeof teams.$inferSelect;
export type InsertTeam = typeof teams.$inferInsert;

/**
 * Team memberships — one row per user per team.
 * role: 'owner' | 'member'
 */
export const teamMembers = mysqlTable("teamMembers", {
  id: int("id").autoincrement().primaryKey(),
  teamId: int("teamId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["owner", "member"]).notNull().default("member"),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
}, (t) => ({
  teamUserIdx: uniqueIndex("teamMembers_teamId_userId_idx").on(t.teamId, t.userId),
}));

export type TeamMember = typeof teamMembers.$inferSelect;
export type InsertTeamMember = typeof teamMembers.$inferInsert;

/**
 * Shared goals — which goals a user shares with which team.
 * A user can share a specific goal (category) with a specific team.
 */
export const sharedGoals = mysqlTable("sharedGoals", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  teamId: int("teamId").notNull(),
  categoryClientId: varchar("categoryClientId", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  userTeamCatIdx: uniqueIndex("sharedGoals_userId_teamId_cat_idx").on(t.userId, t.teamId, t.categoryClientId),
}));

export type SharedGoal = typeof sharedGoals.$inferSelect;
export type InsertSharedGoal = typeof sharedGoals.$inferInsert;

/**
 * Team messages — in-team chat.
 */
export const teamMessages = mysqlTable("teamMessages", {
  id: int("id").autoincrement().primaryKey(),
  teamId: int("teamId").notNull(),
  userId: int("userId").notNull(),
  message: text("message").notNull(),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
});

export type TeamMessage = typeof teamMessages.$inferSelect;
export type InsertTeamMessage = typeof teamMessages.$inferInsert;

/**
 * Referrals — tracks who referred whom and credit status.
 * referrerId: the user who shared the referral link
 * referredId: the user who signed up via the link
 * creditMonths: how many months of credit earned (default 6)
 */
export const referrals = mysqlTable("referrals", {
  id: int("id").autoincrement().primaryKey(),
  referrerId: int("referrerId").notNull(),
  referredId: int("referredId").notNull().unique(), // each user can only be referred once
  referralCode: varchar("referralCode", { length: 32 }).notNull(),
  creditMonths: int("creditMonths").notNull().default(6),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Referral = typeof referrals.$inferSelect;
export type InsertReferral = typeof referrals.$inferInsert;

/**
 * Team posts — social feed posts within a team.
 * type: 'text' | 'checkin' | 'photo'
 * checkinScore: 0-100, only set for checkin posts
 * imageUrl: S3 URL, only set for photo posts
 */
export const teamPosts = mysqlTable("teamPosts", {
  id: int("id").autoincrement().primaryKey(),
  teamId: int("teamId").notNull(),
  userId: int("userId").notNull(),
  type: mysqlEnum("type", ["text", "checkin", "photo"]).notNull().default("text"),
  content: text("content"),
  imageUrl: text("imageUrl"),
  checkinScore: int("checkinScore"),
  checkinDate: varchar("checkinDate", { length: 10 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TeamPost = typeof teamPosts.$inferSelect;
export type InsertTeamPost = typeof teamPosts.$inferInsert;

/**
 * Team post reactions — emoji reactions on feed posts.
 * emoji: one of the allowed reaction emojis
 * Unique per (postId, userId) — one reaction per user per post.
 */
export const teamPostReactions = mysqlTable("teamPostReactions", {
  id: int("id").autoincrement().primaryKey(),
  postId: int("postId").notNull(),
  userId: int("userId").notNull(),
  emoji: varchar("emoji", { length: 8 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  postUserIdx: uniqueIndex("teamPostReactions_postId_userId_idx").on(t.postId, t.userId),
}));

export type TeamPostReaction = typeof teamPostReactions.$inferSelect;
export type InsertTeamPostReaction = typeof teamPostReactions.$inferInsert;

/**
 * Team post comments — text/emoji comments on feed posts.
 */
export const teamPostComments = mysqlTable("teamPostComments", {
  id: int("id").autoincrement().primaryKey(),
  postId: int("postId").notNull(),
  userId: int("userId").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TeamPostComment = typeof teamPostComments.$inferSelect;
export type InsertTeamPostComment = typeof teamPostComments.$inferInsert;

/**
 * Team goal proposals — a habit/goal proposed by a team owner to all members.
 * Members can accept (adds to their habits) or decline.
 */
export const teamGoalProposals = mysqlTable("teamGoalProposals", {
  id: int("id").autoincrement().primaryKey(),
  teamId: int("teamId").notNull(),
  creatorId: int("creatorId").notNull(),
  habitName: varchar("habitName", { length: 100 }).notNull(),
  habitEmoji: varchar("habitEmoji", { length: 16 }).notNull().default("⭐"),
  habitDescription: text("habitDescription"),
  categoryLabel: varchar("categoryLabel", { length: 100 }).notNull(),
  categoryEmoji: varchar("categoryEmoji", { length: 16 }).notNull().default("📋"),
  lifeArea: varchar("lifeArea", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TeamGoalProposal = typeof teamGoalProposals.$inferSelect;
export type InsertTeamGoalProposal = typeof teamGoalProposals.$inferInsert;

/**
 * Team goal votes — one row per (proposalId, userId).
 * vote: "accept" | "decline"
 */
export const teamGoalVotes = mysqlTable("teamGoalVotes", {
  id: int("id").autoincrement().primaryKey(),
  proposalId: int("proposalId").notNull(),
  userId: int("userId").notNull(),
  vote: mysqlEnum("vote", ["accept", "decline"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  proposalUserIdx: uniqueIndex("teamGoalVotes_proposalId_userId_idx").on(t.proposalId, t.userId),
}));

export type TeamGoalVote = typeof teamGoalVotes.$inferSelect;
export type InsertTeamGoalVote = typeof teamGoalVotes.$inferInsert;
