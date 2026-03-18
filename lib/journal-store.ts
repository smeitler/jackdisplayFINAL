/**
 * Journal Store — data types and AsyncStorage persistence for journal entries.
 * All entries are keyed by userId so each account has its own journal.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface JournalAttachment {
  id: string;
  type: "photo" | "video" | "audio" | "pdf";
  uri: string; // data: URI for audio, file URI or base64 for photos/videos
  mimeType: string;
  name?: string;
  durationMs?: number; // for audio/video
  thumbnailUri?: string; // for video
}

export interface JournalLocation {
  latitude: number;
  longitude: number;
  address?: string;
}

export type JournalTemplate =
  | "blank"
  | "gratitude"
  | "daily-reflection"
  | "mood-check"
  | "goal-review"
  | "free-write";

export interface JournalEntry {
  id: string;
  userId: string;
  date: string; // ISO date string YYYY-MM-DD
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
  title: string;
  body: string; // main text content
  template: JournalTemplate;
  attachments: JournalAttachment[];
  location?: JournalLocation;
  mood?: string; // emoji or mood label
  tags: string[];
  /** Transcription status for audio entries */
  transcriptionStatus?: "pending" | "done" | "failed";
  transcriptionText?: string;
  /** Gratitude items — auto-extracted from voice or manually entered */
  gratitudes?: string[];
}

// ── Templates ──────────────────────────────────────────────────────────────────

export const JOURNAL_TEMPLATES: { key: JournalTemplate; label: string; icon: string; prompt: string }[] = [
  { key: "blank", label: "Blank", icon: "doc.fill", prompt: "" },
  { key: "gratitude", label: "Gratitude", icon: "heart.fill", prompt: "Today I'm grateful for..." },
  { key: "daily-reflection", label: "Daily Reflection", icon: "sun.max.fill", prompt: "How was my day?\n\nWhat went well?\n\nWhat could I improve?" },
  { key: "mood-check", label: "Mood Check", icon: "sparkles", prompt: "How am I feeling right now?\n\nWhat's on my mind?\n\nWhat do I need?" },
  { key: "goal-review", label: "Goal Review", icon: "flag.fill", prompt: "Progress on my goals:\n\n1. \n2. \n3. \n\nNext steps:" },
  { key: "free-write", label: "Free Write", icon: "pencil", prompt: "" },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function todayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export function formatTime(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// ── Storage ────────────────────────────────────────────────────────────────────

function storageKey(userId: string): string {
  return `@journal_entries_v2_${userId}`;
}

/** Old storage key from storage.ts */
const OLD_KEY_PREFIX = "daycheck:journal_entries";
function oldStorageKey(userId: string): string {
  return `${OLD_KEY_PREFIX}:${userId}`;
}

/** Migrate old-format entries to new format */
function migrateOldEntry(old: any, userId: string): JournalEntry {
  const attachments: JournalAttachment[] = [];
  if (old.audioUri || old.audioUrl) {
    attachments.push({
      id: generateId(),
      type: "audio",
      uri: old.audioUri || old.audioUrl || "",
      name: "Voice Recording",
      mimeType: "audio/m4a",
      durationMs: old.duration ? old.duration * 1000 : undefined,
    });
  }
  return {
    id: old.id || generateId(),
    userId,
    date: old.date || todayDateStr(),
    createdAt: old.createdAt || new Date().toISOString(),
    updatedAt: old.createdAt || new Date().toISOString(),
    title: "",
    body: old.text || "",
    template: "blank" as JournalTemplate,
    attachments,
    tags: [],
    transcriptionStatus: old.text ? "done" : undefined,
    transcriptionText: old.text || undefined,
  };
}

export async function loadEntries(userId: string): Promise<JournalEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (raw) return JSON.parse(raw) as JournalEntry[];

    // Try to migrate from old format
    const oldRaw = await AsyncStorage.getItem(oldStorageKey(userId));
    if (oldRaw) {
      const oldEntries = JSON.parse(oldRaw) as any[];
      const migrated = oldEntries.map((e) => migrateOldEntry(e, userId));
      await AsyncStorage.setItem(storageKey(userId), JSON.stringify(migrated));
      return migrated;
    }

    // Also try without userId (very old format)
    const legacyRaw = await AsyncStorage.getItem(OLD_KEY_PREFIX);
    if (legacyRaw) {
      const legacyEntries = JSON.parse(legacyRaw) as any[];
      const migrated = legacyEntries.map((e) => migrateOldEntry(e, userId));
      await AsyncStorage.setItem(storageKey(userId), JSON.stringify(migrated));
      return migrated;
    }

    return [];
  } catch {
    return [];
  }
}

export async function saveEntries(userId: string, entries: JournalEntry[]): Promise<void> {
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(entries));
}

export async function addEntry(userId: string, entry: JournalEntry): Promise<JournalEntry[]> {
  const entries = await loadEntries(userId);
  entries.unshift(entry);
  await saveEntries(userId, entries);
  return entries;
}

export async function updateEntry(userId: string, entryId: string, updates: Partial<JournalEntry>): Promise<JournalEntry[]> {
  const entries = await loadEntries(userId);
  const idx = entries.findIndex((e) => e.id === entryId);
  if (idx >= 0) {
    entries[idx] = { ...entries[idx], ...updates, updatedAt: new Date().toISOString() };
    await saveEntries(userId, entries);
  }
  return entries;
}

export async function deleteEntry(userId: string, entryId: string): Promise<JournalEntry[]> {
  let entries = await loadEntries(userId);
  entries = entries.filter((e) => e.id !== entryId);
  await saveEntries(userId, entries);
  return entries;
}

// ── Grouping helpers ───────────────────────────────────────────────────────────

export function groupByDate(entries: JournalEntry[]): Map<string, JournalEntry[]> {
  const map = new Map<string, JournalEntry[]>();
  for (const e of entries) {
    const existing = map.get(e.date) ?? [];
    existing.push(e);
    map.set(e.date, existing);
  }
  return map;
}

export function entriesForMonth(entries: JournalEntry[], year: number, month: number): Map<number, JournalEntry[]> {
  const map = new Map<number, JournalEntry[]>();
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  for (const e of entries) {
    if (e.date.startsWith(prefix)) {
      const day = parseInt(e.date.split("-")[2], 10);
      const existing = map.get(day) ?? [];
      existing.push(e);
      map.set(day, existing);
    }
  }
  return map;
}
