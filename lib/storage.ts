import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Category is now a free-form string ID (e.g. "health", "custom_abc123") */
export type Category = string;

export type CategoryDef = {
  id: string;       // unique slug, e.g. "health" or "custom_1712345678"
  label: string;    // display name, e.g. "Health"
  emoji: string;    // e.g. "💪"
  order: number;    // sort order
};

export type Rating = 'none' | 'red' | 'yellow' | 'green';

export type Habit = {
  id: string;
  name: string;
  emoji: string;    // per-habit emoji, e.g. "🏋️"
  category: Category;
  isActive: boolean;
  createdAt: string;
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
} as const;

// ─── Default data ─────────────────────────────────────────────────────────────

export const DEFAULT_CATEGORIES: CategoryDef[] = [
  { id: 'health',        label: 'Health',        emoji: '💪', order: 0 },
  { id: 'relationships', label: 'Relationships', emoji: '❤️', order: 1 },
  { id: 'wealth',        label: 'Wealth',        emoji: '💰', order: 2 },
  { id: 'mindset',       label: 'Mindset',       emoji: '🧠', order: 3 },
];

export const DEFAULT_HABITS: Habit[] = [
  // Health
  { id: 'h1', name: 'Exercise / Workout',          emoji: '1️⃣', category: 'health',        isActive: true, createdAt: new Date().toISOString() },
  { id: 'h2', name: 'Drink 8 glasses of water',    emoji: '2️⃣', category: 'health',        isActive: true, createdAt: new Date().toISOString() },
  { id: 'h3', name: 'Sleep 7+ hours',              emoji: '3️⃣', category: 'health',        isActive: true, createdAt: new Date().toISOString() },
  { id: 'h4', name: 'Eat healthy meals',           emoji: '4️⃣', category: 'health',        isActive: true, createdAt: new Date().toISOString() },
  // Relationships
  { id: 'r1', name: 'Reach out to a friend',       emoji: '1️⃣', category: 'relationships', isActive: true, createdAt: new Date().toISOString() },
  { id: 'r2', name: 'Quality time with loved ones', emoji: '2️⃣', category: 'relationships', isActive: true, createdAt: new Date().toISOString() },
  { id: 'r3', name: 'Express gratitude',           emoji: '3️⃣', category: 'relationships', isActive: true, createdAt: new Date().toISOString() },
  // Wealth
  { id: 'w1', name: 'Work on main income source',  emoji: '1️⃣', category: 'wealth',        isActive: true, createdAt: new Date().toISOString() },
  { id: 'w2', name: 'Learn a new skill',           emoji: '2️⃣', category: 'wealth',        isActive: true, createdAt: new Date().toISOString() },
  { id: 'w3', name: 'Track expenses / budget',     emoji: '3️⃣', category: 'wealth',        isActive: true, createdAt: new Date().toISOString() },
  // Mindset
  { id: 'm1', name: 'Meditate or breathe deeply',  emoji: '1️⃣', category: 'mindset',       isActive: true, createdAt: new Date().toISOString() },
  { id: 'm2', name: 'Read for 20+ minutes',        emoji: '2️⃣', category: 'mindset',       isActive: true, createdAt: new Date().toISOString() },
  { id: 'm3', name: 'Journal / reflect',           emoji: '3️⃣', category: 'mindset',       isActive: true, createdAt: new Date().toISOString() },
];

export const DEFAULT_ALARM: AlarmConfig = {
  hour: 8,
  minute: 0,
  days: [1, 2, 3, 4, 5, 6, 0],
  isEnabled: false,
  notificationIds: [],
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

export async function loadHabits(): Promise<Habit[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.habits);
    if (!raw) {
      await AsyncStorage.setItem(KEYS.habits, JSON.stringify(DEFAULT_HABITS));
      return DEFAULT_HABITS;
    }
    // Migrate old habits that don't have an emoji field
    const parsed = JSON.parse(raw) as any[];
    return parsed.map((h) => ({ emoji: '⭐', ...h })) as Habit[];
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns "YYYY-MM-DD" for a given Date (or today). */
export function toDateString(d: Date = new Date()): string {
  return d.toISOString().split('T')[0];
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
