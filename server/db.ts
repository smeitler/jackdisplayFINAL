import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  categories,
  habits,
  checkIns,
  alarmConfigs,
  InsertCategory,
  InsertHabit,
  InsertCheckIn,
  InsertAlarmConfig,
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
      weeklyGoal: data.weeklyGoal ?? null,
    },
  });
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
      set: { categoryClientId: h.categoryClientId, name: h.name, emoji: h.emoji, description: h.description ?? null, isActive: h.isActive, weeklyGoal: h.weeklyGoal ?? null },
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
    set: { hour: data.hour, minute: data.minute, days: data.days, enabled: data.enabled },
  });
}
