/**
 * Audio Service — ElevenLabs TTS integration
 *
 * Generates high-quality MP3 audio for habit names, affirmations, and
 * alarm sounds using ElevenLabs. Audio files are stored via the Manus
 * storage proxy and their URLs are cached in the DB so they are only
 * generated once per unique text string.
 *
 * Voice: "Rachel" (voice ID: 21m00Tcm4TlvDq8ikWAM) — warm, clear, professional.
 * Model: eleven_multilingual_v2 — best quality.
 */

import { ENV } from "./_core/env";
import { storagePut } from "./storage";

// ElevenLabs voice IDs (premium voices)
export const VOICES = {
  rachel:  "21m00Tcm4TlvDq8ikWAM",  // Warm, clear female — best for habits/affirmations
  aria:    "9BWtsMINqrJLrRacOk9x",   // Bright, energetic female
  adam:    "pNInz6obpgDQGcFmaJgB",   // Deep, calm male
  josh:    "TxGEqnHWrfWFTfGW9XjX",   // Conversational male
  bella:   "EXAVITQu4vr4xnSDxMaL",   // Soft, soothing female
} as const;

export type VoiceId = keyof typeof VOICES;

// Default voice for habits
export const DEFAULT_VOICE: VoiceId = "rachel";

// ElevenLabs model — eleven_multilingual_v2 is the highest quality
const ELEVENLABS_MODEL = "eleven_multilingual_v2";

/**
 * Generate an MP3 from text using ElevenLabs TTS.
 * Returns the raw MP3 buffer.
 */
export async function generateSpeech(text: string, voiceId: string = VOICES.rachel): Promise<Buffer> {
  const apiKey = ENV.elevenLabsApiKey;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not configured");

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: ELEVENLABS_MODEL,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText);
    throw new Error(`ElevenLabs TTS failed (${response.status}): ${err}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Generate speech and upload it to storage.
 * Returns the public URL of the stored MP3.
 *
 * Storage key format: audio/habits/{sanitized-text}.mp3
 * or                  audio/affirmations/{sanitized-text}.mp3
 */
export async function generateAndStoreAudio(
  text: string,
  category: "habit" | "affirmation" | "alarm" | "celebration",
  voiceId: string = VOICES.rachel,
): Promise<string> {
  // Sanitize text for use as a filename
  const sanitized = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  const storageKey = `audio/${category}s/${sanitized}.mp3`;

  const mp3Buffer = await generateSpeech(text, voiceId);
  const { url } = await storagePut(storageKey, mp3Buffer, "audio/mpeg");
  return url;
}

/**
 * Build the spoken text for a habit check-in prompt.
 * e.g. "Exercise" → "Time to rate your Exercise habit."
 */
export function habitPromptText(habitName: string): string {
  return `${habitName}`;
}
