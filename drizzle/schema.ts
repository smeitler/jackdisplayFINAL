import {
  boolean,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  tinyint,
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
  avatarUrl: text("avatarUrl"),
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
  frequencyType: varchar("frequencyType", { length: 16 }), // 'weekly' | 'monthly'
  monthlyGoal: int("monthlyGoal"), // target days per month (1-31)
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
  elevenLabsVoice: varchar("elevenLabsVoice", { length: 32 }).default("rachel"),
  soundId: varchar("soundId", { length: 64 }).default("drumming"),
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

/**
 * Physical alarm clock devices — one row per registered hardware device.
 * apiKey: long-lived secret stored on the device, used to authenticate device requests.
 * pairingToken: short-lived one-time token generated during the app pairing flow.
 */
export const devices = mysqlTable("devices", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  macAddress: varchar("macAddress", { length: 17 }).notNull().unique(),
  apiKey: varchar("apiKey", { length: 64 }).notNull().unique(),
  pairingToken: varchar("pairingToken", { length: 64 }),
  pairingTokenExpiresAt: timestamp("pairingTokenExpiresAt"),
  firmwareVersion: varchar("firmwareVersion", { length: 16 }),
  lastSeenAt: timestamp("lastSeenAt"),
  scheduleVersion: int("scheduleVersion").notNull().default(1),
  lastScheduleVersionSeen: int("lastScheduleVersionSeen").notNull().default(0),
  // Panel settings
  voiceId: varchar("voiceId", { length: 32 }).notNull().default("rachel"),
  audioEnabled: tinyint("audioEnabled").notNull().default(1),
  voiceEnabled: tinyint("voiceEnabled").notNull().default(0),
  lowEmfMode: tinyint("lowEmfMode").notNull().default(0),
  wifiOffHour: int("wifiOffHour").notNull().default(22),
  wifiOnHour: int("wifiOnHour").notNull().default(6),
  // Ritual stacks synced from the app — JSON array of RitualStack objects
  stacksJson: text("stacksJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Device = typeof devices.$inferSelect;
export type InsertDevice = typeof devices.$inferInsert;

/**
 * Device events — events reported by the physical alarm clock.
 * type: 'alarm_fired' | 'alarm_dismissed' | 'snooze' | 'heartbeat'
 */
export const deviceEvents = mysqlTable("deviceEvents", {
  id: int("id").autoincrement().primaryKey(),
  deviceId: int("deviceId").notNull(),
  type: mysqlEnum("type", ["alarm_fired", "alarm_dismissed", "snooze", "heartbeat"]).notNull(),
  alarmId: varchar("alarmId", { length: 64 }),
  firedAt: timestamp("firedAt"),
  dismissedAt: timestamp("dismissedAt"),
  snoozedCount: int("snoozedCount").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DeviceEvent = typeof deviceEvents.$inferSelect;
export type InsertDeviceEvent = typeof deviceEvents.$inferInsert;

/**
 * Content reports — users can flag chat messages or feed posts as abusive.
 * Required by Apple App Store Guideline 1.2 (User-Generated Content).
 * contentType: 'message' | 'post'
 */
export const contentReports = mysqlTable("contentReports", {
  id: int("id").autoincrement().primaryKey(),
  reporterId: int("reporterId").notNull(),
  contentType: mysqlEnum("contentType", ["message", "post"]).notNull(),
  contentId: int("contentId").notNull(),
  reason: mysqlEnum("reason", ["spam", "harassment", "hate_speech", "inappropriate", "other"]).notNull(),
  details: text("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  reporterContentIdx: uniqueIndex("contentReports_reporter_content_idx").on(t.reporterId, t.contentType, t.contentId),
}));

export type ContentReport = typeof contentReports.$inferSelect;

/**
 * Blocked users — a user can block another user to hide their content.
 * Required by Apple App Store Guideline 1.2 (User-Generated Content).
 */
export const blockedUsers = mysqlTable("blockedUsers", {
  id: int("id").autoincrement().primaryKey(),
  blockerId: int("blockerId").notNull(),
  blockedId: int("blockedId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  blockerBlockedIdx: uniqueIndex("blockedUsers_blocker_blocked_idx").on(t.blockerId, t.blockedId),
}));

export type BlockedUser = typeof blockedUsers.$inferSelect;

/**
 * Device recordings — audio files uploaded from the CrowPanel.
 * category: 'journal' | 'gratitude' | 'minddump' | 'recording'
 * data: base64-encoded audio bytes for playback in the app
 */
export const deviceRecordings = mysqlTable("deviceRecordings", {
  id: int("id").autoincrement().primaryKey(),
  deviceId: int("deviceId").notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  category: varchar("category", { length: 32 }).notNull().default("recording"),
  sizeBytes: int("sizeBytes").notNull().default(0),
  contentType: varchar("contentType", { length: 64 }).notNull().default("audio/wav"),
  data: text("data"),  // base64-encoded audio for playback in app
  transcription: text("transcription"),
  /** Processing pipeline results */
  status: varchar("status", { length: 32 }).notNull().default("pending"), // pending | processing | processed | failed
  journalEntries: text("journalEntries"),   // JSON array of strings
  gratitudeItems: text("gratitudeItems"),   // JSON array of strings
  habitResults: text("habitResults"),       // JSON object: habitId -> {rating, note}
  extractedTasks: text("extractedTasks"),   // JSON array of task objects
  audioUrl: varchar("audioUrl", { length: 512 }), // presigned URL (short-lived, regenerated on fetch)
  audioKey: varchar("audioKey", { length: 512 }), // R2 object key (permanent)
  /** ACK: set to true when app confirms it has saved the entry to journal */
  acked: tinyint("acked").notNull().default(0),
  ackedAt: timestamp("ackedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type DeviceRecording = typeof deviceRecordings.$inferSelect;
export type InsertDeviceRecording = typeof deviceRecordings.$inferInsert;

/**
 * Journal entries — one row per journal entry per user.
 * clientId: client-generated UUID, unique per user.
 * attachmentsJson: JSON array of { id, type, url, mimeType, name, durationMs } objects.
 * tagsJson: JSON array of strings.
 * gratitudesJson: JSON array of strings.
 */
export const journalEntries = mysqlTable("journalEntries", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  clientId: varchar("clientId", { length: 64 }).notNull(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  title: varchar("title", { length: 255 }).notNull().default(""),
  body: text("body").notNull().default(""),
  template: varchar("template", { length: 32 }).notNull().default("blank"),
  mood: varchar("mood", { length: 32 }),
  tagsJson: text("tagsJson"), // JSON array of strings
  gratitudesJson: text("gratitudesJson"), // JSON array of strings
  transcriptionStatus: varchar("transcriptionStatus", { length: 16 }), // pending | done | failed
  transcriptionText: text("transcriptionText"),
  attachmentsJson: text("attachmentsJson"), // JSON array of attachment objects (with S3 URLs)
  locationJson: text("locationJson"), // JSON { latitude, longitude, address }
  deletedAt: timestamp("deletedAt"), // soft delete
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  userClientIdx: uniqueIndex("journalEntries_userId_clientId_idx").on(t.userId, t.clientId),
  userDateIdx: uniqueIndex("journalEntries_userId_date_clientId_idx").on(t.userId, t.date, t.clientId),
}));

export type JournalEntryRow = typeof journalEntries.$inferSelect;
export type InsertJournalEntry = typeof journalEntries.$inferInsert;

/**
 * Vision board images — one row per image per category per user.
 * imageUrl: S3 URL of the uploaded image.
 * order: display order within the category.
 */
export const visionBoardImages = mysqlTable("visionBoardImages", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  categoryClientId: varchar("categoryClientId", { length: 64 }).notNull(),
  imageUrl: text("imageUrl").notNull(), // presigned URL (short-lived, regenerated on fetch)
  imageKey: text("imageKey"), // R2 object key (permanent)
  order: int("order").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type VisionBoardImage = typeof visionBoardImages.$inferSelect;
export type InsertVisionBoardImage = typeof visionBoardImages.$inferInsert;

/**
 * Vision motivations — one row per motivation string per category per user.
 * text: the motivation text.
 * order: display order within the category.
 */
export const visionMotivations = mysqlTable("visionMotivations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  categoryClientId: varchar("categoryClientId", { length: 64 }).notNull(),
  text: text("text").notNull(),
  order: int("order").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type VisionMotivation = typeof visionMotivations.$inferSelect;
export type InsertVisionMotivation = typeof visionMotivations.$inferInsert;

// ─── Rewards ─────────────────────────────────────────────────────────────────
export const rewards = mysqlTable("rewards", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  clientId: varchar("clientId", { length: 64 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  emoji: varchar("emoji", { length: 16 }).notNull().default(""),
  habitId: varchar("habitId", { length: 64 }).notNull().default("any"),
  milestoneCount: int("milestoneCount").notNull().default(1),
  claimedAt: varchar("claimedAt", { length: 32 }),
  color: varchar("color", { length: 32 }),
  createdAt: varchar("createdAt", { length: 32 }).notNull(),
  deletedAt: varchar("deletedAt", { length: 32 }),
}, (t) => ({
  userClientIdx: uniqueIndex("rewards_userId_clientId_idx").on(t.userId, t.clientId),
}));

export type RewardRow = typeof rewards.$inferSelect;
export type InsertReward = typeof rewards.$inferInsert;

// ─── Day Notes ────────────────────────────────────────────────────────────────
/**
 * Per-habit day notes — one row per (userId, habitId, date).
 * note: free-text note the user wrote for that habit on that day.
 */
export const dayNotes = mysqlTable("dayNotes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  habitId: varchar("habitId", { length: 64 }).notNull(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  note: text("note").notNull().default(""),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  userHabitDateIdx: uniqueIndex("dayNotes_userId_habitId_date_idx").on(t.userId, t.habitId, t.date),
}));

export type DayNoteRow = typeof dayNotes.$inferSelect;
export type InsertDayNote = typeof dayNotes.$inferInsert;

// ─── Gratitude Entries ────────────────────────────────────────────────────────
/**
 * Daily gratitude entries — one row per entry per user.
 * clientId: client-generated UUID, unique per user.
 * itemsJson: JSON array of gratitude strings.
 */
export const gratitudeEntries = mysqlTable("gratitudeEntries", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  clientId: varchar("clientId", { length: 64 }).notNull(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  itemsJson: text("itemsJson").notNull().default("[]"),
  createdAt: varchar("createdAt", { length: 32 }).notNull(),
  deletedAt: timestamp("deletedAt"),
}, (t) => ({
  userClientIdx: uniqueIndex("gratitudeEntries_userId_clientId_idx").on(t.userId, t.clientId),
}));

export type GratitudeEntryRow = typeof gratitudeEntries.$inferSelect;
export type InsertGratitudeEntry = typeof gratitudeEntries.$inferInsert;

// ─── Tasks ────────────────────────────────────────────────────────────────────
/**
 * User to-do tasks — one row per task per user.
 * clientId: client-generated UUID, unique per user.
 */
export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  clientId: varchar("clientId", { length: 64 }).notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  notes: text("notes").notNull().default(""),
  priority: mysqlEnum("priority", ["high", "medium", "low"]).notNull().default("medium"),
  dueDate: varchar("dueDate", { length: 10 }), // YYYY-MM-DD or null
  completed: tinyint("completed").notNull().default(0),
  createdAt: varchar("createdAt", { length: 32 }).notNull(),
  deletedAt: timestamp("deletedAt"),
  category: varchar("category", { length: 32 }),
  subtasks: text("subtasks"),
  recurring: varchar("recurring", { length: 16 }),
  sortOrder: int("sortOrder").notNull().default(0),
  completedAt: varchar("completedAt", { length: 32 }),
}, (t) => ({
  userClientIdx: uniqueIndex("tasks_userId_clientId_idx").on(t.userId, t.clientId),
}));

export type TaskRow = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

// ─── Reward Claims ────────────────────────────────────────────────────────────
/**
 * Period-based reward claims — one row per (userId, habitId, periodKey).
 * periodKey: ISO week (YYYY-Www) or month (YYYY-MM) depending on frequency type.
 * claimedAt: ISO timestamp when the user claimed the reward for that period.
 */
export const rewardClaims = mysqlTable("rewardClaims", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  habitId: varchar("habitId", { length: 64 }).notNull(),
  periodKey: varchar("periodKey", { length: 16 }).notNull(), // e.g. "2025-W03" or "2025-01"
  claimedAt: varchar("claimedAt", { length: 32 }).notNull(),
}, (t) => ({
  userHabitPeriodIdx: uniqueIndex("rewardClaims_userId_habitId_periodKey_idx").on(t.userId, t.habitId, t.periodKey),
}));

export type RewardClaimRow = typeof rewardClaims.$inferSelect;
export type InsertRewardClaim = typeof rewardClaims.$inferInsert;
