import { and, eq, ne, desc, gte, inArray, isNull, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import crypto from "crypto";
import {
  InsertUser,
  users,
  categories,
  habits,
  checkIns,
  alarmConfigs,
  teams,
  teamMembers,
  sharedGoals,
  teamMessages,
  referrals,
  InsertCategory,
  InsertHabit,
  InsertCheckIn,
  InsertAlarmConfig,
  teamGoalProposals,
  teamGoalVotes,
  devices,
  deviceEvents,
  teamPosts,
  teamPostReactions,
  teamPostComments,
  InsertTeamPost,
  contentReports,
  blockedUsers,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    textFields.forEach((field) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    });
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot get user: database not available"); return undefined; }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateUserAvatar(userId: number, avatarUrl: string | null): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ avatarUrl }).where(eq(users.id, userId));
}

/**
 * Permanently delete a user account and all associated data.
 * Cascades to: categories, habits, checkIns, alarmConfigs, teamMembers, sharedGoals,
 * teamMessages, referrals, devices, deviceEvents, teamPosts, teamPostComments, teamPostReactions.
 * Called by the in-app "Delete Account" flow (required by Apple App Store guidelines).
 */
export async function deleteUser(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Delete all user data in dependency order (children before parents).
  // Each step uses .catch(() => {}) for non-critical child rows, but we
  // propagate errors from the final user delete so the client knows if it failed.

  try {
    // 1. Device events (linked via devices)
    const userDevices = await db.select({ id: devices.id }).from(devices).where(eq(devices.userId, userId)).catch(() => []);
    for (const device of userDevices) {
      await db.delete(deviceEvents).where(eq(deviceEvents.deviceId, device.id)).catch(() => {});
    }
    await db.delete(devices).where(eq(devices.userId, userId)).catch(() => {});

    // 2. Team goal votes and proposals created by this user
    const userProposals = await db.select({ id: teamGoalProposals.id }).from(teamGoalProposals).where(eq(teamGoalProposals.creatorId, userId)).catch(() => []);
    for (const proposal of userProposals) {
      await db.delete(teamGoalVotes).where(eq(teamGoalVotes.proposalId, proposal.id)).catch(() => {});
    }
    await db.delete(teamGoalVotes).where(eq(teamGoalVotes.userId, userId)).catch(() => {});
    await db.delete(teamGoalProposals).where(eq(teamGoalProposals.creatorId, userId)).catch(() => {});

    // 3. Team posts, messages, reactions, comments
    await db.delete(teamPostComments).where(eq(teamPostComments.userId, userId)).catch(() => {});
    await db.delete(teamPostReactions).where(eq(teamPostReactions.userId, userId)).catch(() => {});
    await db.delete(teamPosts).where(eq(teamPosts.userId, userId)).catch(() => {});
    await db.delete(teamMessages).where(eq(teamMessages.userId, userId)).catch(() => {});

    // 4. Team memberships and shared goals
    await db.delete(sharedGoals).where(eq(sharedGoals.userId, userId)).catch(() => {});
    await db.delete(teamMembers).where(eq(teamMembers.userId, userId)).catch(() => {});

    // 5. Teams created by this user (delete members, posts, messages, goals first)
    const ownedTeams = await db.select({ id: teams.id }).from(teams).where(eq(teams.creatorId, userId)).catch(() => []);
    for (const team of ownedTeams) {
      const teamProposals = await db.select({ id: teamGoalProposals.id }).from(teamGoalProposals).where(eq(teamGoalProposals.teamId, team.id)).catch(() => []);
      for (const p of teamProposals) {
        await db.delete(teamGoalVotes).where(eq(teamGoalVotes.proposalId, p.id)).catch(() => {});
      }
      await db.delete(teamGoalProposals).where(eq(teamGoalProposals.teamId, team.id)).catch(() => {});
      const teamPostsList = await db.select({ id: teamPosts.id }).from(teamPosts).where(eq(teamPosts.teamId, team.id)).catch(() => []);
      for (const post of teamPostsList) {
        await db.delete(teamPostComments).where(eq(teamPostComments.postId, post.id)).catch(() => {});
        await db.delete(teamPostReactions).where(eq(teamPostReactions.postId, post.id)).catch(() => {});
      }
      await db.delete(teamPosts).where(eq(teamPosts.teamId, team.id)).catch(() => {});
      await db.delete(teamMessages).where(eq(teamMessages.teamId, team.id)).catch(() => {});
      await db.delete(sharedGoals).where(eq(sharedGoals.teamId, team.id)).catch(() => {});
      await db.delete(teamMembers).where(eq(teamMembers.teamId, team.id)).catch(() => {});
    }
    await db.delete(teams).where(eq(teams.creatorId, userId)).catch(() => {});

    // 6. Referrals (both as referrer and as referred)
    await db.delete(referrals).where(eq(referrals.referredId, userId)).catch(() => {});
    await db.delete(referrals).where(eq(referrals.referrerId, userId)).catch(() => {});

    // 7. Core user data
    await db.delete(checkIns).where(eq(checkIns.userId, userId));
    await db.delete(habits).where(eq(habits.userId, userId));
    await db.delete(categories).where(eq(categories.userId, userId));
    await db.delete(alarmConfigs).where(eq(alarmConfigs.userId, userId)).catch(() => {});

    // 8. Finally delete the user record itself — must succeed
    await db.delete(users).where(eq(users.id, userId));
  } catch (err) {
    console.error('[deleteUser] Failed to delete user', userId, err);
    throw err; // Re-throw so the tRPC mutation returns an error to the client
  }
}

// ─── Categories ───────────────────────────────────────────────────────────────

export async function getUserCategories(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(categories).where(eq(categories.userId, userId));
}

export async function upsertCategory(data: InsertCategory) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(categories).values(data).onDuplicateKeyUpdate({
    set: {
      label: data.label,
      emoji: data.emoji,
      order: data.order,
      lifeArea: data.lifeArea,
      deadline: data.deadline ?? null,
    },
  });
}

export async function deleteCategoryByClientId(userId: number, clientId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(categories).where(
    and(eq(categories.userId, userId), eq(categories.clientId, clientId))
  );
}

export async function bulkUpsertCategories(userId: number, cats: InsertCategory[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  for (const cat of cats) {
    await db.insert(categories).values({ ...cat, userId }).onDuplicateKeyUpdate({
      set: { label: cat.label, emoji: cat.emoji, order: cat.order, lifeArea: cat.lifeArea, deadline: cat.deadline ?? null },
    });
  }
}

// ─── Habits ───────────────────────────────────────────────────────────────────

export async function getUserHabits(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(habits).where(eq(habits.userId, userId));
}

export async function upsertHabit(data: InsertHabit) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(habits).values(data).onDuplicateKeyUpdate({
    set: {
      categoryClientId: data.categoryClientId,
      name: data.name,
      emoji: data.emoji,
      description: data.description ?? null,
      isActive: data.isActive,
      order: data.order ?? 0,
      weeklyGoal: data.weeklyGoal ?? null,
      frequencyType: data.frequencyType ?? null,
      monthlyGoal: data.monthlyGoal ?? null,
    },
  });
}

export async function updateHabitOrder(userId: number, clientId: string, order: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(habits).set({ order }).where(and(eq(habits.userId, userId), eq(habits.clientId, clientId)));
}

export async function deleteHabitByClientId(userId: number, clientId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(habits).where(
    and(eq(habits.userId, userId), eq(habits.clientId, clientId))
  );
}

export async function bulkUpsertHabits(userId: number, hs: InsertHabit[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  for (const h of hs) {
    await db.insert(habits).values({ ...h, userId }).onDuplicateKeyUpdate({
      set: { categoryClientId: h.categoryClientId, name: h.name, emoji: h.emoji, description: h.description ?? null, isActive: h.isActive, order: h.order ?? 0, weeklyGoal: h.weeklyGoal ?? null },
    });
  }
}

// ─── Check-ins ────────────────────────────────────────────────────────────────

export async function getUserCheckIns(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(checkIns).where(eq(checkIns.userId, userId));
}

export async function upsertCheckIn(data: InsertCheckIn) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(checkIns).values(data).onDuplicateKeyUpdate({
    set: { rating: data.rating, loggedAt: data.loggedAt ?? new Date() },
  });
}

export async function bulkUpsertCheckIns(userId: number, entries: InsertCheckIn[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  for (const entry of entries) {
    await db.insert(checkIns).values({ ...entry, userId }).onDuplicateKeyUpdate({
      set: { rating: entry.rating, loggedAt: entry.loggedAt ?? new Date() },
    });
  }
}

export async function deleteCheckInsForHabit(userId: number, habitClientId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(checkIns).where(
    and(eq(checkIns.userId, userId), eq(checkIns.habitClientId, habitClientId))
  );
}

// ─── Alarm Config ─────────────────────────────────────────────────────────────

export async function getUserAlarm(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(alarmConfigs).where(eq(alarmConfigs.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function upsertAlarm(data: InsertAlarmConfig) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(alarmConfigs).values(data).onDuplicateKeyUpdate({
    set: { hour: data.hour, minute: data.minute, days: data.days, enabled: data.enabled, elevenLabsVoice: data.elevenLabsVoice, soundId: data.soundId },
  });
}


// ─── Community: Teams ─────────────────────────────────────────────────────────

/** Generate a random alphanumeric join code */
export function generateJoinCode(length = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < length; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/** Generate a referral code for a user (userId-based + random suffix) */
export function generateReferralCode(userId: number): string {
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `REF${userId}${suffix}`;
}

export async function createTeam(data: { name: string; description?: string; creatorId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  let joinCode = generateJoinCode();
  // Ensure uniqueness
  for (let i = 0; i < 5; i++) {
    const existing = await db.select({ id: teams.id }).from(teams).where(eq(teams.joinCode, joinCode));
    if (existing.length === 0) break;
    joinCode = generateJoinCode();
  }
  const result = await db.insert(teams).values({ name: data.name, description: data.description ?? null, joinCode, creatorId: data.creatorId });
  const teamId = result[0].insertId;
  // Add creator as owner member
  await db.insert(teamMembers).values({ teamId, userId: data.creatorId, role: "owner" });
  return { teamId, joinCode };
}

export async function getTeamByJoinCode(joinCode: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(teams).where(eq(teams.joinCode, joinCode.toUpperCase()));
  return result.length > 0 ? result[0] : null;
}

export async function getTeamById(teamId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(teams).where(eq(teams.id, teamId));
  return result.length > 0 ? result[0] : null;
}

export async function getUserTeams(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const memberships = await db.select({ teamId: teamMembers.teamId, role: teamMembers.role })
    .from(teamMembers).where(eq(teamMembers.userId, userId));
  if (memberships.length === 0) return [];
  const teamIds = memberships.map((m) => m.teamId);
  const teamList = await db.select().from(teams).where(inArray(teams.id, teamIds));
  return teamList.map((t) => ({
    ...t,
    role: memberships.find((m) => m.teamId === t.id)?.role ?? "member",
  }));
}

export async function joinTeam(teamId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(teamMembers).values({ teamId, userId, role: "member" })
    .onDuplicateKeyUpdate({ set: { role: "member" } });
}

export async function leaveTeam(teamId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
}

export async function deleteTeam(teamId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(teamMessages).where(eq(teamMessages.teamId, teamId));
  await db.delete(sharedGoals).where(eq(sharedGoals.teamId, teamId));
  await db.delete(teamMembers).where(eq(teamMembers.teamId, teamId));
  await db.delete(teams).where(eq(teams.id, teamId));
}

export async function getTeamMembers(teamId: number) {
  const db = await getDb();
  if (!db) return [];
  const members = await db.select({
    userId: teamMembers.userId,
    role: teamMembers.role,
    joinedAt: teamMembers.joinedAt,
    name: users.name,
    email: users.email,
  }).from(teamMembers)
    .leftJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, teamId));
  return members;
}

export async function isTeamMember(teamId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db.select({ id: teamMembers.id }).from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
  return result.length > 0;
}

// ─── Community: Shared Goals ──────────────────────────────────────────────────

export async function setSharedGoals(userId: number, teamId: number, categoryClientIds: string[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Remove all existing shared goals for this user+team
  await db.delete(sharedGoals).where(and(eq(sharedGoals.userId, userId), eq(sharedGoals.teamId, teamId)));
  if (categoryClientIds.length > 0) {
    await db.insert(sharedGoals).values(categoryClientIds.map((cid) => ({ userId, teamId, categoryClientId: cid })));
  }
}

export async function getSharedGoalsForUser(userId: number, teamId: number): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const result = await db.select({ categoryClientId: sharedGoals.categoryClientId })
    .from(sharedGoals).where(and(eq(sharedGoals.userId, userId), eq(sharedGoals.teamId, teamId)));
  return result.map((r) => r.categoryClientId);
}

// ─── Community: Member Stats ──────────────────────────────────────────────────

/** Get stats for a member's shared goals in a team: yesterday, last 7 days, last 30 days */
export async function getMemberStats(memberId: number, teamId: number) {
  const db = await getDb();
  if (!db) return null;

  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const toDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const sevenDaysAgo = new Date(today); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date(today); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const yesterdayStr = toDateStr(yesterday);
  const sevenDaysAgoStr = toDateStr(sevenDaysAgo);
  const thirtyDaysAgoStr = toDateStr(thirtyDaysAgo);

  // Get shared goal category client IDs
  const sharedCatIds = await getSharedGoalsForUser(memberId, teamId);
  if (sharedCatIds.length === 0) return { sharedGoals: [], yesterdayScore: null, sevenDayScore: null, thirtyDayScore: null };

  // Get habits for those categories
  const memberHabits = await db.select({ clientId: habits.clientId, categoryClientId: habits.categoryClientId, name: habits.name })
    .from(habits).where(and(eq(habits.userId, memberId), eq(habits.isActive, true)));
  const relevantHabits = memberHabits.filter((h) => sharedCatIds.includes(h.categoryClientId));
  if (relevantHabits.length === 0) return { sharedGoals: sharedCatIds, yesterdayScore: null, sevenDayScore: null, thirtyDayScore: null };

  const habitIds = relevantHabits.map((h) => h.clientId);

  // Get check-ins for the last 30 days
  const recentCheckIns = await db.select({ habitClientId: checkIns.habitClientId, date: checkIns.date, rating: checkIns.rating })
    .from(checkIns).where(and(eq(checkIns.userId, memberId), gte(checkIns.date, thirtyDaysAgoStr), inArray(checkIns.habitClientId, habitIds)));

  const scoreForRange = (from: string, to: string) => {
    const entries = recentCheckIns.filter((c) => c.date >= from && c.date <= to);
    if (entries.length === 0) return null;
    const total = entries.length;
    const scored = entries.reduce((sum, c) => sum + (c.rating === "green" ? 1 : c.rating === "yellow" ? 0.5 : 0), 0);
    return Math.round((scored / total) * 100);
  };

  const yesterdayScore = scoreForRange(yesterdayStr, yesterdayStr);
  const sevenDayScore = scoreForRange(sevenDaysAgoStr, yesterdayStr);
  const thirtyDayScore = scoreForRange(thirtyDaysAgoStr, yesterdayStr);

  // Get shared goal category details
  const memberCategories = await db.select({ clientId: categories.clientId, label: categories.label, emoji: categories.emoji })
    .from(categories).where(and(eq(categories.userId, memberId), inArray(categories.clientId, sharedCatIds)));

  return { sharedGoals: memberCategories, yesterdayScore, sevenDayScore, thirtyDayScore };
}

// ─── Community: Messages ──────────────────────────────────────────────────────

export async function getTeamMessages(teamId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  const msgs = await db.select({
    id: teamMessages.id,
    message: teamMessages.message,
    sentAt: teamMessages.sentAt,
    userId: teamMessages.userId,
    name: users.name,
    email: users.email,
  }).from(teamMessages)
    .leftJoin(users, eq(teamMessages.userId, users.id))
    .where(eq(teamMessages.teamId, teamId))
    .orderBy(desc(teamMessages.sentAt))
    .limit(limit);
  return msgs.reverse(); // oldest first
}

export async function sendTeamMessage(teamId: number, userId: number, message: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(teamMessages).values({ teamId, userId, message });
  return result[0].insertId;
}

// ─── Community: Referrals ─────────────────────────────────────────────────────

export async function getOrCreateReferralCode(userId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Check if user already has a referral code (as referrer)
  const existing = await db.select({ referralCode: referrals.referralCode })
    .from(referrals).where(eq(referrals.referrerId, userId)).limit(1);
  if (existing.length > 0) return existing[0].referralCode;
  // Generate a unique code for this user (stored on first use)
  return generateReferralCode(userId);
}

export async function applyReferralCode(referralCode: string, newUserId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  // Find referrer by code pattern (REF{userId}{suffix})
  const match = referralCode.match(/^REF(\d+)/);
  if (!match) return false;
  const referrerId = parseInt(match[1]);
  if (referrerId === newUserId) return false; // can't refer yourself
  // Check if already referred
  const alreadyReferred = await db.select({ id: referrals.id }).from(referrals).where(eq(referrals.referredId, newUserId));
  if (alreadyReferred.length > 0) return false;
  await db.insert(referrals).values({ referrerId, referredId: newUserId, referralCode, creditMonths: 6 });
  return true;
}

export async function getReferralStats(userId: number) {
  const db = await getDb();
  if (!db) return { referralCode: generateReferralCode(userId), totalReferrals: 0, totalCreditMonths: 0, referrals: [] };
  const code = await getOrCreateReferralCode(userId);
  const userReferrals = await db.select({
    id: referrals.id,
    referredId: referrals.referredId,
    creditMonths: referrals.creditMonths,
    createdAt: referrals.createdAt,
    name: users.name,
    email: users.email,
  }).from(referrals)
    .leftJoin(users, eq(referrals.referredId, users.id))
    .where(eq(referrals.referrerId, userId));
  const totalCreditMonths = userReferrals.reduce((sum, r) => sum + r.creditMonths, 0);
  return { referralCode: code, totalReferrals: userReferrals.length, totalCreditMonths, referrals: userReferrals };
}

// ─── Team Feed: Posts ─────────────────────────────────────────────────────────



export async function createTeamPost(data: InsertTeamPost) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(teamPosts).values(data);
  return result[0].insertId as number;
}

export async function getTeamFeed(teamId: number, limit = 30) {
  const db = await getDb();
  if (!db) return [];
  const posts = await db
    .select({
      id: teamPosts.id,
      teamId: teamPosts.teamId,
      userId: teamPosts.userId,
      type: teamPosts.type,
      content: teamPosts.content,
      imageUrl: teamPosts.imageUrl,
      checkinScore: teamPosts.checkinScore,
      checkinDate: teamPosts.checkinDate,
      createdAt: teamPosts.createdAt,
      authorName: users.name,
      authorEmail: users.email,
    })
    .from(teamPosts)
    .leftJoin(users, eq(teamPosts.userId, users.id))
    .where(eq(teamPosts.teamId, teamId))
    .orderBy(desc(teamPosts.createdAt))
    .limit(limit);

  // Attach reactions and comments counts
  const postIds = posts.map((p) => p.id);
  if (postIds.length === 0) return [];

  const reactions = await db
    .select({ postId: teamPostReactions.postId, emoji: teamPostReactions.emoji, userId: teamPostReactions.userId })
    .from(teamPostReactions)
    .where(inArray(teamPostReactions.postId, postIds));

  const comments = await db
    .select({
      id: teamPostComments.id,
      postId: teamPostComments.postId,
      userId: teamPostComments.userId,
      content: teamPostComments.content,
      createdAt: teamPostComments.createdAt,
      authorName: users.name,
    })
    .from(teamPostComments)
    .leftJoin(users, eq(teamPostComments.userId, users.id))
    .where(inArray(teamPostComments.postId, postIds))
    .orderBy(teamPostComments.createdAt);

  return posts.map((post) => ({
    ...post,
    reactions: reactions.filter((r) => r.postId === post.id),
    comments: comments.filter((c) => c.postId === post.id),
  }));
}

export async function deleteTeamPost(postId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(teamPosts).where(and(eq(teamPosts.id, postId), eq(teamPosts.userId, userId)));
}

// ─── Team Feed: Reactions ─────────────────────────────────────────────────────

export async function toggleTeamPostReaction(postId: number, userId: number, emoji: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db
    .select({ id: teamPostReactions.id, emoji: teamPostReactions.emoji })
    .from(teamPostReactions)
    .where(and(eq(teamPostReactions.postId, postId), eq(teamPostReactions.userId, userId)));

  if (existing.length > 0) {
    if (existing[0].emoji === emoji) {
      // Same emoji — remove reaction
      await db.delete(teamPostReactions).where(eq(teamPostReactions.id, existing[0].id));
      return null;
    } else {
      // Different emoji — update
      await db.update(teamPostReactions).set({ emoji }).where(eq(teamPostReactions.id, existing[0].id));
      return emoji;
    }
  } else {
    await db.insert(teamPostReactions).values({ postId, userId, emoji });
    return emoji;
  }
}

// ─── Team Feed: Comments ──────────────────────────────────────────────────────

export async function addTeamPostComment(postId: number, userId: number, content: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(teamPostComments).values({ postId, userId, content });
  return result[0].insertId as number;
}

export async function deleteTeamPostComment(commentId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(teamPostComments).where(and(eq(teamPostComments.id, commentId), eq(teamPostComments.userId, userId)));
}

// ─── Team Streak ──────────────────────────────────────────────────────────────

export async function getTeamStreak(teamId: number) {
  const db = await getDb();
  if (!db) return { streak: 0, todayStatus: [] as { userId: number; name: string | null; checkedIn: boolean }[] };

  const members = await db
    .select({ userId: teamMembers.userId, name: users.name })
    .from(teamMembers)
    .leftJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, teamId));

  if (members.length === 0) return { streak: 0, todayStatus: [] };

  const memberIds = members.map((m) => m.userId);

  // Build today status
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const todayCheckIns = await db
    .select({ userId: checkIns.userId })
    .from(checkIns)
    .where(and(inArray(checkIns.userId, memberIds), eq(checkIns.date, todayStr)));

  const checkedInToday = new Set(todayCheckIns.map((c) => c.userId));
  const todayStatus = members.map((m) => ({ userId: m.userId, name: m.name, checkedIn: checkedInToday.has(m.userId) }));

  // Calculate streak: how many consecutive past days ALL members checked in
  let streak = 0;
  let checkDate = new Date(today);
  checkDate.setDate(checkDate.getDate() - 1); // start from yesterday

  for (let i = 0; i < 365; i++) {
    const dateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, "0")}-${String(checkDate.getDate()).padStart(2, "0")}`;
    const dayCheckIns = await db
      .select({ userId: checkIns.userId })
      .from(checkIns)
      .where(and(inArray(checkIns.userId, memberIds), eq(checkIns.date, dateStr)));
    const checkedIn = new Set(dayCheckIns.map((c) => c.userId));
    const allCheckedIn = memberIds.every((id) => checkedIn.has(id));
    if (!allCheckedIn) break;
    streak++;
    checkDate.setDate(checkDate.getDate() - 1);
  }

  return { streak, todayStatus };
}

// ─── Team Leaderboard (supports week / month / alltime) ──────────────────────

export async function getTeamLeaderboard(teamId: number, period: "week" | "month" | "alltime" = "week") {
  const db = await getDb();
  if (!db) return [];

  const members = await db
    .select({ userId: teamMembers.userId, name: users.name, email: users.email })
    .from(teamMembers)
    .leftJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, teamId));

  if (members.length === 0) return [];

  const now = new Date();
  const toDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  // Build date list for the period (null = all-time, no date filter)
  let periodDates: string[] | null = null;
  if (period === "week") {
    const dayOfWeek = now.getDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysFromMonday);
    weekStart.setHours(0, 0, 0, 0);
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      if (d <= now) dates.push(toDateStr(d));
    }
    periodDates = dates;
  } else if (period === "month") {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const dates: string[] = [];
    const d = new Date(monthStart);
    while (d <= now) {
      dates.push(toDateStr(d));
      d.setDate(d.getDate() + 1);
    }
    periodDates = dates;
  }
  // alltime: periodDates stays null → no date filter

  const memberIds = members.map((m) => m.userId);
  const periodCheckIns = await db
    .select({ userId: checkIns.userId, rating: checkIns.rating })
    .from(checkIns)
    .where(
      periodDates
        ? and(inArray(checkIns.userId, memberIds), inArray(checkIns.date, periodDates))
        : inArray(checkIns.userId, memberIds)
    );

  // Today's check-in status for each member
  const todayStr = toDateStr(now);
  const todayCheckIns = await db
    .select({ userId: checkIns.userId })
    .from(checkIns)
    .where(and(inArray(checkIns.userId, memberIds), eq(checkIns.date, todayStr)));
  const checkedInToday = new Set(todayCheckIns.map((c) => c.userId));

  return members.map((m) => {
    const myCheckIns = periodCheckIns.filter((c) => c.userId === m.userId);
    const total = myCheckIns.length;
    if (total === 0) return { ...m, score: 0, checkInsCount: 0, checkedInToday: checkedInToday.has(m.userId) };
    const scoreSum = myCheckIns.reduce((sum, c) => {
      if (c.rating === "green") return sum + 1;
      if (c.rating === "yellow") return sum + 0.5;
      return sum;
    }, 0);
    return {
      ...m,
      score: Math.round((scoreSum / total) * 100),
      checkInsCount: total,
      checkedInToday: checkedInToday.has(m.userId),
    };
  }).sort((a, b) => b.score - a.score);
}

// ─── Team Goal Proposals ──────────────────────────────────────────────────────

export async function createTeamGoalProposal(data: {
  teamId: number;
  creatorId: number;
  habitName: string;
  habitEmoji: string;
  habitDescription?: string;
  lifeArea?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(teamGoalProposals).values({
    teamId: data.teamId,
    creatorId: data.creatorId,
    habitName: data.habitName,
    habitEmoji: data.habitEmoji,
    habitDescription: data.habitDescription ?? null,
    lifeArea: data.lifeArea ?? null,
  });
  return result[0].insertId;
}

export async function getTeamGoalProposals(teamId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];
  const proposals = await db
    .select()
    .from(teamGoalProposals)
    .where(eq(teamGoalProposals.teamId, teamId))
    .orderBy(desc(teamGoalProposals.createdAt));

  if (proposals.length === 0) return [];

  const votes = await db
    .select()
    .from(teamGoalVotes)
    .where(inArray(teamGoalVotes.proposalId, proposals.map((p) => p.id)));

  return proposals.map((p) => {
    const myVote = votes.find((v) => v.proposalId === p.id && v.userId === userId);
    const acceptCount = votes.filter((v) => v.proposalId === p.id && v.vote === "accept").length;
    const declineCount = votes.filter((v) => v.proposalId === p.id && v.vote === "decline").length;
    return { ...p, myVote: myVote?.vote ?? null, acceptCount, declineCount };
  });
}

export async function voteOnTeamGoalProposal(
  proposalId: number,
  userId: number,
  vote: "accept" | "decline"
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .insert(teamGoalVotes)
    .values({ proposalId, userId, vote })
    .onDuplicateKeyUpdate({ set: { vote } });
  return true;
}

export async function resetTeamGoalVote(proposalId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db
    .delete(teamGoalVotes)
    .where(and(eq(teamGoalVotes.proposalId, proposalId), eq(teamGoalVotes.userId, userId)));
  return true;
}

// ─── Physical Alarm Clock Devices ────────────────────────────────────────────

/** Generate a cryptographically secure API key for a device */
function generateApiKey(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** Generate a short-lived one-time pairing token — 6 uppercase alphanumeric chars (easy to type on display keyboard) */
export function generatePairingToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 to avoid confusion
  let token = "";
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    token += chars[bytes[i] % chars.length];
  }
  return token;
}
/** Create a pairing token for a user — returned to the app during setup wizard */
export async function createDevicePairingToken(userId: number): Promise<{ token: string; expiresAt: Date }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Delete any existing PENDING rows for this user to avoid stale entries piling up
  await db.delete(devices)
    .where(and(eq(devices.userId, userId), like(devices.macAddress, "PENDING-%")));
  const token = generatePairingToken();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
  // Store token temporarily in a placeholder device row (macAddress unknown until device registers)
  await db.insert(devices).values({
    userId,
    macAddress: `PENDING-${token}`,
    apiKey: `PENDING-${token}`,
    pairingToken: token,
    pairingTokenExpiresAt: expiresAt,
  });
  return { token, expiresAt };
}

/** Register a device using a pairing token — called by the ESP32 firmware */
export async function registerDevice(data: {
  pairingToken: string;
  macAddress: string;
  firmwareVersion?: string;
}): Promise<{ deviceId: number; apiKey: string } | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Find the pending device row by pairing token
  const rows = await db.select().from(devices)
    .where(eq(devices.pairingToken, data.pairingToken))
    .limit(1);

  if (rows.length === 0) return null;
  const pending = rows[0];

  // Check token hasn't expired
  if (pending.pairingTokenExpiresAt && pending.pairingTokenExpiresAt < new Date()) return null;

  // If a device with this MAC already exists (any user), delete it first to avoid unique constraint violation
  await db.delete(devices)
    .where(and(eq(devices.macAddress, data.macAddress), ne(devices.id, pending.id)));

  const apiKey = generateApiKey();
  await db.update(devices).set({
    macAddress: data.macAddress,
    apiKey,
    firmwareVersion: data.firmwareVersion ?? null,
    pairingToken: null,
    pairingTokenExpiresAt: null,
    lastSeenAt: new Date(),
  }).where(eq(devices.id, pending.id));

  return { deviceId: pending.id, apiKey };
}

/** Authenticate a device request by API key */
export async function getDeviceByApiKey(apiKey: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(devices).where(eq(devices.apiKey, apiKey)).limit(1);
  if (rows.length === 0) return null;
  // Update lastSeenAt
  await db.update(devices).set({ lastSeenAt: new Date() }).where(eq(devices.id, rows[0].id));
  return rows[0];
}

/** Get all devices for a user */
export async function getUserDevices(userId: number) {
  const db = await getDb();
  if (!db) return [];
  // Only return fully-registered devices (pairingToken is null after registration)
  return db.select({
    id: devices.id,
    macAddress: devices.macAddress,
    firmwareVersion: devices.firmwareVersion,
    lastSeenAt: devices.lastSeenAt,
    createdAt: devices.createdAt,
  }).from(devices).where(and(eq(devices.userId, userId), isNull(devices.pairingToken)));
}

/** Get alarm schedule for a device (from the user's alarmConfigs + active habits) */
export async function getDeviceSchedule(deviceId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(devices).where(eq(devices.id, deviceId)).limit(1);
  if (rows.length === 0) return null;
  const device = rows[0];
  const alarms = await db.select().from(alarmConfigs).where(eq(alarmConfigs.userId, device.userId));
  const userHabits = await db
    .select({
      clientId: habits.clientId,
      name: habits.name,
      categoryClientId: habits.categoryClientId,
      order: habits.order,
    })
    .from(habits)
    .where(and(eq(habits.userId, device.userId), eq(habits.isActive, true)))
    .orderBy(habits.order);
  return { alarms, habits: userHabits, userId: device.userId, stacksJson: device.stacksJson ?? null };
}
/** Sync ritual stacks from the app to the device record */
export async function syncDeviceStacks(userId: number, stacksJson: string): Promise<{ ok: boolean }> {
  const db = await getDb();
  if (!db) return { ok: false };
  const userDevices = await db.select({ id: devices.id }).from(devices).where(eq(devices.userId, userId));
  if (!userDevices.length) return { ok: true }; // no device paired yet, silently succeed
  for (const dev of userDevices) {
    await db.update(devices).set({ stacksJson }).where(eq(devices.id, dev.id));
  }
  // Bump scheduleVersion so panel knows to re-fetch
  await db.update(devices).set({ scheduleVersion: sql`scheduleVersion + 1` }).where(eq(devices.userId, userId));
  return { ok: true };
}

/** Save check-in ratings submitted from the CrowPanel display */
export async function submitDeviceCheckin(deviceId: number, date: string, ratings: Record<string, "red" | "yellow" | "green">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Get the userId from the device
  const rows = await db.select({ userId: devices.userId }).from(devices).where(eq(devices.id, deviceId)).limit(1);
  if (rows.length === 0) throw new Error("Device not found");
  const userId = rows[0].userId;
  // Validate date format YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid date format");
  // Upsert each rating
  for (const [habitClientId, rating] of Object.entries(ratings)) {
    if (!["red", "yellow", "green"].includes(rating)) continue;
    await db.insert(checkIns).values({
      userId,
      habitClientId,
      date,
      rating,
      loggedAt: new Date(),
    }).onDuplicateKeyUpdate({
      set: { rating, loggedAt: new Date() },
    });
  }
  return { saved: Object.keys(ratings).length };
}

/** Record a device event (alarm fired, dismissed, snooze, heartbeat) */
export async function recordDeviceEvent(data: {
  deviceId: number;
  type: "alarm_fired" | "alarm_dismissed" | "snooze" | "heartbeat";
  alarmId?: string;
  firedAt?: Date;
  dismissedAt?: Date;
  snoozedCount?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(deviceEvents).values({
    deviceId: data.deviceId,
    type: data.type,
    alarmId: data.alarmId ?? null,
    firedAt: data.firedAt ?? null,
    dismissedAt: data.dismissedAt ?? null,
    snoozedCount: data.snoozedCount ?? 0,
  });
  return result[0].insertId as number;
}

/** Delete a device (unlink from account) */
export async function deleteDevice(deviceId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(devices)
    .where(and(eq(devices.id, deviceId), eq(devices.userId, userId)));
  return true;
}

// ─── Team Habit Stats (3 rolling periods) ─────────────────────────────────────
/**
 * Returns team-aggregate check-in counts for 3 rolling weekly periods:
 * thisWeek, lastWeek, weekBefore.
 * Also returns the team's accepted habit proposals (for habit name display).
 */
export async function getTeamHabitStats(teamId: number) {
  const db = await getDb();
  if (!db) return { thisWeek: 0, lastWeek: 0, weekBefore: 0, memberCount: 0, proposals: [] };

  const members = await db
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .where(eq(teamMembers.teamId, teamId));
  const memberCount = members.length;
  if (memberCount === 0) return { thisWeek: 0, lastWeek: 0, weekBefore: 0, memberCount: 0, proposals: [] };

  const memberIds = members.map((m) => m.userId);

  const now = new Date();
  const toDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  // Build ISO week start (Monday) for current week
  const dayOfWeek = now.getDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - daysFromMonday);
  thisMonday.setHours(0, 0, 0, 0);

  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);

  const weekBeforeMonday = new Date(thisMonday);
  weekBeforeMonday.setDate(thisMonday.getDate() - 14);

  const buildWeekDates = (start: Date): string[] => {
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      if (d <= now) dates.push(toDateStr(d));
    }
    return dates;
  };

  const thisWeekDates = buildWeekDates(thisMonday);
  const lastWeekDates = buildWeekDates(lastMonday);
  const weekBeforeDates = buildWeekDates(weekBeforeMonday);

  const allDates = [...thisWeekDates, ...lastWeekDates, ...weekBeforeDates];
  const allCheckIns = await db
    .select({ userId: checkIns.userId, date: checkIns.date, rating: checkIns.rating })
    .from(checkIns)
    .where(and(inArray(checkIns.userId, memberIds), inArray(checkIns.date, allDates)));

  const countForDates = (dates: string[]) =>
    allCheckIns.filter(
      (c) => dates.includes(c.date) && (c.rating === "green" || c.rating === "yellow")
    ).length;

  // Fetch proposals and compute accept/decline counts from votes table
  const proposalRows = await db
    .select({
      id: teamGoalProposals.id,
      habitName: teamGoalProposals.habitName,
      habitEmoji: teamGoalProposals.habitEmoji,
      lifeArea: teamGoalProposals.lifeArea,
    })
    .from(teamGoalProposals)
    .where(eq(teamGoalProposals.teamId, teamId));

  const proposalIds = proposalRows.map((p) => p.id);
  const allVotes = proposalIds.length > 0
    ? await db.select().from(teamGoalVotes).where(inArray(teamGoalVotes.proposalId, proposalIds))
    : [];

  const acceptedProposals = proposalRows
    .map((p) => {
      const pVotes = allVotes.filter((v) => v.proposalId === p.id);
      const acceptCount = pVotes.filter((v) => v.vote === "accept").length;
      const declineCount = pVotes.filter((v) => v.vote === "decline").length;
      return { ...p, acceptCount, declineCount };
    })
    .filter((p) => p.acceptCount > 0 && p.acceptCount >= p.declineCount);

  return {
    thisWeek: countForDates(thisWeekDates),
    lastWeek: countForDates(lastWeekDates),
    weekBefore: countForDates(weekBeforeDates),
    memberCount,
    proposals: acceptedProposals,
  };
}

// ─── Device Schedule Version ──────────────────────────────────────────────────
/** Bump scheduleVersion for all registered devices belonging to a user.
 * Called whenever the user saves habits or alarm config so the CrowPanel
 * knows to re-fetch the schedule on its next heartbeat. */
export async function bumpScheduleVersionForUser(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(devices)
    .set({ scheduleVersion: sql`scheduleVersion + 1` })
    .where(and(eq(devices.userId, userId), isNull(devices.pairingToken)));
}

/** Mark that the device has acknowledged the current scheduleVersion.
 * Called after the device fetches /api/device/schedule successfully. */
export async function markDeviceScheduleSeen(deviceId: number, version: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(devices)
    .set({ lastScheduleVersionSeen: version })
    .where(eq(devices.id, deviceId));
}

// ─── UGC Moderation (Apple Guideline 1.2) ────────────────────────────────────

/** Report a chat message or feed post as abusive. Idempotent — duplicate reports are silently ignored. */
export async function reportContent(
  reporterId: number,
  contentType: "message" | "post",
  contentId: number,
  reason: "spam" | "harassment" | "hate_speech" | "inappropriate" | "other",
  details?: string,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(contentReports)
    .values({ reporterId, contentType, contentId, reason, details: details ?? null })
    .onDuplicateKeyUpdate({ set: { reason, details: details ?? null } });
}

/** Block a user — their messages and posts will be hidden from the blocker. Idempotent. */
export async function blockUser(blockerId: number, blockedId: number) {
  if (blockerId === blockedId) throw new Error("Cannot block yourself");
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(blockedUsers)
    .values({ blockerId, blockedId })
    .onDuplicateKeyUpdate({ set: { blockerId } }); // no-op update to satisfy MySQL
}

/** Unblock a user. */
export async function unblockUser(blockerId: number, blockedId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(blockedUsers).where(
    and(eq(blockedUsers.blockerId, blockerId), eq(blockedUsers.blockedId, blockedId))
  );
}

/** Get the list of user IDs that the given user has blocked. */
export async function getBlockedUserIds(blockerId: number): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ blockedId: blockedUsers.blockedId })
    .from(blockedUsers)
    .where(eq(blockedUsers.blockerId, blockerId));
  return rows.map((r) => r.blockedId);
}

// ─── Device Settings ──────────────────────────────────────────────────────────

export interface DeviceSettings {
  voiceId: string;
  audioEnabled: boolean;
  voiceEnabled: boolean;
  lowEmfMode: boolean;
  wifiOffHour: number;
  wifiOnHour: number;
}

const DEFAULT_DEVICE_SETTINGS: DeviceSettings = {
  voiceId: "rachel",
  audioEnabled: true,
  voiceEnabled: false,
  lowEmfMode: false,
  wifiOffHour: 22,
  wifiOnHour: 6,
};

/** Get panel settings for the first device owned by userId. Returns defaults if no device. */
export async function getDeviceSettings(userId: number): Promise<DeviceSettings> {
  const db = await getDb();
  if (!db) return DEFAULT_DEVICE_SETTINGS;
  const rows = await db.select().from(devices).where(eq(devices.userId, userId)).limit(1);
  if (!rows.length) return DEFAULT_DEVICE_SETTINGS;
  const d = rows[0];
  return {
    voiceId: d.voiceId ?? "rachel",
    audioEnabled: d.audioEnabled === 1,
    voiceEnabled: d.voiceEnabled === 1,
    lowEmfMode: d.lowEmfMode === 1,
    wifiOffHour: d.wifiOffHour ?? 22,
    wifiOnHour: d.wifiOnHour ?? 6,
  };
}

/** Update panel settings for all devices owned by userId. */
export async function updateDeviceSettings(
  userId: number,
  settings: Partial<DeviceSettings>
): Promise<{ ok: boolean }> {
  const db = await getDb();
  if (!db) return { ok: false };
  const userDevices = await db.select({ id: devices.id }).from(devices).where(eq(devices.userId, userId));
  if (!userDevices.length) return { ok: true };
  const updateData: Record<string, unknown> = {};
  if (settings.voiceId !== undefined) updateData.voiceId = settings.voiceId;
  if (settings.audioEnabled !== undefined) updateData.audioEnabled = settings.audioEnabled ? 1 : 0;
  if (settings.voiceEnabled !== undefined) updateData.voiceEnabled = settings.voiceEnabled ? 1 : 0;
  if (settings.lowEmfMode !== undefined) updateData.lowEmfMode = settings.lowEmfMode ? 1 : 0;
  if (settings.wifiOffHour !== undefined) updateData.wifiOffHour = settings.wifiOffHour;
  if (settings.wifiOnHour !== undefined) updateData.wifiOnHour = settings.wifiOnHour;
  if (!Object.keys(updateData).length) return { ok: true };
  for (const dev of userDevices) {
    await db.update(devices).set(updateData).where(eq(devices.id, dev.id));
  }
  return { ok: true };
}

// ─── Get device recordings ──────────────────────────────────────────────────
// Returns recordings for all devices belonging to a user, newest first.
export async function getDeviceRecordings(
  userId: number,
  limit = 50
): Promise<{ id: number; deviceId: number; filename: string; category: string; sizeBytes: number; contentType: string; data: string | null; transcription: string | null; createdAt: Date }[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const rows = await db.execute(
      sql`SELECT r.id, r.deviceId, r.filename, r.category, r.sizeBytes, r.contentType, r.transcription, r.createdAt
          FROM deviceRecordings r
          INNER JOIN devices d ON d.id = r.deviceId
          WHERE d.userId = ${userId}
          ORDER BY r.createdAt DESC
          LIMIT ${limit}`
    );
    return (rows as any[]).map((r: any) => ({ ...r, data: undefined }));
  } catch (err: any) {
    console.warn("[db/getDeviceRecordings] skipped:", err?.message);
    return [];
  }
}

// ─── Delete device recording ──────────────────────────────────────────────────
export async function deleteDeviceRecording(
  userId: number,
  recordingId: number
): Promise<{ ok: boolean }> {
  const db = await getDb();
  if (!db) return { ok: false };
  try {
    await db.execute(
      sql`DELETE r FROM deviceRecordings r
          INNER JOIN devices d ON d.id = r.deviceId
          WHERE d.userId = ${userId} AND r.id = ${recordingId}`
    );
    return { ok: true };
  } catch (err: any) {
    console.warn("[db/deleteDeviceRecording] skipped:", err?.message);
    return { ok: false };
  }
}

// ─── Get single device recording with binary data ───────────────────────────
export async function getDeviceRecordingData(
  userId: number,
  recordingId: number
): Promise<{ data: Buffer; contentType: string } | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const rows = await db.execute(
      sql`SELECT r.data, r.contentType
          FROM deviceRecordings r
          INNER JOIN devices d ON d.id = r.deviceId
          WHERE d.userId = ${userId} AND r.id = ${recordingId}
          LIMIT 1`
    );
    const row = (rows as any[])[0];
    if (!row) return null;
    const buf: Buffer = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data ?? "");
    return { data: buf, contentType: row.contentType || "audio/wav" };
  } catch (err: any) {
    console.warn("[db/getDeviceRecordingData] skipped:", err?.message);
    return null;
  }
}

// ─── Save device recording ────────────────────────────────────────────────────
// Accepts a raw WAV buffer from the ESP32 and stores metadata in the DB.
// Falls back gracefully if the deviceRecordings table doesn't exist yet.
export async function saveDeviceRecording(
  deviceId: number,
  recording: {
    filename: string;
    category: string;
    sizeBytes: number;
    contentType: string;
    data: Buffer;
  }
): Promise<{ ok: boolean }> {
  const db = await getDb();
  if (!db) return { ok: false };
  try {
    await db.execute(
      sql`INSERT INTO deviceRecordings (deviceId, filename, category, sizeBytes, contentType, data, createdAt)
          VALUES (${deviceId}, ${recording.filename}, ${recording.category}, ${recording.sizeBytes}, ${recording.contentType}, ${recording.data}, NOW())`
    );
    return { ok: true };
  } catch (err: any) {
    console.warn("[db/saveDeviceRecording] skipped:", err?.message);
    return { ok: false };
  }
}
