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
 *   POST /api/device/register    — First-time registration using pairing token
 *   GET  /api/device/schedule    — Get current alarm schedule
 *   POST /api/device/event       — Report an alarm event (fired, dismissed, snooze)
 *   POST /api/device/heartbeat   — Periodic liveness ping
 */

import { Router, Request, Response } from "express";
import * as db from "./db";

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
    }));

    res.json({
      alarms,
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

    res.json({ ok: true, serverTime: new Date().toISOString() });
  } catch (err: any) {
    console.error("[device/heartbeat]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
