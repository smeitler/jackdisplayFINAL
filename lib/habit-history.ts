/**
 * lib/habit-history.ts
 * Persistent storage for habit ratings captured during stack player sessions.
 *
 * Each time a user taps Done / Partial / Missed on a reminder (or melatonin)
 * step, a HabitRatingEntry is saved here via AsyncStorage.
 *
 * Data model:
 *   HabitRatingEntry {
 *     id          — unique entry ID
 *     habitName   — the reminder text / step label shown to the user
 *     stackName   — "Wake Up Stack" | "Sleep Stack"
 *     rating      — 'done' | 'partial' | 'missed'
 *     timestamp   — ISO 8601 string
 *     date        — YYYY-MM-DD (local date, used for grouping)
 *   }
 *
 * API:
 *   saveHabitRating(entry)           — append a new entry
 *   loadHabitHistory()               — load all entries, newest first
 *   loadHabitHistoryForDate(date)    — entries for a specific YYYY-MM-DD
 *   loadHabitHistoryForRange(from, to) — entries between two dates (inclusive)
 *   clearHabitHistory()              — wipe all history (dev/testing only)
 *   getHabitStreak(habitName)        — consecutive days with 'done' rating
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Types ─────────────────────────────────────────────────────────────────────

export type HabitRating = 'done' | 'partial' | 'missed';

export interface HabitRatingEntry {
  id: string;
  habitName: string;
  stackName: string;
  rating: HabitRating;
  timestamp: string; // ISO 8601
  date: string;      // YYYY-MM-DD local
}

// ── Storage key ───────────────────────────────────────────────────────────────

const HISTORY_KEY = '@daycheck:habit_history:v1';

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayLocalDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function generateId(): string {
  return `hr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

async function readAll(): Promise<HabitRatingEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HabitRatingEntry[];
  } catch {
    return [];
  }
}

async function writeAll(entries: HabitRatingEntry[]): Promise<void> {
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Save a new habit rating entry.
 * Automatically fills in id, timestamp, and date if not provided.
 */
export async function saveHabitRating(
  params: Omit<HabitRatingEntry, 'id' | 'timestamp' | 'date'> & Partial<Pick<HabitRatingEntry, 'id' | 'timestamp' | 'date'>>,
): Promise<HabitRatingEntry> {
  const entry: HabitRatingEntry = {
    id: params.id ?? generateId(),
    habitName: params.habitName,
    stackName: params.stackName,
    rating: params.rating,
    timestamp: params.timestamp ?? new Date().toISOString(),
    date: params.date ?? todayLocalDate(),
  };
  const existing = await readAll();
  await writeAll([entry, ...existing]);
  return entry;
}

/**
 * Load all habit rating entries, newest first.
 */
export async function loadHabitHistory(): Promise<HabitRatingEntry[]> {
  const entries = await readAll();
  return entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/**
 * Load entries for a specific local date (YYYY-MM-DD).
 */
export async function loadHabitHistoryForDate(date: string): Promise<HabitRatingEntry[]> {
  const all = await readAll();
  return all
    .filter((e) => e.date === date)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/**
 * Load entries between two local dates (inclusive), newest first.
 */
export async function loadHabitHistoryForRange(
  from: string,
  to: string,
): Promise<HabitRatingEntry[]> {
  const all = await readAll();
  return all
    .filter((e) => e.date >= from && e.date <= to)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/**
 * Group entries by date, returning a map of YYYY-MM-DD → entries[].
 */
export function groupByDate(
  entries: HabitRatingEntry[],
): Record<string, HabitRatingEntry[]> {
  const map: Record<string, HabitRatingEntry[]> = {};
  for (const e of entries) {
    if (!map[e.date]) map[e.date] = [];
    map[e.date].push(e);
  }
  return map;
}

/**
 * Get the current consecutive-day streak for a specific habit name.
 * A day counts if the habit was rated 'done' at least once that day.
 */
export async function getHabitStreak(habitName: string): Promise<number> {
  const all = await readAll();
  const doneDates = new Set(
    all.filter((e) => e.habitName === habitName && e.rating === 'done').map((e) => e.date),
  );

  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (doneDates.has(dateStr)) {
      streak++;
    } else if (i > 0) {
      // Allow today to be missing (day not yet rated)
      break;
    }
  }
  return streak;
}

/**
 * Get completion rate (0–1) for a habit over the last N days.
 */
export async function getHabitCompletionRate(
  habitName: string,
  days: number = 7,
): Promise<number> {
  const all = await readAll();
  const today = new Date();
  let doneCount = 0;
  let totalDays = 0;

  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayEntries = all.filter((e) => e.habitName === habitName && e.date === dateStr);
    if (dayEntries.length > 0) {
      totalDays++;
      if (dayEntries.some((e) => e.rating === 'done')) doneCount++;
    }
  }

  return totalDays === 0 ? 0 : doneCount / totalDays;
}

/**
 * Clear all history. Use only in dev/testing.
 */
export async function clearHabitHistory(): Promise<void> {
  await AsyncStorage.removeItem(HISTORY_KEY);
}
