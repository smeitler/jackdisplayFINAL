/**
 * Journal Server Sync — wraps journal-store functions to also sync with the server.
 *
 * Strategy:
 * - On login: fetch all journal entries from server and merge with local storage.
 * - On save/update/delete: save locally first (instant), then sync to server in background.
 * - Photo attachments: local file URIs are kept locally; only text content is synced to server.
 *
 * This ensures journal entries survive sign-out, reinstall, and device changes.
 */

import { JournalEntry } from './journal-store';
import * as JournalStore from './journal-store';

/** Convert a local JournalEntry to the server upsert input format */
export function entryToServerInput(entry: JournalEntry) {
  return {
    clientId: entry.id,
    date: entry.date,
    title: entry.title,
    body: entry.body,
    template: entry.template,
    mood: entry.mood ?? null,
    tagsJson: entry.tags.length > 0 ? JSON.stringify(entry.tags) : null,
    gratitudesJson: entry.gratitudes && entry.gratitudes.length > 0
      ? JSON.stringify(entry.gratitudes) : null,
    transcriptionStatus: entry.transcriptionStatus ?? null,
    transcriptionText: entry.transcriptionText ?? null,
    // Attachments: only sync metadata (type, name, mimeType) — not local file URIs
    // which are device-specific. S3 URLs would be included here once upload is implemented.
    attachmentsJson: entry.attachments.length > 0
      ? JSON.stringify(entry.attachments.map(a => ({
          id: a.id,
          type: a.type,
          mimeType: a.mimeType,
          name: a.name,
          durationMs: a.durationMs,
          // Only include URI if it's an S3/https URL (not a local file:// URI)
          uri: a.uri.startsWith('http') ? a.uri : null,
        })))
      : null,
    locationJson: entry.location ? JSON.stringify(entry.location) : null,
  };
}

/** Convert a server journal entry row back to a local JournalEntry */
export function serverEntryToLocal(row: {
  clientId: string;
  date: string;
  title: string;
  body: string;
  template: string;
  mood?: string | null;
  tagsJson?: string | null;
  gratitudesJson?: string | null;
  transcriptionStatus?: string | null;
  transcriptionText?: string | null;
  attachmentsJson?: string | null;
  locationJson?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}, userId: string): JournalEntry {
  let tags: string[] = [];
  let gratitudes: string[] = [];
  let attachments: JournalEntry['attachments'] = [];
  let location: JournalEntry['location'] | undefined;

  try { tags = row.tagsJson ? JSON.parse(row.tagsJson) : []; } catch {}
  try { gratitudes = row.gratitudesJson ? JSON.parse(row.gratitudesJson) : []; } catch {}
  try {
    const rawAttachments = row.attachmentsJson ? JSON.parse(row.attachmentsJson) : [];
    attachments = rawAttachments.map((a: any) => ({
      id: a.id || JournalStore.generateId(),
      type: a.type || 'audio',
      uri: a.uri || '',
      mimeType: a.mimeType || 'application/octet-stream',
      name: a.name,
      durationMs: a.durationMs,
    })).filter((a: any) => a.uri); // Only include attachments with valid URIs
  } catch {}
  try { location = row.locationJson ? JSON.parse(row.locationJson) : undefined; } catch {}

  const createdAt = row.createdAt instanceof Date
    ? row.createdAt.toISOString()
    : String(row.createdAt);
  const updatedAt = row.updatedAt instanceof Date
    ? row.updatedAt.toISOString()
    : String(row.updatedAt);

  return {
    id: row.clientId,
    userId,
    date: row.date,
    createdAt,
    updatedAt,
    title: row.title,
    body: row.body,
    template: row.template as JournalEntry['template'],
    attachments,
    location,
    mood: row.mood ?? undefined,
    tags,
    gratitudes: gratitudes.length > 0 ? gratitudes : undefined,
    transcriptionStatus: (row.transcriptionStatus as JournalEntry['transcriptionStatus']) ?? undefined,
    transcriptionText: row.transcriptionText ?? undefined,
  };
}

/**
 * Merge server entries with local entries.
 * Server is source of truth for text content.
 * Local entries with local file attachments are preserved.
 * Returns the merged array sorted by date (newest first).
 */
export function mergeEntries(
  serverEntries: JournalEntry[],
  localEntries: JournalEntry[]
): JournalEntry[] {
  const merged = new Map<string, JournalEntry>();

  // Start with local entries (they may have local file attachments)
  for (const entry of localEntries) {
    merged.set(entry.id, entry);
  }

  // Overlay with server entries (server is source of truth for text)
  for (const serverEntry of serverEntries) {
    const local = merged.get(serverEntry.id);
    if (local) {
      // Merge: use server text content but keep local file attachments
      const localFileAttachments = local.attachments.filter(
        a => !a.uri.startsWith('http')
      );
      const serverAttachments = serverEntry.attachments.filter(
        a => a.uri.startsWith('http')
      );
      merged.set(serverEntry.id, {
        ...serverEntry,
        attachments: [...serverAttachments, ...localFileAttachments],
      });
    } else {
      merged.set(serverEntry.id, serverEntry);
    }
  }

  // Sort by date descending, then by createdAt descending
  return Array.from(merged.values()).sort((a, b) => {
    if (b.date !== a.date) return b.date.localeCompare(a.date);
    return b.createdAt.localeCompare(a.createdAt);
  });
}
