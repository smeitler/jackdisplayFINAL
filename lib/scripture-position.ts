/**
 * lib/scripture-position.ts
 * Persistent reading position storage for Full BOM and Full Bible steps.
 *
 * Stores: which section index the user is on + seek position (seconds) within that section.
 * Keyed by source ('book-of-mormon' | 'bible') so each has its own independent position.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ScripturePosition {
  sectionIndex: number;   // 0-based index into the sections array
  seekSeconds: number;    // position within the current section (seconds)
  updatedAt: number;      // unix timestamp of last save
}

const KEY_PREFIX = '@daycheck:scripture_pos:';

export async function getScripturePosition(
  source: 'book-of-mormon' | 'bible',
): Promise<ScripturePosition | null> {
  try {
    const raw = await AsyncStorage.getItem(`${KEY_PREFIX}${source}`);
    if (raw) return JSON.parse(raw) as ScripturePosition;
  } catch { /* ignore */ }
  return null;
}

export async function saveScripturePosition(
  source: 'book-of-mormon' | 'bible',
  sectionIndex: number,
  seekSeconds: number,
): Promise<void> {
  const pos: ScripturePosition = { sectionIndex, seekSeconds, updatedAt: Date.now() };
  await AsyncStorage.setItem(`${KEY_PREFIX}${source}`, JSON.stringify(pos));
}

export async function resetScripturePosition(
  source: 'book-of-mormon' | 'bible',
): Promise<void> {
  await AsyncStorage.removeItem(`${KEY_PREFIX}${source}`);
}

/** Alias for resetScripturePosition */
export const clearScripturePosition = resetScripturePosition;
