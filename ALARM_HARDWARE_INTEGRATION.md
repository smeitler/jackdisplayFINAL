# Jack Alarm Clock — Hardware Integration Architecture

> **Document purpose:** A complete technical blueprint for connecting a custom physical alarm clock device to the Jack mobile app and backend, covering hardware selection, communication protocols, pairing flow, API design, and firmware responsibilities.

---

## 1. Overview

The goal is to build a physical alarm clock that is a **first-class citizen of the Jack ecosystem**: the device knows the user's alarm schedule (set in the app), fires the alarm at the right time, and reports back to the app when the user wakes up and dismisses it. This creates a closed loop — the app controls the clock, and the clock feeds data back to the app.

At a high level, three systems must talk to each other:

| System | Role |
|---|---|
| **Jack Mobile App** (iOS/Android) | User sets alarm times, views history, manages habits |
| **Jack Backend Server** (Node.js/Express + PostgreSQL) | Source of truth for alarm schedules; receives device events |
| **Physical Alarm Clock** (ESP32 microcontroller) | Fires alarm at scheduled time; reports dismissal to server |

The mobile app **never talks directly to the clock**. All communication routes through the backend server. This is the standard architecture for consumer IoT products at scale because it works whether the user's phone is on the same WiFi network or on the other side of the world.

---

## 2. Recommended Hardware Platform

**Microcontroller: ESP32** (specifically the ESP32-S3 or ESP32-C3 variant)

The ESP32 is the industry standard for consumer WiFi IoT products. It is used in products from Sonos, Philips Hue, and countless smart home devices. Key reasons for this choice:

- Built-in dual-band WiFi (2.4 GHz) and Bluetooth LE — no separate radio module needed
- 240 MHz dual-core processor, 520 KB SRAM — more than enough for a clock
- Deep-sleep current draw of ~10 µA (critical for battery-backed designs)
- Arduino and ESP-IDF frameworks both supported; massive community
- Unit cost: **$2–5 USD** at volume, making it viable for a consumer product at scale
- Built-in hardware RTC (Real-Time Clock) that keeps time during deep sleep

**Recommended development board for prototyping:** ESP32-S3 DevKit or the XIAO ESP32-C3 (tiny form factor, ~$5).

---

## 3. Communication Architecture

### 3.1 Protocol Choice: REST over HTTPS (with optional MQTT upgrade)

For a product at your scale, **REST over HTTPS** is the right starting point. Here is why:

The clock only needs to do two things over the network: (1) **pull** its alarm schedule from the server once per day or when settings change, and (2) **push** a single event to the server when the alarm is dismissed. This is a low-frequency, low-data-volume use case — exactly where REST excels. MQTT adds operational complexity (you need a separate broker like Mosquitto or HiveMQ) without meaningful benefit for this pattern.

MQTT becomes worth adding later if you want **real-time two-way control** — for example, the user tapping "snooze" in the app and the physical clock immediately stopping. That is a Phase 2 feature.

| Feature | REST (Phase 1) | MQTT (Phase 2) |
|---|---|---|
| Pull alarm schedule | ✅ Simple GET request | ✅ Subscribe to topic |
| Report dismissal | ✅ Simple POST request | ✅ Publish to topic |
| App-to-clock real-time control (snooze, cancel) | ❌ Requires polling | ✅ Near-instant |
| Infrastructure needed | Your existing server | MQTT broker (e.g., HiveMQ Cloud free tier) |
| Firmware complexity | Low | Medium |

### 3.2 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    JACK BACKEND SERVER                   │
│                                                          │
│  POST /api/device/register    ← Device registers itself │
│  GET  /api/device/schedule    ← Device polls schedule   │
│  POST /api/device/event       ← Device reports events   │
│  POST /api/device/heartbeat   ← Device proves it's alive│
└──────────────────────┬──────────────────────────────────┘
                       │  HTTPS (REST)
              ┌────────┴────────┐
              │                 │
   ┌──────────▼──────┐   ┌──────▼──────────┐
   │  JACK MOBILE    │   │  PHYSICAL ALARM  │
   │  APP            │   │  CLOCK (ESP32)   │
   │                 │   │                  │
   │ Sets alarm time │   │ Fires alarm at   │
   │ Views history   │   │ scheduled time   │
   │ Receives push   │   │ Reports dismiss  │
   │ notifications   │   │ Polls schedule   │
   └─────────────────┘   └──────────────────┘
```

---

## 4. Device Pairing Flow

The biggest UX challenge in consumer IoT is the **first-time setup** — getting the clock onto the user's WiFi network and linked to their Jack account. The recommended approach is **Soft AP (Access Point) provisioning**, which is what products like the Amazon Echo and Philips Hue use.

### Step-by-Step Pairing Flow

**Step 1 — Out of the box:** The clock powers on and, finding no saved WiFi credentials, broadcasts its own temporary WiFi network (e.g., `Jack-Clock-XXXX`). The clock's display shows "Scan QR to set up."

**Step 2 — App detects setup mode:** The Jack app has a "Connect a Clock" button in Settings. Tapping it opens a setup wizard. The app uses `react-native-wifi-reborn` to scan for nearby networks and detect the `Jack-Clock-XXXX` SSID automatically.

**Step 3 — App connects to clock's network:** The app temporarily switches the phone's WiFi to the clock's hotspot network. The clock runs a tiny HTTP server at a fixed IP address (typically `192.168.4.1`).

**Step 4 — App sends credentials to clock:** The app makes an HTTP POST request to `http://192.168.4.1/provision` with:
```json
{
  "ssid": "HomeNetwork",
  "password": "wifi-password",
  "deviceToken": "jwt-token-linking-clock-to-user-account"
}
```

**Step 5 — Clock connects to home WiFi:** The clock saves the credentials to its non-volatile storage (NVS flash), reboots, and connects to the home network. The temporary hotspot disappears and the phone's WiFi reconnects to the home network automatically.

**Step 6 — Clock registers with server:** The clock makes its first call to `POST /api/device/register` using the `deviceToken` it received. The server links the device to the user's account and returns the current alarm schedule.

**Step 7 — Pairing confirmed:** The app polls `GET /api/device/status` and shows a "Clock connected!" confirmation when the device appears online.

---

## 5. API Endpoints to Build

The following four endpoints are all that is needed for Phase 1. They live on your existing Express server.

### `POST /api/device/register`
Called once when the clock first connects to WiFi. Links the physical device to a user account.

**Request body:**
```json
{
  "deviceToken": "one-time-jwt-from-pairing",
  "firmwareVersion": "1.0.0",
  "macAddress": "AA:BB:CC:DD:EE:FF"
}
```
**Response:** `{ "deviceId": 42, "apiKey": "long-lived-secret-key" }`

The `apiKey` is stored in the clock's NVS flash and used to authenticate all future requests. It is a long-lived secret (like a password) specific to this device.

---

### `GET /api/device/schedule`
Called by the clock once per hour (or immediately after a reboot) to get its current alarm configuration. The clock uses this to set its internal RTC alarm.

**Headers:** `X-Device-Key: <apiKey>`

**Response:**
```json
{
  "alarms": [
    {
      "id": "alarm-1",
      "time": "06:30",
      "daysOfWeek": [1, 2, 3, 4, 5],
      "enabled": true,
      "sound": "gentle_rise",
      "snoozeMinutes": 9
    }
  ],
  "timezone": "America/Denver",
  "updatedAt": "2026-02-24T18:00:00Z"
}
```

---

### `POST /api/device/event`
Called by the clock when something notable happens: alarm fired, alarm dismissed, snooze pressed, etc.

**Headers:** `X-Device-Key: <apiKey>`

**Request body:**
```json
{
  "type": "alarm_dismissed",
  "alarmId": "alarm-1",
  "firedAt": "2026-02-25T13:30:00Z",
  "dismissedAt": "2026-02-25T13:31:42Z",
  "snoozedCount": 1
}
```

When the server receives `alarm_dismissed`, it can:
- Automatically open the Jack check-in flow via a push notification to the user's phone
- Record the wake-up event in the database for analytics
- Update the user's streak

---

### `POST /api/device/heartbeat`
Called every 5 minutes to prove the device is online. Used to show "Connected" vs "Offline" status in the app.

**Headers:** `X-Device-Key: <apiKey>`

**Request body:** `{ "uptime": 86400, "wifiRssi": -62 }`

---

## 6. Firmware Responsibilities (ESP32 Side)

The firmware running on the ESP32 needs to handle the following:

| Responsibility | Implementation |
|---|---|
| Keep accurate time | Sync with NTP server on boot and every 24 hours |
| Store WiFi credentials | ESP32 NVS (Non-Volatile Storage) flash |
| Store API key | ESP32 NVS flash |
| Poll schedule | HTTPS GET every hour using `esp_http_client` |
| Fire alarm at correct time | ESP32 hardware RTC alarm interrupt |
| Report events | HTTPS POST using `esp_http_client` |
| Handle no-WiFi gracefully | Use last cached schedule from NVS |
| OTA firmware updates | `esp_https_ota` library (critical for scale) |

**Recommended firmware framework:** ESP-IDF (Espressif's official framework) or Arduino with the ESP32 Arduino core. Arduino is faster to prototype; ESP-IDF gives more control for production.

---

## 7. Database Schema Additions

Two new tables are needed in the PostgreSQL database:

```sql
-- Registered physical devices
CREATE TABLE devices (
  id          SERIAL PRIMARY KEY,
  userId      INTEGER NOT NULL REFERENCES users(id),
  macAddress  VARCHAR(17) NOT NULL UNIQUE,
  apiKey      VARCHAR(64) NOT NULL UNIQUE,
  firmwareVersion VARCHAR(16),
  lastSeenAt  TIMESTAMP,
  createdAt   TIMESTAMP DEFAULT NOW()
);

-- Events reported by the device
CREATE TABLE deviceEvents (
  id          SERIAL PRIMARY KEY,
  deviceId    INTEGER NOT NULL REFERENCES devices(id),
  type        VARCHAR(32) NOT NULL,  -- 'alarm_fired', 'alarm_dismissed', 'snooze'
  alarmId     VARCHAR(64),
  firedAt     TIMESTAMP,
  dismissedAt TIMESTAMP,
  snoozedCount INTEGER DEFAULT 0,
  createdAt   TIMESTAMP DEFAULT NOW()
);
```

---

## 8. Push Notification Trigger

When the server receives an `alarm_dismissed` event, it should immediately send a push notification to the user's phone:

> **"Good morning! Time to check in 🌅"**
> *Tap to rate your habits for today.*

This creates the seamless experience: the physical clock wakes the user up, and the Jack app is already open and ready for the check-in by the time they pick up their phone. This is the core product loop.

---

## 9. Security Considerations

At scale, security is non-negotiable. Key practices to implement:

1. **HTTPS only** — The ESP32 `esp_http_client` supports TLS. Never send the API key over plain HTTP.
2. **Per-device API keys** — Each clock gets a unique, randomly generated 256-bit key. If one device is compromised, others are unaffected.
3. **One-time pairing tokens** — The `deviceToken` used during setup expires after 10 minutes and can only be used once.
4. **Rate limiting** — The `/api/device/event` endpoint should be rate-limited to prevent a buggy firmware from flooding the server.
5. **OTA signing** — Firmware updates should be signed so the device only accepts updates from you.

---

## 10. Development Roadmap

| Phase | What to build | Estimated effort |
|---|---|---|
| **Phase 1 — Foundation** | 4 REST endpoints + DB schema + ESP32 prototype firmware | 2–3 weeks |
| **Phase 2 — App UI** | "Connect a Clock" setup wizard in the Jack app | 1 week |
| **Phase 3 — Push trigger** | Auto-open check-in when alarm is dismissed | 2 days |
| **Phase 4 — Real-time control** | MQTT broker + snooze/cancel from app | 1–2 weeks |
| **Phase 5 — OTA updates** | Signed firmware update delivery system | 1 week |
| **Phase 6 — Production hardware** | PCB design, enclosure, FCC/CE certification | 2–4 months |

---

## 11. Recommended Tools and Services

| Tool | Purpose | Cost |
|---|---|---|
| **ESP32-S3 DevKit** | Prototype hardware | ~$10 |
| **Arduino IDE / PlatformIO** | Firmware development | Free |
| **HiveMQ Cloud** | MQTT broker (Phase 2) | Free up to 100 devices |
| **Let's Encrypt** | TLS certificate for your server | Free |
| **Expo Notifications** | Push notifications to the app | Free (via FCM/APNs) |
| **JLCPCB** | PCB manufacturing at scale | ~$2/board at volume |

---

*Document version 1.0 — Jack Hardware Integration Architecture*
