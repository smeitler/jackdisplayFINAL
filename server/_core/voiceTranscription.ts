/**
 * Voice transcription helper using ElevenLabs Scribe STT API
 *
 * Uses ELEVENLABS_API_KEY — no dependency on Manus Forge or OpenAI proxy.
 * Endpoint: POST https://api.elevenlabs.io/v1/speech-to-text
 * Model: scribe_v2 (most accurate, 90+ languages)
 *
 * Frontend implementation guide:
 * 1. Capture audio using MediaRecorder API
 * 2. Upload audio to storage (e.g., S3) to get URL
 * 3. Call transcription with the URL
 */
import { ENV } from "./env";

export type TranscribeOptions = {
  audioUrl: string; // URL to the audio file (e.g., S3 URL)
  mimeType?: string; // Optional: override the MIME type (e.g., "audio/m4a", "audio/webm")
  language?: string; // Optional: specify language code (e.g., "en", "es", "zh")
  prompt?: string;   // Optional: custom prompt / keyterms hint
};

// Normalised response — same shape callers already expect
export type TranscriptionResponse = {
  text: string;
  language: string;
  duration?: number;
};

export type TranscriptionError = {
  error: string;
  code:
    | "FILE_TOO_LARGE"
    | "INVALID_FORMAT"
    | "TRANSCRIPTION_FAILED"
    | "UPLOAD_FAILED"
    | "SERVICE_ERROR";
  details?: string;
};

const ELEVENLABS_STT_URL = "https://api.elevenlabs.io/v1/speech-to-text";

/**
 * Transcribe audio to text using ElevenLabs Scribe v2.
 * Downloads audio from a URL then sends to Scribe.
 */
export async function transcribeAudio(
  options: TranscribeOptions,
): Promise<TranscriptionResponse | TranscriptionError> {
  try {
    if (!ENV.elevenLabsApiKey) {
      return { error: "ElevenLabs API key is not configured", code: "SERVICE_ERROR", details: "ELEVENLABS_API_KEY is not set" };
    }

    // Download audio from URL
    let audioBuffer: Buffer;
    let mimeType: string;
    try {
      const response = await fetch(options.audioUrl);
      if (!response.ok) {
        return { error: "Failed to download audio file", code: "INVALID_FORMAT", details: `HTTP ${response.status}: ${response.statusText}` };
      }
      audioBuffer = Buffer.from(await response.arrayBuffer());
      mimeType = options.mimeType || response.headers.get("content-type") || "audio/m4a";
      const sizeMB = audioBuffer.length / (1024 * 1024);
      if (sizeMB > 100) {
        return { error: "Audio file exceeds maximum size limit", code: "FILE_TOO_LARGE", details: `File size is ${sizeMB.toFixed(2)}MB, maximum allowed is 100MB` };
      }
    } catch (error) {
      return { error: "Failed to fetch audio file", code: "SERVICE_ERROR", details: error instanceof Error ? error.message : "Unknown error" };
    }

    return transcribeAudioBuffer(audioBuffer, mimeType, options);
  } catch (error) {
    return { error: "Voice transcription failed", code: "SERVICE_ERROR", details: error instanceof Error ? error.message : "An unexpected error occurred" };
  }
}

/**
 * Transcribe audio directly from a Buffer using ElevenLabs Scribe v2.
 * More efficient when audio data is already in memory (e.g., device upload).
 */
export async function transcribeAudioBuffer(
  audioBuffer: Buffer,
  mimeType: string,
  options?: Omit<TranscribeOptions, "audioUrl" | "mimeType">,
): Promise<TranscriptionResponse | TranscriptionError> {
  try {
    if (!ENV.elevenLabsApiKey) {
      return { error: "ElevenLabs API key is not configured", code: "SERVICE_ERROR", details: "ELEVENLABS_API_KEY is not set" };
    }

    const sizeMB = audioBuffer.length / (1024 * 1024);
    if (sizeMB > 100) {
      return { error: "Audio file exceeds maximum size limit", code: "FILE_TOO_LARGE", details: `File size is ${sizeMB.toFixed(2)}MB, maximum allowed is 100MB` };
    }

    // Normalise MIME type — strip codec suffixes (e.g. "audio/webm;codecs=opus" → "audio/webm")
    const normalizedMimeType = mimeType.split(";")[0].trim().toLowerCase();
    const filename = `audio.${getFileExtension(normalizedMimeType)}`;

    const formData = new FormData();
    const audioBlob = new Blob([new Uint8Array(audioBuffer)], { type: normalizedMimeType });
    formData.append("file", audioBlob, filename);
    formData.append("model_id", "scribe_v2");
    formData.append("timestamps_granularity", "none"); // faster, we only need text
    formData.append("tag_audio_events", "false");      // skip [music] [laughter] tags

    // Language hint — improves accuracy for known languages
    if (options?.language) {
      formData.append("language_code", options.language);
    }

    // Keyterms hint — helps Scribe recognise domain-specific words (alarm names, habit names, etc.)
    if (options?.prompt) {
      // Scribe uses "keyterms" array rather than a free-text prompt
      // Split comma-separated prompt into individual keyterms
      const terms = options.prompt.split(",").map(t => t.trim()).filter(Boolean);
      for (const term of terms) {
        formData.append("keyterms", term);
      }
    }

    const response = await fetch(ELEVENLABS_STT_URL, {
      method: "POST",
      headers: {
        "xi-api-key": ENV.elevenLabsApiKey,
        "Accept-Encoding": "identity",
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return { error: "Transcription service request failed", code: "TRANSCRIPTION_FAILED", details: `${response.status} ${response.statusText}${errorText ? `: ${errorText}` : ""}` };
    }

    const scribeResponse = (await response.json()) as { text?: string; language_code?: string; duration?: number };

    if (typeof scribeResponse.text !== "string") {
      return { error: "Invalid transcription response", code: "SERVICE_ERROR", details: "ElevenLabs Scribe returned an invalid response format" };
    }

    return {
      text: scribeResponse.text,
      language: scribeResponse.language_code ?? options?.language ?? "en",
      duration: scribeResponse.duration,
    };
  } catch (error) {
    return { error: "Voice transcription failed", code: "SERVICE_ERROR", details: error instanceof Error ? error.message : "An unexpected error occurred" };
  }
}

/**
 * Helper: map MIME type to file extension
 */
function getFileExtension(mimeType: string): string {
  const baseMime = mimeType.split(";")[0].trim().toLowerCase();
  const mimeToExt: Record<string, string> = {
    "audio/webm": "webm",
    "audio/mp3": "mp3",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/ogg": "ogg",
    "audio/oga": "ogg",
    "audio/m4a": "m4a",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/aac": "m4a",
    "audio/flac": "flac",
  };
  return mimeToExt[baseMime] || "wav";
}

/**
 * Helper: ISO language code → full name
 */
function getLanguageName(langCode: string): string {
  const langMap: Record<string, string> = {
    en: "English", es: "Spanish", fr: "French", de: "German",
    it: "Italian", pt: "Portuguese", ru: "Russian", ja: "Japanese",
    ko: "Korean", zh: "Chinese", ar: "Arabic", hi: "Hindi",
    nl: "Dutch", pl: "Polish", tr: "Turkish", sv: "Swedish",
    da: "Danish", no: "Norwegian", fi: "Finnish",
  };
  return langMap[langCode] || langCode;
}
