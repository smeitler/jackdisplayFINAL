/**
 * Device REST API Routes
 *
 * These endpoints are called directly by the ESP32 firmware over HTTPS.
 * They are NOT tRPC — they use plain Express so the firmware can use
 * standard HTTP without the tRPC client library.
 *
 * Authentication: X-Device-Key header (long-lived per-device API key)
 *
 * Endpoints:
 *   POST /api/device/register              — First-time registration using pairing token
 *   POST /api/device/self-register          — Token-free self-registration on WiFi connect (QR pairing flow)
 *   GET  /api/device/schedule              — Get current alarm schedule
 *   GET  /api/device/audio-manifest        — Get list of habit audio files to cache on SD card
 *   POST /api/device/event                 — Report an alarm event (fired, dismissed, snooze)
 *   POST /api/device/heartbeat             — Periodic liveness ping
 *   POST /api/device/checkin               — Submit habit check-in ratings
 *   POST /api/device/upload                — Upload a voice recording from the panel
 *   GET  /api/device/recording/:id         — Stream a recording to the app
 *   POST /api/device/recording/:id/ack     — App confirms it saved the recording to journal
 *   GET  /api/device/recording/:id/acked   — Panel polls to check if app has ACKed (device key auth)
 *   GET  /api/device/prompts               — Get journal prompts for the panel recording screen
 */

import { Router, Request, Response } from "express";
import * as db from "./db";
// audioService and storage imports removed — habit audio is now streamed on demand, not pre-downloaded

const router = Router();

// ─── Middleware: authenticate device by API key ────────────────────────────────

async function requireDeviceKey(req: Request, res: Response, next: () => void) {
  const apiKey = req.headers["x-device-key"] as string | undefined;
  if (!apiKey) {
    res.status(401).json({ error: "Missing X-Device-Key header" });
    return;
  }
  const device = await db.getDeviceByApiKey(apiKey);
  if (!device) {
    res.status(401).json({ error: "Invalid or expired API key" });
    return;
  }
  (req as any).device = device;
  next();
}

// ─── POST /api/device/register ────────────────────────────────────────────────
// Called once by the ESP32 after receiving WiFi credentials from the app.
// The pairingToken was embedded in the provisioning payload by the app.

router.post("/register", async (req: Request, res: Response) => {
  try {
    const { pairingToken, macAddress, firmwareVersion } = req.body as {
      pairingToken?: string;
      macAddress?: string;
      firmwareVersion?: string;
    };

    if (!pairingToken || !macAddress) {
      res.status(400).json({ error: "pairingToken and macAddress are required" });
      return;
    }

    // Validate MAC address format
    const macRegex = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;
    if (!macRegex.test(macAddress)) {
      res.status(400).json({ error: "Invalid MAC address format (expected AA:BB:CC:DD:EE:FF)" });
      return;
    }

    const result = await db.registerDevice({ pairingToken, macAddress, firmwareVersion });
    if (!result) {
      res.status(400).json({ error: "Invalid or expired pairing token" });
      return;
    }

    res.json({
      deviceId: result.deviceId,
      apiKey: result.apiKey,
      message: "Device registered successfully",
    });
  } catch (err: any) {
    console.error("[device/register]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/device/self-register ─────────────────────────────────────────
// Called by the ESP32 on every WiFi connect. No token required — the panel
// announces itself by MAC so the app can later claim it via QR scan.
// If the MAC already exists, returns the existing API key (idempotent).
// New devices are created unclaimed (userId = 0) until the user scans the QR.

router.post("/self-register", async (req: Request, res: Response) => {
  try {
    const { macAddress, firmwareVersion } = req.body as {
      macAddress?: string;
      firmwareVersion?: string;
    };
    if (!macAddress) {
      res.status(400).json({ error: "macAddress is required" });
      return;
    }
    const macRegex = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;
    if (!macRegex.test(macAddress)) {
      res.status(400).json({ error: "Invalid MAC address format (expected AA:BB:CC:DD:EE:FF)" });
      return;
    }
    const result = await db.selfRegisterDevice({ macAddress, firmwareVersion });
    res.json({
      deviceId: result.deviceId,
      apiKey: result.apiKey,
      message: "Device self-registered",
    });
  } catch (err: any) {
    console.error("[device/self-register]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/device/schedule ─────────────────────────────────────────────────
// Returns the user's alarm configuration so the ESP32 can set its RTC alarm.

router.get("/schedule", requireDeviceKey, async (req: Request, res: Response) => {
  try {
    const device = (req as any).device;
    const schedule = await db.getDeviceSchedule(device.id);
    if (!schedule) {
      res.status(404).json({ error: "Device not found" });
      return;
    }

    // Format alarms for the firmware — simple and flat
    const alarms = schedule.alarms.map((a) => ({
      id: a.id,
      hour: a.hour,
      minute: a.minute,
      daysOfWeek: a.days.split(",").map(Number).filter((d) => !isNaN(d)),
      enabled: a.enabled,
      soundId: a.soundId ?? "edm",
      alarmSoundUrl: getAlarmSoundProxyUrl(a.soundId),
    }));

    // Include active habits so the firmware can show the check-in screen
    const habits = (schedule.habits ?? []).map((h) => ({
      id: h.clientId,
      name: h.name,
      category: h.categoryClientId,
      emoji: (h as any).emoji ?? '⭐',
      description: (h as any).description ?? null,
    }));

    // Mark device as having seen this version so needsSync clears
    await db.markDeviceScheduleSeen(device.id, device.scheduleVersion ?? 1).catch(() => {});

    // Parse stacks from JSON — send as array (empty if not set)
    let stacks: any[] = [];
    if (schedule.stacksJson) {
      try { stacks = JSON.parse(schedule.stacksJson); } catch {}
    }

    res.json({
      alarms,
      habits,
      stacks,
      scheduleVersion: device.scheduleVersion ?? 1,
      updatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[device/schedule]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/device/event ───────────────────────────────────────────────────
// Called when the alarm fires, is dismissed, or is snoozed.

router.post("/event", requireDeviceKey, async (req: Request, res: Response) => {
  try {
    const device = (req as any).device;
    const { type, alarmId, firedAt, dismissedAt, snoozedCount } = req.body as {
      type?: string;
      alarmId?: string;
      firedAt?: string;
      dismissedAt?: string;
      snoozedCount?: number;
    };

    const validTypes = ["alarm_fired", "alarm_dismissed", "snooze", "heartbeat"] as const;
    if (!type || !validTypes.includes(type as any)) {
      res.status(400).json({ error: `type must be one of: ${validTypes.join(", ")}` });
      return;
    }

    const eventId = await db.recordDeviceEvent({
      deviceId: device.id,
      type: type as "alarm_fired" | "alarm_dismissed" | "snooze" | "heartbeat",
      alarmId,
      firedAt: firedAt ? new Date(firedAt) : undefined,
      dismissedAt: dismissedAt ? new Date(dismissedAt) : undefined,
      snoozedCount: snoozedCount ?? 0,
    });

    // When alarm is dismissed, this is the trigger to prompt the user to check in.
    // In a future phase, send a push notification here using expo-notifications server SDK.
    if (type === "alarm_dismissed") {
      console.log(`[device/event] Alarm dismissed by device ${device.id} (user ${device.userId}) — push notification hook ready`);
    }

    res.json({ eventId, received: true });
  } catch (err: any) {
    console.error("[device/event]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/device/heartbeat ───────────────────────────────────────────────
// Lightweight liveness ping sent every 5 minutes by the firmware.

router.post("/heartbeat", requireDeviceKey, async (req: Request, res: Response) => {
  try {
    const device = (req as any).device;
    const { uptime, wifiRssi } = req.body as { uptime?: number; wifiRssi?: number };

    // lastSeenAt is updated by getDeviceByApiKey (called in requireDeviceKey middleware)
    console.log(`[device/heartbeat] device=${device.id} uptime=${uptime}s rssi=${wifiRssi}dBm`);

    // Tell the firmware to re-fetch the schedule if the version has changed
    const needsSync = (device.scheduleVersion ?? 1) !== (device.lastScheduleVersionSeen ?? 0);
    res.json({
      ok: true,
      serverTime: new Date().toISOString(),
      needsSync,
      scheduleVersion: device.scheduleVersion ?? 1,
    });
  } catch (err: any) {
    console.error("[device/heartbeat]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/device/checkin ────────────────────────────────────────────────
// Called by the CrowPanel after the user rates their habits on the check-in screen.
// Saves the ratings to the database exactly like the mobile app does.

router.post("/checkin", requireDeviceKey, async (req: Request, res: Response) => {
  try {
    const device = (req as any).device;
    const { date, ratings } = req.body as {
      date?: string;
      ratings?: Record<string, string>;
    };

    if (!date || !ratings || typeof ratings !== "object") {
      res.status(400).json({ error: "date and ratings object are required" });
      return;
    }

    // Validate date format YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: "date must be in YYYY-MM-DD format" });
      return;
    }

    // Filter to only valid rating values
    const validRatings: Record<string, "red" | "yellow" | "green"> = {};
    for (const [habitId, rating] of Object.entries(ratings)) {
      if (["red", "yellow", "green"].includes(rating)) {
        validRatings[habitId] = rating as "red" | "yellow" | "green";
      }
    }

    if (Object.keys(validRatings).length === 0) {
      res.status(400).json({ error: "No valid ratings provided (must be red, yellow, or green)" });
      return;
    }

    const result = await db.submitDeviceCheckin(device.id, date, validRatings);
    console.log(`[device/checkin] device=${device.id} date=${date} saved=${result.saved} ratings`);

    res.json({ ok: true, saved: result.saved });
  } catch (err: any) {
    console.error("[device/checkin]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/device/audio-manifest ─────────────────────────────────────────
// Returns a list of habit audio files for the ESP32 to cache on its SD card.
// Each entry has: filename (SD path), url (HTTP proxy URL for download), text (habit name).
// The url goes through the Cloudflare Worker /proxy-download endpoint so the
// ESP32 can fetch HTTPS-hosted files over plain HTTP.

const WORKER_BASE_URL = process.env.NODE_ENV === "production"
  ? "http://jack-device-proxy.steve-137.workers.dev"
  : "http://jack-device-proxy-dev.steve-137.workers.dev";

// MP3-only alarm sounds — WAV removed (CrowPanel firmware uses minimp3 decoder, WAV unsupported)
// Mirrors ALARM_SOUNDS in app/alarms.tsx
const ALARM_SOUND_URLS: Record<string, string> = {
  edm:        "https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/alarm_edm_ce8fe03f.mp3",
  fulltrack:  "https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/alarm_fulltrack_6082bd59.mp3",
  prisonbell: "https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/alarm_prisonbell_9d68b4d6.mp3",
  stomp4k:    "https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/alarm_stomp4k_d0a6e2e5.mp3",
  stomp5k:    "https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/alarm_stomp5k_2c8b4f12.mp3",
  classic:    "https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/alarm_classic_bundled.mp3",
};

function getAlarmSoundProxyUrl(soundId?: string | null): string {
  const id = soundId ?? "edm";
  const rawUrl = ALARM_SOUND_URLS[id] ?? ALARM_SOUND_URLS["edm"];
  return `${WORKER_BASE_URL}/proxy-download?url=${encodeURIComponent(rawUrl)}`;
}

router.get("/audio-manifest", requireDeviceKey, async (req: Request, res: Response) => {
  try {
    const alarmFiles = Object.entries(ALARM_SOUND_URLS).map(([soundId, rawUrl]) => ({
      filename: `alarms/${soundId}.mp3`,
      url: rawUrl,
      text: soundId,
      category: "alarm_sounds",
    }));

    res.json({
      files: alarmFiles,
      totalFiles: alarmFiles.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[device/audio-manifest]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/device/upload ─────────────────────────────────────────────────
// Called by the CrowPanel to upload a voice recording.
// The body is the raw audio bytes (WAV or MP3).
// Returns immediately with { ok, recordingId } then transcribes async.

router.post("/upload", requireDeviceKey, async (req: Request, res: Response) => {
  try {
    const device = (req as any).device;
    const filename = (req.headers["x-filename"] as string) || `recording-${Date.now()}.wav`;
    const contentType = (req.headers["content-type"] as string) || "audio/wav";

    // Read raw body
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", resolve);
      req.on("error", reject);
    });
    const body = Buffer.concat(chunks);
    if (body.length === 0) {
      res.status(400).json({ error: "Empty file" });
      return;
    }

    // Determine category from path
    const category = filename.startsWith("/journal") ? "journal"
      : filename.startsWith("/gratitudes") ? "gratitude"
      : filename.startsWith("/minddump") ? "minddump"
      : "recording";

    // Save to DB with status=pending
    const saveResult = await db.saveDeviceRecording(device.id, {
      filename, category, sizeBytes: body.length, contentType, data: body,
    }).catch((err: any) => {
      console.warn("[device/upload] saveDeviceRecording failed:", err?.message);
      return { ok: false };
    });

    // Use insertId returned directly from saveDeviceRecording (no separate query, no race condition)
    const recordingId: number | null = (saveResult.ok && (saveResult as any).insertId) ? (saveResult as any).insertId : null;

    console.log(`[device/upload] device=${device.id} file=${filename} size=${body.length} id=${recordingId}`);

    // Respond immediately — don't make the panel wait for transcription
    res.json({ ok: true, filename, sizeBytes: body.length, recordingId });

    // ─── Async transcription pipeline (fire-and-forget) ────────────────────────────────────────
    if (recordingId !== null) {
      processRecordingAsync(recordingId, device.id, device.userId, body, contentType, category).catch((err) => {
        console.error('[device/upload] async processing failed:', err?.message);
      });
    }
  } catch (err: any) {
    console.error("[device/upload]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Async pipeline: transcribe WAV → LLM extract → update DB row.
 * Mirrors the voiceJournal.transcribeAndAnalyze tRPC procedure exactly,
 * using the full habit analysis with ratings (green/yellow/red) and extractedTasks.
 */
async function processRecordingAsync(
  recordingId: number,
  deviceId: number,
  userId: number,
  audioBuffer: Buffer,
  contentType: string,
  _category: string,
): Promise<void> {
  try {
    await db.updateDeviceRecording(recordingId, { status: 'processing' });

    // 1. Upload audio to R2 for playback
    let audioUrl = '';
    let audioKey = '';
    try {
      const { storagePut } = await import('./storage.js');
      const ext = contentType.includes('mp3') ? 'mp3' : 'wav';
      const fileKey = `device-recordings/${deviceId}/${recordingId}.${ext}`;
      const result = await storagePut(fileKey, audioBuffer, contentType);
      audioUrl = result.url;
      audioKey = result.key;
    } catch (err: any) {
      console.warn('[device/upload] R2 upload failed (non-fatal):', err?.message);
    }

    // 2. Transcribe with Whisper
    const { transcribeAudioBuffer } = await import('./_core/voiceTranscription.js');
    const transcription = await transcribeAudioBuffer(audioBuffer, contentType, {
      language: 'en',
      prompt: 'Daily habit check-in, gratitude, journal entry, reflections',
    });
    if ('error' in transcription) {
      console.error('[device/upload] transcription error:', transcription.error);
      await db.updateDeviceRecording(recordingId, { status: 'failed', audioUrl: audioUrl || undefined, audioKey: audioKey || undefined });
      return;
    }
    const transcript = transcription.text?.trim() ?? '';
    if (!transcript) {
      await db.updateDeviceRecording(recordingId, { status: 'processed', transcription: '', audioUrl: audioUrl || undefined, audioKey: audioKey || undefined });
      return;
    }

    // 2b. Mark as 'transcribed' immediately — panel can show the text now without waiting for LLM
    await db.updateDeviceRecording(recordingId, {
      status: 'transcribed',
      transcription: transcript,
      audioUrl: audioUrl || undefined,
      audioKey: audioKey || undefined,
    });
    console.log(`[device/upload] transcribed recording ${recordingId} (${transcript.length} chars) — starting LLM extraction`);

    // 3. Get user habits for context
    const userHabits = await db.getUserHabits(userId).catch(() => [] as any[]);
    const activeHabits = (userHabits as any[]).filter((h: any) => h.isActive !== false);
    const habitList = activeHabits
      .map((h: any) => `- ${h.clientId}: ${h.emoji ?? ''} ${h.name}`).join('\n');
    const habitSection = habitList
      ? `\n4. "habitResults": object mapping habit IDs to {"rating": "green"|"yellow"|"red"|null, "note": "rich 2-3 sentence description using user's exact words"}. Habits:\n${habitList}`
      : '';
    const habitJsonExample = habitList ? `, "habitResults": {"habit_id": {"rating": "green", "note": "Hit the gym for about 45 minutes."}}` : '';

    // 4. LLM extraction — full analysis matching voiceJournal.transcribeAndAnalyze
    const { invokeAnthropic } = await import('./_core/llm.js');
    const llmResp = await invokeAnthropic({
      messages: [
        {
          role: 'system',
          content: `You are a personal journal + habit coach assistant. Given a voice check-in transcript, extract:\n1. "journalEntries": array of reflective thoughts/observations (concise, preserve user voice)\n2. "gratitudeItems": array of specific things user is grateful for (3-10 words each)\n3. "extractedTasks": array of task objects for anything the user wants to remember or do. Look for phrases like "remind me to", "don't forget", "I need to", "I should", "I have to". Each task: {"title": "short action phrase", "notes": "optional context", "priority": "medium"}.${habitSection}\n\nHABIT EXTRACTION RULES (critical):\n- Be AGGRESSIVE and THOROUGH — scan every sentence for evidence of each habit\n- Match by meaning, not just keywords\n- HABIT NOTE RULES: use the user's EXACT words, do NOT paraphrase\n- Include ALL habits that have ANY evidence in the transcript\n- Gratitude expressions → gratitudeItems; everything else → journalEntries\nReturn ONLY valid JSON: {"journalEntries": [...], "gratitudeItems": [...], "extractedTasks": [...]${habitJsonExample}}`,
        },
        { role: 'user', content: `Transcript:\n${transcript}` },
      ],
      response_format: { type: 'json_object' },
    });

    let journalEntries: string[] = [];
    let gratitudeItems: string[] = [];
    let habitResults: Record<string, { rating: 'green' | 'yellow' | 'red' | null; note: string }> = {};
    let extractedTasks: Array<{ title: string; notes: string; priority: string }> = [];
    try {
      const parsed = JSON.parse(llmResp.choices[0].message.content as string);
      journalEntries = Array.isArray(parsed.journalEntries)
        ? parsed.journalEntries.filter((s: unknown) => typeof s === 'string' && (s as string).trim())
        : [];
      gratitudeItems = Array.isArray(parsed.gratitudeItems)
        ? parsed.gratitudeItems.filter((s: unknown) => typeof s === 'string' && (s as string).trim())
        : [];
      extractedTasks = Array.isArray(parsed.extractedTasks)
        ? parsed.extractedTasks.filter((t: any) => t && typeof t.title === 'string' && t.title.trim())
        : [];
      if (parsed.habitResults && typeof parsed.habitResults === 'object') {
        habitResults = Object.fromEntries(
          Object.entries(parsed.habitResults)
            .filter(([, v]: [string, any]) => v && typeof v === 'object' && v.rating)
            .map(([id, v]: [string, any]) => [id, { rating: v.rating, note: (v.note ?? '') }])
        ) as Record<string, { rating: 'green' | 'yellow' | 'red' | null; note: string }>;
      }
    } catch {
      journalEntries = [transcript];
    }

    // 5. Save results to DB
    await db.updateDeviceRecording(recordingId, {
      status: 'processed',
      transcription: transcript,
      journalEntries: JSON.stringify(journalEntries),
      gratitudeItems: JSON.stringify(gratitudeItems),
      habitResults: JSON.stringify(habitResults),
      extractedTasks: JSON.stringify(extractedTasks),
      audioUrl: audioUrl || undefined,
      audioKey: audioKey || undefined,
    });
    console.log(`[device/upload] processed recording ${recordingId}: ${journalEntries.length} entries, ${gratitudeItems.length} gratitudes, ${Object.keys(habitResults).length} habits, ${extractedTasks.length} tasks`);
  } catch (err: any) {
    console.error('[device/upload] processRecordingAsync error:', err?.message);
    await db.updateDeviceRecording(recordingId, { status: 'failed' }).catch(() => {});
  }
}

// ─── GET /api/device/recording/:id ──────────────────────────────────────────────────────────────
// Streams a single recording back to an authenticated app user.
// Auth: Bearer token (same as tRPC) or session cookie.
router.get("/recording/:id", async (req: Request, res: Response) => {
  // Skip if this is the /acked sub-path (handled below)
  if (req.params.id?.endsWith('/acked')) {
    return;
  }
  try {
    let user: any = null;
    try {
      const { sdk } = await import("./_core/sdk.js");
      user = await sdk.authenticateRequest(req);
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const recordingId = parseInt(req.params.id, 10);
    if (isNaN(recordingId)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const rec = await db.getDeviceRecordingData(user.id, recordingId);
    if (!rec) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    // Prefer DB blob; fall back to S3 redirect if blob is null (e.g. large files stored externally)
    if (!rec.data) {
      if (rec.audioUrl) {
        res.redirect(302, rec.audioUrl);
      } else {
        res.status(404).json({ error: "Audio data not available" });
      }
      return;
    }
    const buf = rec.data;
    const ct = rec.contentType;
    res.setHeader("Content-Type", ct);
    res.setHeader("Content-Length", buf.length);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(buf);
  } catch (err: any) {
    console.error("[device/recording]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/device/recording/:id/ack ─────────────────────────────────────────────────────────
// Called by the app after it saves the recording to the local journal.
// Sets acked=1 so the recording is hidden from the app's list.
router.post("/recording/:id/ack", async (req: Request, res: Response) => {
  try {
    let user: any = null;
    try {
      const { sdk } = await import("./_core/sdk.js");
      user = await sdk.authenticateRequest(req);
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const recordingId = parseInt(req.params.id, 10);
    if (isNaN(recordingId)) { res.status(400).json({ error: "Invalid id" }); return; }
    // Verify ownership via join
    const recs = await db.getDeviceRecordings(user.id, 200);
    const rec = recs.find((r) => r.id === recordingId);
    if (!rec) { res.status(404).json({ error: "Not found" }); return; }
    await db.updateDeviceRecording(recordingId, { acked: 1, ackedAt: new Date() });
    console.log(`[device/recording/ack] recording ${recordingId} acked by user ${user.id}`);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[device/recording/ack]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/device/recording/:id/acked ────────────────────────────────────────────────────────
// Called by the panel (using device key) to poll whether the app has ACKed a recording.
// The panel keeps the SD file until this returns { acked: true }.
router.get("/recording/:id/acked", requireDeviceKey, async (req: Request, res: Response) => {
  try {
    const device = (req as any).device;
    const recordingId = parseInt(req.params.id, 10);
    if (isNaN(recordingId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const row = await db.getDeviceRecordingById(recordingId, device.userId);
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ acked: row.acked === 1 || row.acked === true });
  } catch (err: any) {
    console.error("[device/recording/acked]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/device/recording/:id/status ──────────────────────────────────────────────────────
// Called by the panel to poll transcription status. Returns { status, transcription } so the
// panel can show a loading screen until status === 'processed' then display the transcription.
router.get("/recording/:id/status", requireDeviceKey, async (req: Request, res: Response) => {
  try {
    const device = (req as any).device;
    const recordingId = parseInt(req.params.id, 10);
    if (isNaN(recordingId)) { res.status(400).json({ error: "Invalid id" }); return; }
    const row = await db.getDeviceRecordingById(recordingId, device.userId);
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    // Parse habitResults JSON if present (only included when status === 'processed')
    let habitResults: Record<string, any> | null = null;
    if (row.status === 'processed' && row.habitResults) {
      try { habitResults = JSON.parse(row.habitResults); } catch {}
    }
    res.json({
      status: row.status,
      transcription: row.transcription ?? null,
      ...(habitResults ? { habitResults } : {}),
    });
  } catch (err: any) {
    console.error("[device/recording/status]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/device/prompts ─────────────────────────────────────────────────────────────────────
// Returns the user's active habits formatted as recording prompts.
// The panel fetches this before recording to show the same prompts as the app.
router.get("/prompts", requireDeviceKey, async (req: Request, res: Response) => {
  try {
    const device = (req as any).device;
    const allHabits = await db.getUserHabits(device.userId).catch(() => [] as any[]);
    // MySQL stores boolean as tinyint(1) — compare loosely so both true/1 and false/0 work
    const activeHabits = (allHabits as any[]).filter((h: any) => h.isActive !== false && h.isActive !== 0);
    // Return structured data so the panel can render habits separately from fixed prompts
    const habits = activeHabits.map((h: any) => ({
      id: h.clientId,
      name: h.name,
      emoji: h.emoji ?? '⭐',
      description: h.description ?? null,
    }));
    // Legacy flat prompts list (kept for backward compat with older firmware)
    const prompts = [
      { id: 'gratitude', text: '\xF0\x9F\x99\x8F What are you grateful for today?', type: 'gratitude' },
      ...activeHabits.map((h: any) => ({
        id: h.clientId,
        text: `${h.emoji ?? '\u2B50'} ${h.name}`,
        type: 'habit',
        description: h.description ?? null,
      })),
      { id: 'journal', text: '\xF0\x9F\x93\x9D Anything else on your mind?', type: 'journal' },
    ];
    res.json({ habits, prompts });
  } catch (err: any) {
    console.error('[device/prompts]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/device/today-summary ─────────────────────────────────────────────────────────────────
// Returns today's check-in ratings, gratitude items, and last journal entry for the panel preview.
router.get("/today-summary", requireDeviceKey, async (req: Request, res: Response) => {
  try {
    const device = (req as any).device;
    const userId = device.userId;

    // Today's date string YYYY-MM-DD in UTC
    const today = new Date().toISOString().slice(0, 10);

    // 1. Today's check-in ratings (habitClientId -> rating)
    const allCheckIns = await db.getUserCheckIns(userId).catch(() => [] as any[]);
    const todayCheckIns = (allCheckIns as any[]).filter((c: any) => c.date === today);
    const ratings: Record<string, string> = {};
    for (const c of todayCheckIns) {
      ratings[c.habitClientId] = c.rating;
    }

    // 2. Today's gratitude items (flatten all itemsJson arrays from today)
    const allGratitudes = await db.getUserGratitudeEntries(userId).catch(() => [] as any[]);
    const todayGratitudes: string[] = [];
    for (const g of allGratitudes as any[]) {
      if (g.date !== today) continue;
      try {
        const items = JSON.parse(g.itemsJson || '[]');
        if (Array.isArray(items)) todayGratitudes.push(...items.filter((s: unknown) => typeof s === 'string'));
      } catch { /* ignore */ }
    }

    // 3. Most recent journal entry today (title + first 200 chars of body/transcription)
    const allJournal = await db.getUserJournalEntries(userId).catch(() => [] as any[]);
    const todayJournal = (allJournal as any[]).filter((j: any) => j.date === today && !j.deletedAt);
    const lastEntry = todayJournal[0] ?? null;
    const lastEntryPreview = lastEntry ? {
      title: lastEntry.title || '',
      body: (lastEntry.body || '').slice(0, 200),
      transcription: (lastEntry.transcriptionText || '').slice(0, 200),
    } : null;

    res.json({
      date: today,
      ratings,
      gratitudes: todayGratitudes.slice(0, 10),
      lastEntry: lastEntryPreview,
      entryCount: todayJournal.length,
    });
  } catch (err: any) {
    console.error('[device/today-summary]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/device/audio/:key ──────────────────────────────────────────────
// Streams a pre-recorded voice confirmation clip from R2 to the ESP32.
// Files are stored in R2 under voice-commands/{key}.mp3
// Key examples: listening, command_not_understood, alarm_0630, habit_logged_green
// Auth: X-Device-Key header (same as all device endpoints)
router.get("/audio/:key", requireDeviceKey, async (req: Request, res: Response) => {
  const { key } = req.params;
  // Sanitize: only allow alphanumeric, underscore, hyphen
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
    return res.status(400).json({ error: 'Invalid audio key' });
  }
  const r2Key = `voice-commands/${key}.mp3`;
  try {
    // Use storageStream (direct GetObject) instead of presigned URL.
    // Presigned URLs return 403 when the bucket does not have public access enabled.
    const { storageStream } = await import('./storage.js');
    const { body, contentType, contentLength } = await storageStream(r2Key);
    res.setHeader('Content-Type', contentType || 'audio/mpeg');
    if (contentLength) res.setHeader('Content-Length', String(contentLength));
    (body as any).pipe(res);
  } catch (err: any) {
    console.error(`[device/audio] error streaming ${r2Key}:`, err?.message);
    res.status(404).json({ error: 'Audio clip not found' });
  }
});

// ─── POST /api/device/voice/transcribe ──────────────────────────────────────
// Real-time voice command endpoint for the CrowPanel.
// Accepts raw PCM audio (16kHz 16-bit mono), transcribes it synchronously,
// parses the command intent via LLM, executes any server-side actions
// (alarm set/toggle), and returns { responseKey, command } for the firmware
// to play the confirmation audio and perform local actions.
//
// Response schema (mirrors firmware expectations in sendVoiceToServer()):
//   { responseKey: string, command: { type: string, ...params } }
//
// Command types:
//   set_alarm       — { hour, minute, days }  → upserts alarm, returns "alarm_set_{H}_{MM}_{ampm}"
//   alarm_off       — {}                       → disables alarm, returns "alarm_disabled"
//   alarm_on        — {}                       → enables alarm, returns "alarm_enabled"
//   snooze          — { minutes }              → firmware handles locally, returns "snooze_ok"
//   stop_alarm      — {}                       → firmware handles locally, returns "ok"
//   habit_green/yellow/red/skip — {}           → firmware handles locally
//   journal         — {}                       → stores transcript async, returns "journal_saved"
//   unknown         — {}                       → returns "command_not_understood"

router.post("/voice/transcribe", requireDeviceKey, async (req: Request, res: Response) => {
  try {
    const device = (req as any).device as { id: number; userId: number };
    const contentType = (req.headers["content-type"] as string) || "audio/pcm";

    // ── 1. Read raw audio body ────────────────────────────────────────────────
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", resolve);
      req.on("error", reject);
    });
    const audioBuffer = Buffer.concat(chunks);
    if (audioBuffer.length === 0) {
      return res.status(400).json({ error: "Empty audio body" });
    }
    console.log(`[device/voice/transcribe] device=${device.id} size=${audioBuffer.length} ct=${contentType}`);

    // ── 2. Transcribe with Whisper ────────────────────────────────────────────
    const { transcribeAudioBuffer } = await import('./_core/voiceTranscription.js');
    const transcription = await transcribeAudioBuffer(audioBuffer, contentType, {
      language: 'en',
      prompt: 'Alarm commands, habit check-in, snooze, stop alarm, set alarm, journal entry',
    });
    if ('error' in transcription) {
      console.error('[device/voice/transcribe] transcription error:', transcription.error);
      return res.json({ responseKey: 'command_not_understood', command: { type: 'unknown' } });
    }
    const transcript = (transcription.text ?? '').trim();
    console.log(`[device/voice/transcribe] transcript: "${transcript}"`);
    if (!transcript) {
      return res.json({ responseKey: 'command_not_understood', transcript: '', command: { type: 'unknown' } });
    }

    // ── 3. Parse command intent via LLM ──────────────────────────────────────
    const { invokeAnthropic } = await import('./_core/llm.js');
    const llmResp = await invokeAnthropic({
      messages: [
        {
          role: 'system',
          content: `You are a voice command parser for a smart alarm clock. Given a voice transcript, identify the user's intent and extract parameters.

Supported command types:
- "set_alarm": user wants to set or change their alarm time. Extract hour (0-23, 24h), minute (0-59), days (comma-separated 0-6, 0=Sun; default "1,2,3,4,5" for weekdays, "0,1,2,3,4,5,6" for every day).
- "alarm_off": user wants to turn off / disable their alarm.
- "alarm_on": user wants to turn on / enable their alarm.
- "snooze": user wants to snooze the current alarm. Extract minutes (default 9).
- "stop_alarm": user wants to dismiss/stop the alarm.
- "habit_green": user is rating a habit as completed/won.
- "habit_yellow": user is rating a habit as partial.
- "habit_red": user is rating a habit as missed/failed.
- "skip_habit": user wants to skip the current habit.
- "journal": user is recording a journal entry or reflection.
- "unknown": none of the above.

Return ONLY valid JSON: {"type": "<command_type>", "hour": <int or null>, "minute": <int or null>, "days": "<string or null>", "minutes": <int or null>}`,
        },
        { role: 'user', content: `Transcript: "${transcript}"` },
      ],
      response_format: { type: 'json_object' },
    });

    let cmdType = 'unknown';
    let cmdHour: number | null = null;
    let cmdMinute: number | null = null;
    let cmdDays: string | null = null;
    let cmdSnoozeMin: number = 9;
    try {
      const parsed = JSON.parse(llmResp.choices[0].message.content as string);
      cmdType    = (typeof parsed.type === 'string') ? parsed.type : 'unknown';
      cmdHour    = (typeof parsed.hour === 'number') ? parsed.hour : null;
      cmdMinute  = (typeof parsed.minute === 'number') ? parsed.minute : null;
      cmdDays    = (typeof parsed.days === 'string') ? parsed.days : null;
      cmdSnoozeMin = (typeof parsed.minutes === 'number') ? parsed.minutes : 9;
    } catch {
      cmdType = 'unknown';
    }
    console.log(`[device/voice/transcribe] cmd=${cmdType} hour=${cmdHour} min=${cmdMinute}`);

    // ── 4. Execute server-side actions ────────────────────────────────────────
    let responseKey = 'ok';

    if (cmdType === 'set_alarm' && cmdHour !== null && cmdMinute !== null) {
      // Upsert the user's alarm
      const days = cmdDays ?? '1,2,3,4,5';
      await db.upsertAlarm({
        userId: device.userId,
        hour: cmdHour,
        minute: cmdMinute,
        days,
        enabled: true,
      });
      await db.bumpScheduleVersionForUser(device.userId).catch(() => {});
      // Build response key: alarm_set_6_30_am or alarm_set_14_00
      const h12 = cmdHour % 12 || 12;
      const ampm = cmdHour >= 12 ? 'pm' : 'am';
      const minStr = String(cmdMinute).padStart(2, '0');
      responseKey = `alarm_set_${h12}_${minStr}_${ampm}`;
      console.log(`[device/voice/transcribe] set alarm ${cmdHour}:${minStr} days=${days}`);

    } else if (cmdType === 'alarm_off') {
      const existing = await db.getUserAlarm(device.userId);
      if (existing) {
        await db.upsertAlarm({ ...existing, enabled: false });
        await db.bumpScheduleVersionForUser(device.userId).catch(() => {});
      }
      responseKey = 'alarm_disabled';

    } else if (cmdType === 'alarm_on') {
      const existing = await db.getUserAlarm(device.userId);
      if (existing) {
        await db.upsertAlarm({ ...existing, enabled: true });
        await db.bumpScheduleVersionForUser(device.userId).catch(() => {});
      }
      responseKey = 'alarm_enabled';

    } else if (cmdType === 'snooze') {
      responseKey = 'snooze_ok';

    } else if (cmdType === 'stop_alarm') {
      responseKey = 'ok';

    } else if (cmdType === 'habit_green') {
      responseKey = 'habit_logged_green';

    } else if (cmdType === 'habit_yellow') {
      responseKey = 'habit_logged_yellow';

    } else if (cmdType === 'habit_red') {
      responseKey = 'habit_logged_red';

    } else if (cmdType === 'skip_habit') {
      responseKey = 'ok';

    } else if (cmdType === 'journal') {
      // Store transcript as a device recording async (fire-and-forget)
      db.saveDeviceRecording(device.id, {
        filename: `journal-voice-${Date.now()}.pcm`,
        category: 'journal',
        sizeBytes: audioBuffer.length,
        contentType,
        data: audioBuffer,
      }).then(async () => {
        try {
          const mysql = await import('mysql2/promise');
          const conn = await mysql.createConnection(process.env.DATABASE_URL!);
          const [rows] = await conn.execute(
            'SELECT id FROM deviceRecordings WHERE deviceId = ? ORDER BY id DESC LIMIT 1',
            [device.id]
          ) as any;
          await conn.end();
          const recordingId = rows[0]?.id ?? null;
          if (recordingId) {
            processRecordingAsync(recordingId, device.id, device.userId, audioBuffer, contentType, 'journal').catch(() => {});
          }
        } catch {}
      }).catch(() => {});
      responseKey = 'journal_saved';

    } else {
      responseKey = 'command_not_understood';
      cmdType = 'unknown';
    }

    // ── 5. Return result to firmware ──────────────────────────────────────────
    res.json({
      responseKey,
      transcript,
      command: {
        type: cmdType,
        ...(cmdHour !== null ? { hour: cmdHour } : {}),
        ...(cmdMinute !== null ? { minute: cmdMinute } : {}),
        ...(cmdDays ? { days: cmdDays } : {}),
        ...(cmdType === 'snooze' ? { minutes: cmdSnoozeMin } : {}),
      },
    });
  } catch (err: any) {
    console.error('[device/voice/transcribe]', err);
    res.json({ responseKey: 'command_not_understood', command: { type: 'unknown' } });
  }
});

// ─── POST /api/device/voice/debug-upload ────────────────────────────────────
// Accepts a raw WAV file from the device and saves it to /tmp/voice_debug.wav
// for server-side inspection. Also runs it through Scribe and returns the transcript.
router.post('/voice/debug-upload', requireDeviceKey, async (req: Request, res: Response) => {
  try {
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', resolve);
      req.on('error', reject);
    });
    const audioBuffer = Buffer.concat(chunks);
    const contentType = (req.headers['content-type'] as string) || 'audio/wav';
    console.log(`[device/voice/debug-upload] received ${audioBuffer.length} bytes, ct=${contentType}`);

    // Save to filesystem
    const fs = await import('fs');
    const path = await import('path');
    const savePath = path.join('/tmp', 'voice_debug.wav');
    fs.writeFileSync(savePath, audioBuffer);
    console.log(`[device/voice/debug-upload] saved to ${savePath}`);

    // Also run through Scribe so we can see the transcript
    const { transcribeAudioBuffer } = await import('./_core/voiceTranscription.js');
    const transcription = await transcribeAudioBuffer(audioBuffer, contentType, { language: 'en' });
    const transcript = 'error' in transcription ? `ERROR: ${transcription.error}` : (transcription.text ?? '');
    console.log(`[device/voice/debug-upload] transcript: "${transcript}"`);

    res.json({ ok: true, size: audioBuffer.length, transcript, savedTo: savePath });
  } catch (err: any) {
    console.error('[device/voice/debug-upload]', err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
