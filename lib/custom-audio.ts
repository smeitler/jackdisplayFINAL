/**
 * lib/custom-audio.ts
 * Helpers for managing user-uploaded custom audio files.
 * Files are copied to the app's documentDirectory for persistent access.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

const STORAGE_KEY = '@custom_audio_files';

export interface CustomAudioFile {
  id: string;
  name: string;       // display name (original filename without extension)
  uri: string;        // persistent local URI inside documentDirectory
  addedAt: number;    // timestamp
}

export async function loadCustomAudioFiles(): Promise<CustomAudioFile[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveCustomAudioFiles(files: CustomAudioFile[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(files));
}

/**
 * Copy a picked file to persistent storage and add it to the list.
 * Returns the updated list.
 */
export async function addCustomAudioFile(
  sourceUri: string,
  originalName: string,
): Promise<CustomAudioFile[]> {
  const existing = await loadCustomAudioFiles();
  const id = `custom_audio_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  // Sanitize filename — keep only safe chars
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const destUri = `${FileSystem.documentDirectory}${id}_${safeName}`;
  await FileSystem.copyAsync({ from: sourceUri, to: destUri });
  const displayName = originalName.replace(/\.[^.]+$/, ''); // strip extension
  const newFile: CustomAudioFile = { id, name: displayName, uri: destUri, addedAt: Date.now() };
  const updated = [...existing, newFile];
  await saveCustomAudioFiles(updated);
  return updated;
}

/**
 * Remove a custom audio file from storage and delete the local copy.
 */
export async function removeCustomAudioFile(id: string): Promise<CustomAudioFile[]> {
  const existing = await loadCustomAudioFiles();
  const file = existing.find((f) => f.id === id);
  if (file) {
    try { await FileSystem.deleteAsync(file.uri, { idempotent: true }); } catch {}
  }
  const updated = existing.filter((f) => f.id !== id);
  await saveCustomAudioFiles(updated);
  return updated;
}

/**
 * Given a list of file URIs and a mode, pick the next URI to play.
 * Uses AsyncStorage to track the last-played index for sequential mode.
 */
const SEQ_KEY = '@custom_audio_seq_index';

export async function pickNextCustomAudio(
  uris: string[],
  mode: 'random' | 'sequential',
): Promise<string | null> {
  if (!uris.length) return null;
  if (mode === 'random') {
    return uris[Math.floor(Math.random() * uris.length)];
  }
  // Sequential
  try {
    const raw = await AsyncStorage.getItem(SEQ_KEY);
    const lastIdx = raw ? parseInt(raw, 10) : -1;
    const nextIdx = (lastIdx + 1) % uris.length;
    await AsyncStorage.setItem(SEQ_KEY, String(nextIdx));
    return uris[nextIdx];
  } catch {
    return uris[0];
  }
}
