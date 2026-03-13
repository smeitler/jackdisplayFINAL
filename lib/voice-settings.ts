/**
 * voice-settings.ts
 * Manages the global ElevenLabs voice selection and the habit audio pre-recording cache.
 *
 * Architecture:
 * - Selected voice ID is stored in AsyncStorage (key: daycheck:globalVoiceId)
 * - Pre-recorded habit MP3s are stored in documentDirectory/habit-audio/<habitId>.mp3
 * - A manifest (daycheck:habitAudioManifest) maps habitId → { voiceId, habitName, cachedAt }
 *   so we know when to re-record (voice changed or habit name changed)
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

const GLOBAL_VOICE_KEY = 'daycheck:globalVoiceId';
const HABIT_AUDIO_MANIFEST_KEY = 'daycheck:habitAudioManifest';
const READ_ALOUD_KEY = 'daycheck:habitReadAloud';

export type HabitAudioEntry = {
  voiceId: string;
  habitName: string;
  cachedAt: string; // ISO date
};

export type HabitAudioManifest = Record<string, HabitAudioEntry>;

// ─── Global Voice ID ──────────────────────────────────────────────────────────

export async function getGlobalVoiceId(): Promise<string | null> {
  return AsyncStorage.getItem(GLOBAL_VOICE_KEY);
}

export async function setGlobalVoiceId(voiceId: string): Promise<void> {
  await AsyncStorage.setItem(GLOBAL_VOICE_KEY, voiceId);
}

// ─── Read Aloud Toggle ────────────────────────────────────────────────────────

export async function getHabitReadAloud(): Promise<boolean> {
  const val = await AsyncStorage.getItem(READ_ALOUD_KEY);
  return val !== '0'; // default true
}

export async function setHabitReadAloud(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(READ_ALOUD_KEY, enabled ? '1' : '0');
}

// ─── Habit Audio Manifest ─────────────────────────────────────────────────────

export async function getHabitAudioManifest(): Promise<HabitAudioManifest> {
  const raw = await AsyncStorage.getItem(HABIT_AUDIO_MANIFEST_KEY);
  return raw ? (JSON.parse(raw) as HabitAudioManifest) : {};
}

async function saveHabitAudioManifest(manifest: HabitAudioManifest): Promise<void> {
  await AsyncStorage.setItem(HABIT_AUDIO_MANIFEST_KEY, JSON.stringify(manifest));
}

// ─── File Paths ───────────────────────────────────────────────────────────────

function getHabitAudioDir(): string {
  return (FileSystem.documentDirectory ?? '') + 'habit-audio/';
}

export function getHabitAudioUri(habitId: string): string {
  return getHabitAudioDir() + `${habitId}.mp3`;
}

// ─── Pre-recording ────────────────────────────────────────────────────────────

/**
 * Ensure the habit-audio directory exists.
 */
async function ensureDir(): Promise<void> {
  if (Platform.OS === 'web') return;
  const dir = getHabitAudioDir();
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

/**
 * Pre-record a single habit's name using ElevenLabs TTS.
 * Saves the MP3 to documentDirectory/habit-audio/<habitId>.mp3.
 * Returns the local file URI on success, or null on failure.
 */
export async function preRecordHabit(
  habitId: string,
  habitName: string,
  voiceId: string,
  elevenLabsApiKey: string,
): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    await ensureDir();
    const fileUri = getHabitAudioUri(habitId);

    // Call ElevenLabs TTS API
    const resp = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': elevenLabsApiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text: habitName,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      }
    );

    if (!resp.ok) {
      console.error(`[habitAudio] ElevenLabs error ${resp.status} for habit "${habitName}"`);
      return null;
    }

    // Convert response to base64 and write to disk
    const arrayBuffer = await resp.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < uint8.length; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    const base64 = btoa(binary);
    await FileSystem.writeAsStringAsync(fileUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Update manifest
    const manifest = await getHabitAudioManifest();
    manifest[habitId] = { voiceId, habitName, cachedAt: new Date().toISOString() };
    await saveHabitAudioManifest(manifest);

    return fileUri;
  } catch (err) {
    console.error('[habitAudio] preRecordHabit error:', err);
    return null;
  }
}

/**
 * Check if a habit's audio is up-to-date (voice and name match).
 */
export async function isHabitAudioFresh(
  habitId: string,
  habitName: string,
  voiceId: string,
): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const manifest = await getHabitAudioManifest();
  const entry = manifest[habitId];
  if (!entry) return false;
  if (entry.voiceId !== voiceId || entry.habitName !== habitName) return false;
  // Check file actually exists
  const info = await FileSystem.getInfoAsync(getHabitAudioUri(habitId));
  return info.exists;
}

/**
 * Pre-record all habits that are stale (voice changed or name changed).
 * Returns the number of habits that were re-recorded.
 */
export async function syncHabitAudio(
  habits: { id: string; name: string }[],
  voiceId: string,
  elevenLabsApiKey: string,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  if (Platform.OS === 'web') return 0;
  let count = 0;
  const stale = await Promise.all(
    habits.map(async (h) => ({
      ...h,
      needsRecord: !(await isHabitAudioFresh(h.id, h.name, voiceId)),
    }))
  );
  const toRecord = stale.filter((h) => h.needsRecord);
  for (let i = 0; i < toRecord.length; i++) {
    const h = toRecord[i];
    onProgress?.(i, toRecord.length);
    const result = await preRecordHabit(h.id, h.name, voiceId, elevenLabsApiKey);
    if (result) count++;
  }
  onProgress?.(toRecord.length, toRecord.length);
  return count;
}

/**
 * Delete all cached habit audio files (e.g. when voice changes).
 */
export async function clearHabitAudioCache(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const dir = getHabitAudioDir();
    const info = await FileSystem.getInfoAsync(dir);
    if (info.exists) {
      await FileSystem.deleteAsync(dir, { idempotent: true });
    }
    await AsyncStorage.removeItem(HABIT_AUDIO_MANIFEST_KEY);
  } catch (err) {
    console.error('[habitAudio] clearHabitAudioCache error:', err);
  }
}
