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
 *   POST /api/device/register       — First-time registration using pairing token
 *   GET  /api/device/schedule       — Get current alarm schedule
 *   GET  /api/device/audio-manifest — Get list of habit audio files to cache on SD card
 *   POST /api/device/event          — Report an alarm event (fired, dismissed, snooze)
 *   POST /api/device/heartbeat      — Periodic liveness ping
 *   POST /api/device/checkin        — Submit habit check-in ratings
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
  stomp4k:    "https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/alarm_stomp4k_be7c271e.mp3",
  stomp5k:    "https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/alarm_stomp5k_e7c316e0.mp3",
  // Legacy — 'classic' maps to edm
  classic:    "https://d2xsxph8kpxj0f.cloudfront.net/310519663287248938/bFcyWdAL5JXed3bpyDvBEf/alarm_edm_ce8fe03f.mp3",
};

function getAlarmSoundProxyUrl(soundId: string | null | undefined): string {
  const httpsUrl = ALARM_SOUND_URLS[soundId ?? "edm"] ?? ALARM_SOUND_URLS.edm;
  return `${WORKER_BASE_URL}/proxy-download?url=${encodeURIComponent(httpsUrl)}`;
}

function sanitizeForFilename(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

router.get("/audio-manifest", requireDeviceKey, async (req: Request, res: Response) => {
  try {
    const device = (req as any).device as Awaited<ReturnType<typeof db.getDeviceByApiKey>>;
    if (!device) { res.status(401).json({ error: "Device not found" }); return; }

    const schedule = await db.getDeviceSchedule(device.id);
    if (!schedule) { res.status(404).json({ error: "Schedule not found" }); return; }

    const files: { filename: string; url: string; text: string }[] = [];

    // Alarm sounds only — ESP32 pre-downloads these to SD card.
    // All other audio (habits, wellness) is streamed on demand via proxy.
    for (const [soundId, httpsUrl] of Object.entries(ALARM_SOUND_URLS)) {
      const ext = httpsUrl.endsWith(".wav") ? ".wav" : ".mp3";
      const filename = `alarms/${soundId}${ext}`;
      // Return the raw HTTPS CloudFront URL.
      // The firmware's downloadToSD() will wrap it through the Cloudflare Worker
      // proxy itself (one hop only). Returning a pre-wrapped proxy URL here would
      // cause double-proxying and a 404 on the device.
      files.push({ filename, url: httpsUrl, text: soundId });
    }

    res.json({ files, totalFiles: files.length });
  } catch (err: any) {
    console.error("[device/audio-manifest]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/device/upload ───────────────────────────────────────────────────────────────────
// Receives a raw WAV file from the ESP32 (journal/gratitude/minddump recordings).
// The X-Filename header carries the original SD path (e.g. /journal/2026-04-07_08-30.wav).
// Files are stored in the DB as blobs or forwarded to storage; for now we accept and
// acknowledge so the device removes the local copy and stops retrying.

router.post("/upload", requireDeviceKey, async (req: Request, res: Response) => {
  try {
    const device = (req as any).device;
    const filename = (req.headers["x-filename"] as string) || "unknown.wav";
    const contentType = (req.headers["content-type"] as string) || "audio/wav";

    // Read the raw body into a buffer
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

    // Store in DB as a device recording entry
    await db.saveDeviceRecording(device.id, {
      filename,
      category,
      sizeBytes: body.length,
      contentType,
      data: body,
    }).catch((err: any) => {
      // If saveDeviceRecording isn't implemented yet, log and continue
      console.warn("[device/upload] saveDeviceRecording not available:", err?.message);
    });

    console.log(`[device/upload] device=${device.id} file=${filename} size=${body.length}`);
    res.json({ ok: true, filename, sizeBytes: body.length });
  } catch (err: any) {
    console.error("[device/upload]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/device/recording/:id ──────────────────────────────────────────────────────────────
// Streams a single recording back to an authenticated app user.
// Auth: Bearer token (same as tRPC) or session cookie.
router.get("/recording/:id", async (req: Request, res: Response) => {
  try {
    // Authenticate the request using the same SDK used by tRPC
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

     // Fetch the recording data, verifying it belongs to this user
    const rec = await db.getDeviceRecordingData(user.id, recordingId);
    if (!rec) {
      res.status(404).json({ error: "Not found" });
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

export default router;
