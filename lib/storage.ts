import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Category is now a free-form string ID (e.g. "health", "custom_abc123") */
export type Category = string;

export const LIFE_AREAS = [
  { id: 'body',         label: 'Body',         emoji: '💪' },
  { id: 'mind',         label: 'Mind',         emoji: '🧠' },
  { id: 'relationships',label: 'Relationships', emoji: '❤️' },
  { id: 'focus',        label: 'Focus',        emoji: '🎯' },
  { id: 'career',       label: 'Career',       emoji: '💼' },
  { id: 'money',        label: 'Money',        emoji: '💰' },
  { id: 'contribution', label: 'Contribution', emoji: '🤝' },
  { id: 'spirituality', label: 'Spirituality', emoji: '✨' },
] as const;

export type LifeArea = typeof LIFE_AREAS[number]['id'];

export type CategoryDef = {
  id: string;         // unique slug, e.g. "health" or "custom_1712345678"
  label: string;      // display name, e.g. "Get Fit"
  emoji: string;      // e.g. "💪"
  order: number;      // sort order
  lifeArea?: LifeArea; // which of the 8 life areas this goal belongs to
  deadline?: string;   // ISO date string YYYY-MM-DD, optional goal deadline
};

export type Rating = 'none' | 'red' | 'yellow' | 'green';

export type FrequencyType = 'weekly' | 'monthly';

export type Habit = {
  id: string;
  name: string;
  emoji: string;    // per-habit emoji, e.g. "🏋️"
  description?: string; // optional user-written description
  category: Category;
  isActive: boolean;
  order: number;    // sort order within the category
  globalOrder?: number; // global importance rank across all habits (1 = most important)
  createdAt: string;
  weeklyGoal?: number;     // target days per week (1-7), optional
  frequencyType?: FrequencyType; // 'weekly' (default) | 'monthly'
  monthlyGoal?: number;    // target days per month (1-31), used when frequencyType='monthly'
  teamProposalId?: number; // if this habit was added from a team proposal, store the proposal ID
  teamId?: number;         // the team the proposal belongs to
  // Reward tied to this habit's goal milestone
  rewardName?: string;        // e.g. "New Running Shoes"
  rewardEmoji?: string;       // e.g. "👟" (used when no image)
  rewardImageUri?: string;    // base64 data URI or local file URI for custom reward photo
  rewardDescription?: string; // optional longer description
  rewardClaimedAt?: string;   // ISO date when claimed
};

export type CheckInEntry = {
  date: string;       // "YYYY-MM-DD" — the day being reviewed
  habitId: string;
  rating: Rating;     // 'none' | 'red' | 'yellow' | 'green'
  loggedAt: string;
};

export type AlarmConfig = {
  hour: number;
  minute: number;
  days: number[];     // 0=Sun … 6=Sat
  isEnabled: boolean;
  notificationIds: string[];
  soundId?: string;       // ID of the alarm sound to play (default: 'classic')
  meditationId?: string;  // ID of the post-alarm meditation (default: none)
  requireCheckin?: boolean; // If true, block app access until yesterday's check-in is done
  snoozeMinutes?: number;   // Snooze duration in minutes (default: 10)
  elevenLabsVoice?: string; // ElevenLabs voice key (e.g. 'rachel', 'aria', 'adam')
  morningPracticeType?: 'priming' | 'meditation' | 'breathwork' | 'visualization' | 'none';
  morningPracticeLength?: 5 | 10 | 20;  // minutes for meditation/visualization
  morningBreathworkStyle?: 'wim_hof' | 'box' | '4_7_8';
  morningPracticeEnabled?: boolean;  // auto-launch after habit check-in
};

// ─── Rating helpers ───────────────────────────────────────────────────────────

/** Weighted score for a rating: green=1, yellow=0.5, red=0, none=null (excluded) */
export function ratingScore(rating: Rating): number | null {
  if (rating === 'green') return 1;
  if (rating === 'yellow') return 0.5;
  if (rating === 'red') return 0;
  return null; // 'none' — not rated, excluded from averages
}

export const RATING_META: Record<Rating, { label: string; color: string; emoji: string }> = {
  none:   { label: 'Not rated',   color: '#9090B8', emoji: '–'  },
  red:    { label: 'Missed',      color: '#EF4444', emoji: '🔴' },
  yellow: { label: 'Okay',        color: '#F59E0B', emoji: '🟡' },
  green:  { label: 'Crushed it!', color: '#22C55E', emoji: '🟢' },
};

// ─── Keys ────────────────────────────────────────────────────────────────────

const KEYS = {
  habits:     'daycheck:habits',
  categories: 'daycheck:categories',
  checkIns:   'daycheck:checkins',
  alarm:      'daycheck:alarm',
  lastCheckIn:'daycheck:lastcheckin',
  lastUserId: 'daycheck:lastUserId',
  demoMode:   'daycheck:demoMode',
  rewards:    'daycheck:rewards',
} as const;

/** Returns true if the app is currently running in Demo Mode. */
export async function getIsDemoMode(): Promise<boolean> {
  const val = await AsyncStorage.getItem(KEYS.demoMode);
  return val === '1';
}

/** Set or clear Demo Mode flag. */
export async function setDemoMode(enabled: boolean): Promise<void> {
  if (enabled) {
    await AsyncStorage.setItem(KEYS.demoMode, '1');
  } else {
    await AsyncStorage.removeItem(KEYS.demoMode);
  }
}

// ─── Default data ─────────────────────────────────────────────────────────────

export const DEFAULT_CATEGORIES: CategoryDef[] = [
  { id: 'body',         label: 'Body',         emoji: '💪', order: 0, lifeArea: 'body' },
  { id: 'mind',         label: 'Mind',         emoji: '🧠', order: 1, lifeArea: 'mind' },
  { id: 'relationships',label: 'Relationships', emoji: '❤️', order: 2, lifeArea: 'relationships' },
  { id: 'focus',        label: 'Focus',        emoji: '🎯', order: 3, lifeArea: 'focus' },
  { id: 'career',       label: 'Career',       emoji: '💼', order: 4, lifeArea: 'career' },
  { id: 'money',        label: 'Money',        emoji: '💰', order: 5, lifeArea: 'money' },
  { id: 'contribution', label: 'Contribution', emoji: '🤝', order: 6, lifeArea: 'contribution' },
  { id: 'spirituality', label: 'Spirituality', emoji: '✨', order: 7, lifeArea: 'spirituality' },
];

export const DEFAULT_HABITS: Habit[] = [
  // Body
  { id: 'h1', name: 'Exercise / Workout',        emoji: '💪', category: 'body',          isActive: true, order: 0, createdAt: new Date().toISOString() },
  { id: 'h2', name: 'Drink 8 glasses of water',  emoji: '💧', category: 'body',          isActive: true, order: 1, createdAt: new Date().toISOString() },
  { id: 'h3', name: 'Sleep 7+ hours',            emoji: '😴', category: 'body',          isActive: true, order: 2, createdAt: new Date().toISOString() },
  // Mind
  { id: 'm1', name: 'Meditate or breathe',       emoji: '🧘', category: 'mind',          isActive: true, order: 0, createdAt: new Date().toISOString() },
  { id: 'm2', name: 'Read 20+ minutes',          emoji: '📖', category: 'mind',          isActive: true, order: 1, createdAt: new Date().toISOString() },
  { id: 'm3', name: 'Journal / reflect',         emoji: '✍️', category: 'mind',          isActive: true, order: 2, createdAt: new Date().toISOString() },
  // Relationships
  { id: 'r1', name: 'Reach out to a friend',     emoji: '📱', category: 'relationships', isActive: true, order: 0, createdAt: new Date().toISOString() },
  { id: 'r2', name: 'Quality time w/ loved ones',emoji: '❤️', category: 'relationships', isActive: true, order: 1, createdAt: new Date().toISOString() },
  // Focus
  { id: 'f1', name: 'Deep work block (2h+)',     emoji: '🎯', category: 'focus',         isActive: true, order: 0, createdAt: new Date().toISOString() },
  { id: 'f2', name: 'No phone first 30 min',     emoji: '📵', category: 'focus',         isActive: true, order: 1, createdAt: new Date().toISOString() },
  // Career
  { id: 'c1', name: 'Work on main goal',         emoji: '🚀', category: 'career',        isActive: true, order: 0, createdAt: new Date().toISOString() },
  { id: 'c2', name: 'Learn a new skill',         emoji: '📚', category: 'career',        isActive: true, order: 1, createdAt: new Date().toISOString() },
  // Money
  { id: 'mo1', name: 'Track expenses',           emoji: '💰', category: 'money',         isActive: true, order: 0, createdAt: new Date().toISOString() },
  { id: 'mo2', name: 'Review financial goals',   emoji: '📈', category: 'money',         isActive: true, order: 1, createdAt: new Date().toISOString() },
  // Contribution
  { id: 'co1', name: 'Help someone today',       emoji: '🤝', category: 'contribution',  isActive: true, order: 0, createdAt: new Date().toISOString() },
  // Spirituality
  { id: 'sp1', name: 'Gratitude practice',       emoji: '🙏', category: 'spirituality',  isActive: true, order: 0, createdAt: new Date().toISOString() },
  { id: 'sp2', name: 'Prayer or reflection',     emoji: '✨', category: 'spirituality',  isActive: true, order: 1, createdAt: new Date().toISOString() },
];

export const DEFAULT_ALARM: AlarmConfig = {
  hour: 8,
  minute: 0,
  days: [1, 2, 3, 4, 5, 6, 0],
  isEnabled: false,
  notificationIds: [],
  soundId: 'classic',
  meditationId: undefined,
  snoozeMinutes: 10,
};

// ─── Categories ───────────────────────────────────────────────────────────────

export async function loadCategories(): Promise<CategoryDef[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.categories);
    if (!raw) {
      await AsyncStorage.setItem(KEYS.categories, JSON.stringify(DEFAULT_CATEGORIES));
      return DEFAULT_CATEGORIES;
    }
    return JSON.parse(raw) as CategoryDef[];
  } catch {
    return DEFAULT_CATEGORIES;
  }
}

export async function saveCategories(cats: CategoryDef[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.categories, JSON.stringify(cats));
}

// ─── Habits ───────────────────────────────────────────────────────────────────

// Number emoji characters that should be replaced on migration
const NUMBER_EMOJI_SET = new Set(['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟','⭐']);

// Sensible default emoji per category for migration
const CATEGORY_DEFAULT_EMOJI: Record<string, string> = {
  body: '💪', mind: '🧠', relationships: '❤️', focus: '🎯',
  career: '💼', money: '💰', contribution: '🤝', spirituality: '✨',
};

export async function loadHabits(): Promise<Habit[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.habits);
    if (!raw) {
      await AsyncStorage.setItem(KEYS.habits, JSON.stringify(DEFAULT_HABITS));
      return DEFAULT_HABITS;
    }
    const parsed = JSON.parse(raw) as any[];
    const migrated = parsed.map((h) => {
      const needsMigration = !h.emoji || NUMBER_EMOJI_SET.has(h.emoji);
      if (needsMigration) {
        const fallback = CATEGORY_DEFAULT_EMOJI[h.category] ?? '⭐';
        return { ...h, emoji: fallback } as Habit;
      }
      return h as Habit;
    });
    // Persist migration so it doesn't re-run every load
    const anyMigrated = migrated.some((h, i) => h.emoji !== parsed[i]?.emoji);
    if (anyMigrated) await AsyncStorage.setItem(KEYS.habits, JSON.stringify(migrated));
    return migrated;
  } catch {
    return DEFAULT_HABITS;
  }
}

export async function saveHabits(habits: Habit[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.habits, JSON.stringify(habits));
}

// ─── Check-ins ────────────────────────────────────────────────────────────────

export async function loadCheckIns(): Promise<CheckInEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.checkIns);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as any[];
    // Migrate old boolean `completed` entries to rating format
    return parsed.map((e) => {
      if (typeof e.completed === 'boolean') {
        return { ...e, rating: e.completed ? 'green' : 'red', completed: undefined } as CheckInEntry;
      }
      return e as CheckInEntry;
    });
  } catch {
    return [];
  }
}

export async function saveCheckIns(entries: CheckInEntry[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.checkIns, JSON.stringify(entries));
}

/** Submit ratings for a specific date. ratingsMap: { habitId -> Rating } */
export async function submitCheckIn(
  date: string,
  ratingsMap: Record<string, Rating>,
  allHabitIds: string[],
): Promise<void> {
  const existing = await loadCheckIns();
  // Remove any previous entries for this date
  const filtered = existing.filter((e) => e.date !== date);
  const now = new Date().toISOString();
  // Only save entries that have an actual rating — skip 'none' so the calendar
  // can reliably distinguish "logged day" (has rated entries) from "skipped day" (no entries)
  const newEntries: CheckInEntry[] = allHabitIds
    .filter((habitId) => {
      const r = ratingsMap[habitId];
      return r && r !== 'none';
    })
    .map((habitId) => ({
      date,
      habitId,
      rating: ratingsMap[habitId] as Rating,
      loggedAt: now,
    }));
  await saveCheckIns([...filtered, ...newEntries]);
  await AsyncStorage.setItem(KEYS.lastCheckIn, date);
}

/** Remove all check-in entries for a specific habit ID */
export async function deleteCheckInsForHabit(habitId: string): Promise<void> {
  const existing = await loadCheckIns();
  const filtered = existing.filter((e) => e.habitId !== habitId);
  await saveCheckIns(filtered);
}

/** Count check-in entries for a specific habit ID */
export async function countCheckInsForHabit(habitId: string): Promise<number> {
  const existing = await loadCheckIns();
  return existing.filter((e) => e.habitId === habitId).length;
}

export async function getLastCheckInDate(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.lastCheckIn);
}

// ─── Alarm ────────────────────────────────────────────────────────────────────

export async function loadAlarm(): Promise<AlarmConfig> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.alarm);
    return raw ? (JSON.parse(raw) as AlarmConfig) : DEFAULT_ALARM;
  } catch {
    return DEFAULT_ALARM;
  }
}

export async function saveAlarm(config: AlarmConfig): Promise<void> {
  await AsyncStorage.setItem(KEYS.alarm, JSON.stringify(config));
}

// ─── Vision Board ────────────────────────────────────────────────────────────

/** Map of categoryId -> array of local image URIs */
export type VisionBoard = Record<string, string[]>;

/** Map of categoryId -> array of motivation strings (why this goal matters) */
export type VisionMotivations = Record<string, string[]>;

const VISION_BOARD_KEY = 'daycheck:visionboard';
const VISION_MOTIVATIONS_KEY = 'daycheck:visionmotivations';

export async function loadVisionBoard(): Promise<VisionBoard> {
  try {
    const raw = await AsyncStorage.getItem(VISION_BOARD_KEY);
    return raw ? (JSON.parse(raw) as VisionBoard) : {};
  } catch {
    return {};
  }
}

export async function saveVisionBoard(board: VisionBoard): Promise<void> {
  await AsyncStorage.setItem(VISION_BOARD_KEY, JSON.stringify(board));
}

export async function loadVisionMotivations(): Promise<VisionMotivations> {
  try {
    const raw = await AsyncStorage.getItem(VISION_MOTIVATIONS_KEY);
    return raw ? (JSON.parse(raw) as VisionMotivations) : {};
  } catch {
    return {};
  }
}

export async function saveVisionMotivations(motivations: VisionMotivations): Promise<void> {
  await AsyncStorage.setItem(VISION_MOTIVATIONS_KEY, JSON.stringify(motivations));
}

// ─── Day Notes ───────────────────────────────────────────────────────────────

/** Map of "habitId:YYYY-MM-DD" -> note string */
export type DayNotes = Record<string, string>;

const DAY_NOTES_KEY = 'daycheck:daynotes';

export async function loadDayNotes(): Promise<DayNotes> {
  try {
    const raw = await AsyncStorage.getItem(DAY_NOTES_KEY);
    return raw ? (JSON.parse(raw) as DayNotes) : {};
  } catch {
    return {};
  }
}

export async function saveDayNotes(notes: DayNotes): Promise<void> {
  await AsyncStorage.setItem(DAY_NOTES_KEY, JSON.stringify(notes));
}

// ─── Mind Dump ──────────────────────────────────────────────────────────────

export type MindDumpCategory = 'task' | 'idea' | 'reminder' | 'worry' | 'gratitude';

export type MindDumpItem = {
  id: string;
  text: string;
  category: MindDumpCategory;
  createdAt: string;       // ISO timestamp
  promotedToDate?: string; // YYYY-MM-DD if promoted to a day's check-in
  done: boolean;
};

const MIND_DUMP_KEY = 'daycheck:minddump';

export async function loadMindDump(): Promise<MindDumpItem[]> {
  try {
    const raw = await AsyncStorage.getItem(MIND_DUMP_KEY);
    return raw ? (JSON.parse(raw) as MindDumpItem[]) : [];
  } catch {
    return [];
  }
}

export async function saveMindDump(items: MindDumpItem[]): Promise<void> {
  await AsyncStorage.setItem(MIND_DUMP_KEY, JSON.stringify(items));
}

// ─── User Identity (for data isolation on account switch) ───────────────────

/** Returns the user ID that was last logged in, or null if never set. */
export async function getLastUserId(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.lastUserId);
}

/** Persists the current user ID so we can detect account switches on next launch. */
export async function setLastUserId(userId: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.lastUserId, userId);
}

/**
 * Clears ALL local user data from AsyncStorage.
 * Call this on logout or when a different user logs in to prevent data leakage.
 */
export async function clearLocalData(): Promise<void> {
  await AsyncStorage.multiRemove([
    KEYS.habits,
    KEYS.categories,
    KEYS.checkIns,
    KEYS.alarm,
    KEYS.lastCheckIn,
    KEYS.lastUserId,
    VISION_BOARD_KEY,
    VISION_MOTIVATIONS_KEY,
    DAY_NOTES_KEY,
    KEYS.rewards,
  ]);
}

// ─── Rewards ─────────────────────────────────────────────────────────────────

/** A reward the user creates to celebrate reaching a habit milestone. */
export type Reward = {
  id: string;
  /** Display name, e.g. "New Running Shoes" */
  name: string;
  /** Optional longer description */
  description?: string;
  /** Emoji icon for the reward, e.g. "👟" */
  emoji: string;
  /** The habit ID this reward is tied to (or 'any' for total completions across all habits) */
  habitId: string;
  /** Number of completions (green check-ins) needed to unlock this reward */
  milestoneCount: number;
  /** ISO date string when the reward was claimed (unlocked), or null if not yet */
  claimedAt?: string;
  /** ISO date string when the reward was created */
  createdAt: string;
  /** Optional color accent for the card */
  color?: string;
};

export async function loadRewards(): Promise<Reward[]> {
  const raw = await AsyncStorage.getItem(KEYS.rewards);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Reward[];
  } catch {
    return [];
  }
}

export async function saveRewards(rewards: Reward[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.rewards, JSON.stringify(rewards));
}

export async function addReward(reward: Reward): Promise<void> {
  const rewards = await loadRewards();
  rewards.push(reward);
  await saveRewards(rewards);
}

export async function updateReward(updated: Reward): Promise<void> {
  const rewards = await loadRewards();
  const idx = rewards.findIndex(r => r.id === updated.id);
  if (idx >= 0) {
    rewards[idx] = updated;
    await saveRewards(rewards);
  }
}

export async function deleteReward(id: string): Promise<void> {
  const rewards = await loadRewards();
  await saveRewards(rewards.filter(r => r.id !== id));
}

/** Count how many green check-ins a habit (or all habits) has accumulated. */
export function countGreenCheckIns(checkIns: CheckInEntry[], habitId: string): number {
  if (habitId === 'any') {
    return checkIns.filter(c => c.rating === 'green').length;
  }
  return checkIns.filter(c => c.habitId === habitId && c.rating === 'green').length;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns "YYYY-MM-DD" for a given Date (or today) using LOCAL timezone. */
export function toDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Yesterday's date string */
export function yesterdayString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toDateString(d);
}

/** Offset date string: 0 = today, -1 = yesterday, -2 = two days ago, etc. */
export function offsetDateString(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return toDateString(d);
}

/** Format a date string for display */
export function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const today = toDateString();
  const yesterday = yesterdayString();
  if (dateStr === today) return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

// ─── Journal Entries ──────────────────────────────────────────────────────────
const JOURNAL_ENTRIES_KEY_PREFIX = 'daycheck:journal_entries';

/** Get the storage key for journal entries, scoped to a user if userId is provided */
function journalKey(userId?: string | null): string {
  return userId ? `${JOURNAL_ENTRIES_KEY_PREFIX}:${userId}` : JOURNAL_ENTRIES_KEY_PREFIX;
}

export interface JournalHabitMapping {
  habitId: string;
  habitName: string;
  suggestedNote: string;
  excerpt: string;
  accepted?: boolean; // undefined = pending, true = accepted, false = dismissed
}

export interface JournalEntry {
  id: string;
  date: string;       // YYYY-MM-DD
  text: string;       // transcript or manual text
  audioUri?: string;  // local file:// path to voice recording (if any)
  audioUrl?: string;  // remote R2 URL (if uploaded)
  duration?: number;  // recording duration in seconds
  habitMappings?: JournalHabitMapping[]; // AI-suggested habit notes
  createdAt: string;  // ISO
}

export async function loadJournalEntries(userId?: string | null): Promise<JournalEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(journalKey(userId));
    return raw ? (JSON.parse(raw) as JournalEntry[]) : [];
  } catch { return []; }
}

export async function saveJournalEntries(entries: JournalEntry[], userId?: string | null): Promise<void> {
  await AsyncStorage.setItem(journalKey(userId), JSON.stringify(entries));
}

export async function addJournalEntry(entry: JournalEntry, userId?: string | null): Promise<void> {
  const entries = await loadJournalEntries(userId);
  await saveJournalEntries([entry, ...entries], userId);
}

export async function deleteJournalEntry(id: string, userId?: string | null): Promise<void> {
  const entries = await loadJournalEntries(userId);
  await saveJournalEntries(entries.filter(e => e.id !== id), userId);
}

// ─── Gratitude Entries ────────────────────────────────────────────────────────
const GRATITUDE_ENTRIES_KEY = 'daycheck:gratitude_entries';

export interface GratitudeEntry {
  id: string;
  date: string;       // YYYY-MM-DD
  items: string[];    // 3-5 gratitude items
  createdAt: string;  // ISO
}

export async function loadGratitudeEntries(): Promise<GratitudeEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(GRATITUDE_ENTRIES_KEY);
    return raw ? (JSON.parse(raw) as GratitudeEntry[]) : [];
  } catch { return []; }
}

export async function saveGratitudeEntries(entries: GratitudeEntry[]): Promise<void> {
  await AsyncStorage.setItem(GRATITUDE_ENTRIES_KEY, JSON.stringify(entries));
}

export async function addGratitudeEntry(entry: GratitudeEntry): Promise<void> {
  const entries = await loadGratitudeEntries();
  await saveGratitudeEntries([entry, ...entries]);
}

export async function deleteGratitudeEntry(id: string): Promise<void> {
  const entries = await loadGratitudeEntries();
  await saveGratitudeEntries(entries.filter(e => e.id !== id));
}
