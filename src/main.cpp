/**
 * Jack Alarm Clock — CrowPanel ESP32-S3 Firmware
 *
 * Connects to the Jack app backend at https://api.jackalarm.com
 *
 * Flow:
 *   1. Boot → if no saved WiFi credentials, show on-panel WiFi Setup screen
 *      a. Scan networks → scrollable list of SSIDs
 *      b. Tap an SSID → password entry screen (on-screen keyboard)
 *      c. Tap Connect → tries to connect; shows status; retries or proceeds
 *   2. WiFi connected → NTP sync → Mountain Time (auto DST)
 *   3. NVS check → if no API key, show Pairing screen
 *   4. Pairing screen → user enters 6-char PIN from the Jack app
 *   5. POST /api/device/register → receive API key, save to NVS
 *   6. Clock face → shows time, date, WiFi, next alarm
 *   7. Every 5 min → GET /api/device/schedule (alarm + habits)
 *   8. Every 5 min → POST /api/device/heartbeat (re-fetch if needsSync)
 *   9. At alarm time → Alarm popup (Snooze / Dismiss)
 *  10. After Dismiss → Check-in screen (red/yellow/green per habit)
 *  11. After Done → POST /api/device/checkin, return to clock face
 */

#include "pins_config.h"
#include "LovyanGFX_Driver.h"

#include <Arduino.h>
#include <lvgl.h>
#include <SPI.h>
#include <Wire.h>
#include <stdbool.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <time.h>

// ─── Custom fonts ────────────────────────────────────────────────────────────────
LV_FONT_DECLARE(montserrat_light_120);  // 120pt thin digits for clock time
LV_FONT_DECLARE(montserrat_light_36);   // 36pt thin for AM/PM, date, alarms

// ─── Server config ─────────────────────────────────────────────────────────────
// Jason2866/IDF53 strips mbedTLS SSL so HTTPS is not possible on-device.
// Requests go via a Cloudflare Worker proxy over plain HTTP.
// The Worker forwards them to https://api.jackalarm.com server-side.
#define API_BASE_URL   "http://jack-device-proxy.steve-137.workers.dev"
#define NTP_SERVER     "pool.ntp.org"
#define TZ_OFFSET_SEC  (-7 * 3600)   // Mountain Standard Time (UTC-7)
#define TZ_DST_SEC     3600          // 1 hour DST

// ─── NVS keys ──────────────────────────────────────────────────────────────────
#define NVS_NAMESPACE       "jack"
#define NVS_KEY_APIKEY      "apiKey"
#define NVS_KEY_WIFI_SSID   "wifiSsid"
#define NVS_KEY_WIFI_PASS   "wifiPass"
#define NVS_KEY_SCHEDULE    "schedule"   // cached JSON from last successful fetch
#define NVS_KEY_THEME       "theme"      // selected clock face theme (0/1/2)

/// ─── PCF8563 RTC ──────────────────────────────────────────────────────────────────
// PCF8563 real-time clock at I2C 0x51 (backed by CR1220 coin cell)
// Register map (BCD-encoded):
//   0x00 = control/status 1
//   0x01 = control/status 2
//   0x02 = seconds   (bit7 = VL flag, bits 6-0 = BCD seconds)
//   0x03 = minutes   (bits 6-0 = BCD minutes)
//   0x04 = hours     (bits 5-0 = BCD hours, 24h)
//   0x05 = days      (bits 5-0 = BCD day-of-month)
//   0x06 = weekdays  (bits 2-0 = weekday 0=Sun)
//   0x07 = months    (bit7 = century, bits 4-0 = BCD month)
//   0x08 = years     (bits 7-0 = BCD year 00-99, offset from 2000)
#define PCF8563_ADDR  0x51

// ─── Timing ──────────────────────────────────────────────────────────────────
#define POLL_INTERVAL_MS   (5UL * 60UL * 1000UL)   // 5 minutes
#define CLOCK_UPDATE_MS    1000                      // 1 second

// ─── Hardware ──────────────────────────────────────────────────────────────────
#include <TCA9534.h>
TCA9534 ioex;
LGFX gfx;

static lv_disp_draw_buf_t draw_buf;
static lv_color_t *buf;
static lv_color_t *buf1;
uint16_t touch_x, touch_y;

// ─── App state ─────────────────────────────────────────────────────────────────
Preferences prefs;
String g_apiKey = "";

struct AlarmEntry {
  String id;
  int    hour;
  int    minute;
  int    daysOfWeek[7];
  int    daysCount;
  bool   enabled;
  String meditationId;  // post-alarm routine: "meditation"|"breathwork"|"visualization"|"priming"|"journaling"|"" 
};

struct HabitEntry {
  String id;
  String name;
  String category;
};

#define MAX_ALARMS  8
#define MAX_HABITS  16
AlarmEntry g_alarms[MAX_ALARMS];
int        g_alarmCount = 0;
HabitEntry g_habits[MAX_HABITS];
int        g_habitCount = 0;

// Ratings for check-in: 0=unrated, 1=red, 2=yellow, 3=green
int g_ratings[MAX_HABITS];

// Which alarm fired
int  g_firedAlarmIdx = -1;
bool g_alarmFired    = false;
bool g_inCheckin     = false;
int  g_snoozeCount   = 0;

unsigned long g_lastPoll      = 0;
unsigned long g_lastHeartbeat = 0;
unsigned long g_lastClockUpd  = 0;

// ─── WiFi setup state ──────────────────────────────────────────────────────────
#define MAX_NETWORKS 20
static char   g_ssidList[MAX_NETWORKS][33]; // 32 chars + null
static int    g_rssiList[MAX_NETWORKS];
static int    g_networkCount = 0;
static char   g_selectedSsid[33] = "";

// ─── LVGL objects ──────────────────────────────────────────────────────────────
// WiFi setup screens
lv_obj_t *scr_wifi_scan    = nullptr;  // network list
lv_obj_t *lbl_scan_status  = nullptr;
lv_obj_t *list_networks    = nullptr;
lv_obj_t *scr_wifi_pass    = nullptr;  // password entry
lv_obj_t *lbl_ssid_title   = nullptr;
lv_obj_t *ta_password      = nullptr;
lv_obj_t *kb_password      = nullptr;
lv_obj_t *lbl_wifi_status  = nullptr;

// Clock face
lv_obj_t *scr_clock    = nullptr;
lv_obj_t *lbl_time     = nullptr;
lv_obj_t *lbl_ampm     = nullptr;
lv_obj_t *lbl_date     = nullptr;
lv_obj_t *lbl_wifi     = nullptr;
lv_obj_t *lbl_alarm1   = nullptr;   // bottom-left alarm
lv_obj_t *lbl_alarm2   = nullptr;   // bottom-right alarm (2nd alarm if present)

// Theme
#define THEME_MINIMAL  0
#define THEME_LED      1
#define THEME_WARM     2
#define THEME_RED      3
#define THEME_COUNT    4
int g_theme = THEME_MINIMAL;   // default

// Brightness (0=max, 245=off on this backlight controller)
// We store as 0-100% and map to 0-245 inverted
#define NVS_KEY_BRIGHTNESS  "brightness"
int g_brightness = 100;  // 100% = full brightness

// Long-press detection for theme cycling
static unsigned long g_pressStart = 0;
static bool          g_pressing   = false;

// Pairing screen
lv_obj_t *scr_pair    = nullptr;
lv_obj_t *lbl_pin     = nullptr;
lv_obj_t *ta_pin      = nullptr;
lv_obj_t *kb_pin      = nullptr;
lv_obj_t *lbl_status  = nullptr;

// Alarm popup
lv_obj_t *scr_alarm    = nullptr;
lv_obj_t *lbl_alm_time = nullptr;

// Check-in screen
lv_obj_t *scr_checkin = nullptr;
lv_obj_t *cont_habits = nullptr;

// ─── Forward declarations ───────────────────────────────────────────────────────
void buildWifiScanScreen();
void buildWifiPassScreen();
void buildClockScreen();
void buildPairingScreen();
void buildAlarmScreen();
void buildCheckinScreen();
void showWifiScanScreen();
void showWifiPassScreen(const char *ssid);
void showClockScreen();
void showPairingScreen();
void showAlarmScreen(int alarmIdx);
void showCheckinScreen();
void updateClockLabel();
void fetchSchedule();
void sendHeartbeat();
void sendEvent(const char *type, const char *alarmId, time_t firedAt, time_t dismissedAt, int snoozedCount);
void submitCheckin();
bool registerDevice(const char *token);
String nextAlarmString();
bool alarmShouldFire(int idx, struct tm *t);
void doPostWifiConnect();
void parseScheduleJson(const String &json);
void updateAlarmLabels();
int  loadTheme();
void saveTheme(int theme);
void setBrightness(int pct);
void saveBrightness(int pct);
int  loadBrightness();
void buzzerOn();
void buzzerOff();
void showCelebrationScreen();
void showMorningRoutineScreen(const String &meditationId);
static void showMorePanel();
bool rtcRead(struct tm *t);   // read PCF8563 -> struct tm (local time)
void rtcWrite(const struct tm *t); // write struct tm (local time) -> PCF8563
void rtcApplyToSystem();      // read RTC and set ESP32 system clock

// ─── Display flush ─────────────────────────────────────────────────────────────
void my_disp_flush(lv_disp_drv_t *disp, const lv_area_t *area, lv_color_t *color_p) {
  if (gfx.getStartCount() > 0) gfx.endWrite();
  gfx.pushImageDMA(area->x1, area->y1, area->x2 - area->x1 + 1, area->y2 - area->y1 + 1,
                   (lgfx::rgb565_t *)&color_p->full);
  lv_disp_flush_ready(disp);
}

// ─── Touch read ────────────────────────────────────────────────────────────────
void my_touchpad_read(lv_indev_drv_t *indev_driver, lv_indev_data_t *data) {
  data->state = LV_INDEV_STATE_REL;
  bool touched = gfx.getTouch(&touch_x, &touch_y);
  if (touched) {
    data->state   = LV_INDEV_STATE_PR;
    data->point.x = touch_x;
    data->point.y = touch_y;
  }
}

// ─── I2C helpers ───────────────────────────────────────────────────────────────
bool i2cScanForAddress(uint8_t address) {
  Wire.beginTransmission(address);
  return (Wire.endTransmission() == 0);
}

void sendI2CCommand(uint8_t command) {
  Wire.beginTransmission(0x30);
  Wire.write(command);
  Wire.endTransmission();
}

// ─── PCF8563 RTC helpers ──────────────────────────────────────────────────────────────────
static uint8_t bcd2dec(uint8_t b) { return (b >> 4) * 10 + (b & 0x0F); }
static uint8_t dec2bcd(uint8_t d) { return ((d / 10) << 4) | (d % 10); }

// Read PCF8563 and populate a struct tm in LOCAL time.
// Returns true if the VL (Voltage Low) flag is NOT set (time is valid).
bool rtcRead(struct tm *t) {
  Wire.beginTransmission(PCF8563_ADDR);
  Wire.write(0x02);  // start at seconds register
  if (Wire.endTransmission(false) != 0) {
    Serial.println("[RTC] read: I2C error");
    return false;
  }
  Wire.requestFrom((uint8_t)PCF8563_ADDR, (uint8_t)7);
  if (Wire.available() < 7) {
    Serial.println("[RTC] read: short response");
    return false;
  }
  uint8_t sec_raw = Wire.read();  // reg 0x02
  uint8_t min_raw = Wire.read();  // reg 0x03
  uint8_t hr_raw  = Wire.read();  // reg 0x04
  uint8_t day_raw = Wire.read();  // reg 0x05
  uint8_t wday    = Wire.read();  // reg 0x06
  uint8_t mon_raw = Wire.read();  // reg 0x07
  uint8_t yr_raw  = Wire.read();  // reg 0x08

  bool vl = (sec_raw & 0x80) != 0;  // voltage-low flag = time unreliable
  memset(t, 0, sizeof(struct tm));
  t->tm_sec  = bcd2dec(sec_raw & 0x7F);
  t->tm_min  = bcd2dec(min_raw & 0x7F);
  t->tm_hour = bcd2dec(hr_raw  & 0x3F);
  t->tm_mday = bcd2dec(day_raw & 0x3F);
  t->tm_wday = wday & 0x07;
  t->tm_mon  = bcd2dec(mon_raw & 0x1F) - 1;  // tm_mon is 0-based
  t->tm_year = bcd2dec(yr_raw) + 100;         // years since 1900; PCF stores 00-99 = 2000-2099
  t->tm_isdst = -1;
  mktime(t);  // normalise and fill tm_yday etc.

  Serial.printf("[RTC] read: %04d-%02d-%02d %02d:%02d:%02d VL=%d\n",
    t->tm_year + 1900, t->tm_mon + 1, t->tm_mday,
    t->tm_hour, t->tm_min, t->tm_sec, vl);
  return !vl;
}

// Write a struct tm (LOCAL time) to the PCF8563.
void rtcWrite(const struct tm *t) {
  Wire.beginTransmission(PCF8563_ADDR);
  Wire.write(0x02);                          // start at seconds register
  Wire.write(dec2bcd(t->tm_sec)  & 0x7F);   // clear VL flag
  Wire.write(dec2bcd(t->tm_min)  & 0x7F);
  Wire.write(dec2bcd(t->tm_hour) & 0x3F);
  Wire.write(dec2bcd(t->tm_mday) & 0x3F);
  Wire.write(t->tm_wday & 0x07);
  Wire.write(dec2bcd(t->tm_mon + 1) & 0x1F); // tm_mon is 0-based
  Wire.write(dec2bcd(t->tm_year - 100));      // store 00-99
  uint8_t err = Wire.endTransmission();
  if (err != 0) Serial.printf("[RTC] write error: %d\n", err);
  else Serial.printf("[RTC] wrote: %04d-%02d-%02d %02d:%02d:%02d\n",
    t->tm_year + 1900, t->tm_mon + 1, t->tm_mday,
    t->tm_hour, t->tm_min, t->tm_sec);
}

// Read the PCF8563 and set the ESP32 system clock from it.
// Uses the TZ_OFFSET_SEC / TZ_DST_SEC already configured by configTime().
// If the RTC has never been set (VL flag), the system clock is left at epoch.
void rtcApplyToSystem() {
  struct tm t;
  if (!rtcRead(&t)) {
    Serial.println("[RTC] VL flag set — time not reliable, skipping system clock set");
    return;
  }
  // Convert local tm -> UTC time_t, then set system clock
  // mktime() treats the tm as LOCAL time (respecting the TZ set by configTime)
  // but configTime hasn't been called yet at boot, so we apply the offset manually.
  time_t local_epoch = mktime(&t);
  // Subtract the fixed UTC offset to get UTC epoch
  // (TZ_DST_SEC is added when DST is active; we use TZ_OFFSET_SEC + TZ_DST_SEC = MDT = -6h)
  // For simplicity, apply the combined offset that configTime would use:
  time_t utc_epoch = local_epoch - TZ_OFFSET_SEC - TZ_DST_SEC;
  struct timeval tv = { .tv_sec = utc_epoch, .tv_usec = 0 };
  settimeofday(&tv, nullptr);
  // Also call configTime so localtime_r() applies the correct TZ going forward
  configTime(TZ_OFFSET_SEC, TZ_DST_SEC, NTP_SERVER);
  Serial.printf("[RTC] system clock set to UTC epoch %ld\n", (long)utc_epoch);
}

// ─── NVS helpers ──────────────────────────────────────────────────────────────────
void loadApiKey() {
  prefs.begin(NVS_NAMESPACE, true);
  g_apiKey = prefs.getString(NVS_KEY_APIKEY, "");
  prefs.end();
  Serial.printf("[NVS] apiKey loaded: %s\n", g_apiKey.isEmpty() ? "(none)" : "(set)");
}

void saveApiKey(const String &key) {
  prefs.begin(NVS_NAMESPACE, false);
  prefs.putString(NVS_KEY_APIKEY, key);
  prefs.end();
  g_apiKey = key;
  Serial.println("[NVS] apiKey saved");
}

void clearApiKey() {
  prefs.begin(NVS_NAMESPACE, false);
  prefs.remove(NVS_KEY_APIKEY);
  prefs.end();
  g_apiKey = "";
  Serial.println("[NVS] apiKey cleared");
}

void saveWifiCredentials(const char *ssid, const char *pass) {
  prefs.begin(NVS_NAMESPACE, false);
  prefs.putString(NVS_KEY_WIFI_SSID, ssid);
  prefs.putString(NVS_KEY_WIFI_PASS, pass);
  prefs.end();
  Serial.printf("[NVS] WiFi credentials saved for: %s\n", ssid);
}

bool loadWifiCredentials(String &ssid, String &pass) {
  prefs.begin(NVS_NAMESPACE, true);
  ssid = prefs.getString(NVS_KEY_WIFI_SSID, "");
  pass = prefs.getString(NVS_KEY_WIFI_PASS, "");
  prefs.end();
  return !ssid.isEmpty();
}

void saveScheduleCache(const String &json) {
  prefs.begin(NVS_NAMESPACE, false);
  prefs.putString(NVS_KEY_SCHEDULE, json);
  prefs.end();
  Serial.println("[NVS] schedule cached");
}

String loadScheduleCache() {
  prefs.begin(NVS_NAMESPACE, true);
  String s = prefs.getString(NVS_KEY_SCHEDULE, "");
  prefs.end();
  return s;
}

void saveTheme(int t) {
  prefs.begin(NVS_NAMESPACE, false);
  prefs.putInt(NVS_KEY_THEME, t);
  prefs.end();
}

int loadTheme() {
  prefs.begin(NVS_NAMESPACE, true);
  int t = prefs.getInt(NVS_KEY_THEME, THEME_MINIMAL);
  prefs.end();
  return t;
}

// ─── Brightness control ───────────────────────────────────────────────────────
// Backlight controller is an STC8H1K28 MCU at I2C 0x30.
// It accepts 6 discrete levels: 0x05 = off, 0x06..0x0F = dim..bright, 0x10 = max.
// We expose 0-100% to the user and map to one of these 6 steps.
void setBrightness(int pct) {
  pct = constrain(pct, 0, 100);
  g_brightness = pct;
  // Map 0-100% to 6 levels: 0%=0x05(off), 1-20%=0x06, 21-40%=0x08, 41-60%=0x0A, 61-80%=0x0C, 81-100%=0x10
  uint8_t val;
  if      (pct == 0)   val = 0x05;  // off
  else if (pct <= 20)  val = 0x06;  // very dim
  else if (pct <= 40)  val = 0x08;  // dim
  else if (pct <= 60)  val = 0x0A;  // medium
  else if (pct <= 80)  val = 0x0C;  // bright
  else                 val = 0x10;  // max
  Wire.beginTransmission(0x30);
  Wire.write(val);
  Wire.endTransmission();
  Serial.printf("[BL] brightness %d%% -> I2C 0x%02X\n", pct, val);
}

// ─── Buzzer control ──────────────────────────────────────────────────────────
// Buzzer is controlled by the same STC8H1K28 MCU at I2C 0x30.
// 0x15 = buzzer ON, 0x16 = buzzer OFF
static bool g_buzzerOn = false;

void buzzerOn() {
  if (g_buzzerOn) return;
  g_buzzerOn = true;
  Wire.beginTransmission(0x30);
  Wire.write(0x15);
  Wire.endTransmission();
  Serial.println("[BUZ] ON");
}

void buzzerOff() {
  if (!g_buzzerOn) return;
  g_buzzerOn = false;
  Wire.beginTransmission(0x30);
  Wire.write(0x16);
  Wire.endTransmission();
  Serial.println("[BUZ] OFF");
}

void saveBrightness(int pct) {
  prefs.begin(NVS_NAMESPACE, false);
  prefs.putInt(NVS_KEY_BRIGHTNESS, pct);
  prefs.end();
}

int loadBrightness() {
  prefs.begin(NVS_NAMESPACE, true);
  int b = prefs.getInt(NVS_KEY_BRIGHTNESS, 100);
  prefs.end();
  return b;
}

// ─── HTTP helpers ──────────────────────────────────────────────────────────────
// Uses plain HTTP to a proxy endpoint on the server. The proxy forwards
// requests to the real HTTPS API. Jason2866/IDF53 strips the mbedTLS SSL
// handshake layer so HTTPS is not possible directly from the device.
String httpGet(const String &path) {
  if (WiFi.status() != WL_CONNECTED) return "";
  HTTPClient http;
  http.begin(String(API_BASE_URL) + path);
  http.addHeader("X-Device-Key", g_apiKey);
  http.setTimeout(10000);
  int code = http.GET();
  String body = (code > 0) ? http.getString() : "";
  http.end();
  Serial.printf("[HTTP] GET %s -> %d\n", path.c_str(), code);
  return body;
}

String httpPost(const String &path, const String &payload, bool withAuth = true) {
  if (WiFi.status() != WL_CONNECTED) return "";
  HTTPClient http;
  http.begin(String(API_BASE_URL) + path);
  http.addHeader("Content-Type", "application/json");
  if (withAuth) http.addHeader("X-Device-Key", g_apiKey);
  http.setTimeout(10000);
  int code = http.POST(payload);
  String body = (code > 0) ? http.getString() : "";
  http.end();
  Serial.printf("[HTTP] POST %s -> %d\n", path.c_str(), code);
  return body;
}

// ─── Device registration ───────────────────────────────────────────────────────
bool registerDevice(const char *token) {
  String mac = WiFi.macAddress();
  StaticJsonDocument<256> doc;
  doc["pairingToken"]    = token;
  doc["macAddress"]      = mac;
  doc["firmwareVersion"] = "2.0.0";
  String payload;
  serializeJson(doc, payload);

  String resp = httpPost("/api/device/register", payload, false);
  if (resp.isEmpty()) return false;

  StaticJsonDocument<256> res;
  if (deserializeJson(res, resp)) return false;
  if (!res.containsKey("apiKey")) return false;

  saveApiKey(res["apiKey"].as<String>());
  return true;
}

// ─── Schedule parse (shared by fetch and cache load) ──────────────────────────────────────────────
void parseScheduleJson(const String &resp) {
  // Use DynamicJsonDocument so 16 habits + alarms always fit
  DynamicJsonDocument doc(8192);
  DeserializationError err = deserializeJson(doc, resp);
  if (err) {
    Serial.printf("[schedule] JSON parse error: %s\n", err.c_str());
    return;
  }
  // If the server returned an error object (e.g. {"error":"..."}) don't wipe state
  if (doc.containsKey("error") && !doc.containsKey("alarms")) {
    Serial.printf("[schedule] server error: %s\n", doc["error"].as<const char*>());
    return;
  }

  // Parse alarms
  g_alarmCount = 0;
  JsonArray alarms = doc["alarms"].as<JsonArray>();
  for (JsonObject a : alarms) {
    if (g_alarmCount >= MAX_ALARMS) break;
    AlarmEntry &e = g_alarms[g_alarmCount];
    e.id          = a["id"].as<String>();
    e.hour        = a["hour"]   | 9;
    e.minute      = a["minute"] | 0;
    e.enabled     = a["enabled"] | true;
    e.meditationId = a["meditationId"].isNull() ? "" : a["meditationId"].as<String>();
    e.daysCount = 0;
    JsonArray days = a["daysOfWeek"].as<JsonArray>();
    for (int d : days) {
      if (e.daysCount < 7) e.daysOfWeek[e.daysCount++] = d;
    }
    // Debug: print alarm details
    Serial.printf("[alarm] %02d:%02d enabled=%d days=", e.hour, e.minute, e.enabled);
    for (int i = 0; i < e.daysCount; i++) Serial.printf("%d ", e.daysOfWeek[i]);
    Serial.println();
    g_alarmCount++;
  }

  // Parse habits
  g_habitCount = 0;
  JsonArray habits = doc["habits"].as<JsonArray>();
  for (JsonObject h : habits) {
    if (g_habitCount >= MAX_HABITS) break;
    g_habits[g_habitCount].id       = h["id"].as<String>();
    g_habits[g_habitCount].name     = h["name"].as<String>();
    g_habits[g_habitCount].category = h["category"].as<String>();
    g_habitCount++;
  }

  Serial.printf("[schedule] %d alarms, %d habits\n", g_alarmCount, g_habitCount);

  // Refresh alarm labels on clock face
  updateAlarmLabels();
}

// ─── Schedule fetch ──────────────────────────────────────────────────────────────
void fetchSchedule() {
  String resp = httpGet("/api/device/schedule");
  if (resp.isEmpty()) {
    // Offline — try to use the cached schedule from last successful fetch
    String cached = loadScheduleCache();
    if (!cached.isEmpty()) {
      Serial.println("[schedule] offline, using cached schedule");
      parseScheduleJson(cached);
    }
    return;
  }
  // Save to NVS so we can use it offline on next boot
  saveScheduleCache(resp);
  parseScheduleJson(resp);
}

// ─── Heartbeat ─────────────────────────────────────────────────────────────────
void sendHeartbeat() {
  StaticJsonDocument<128> doc;
  doc["uptime"]   = (unsigned long)(millis() / 1000);
  doc["wifiRssi"] = WiFi.RSSI();
  String payload;
  serializeJson(doc, payload);

  String resp = httpPost("/api/device/heartbeat", payload);
  if (resp.isEmpty()) return;

  StaticJsonDocument<256> res;
  if (deserializeJson(res, resp)) return;

  bool needsSync = res["needsSync"] | false;
  if (needsSync) {
    Serial.println("[heartbeat] needsSync=true, re-fetching schedule");
    fetchSchedule();
  }
}

// ─── Event reporting ───────────────────────────────────────────────────────────
void sendEvent(const char *type, const char *alarmId, time_t firedAt, time_t dismissedAt, int snoozedCount) {
  StaticJsonDocument<256> doc;
  doc["type"]         = type;
  doc["alarmId"]      = alarmId;
  doc["snoozedCount"] = snoozedCount;
  char tbuf[32];
  if (firedAt > 0) {
    struct tm t; gmtime_r(&firedAt, &t);
    strftime(tbuf, sizeof(tbuf), "%Y-%m-%dT%H:%M:%SZ", &t);
    doc["firedAt"] = tbuf;
  }
  if (dismissedAt > 0) {
    struct tm t; gmtime_r(&dismissedAt, &t);
    strftime(tbuf, sizeof(tbuf), "%Y-%m-%dT%H:%M:%SZ", &t);
    doc["dismissedAt"] = tbuf;
  }
  String payload;
  serializeJson(doc, payload);
  httpPost("/api/device/event", payload);
}

// ─── Check-in submit ───────────────────────────────────────────────────────────
void submitCheckin() {
  // Build date string YYYY-MM-DD for yesterday
  time_t now = time(nullptr);
  time_t yesterday = now - 86400;
  struct tm t; localtime_r(&yesterday, &t);
  char dateStr[12];
  strftime(dateStr, sizeof(dateStr), "%Y-%m-%d", &t);

  StaticJsonDocument<1024> doc;
  doc["date"] = dateStr;
  JsonObject ratings = doc.createNestedObject("ratings");
  const char *ratingNames[] = { "", "red", "yellow", "green" };
  for (int i = 0; i < g_habitCount; i++) {
    int r = g_ratings[i];
    if (r >= 1 && r <= 3) {
      ratings[g_habits[i].id] = ratingNames[r];
    }
  }
  String payload;
  serializeJson(doc, payload);
  httpPost("/api/device/checkin", payload);
  Serial.println("[checkin] submitted");
}

// ─── Alarm helpers ─────────────────────────────────────────────────────────────
bool alarmShouldFire(int idx, struct tm *t) {
  if (idx < 0 || idx >= g_alarmCount) return false;
  AlarmEntry &a = g_alarms[idx];
  if (!a.enabled) return false;
  if (t->tm_hour != a.hour || t->tm_min != a.minute || t->tm_sec != 0) return false;
  for (int i = 0; i < a.daysCount; i++) {
    if (a.daysOfWeek[i] == t->tm_wday) return true;
  }
  return false;
}

// Format a single alarm entry as "7:30 AM"
String alarmString(int idx) {
  if (idx < 0 || idx >= g_alarmCount) return "";
  int h = g_alarms[idx].hour;
  int m = g_alarms[idx].minute;
  bool pm = h >= 12;
  int h12 = h % 12; if (h12 == 0) h12 = 12;
  char tbuf[16];
  snprintf(tbuf, sizeof(tbuf), "%d:%02d %s", h12, m, pm ? "PM" : "AM");
  return String(tbuf);
}

// Update both bottom alarm labels on the clock face
void updateAlarmLabels() {
  if (!lbl_alarm1) return;

  // Show up to 2 alarms — all alarms shown, enabled ones bright, disabled ones with (off) suffix
  // This ensures the label is never blank just because enabled=false
  int found[2] = { -1, -1 };
  int fc = 0;
  for (int i = 0; i < g_alarmCount && fc < 2; i++) {
    found[fc++] = i;  // show all, not just enabled
  }

  // Alarm 1 — bottom-left
  if (found[0] >= 0) {
    String s = alarmString(found[0]);
    if (!g_alarms[found[0]].enabled) s += " (off)";
    lv_label_set_text(lbl_alarm1, s.c_str());
    Serial.printf("[alarm label] set to: %s\n", s.c_str());
  } else {
    // Show placeholder so we can confirm the label position renders correctly
    lv_label_set_text(lbl_alarm1, "No alarm");
    Serial.println("[alarm label] no alarms — showing placeholder");
  }

  // Alarm 2 — only if a second alarm exists
  if (lbl_alarm2) {
    if (found[1] >= 0) {
      String s = alarmString(found[1]);
      if (!g_alarms[found[1]].enabled) s += " (off)";
      lv_label_set_text(lbl_alarm2, s.c_str());
      lv_obj_clear_flag(lbl_alarm2, LV_OBJ_FLAG_HIDDEN);
    } else {
      lv_obj_add_flag(lbl_alarm2, LV_OBJ_FLAG_HIDDEN);
    }
  }
}

// Legacy helper kept for compatibility
String nextAlarmString() {
  return (g_alarmCount > 0 && g_alarms[0].enabled) ? alarmString(0) : "No alarm";
}

// ─── Post-WiFi-connect actions (NTP + pairing/clock) ──────────────────────────
void doPostWifiConnect() {
  Serial.printf("[WiFi] Connected: %s\n", WiFi.localIP().toString().c_str());

  // Update WiFi label on clock screen if already built
  if (lbl_wifi) lv_label_set_text(lbl_wifi, "WiFi");

  // NTP sync
  configTime(TZ_OFFSET_SEC, TZ_DST_SEC, NTP_SERVER);
  Serial.println("[NTP] Syncing...");
  time_t now = 0;
  for (int i = 0; i < 20 && now < 1000000000; i++) { delay(500); now = time(nullptr); }
  Serial.printf("[NTP] Time: %ld\n", now);

  // Write NTP-synced time to the PCF8563 RTC so it survives power loss
  if (now > 1000000000) {
    struct tm t;
    localtime_r(&now, &t);
    rtcWrite(&t);
  }

  // Load NVS API key
  loadApiKey();

  if (g_apiKey.isEmpty()) {
    showPairingScreen();
  } else {
    fetchSchedule();
    showClockScreen();
  }

  g_lastPoll      = millis();
  g_lastHeartbeat = millis();
  g_lastClockUpd  = millis();
}

// ─── WiFi scan screen ──────────────────────────────────────────────────────────
static void cb_network_selected(lv_event_t *e) {
  lv_obj_t *btn = lv_event_get_target(e);
  const char *ssid = (const char *)lv_event_get_user_data(e);
  if (!ssid) return;
  strncpy(g_selectedSsid, ssid, 32);
  g_selectedSsid[32] = '\0';
  showWifiPassScreen(g_selectedSsid);
}

static void cb_rescan(lv_event_t *e) {
  showWifiScanScreen();
}

void buildWifiScanScreen() {
  if (scr_wifi_scan) {
    lv_obj_del(scr_wifi_scan);
    scr_wifi_scan = nullptr;
  }

  scr_wifi_scan = lv_obj_create(nullptr);
  lv_obj_set_style_bg_color(scr_wifi_scan, lv_color_hex(0x0D0D1A), LV_PART_MAIN);
  lv_obj_clear_flag(scr_wifi_scan, LV_OBJ_FLAG_SCROLLABLE);

  // Title
  lv_obj_t *title = lv_label_create(scr_wifi_scan);
  lv_obj_set_style_text_font(title, &lv_font_montserrat_28, LV_PART_MAIN);
  lv_obj_set_style_text_color(title, lv_color_hex(0xEEEEFF), LV_PART_MAIN);
  lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 14);
  lv_label_set_text(title, "Connect to WiFi");

  // Status label
  lbl_scan_status = lv_label_create(scr_wifi_scan);
  lv_obj_set_style_text_font(lbl_scan_status, &lv_font_montserrat_16, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_scan_status, lv_color_hex(0x9090B8), LV_PART_MAIN);
  lv_obj_align(lbl_scan_status, LV_ALIGN_TOP_MID, 0, 52);
  lv_label_set_text(lbl_scan_status, "Tap a network to connect");

  // Scrollable list container
  list_networks = lv_list_create(scr_wifi_scan);
  lv_obj_set_size(list_networks, LCD_H_RES - 40, LCD_V_RES - 130);
  lv_obj_align(list_networks, LV_ALIGN_TOP_MID, 0, 80);
  lv_obj_set_style_bg_color(list_networks, lv_color_hex(0x0D0D1A), LV_PART_MAIN);
  lv_obj_set_style_border_width(list_networks, 0, LV_PART_MAIN);

  // Populate network list
  for (int i = 0; i < g_networkCount; i++) {
    // Build label: SSID + signal strength
    char label[48];
    int rssi = g_rssiList[i];
    const char *sig = (rssi >= -60) ? " (Strong)" : (rssi >= -75) ? " (Good)" : " (Weak)";
    snprintf(label, sizeof(label), "%s%s", g_ssidList[i], sig);

    lv_obj_t *btn = lv_list_add_btn(list_networks, LV_SYMBOL_WIFI, label);
    lv_obj_set_style_bg_color(btn, lv_color_hex(0x1A1A2E), LV_PART_MAIN);
    lv_obj_set_style_text_color(btn, lv_color_hex(0xEEEEFF), LV_PART_MAIN);
    lv_obj_set_style_text_font(btn, &lv_font_montserrat_18, LV_PART_MAIN);
    lv_obj_set_height(btn, 52);
    // Pass pointer to the static ssid buffer
    lv_obj_add_event_cb(btn, cb_network_selected, LV_EVENT_CLICKED, (void *)g_ssidList[i]);
  }

  if (g_networkCount == 0) {
    lv_obj_t *none = lv_label_create(scr_wifi_scan);
    lv_obj_set_style_text_font(none, &lv_font_montserrat_16, LV_PART_MAIN);
    lv_obj_set_style_text_color(none, lv_color_hex(0x9090B8), LV_PART_MAIN);
    lv_obj_align(none, LV_ALIGN_CENTER, 0, 0);
    lv_label_set_text(none, "No networks found");
  }

  // Rescan button
  lv_obj_t *btnRescan = lv_btn_create(scr_wifi_scan);
  lv_obj_set_size(btnRescan, 160, 44);
  lv_obj_align(btnRescan, LV_ALIGN_BOTTOM_MID, 0, -10);
  lv_obj_set_style_bg_color(btnRescan, lv_color_hex(0x374151), LV_PART_MAIN);
  lv_obj_add_event_cb(btnRescan, cb_rescan, LV_EVENT_CLICKED, nullptr);
  lv_obj_t *lblRescan = lv_label_create(btnRescan);
  lv_label_set_text(lblRescan, LV_SYMBOL_REFRESH "  Rescan");
  lv_obj_set_style_text_font(lblRescan, &lv_font_montserrat_16, LV_PART_MAIN);
  lv_obj_center(lblRescan);
}

void showWifiScanScreen() {
  // Scan networks (blocking, brief)
  lv_timer_handler();
  Serial.println("[WiFi] Scanning...");
  int n = WiFi.scanNetworks();
  g_networkCount = 0;
  if (n > 0) {
    // Sort by RSSI descending (simple bubble sort on small list)
    // First collect into arrays
    int total = (n > MAX_NETWORKS) ? MAX_NETWORKS : n;
    for (int i = 0; i < total; i++) {
      strncpy(g_ssidList[i], WiFi.SSID(i).c_str(), 32);
      g_ssidList[i][32] = '\0';
      g_rssiList[i] = WiFi.RSSI(i);
    }
    // Bubble sort descending by RSSI
    for (int i = 0; i < total - 1; i++) {
      for (int j = 0; j < total - i - 1; j++) {
        if (g_rssiList[j] < g_rssiList[j + 1]) {
          int tmpR = g_rssiList[j]; g_rssiList[j] = g_rssiList[j+1]; g_rssiList[j+1] = tmpR;
          char tmpS[33]; memcpy(tmpS, g_ssidList[j], 33);
          memcpy(g_ssidList[j], g_ssidList[j+1], 33);
          memcpy(g_ssidList[j+1], tmpS, 33);
        }
      }
    }
    // Deduplicate SSIDs (keep strongest)
    for (int i = 0; i < total; i++) {
      if (g_ssidList[i][0] == '\0') continue; // hidden/already removed
      bool dup = false;
      for (int k = 0; k < g_networkCount; k++) {
        if (strcmp(g_ssidList[i], g_ssidList[k]) == 0) { dup = true; break; }
      }
      if (!dup) {
        strncpy(g_ssidList[g_networkCount], g_ssidList[i], 32);
        g_rssiList[g_networkCount] = g_rssiList[i];
        g_networkCount++;
      }
    }
  }
  WiFi.scanDelete();
  Serial.printf("[WiFi] Found %d unique networks\n", g_networkCount);

  buildWifiScanScreen();
  lv_disp_load_scr(scr_wifi_scan);
}

// ─── WiFi password screen ──────────────────────────────────────────────────────
static void cb_wifi_connect(lv_event_t *e) {
  const char *pass = lv_textarea_get_text(ta_password);
  if (!pass) pass = "";

  char statusBuf[64];
  snprintf(statusBuf, sizeof(statusBuf), "Connecting to %s...", g_selectedSsid);
  lv_label_set_text(lbl_wifi_status, statusBuf);
  lv_timer_handler();

  Serial.printf("[WiFi] Connecting to %s\n", g_selectedSsid);
  WiFi.begin(g_selectedSsid, pass);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    lv_timer_handler();
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    // Save credentials for future boots
    saveWifiCredentials(g_selectedSsid, pass);
    lv_label_set_text(lbl_wifi_status, "Connected! Starting up...");
    lv_timer_handler();
    delay(500);
    doPostWifiConnect();
  } else {
    WiFi.disconnect();
    lv_label_set_text(lbl_wifi_status, "Failed — check password and try again");
    Serial.println("[WiFi] Connection failed");
  }
}

static void cb_wifi_back(lv_event_t *e) {
  showWifiScanScreen();
}

void buildWifiPassScreen() {
  if (scr_wifi_pass) {
    lv_obj_del(scr_wifi_pass);
    scr_wifi_pass = nullptr;
  }

  scr_wifi_pass = lv_obj_create(nullptr);
  lv_obj_set_style_bg_color(scr_wifi_pass, lv_color_hex(0x0D0D1A), LV_PART_MAIN);
  lv_obj_clear_flag(scr_wifi_pass, LV_OBJ_FLAG_SCROLLABLE);

  // Row 1 (y=14): Title — network name
  lbl_ssid_title = lv_label_create(scr_wifi_pass);
  lv_obj_set_style_text_font(lbl_ssid_title, &lv_font_montserrat_24, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_ssid_title, lv_color_hex(0xEEEEFF), LV_PART_MAIN);
  lv_obj_align(lbl_ssid_title, LV_ALIGN_TOP_MID, 0, 14);
  char titleBuf[48];
  snprintf(titleBuf, sizeof(titleBuf), "Password for: %s", g_selectedSsid);
  lv_label_set_text(lbl_ssid_title, titleBuf);

  // Row 2 (y=56): Back button (left) + Connect button (right)
  lv_obj_t *btnBack = lv_btn_create(scr_wifi_pass);
  lv_obj_set_size(btnBack, 120, 52);
  lv_obj_align(btnBack, LV_ALIGN_TOP_LEFT, 20, 56);
  lv_obj_set_style_bg_color(btnBack, lv_color_hex(0x374151), LV_PART_MAIN);
  lv_obj_add_event_cb(btnBack, cb_wifi_back, LV_EVENT_CLICKED, nullptr);
  lv_obj_t *lblBack = lv_label_create(btnBack);
  lv_label_set_text(lblBack, LV_SYMBOL_LEFT "  Back");
  lv_obj_set_style_text_font(lblBack, &lv_font_montserrat_18, LV_PART_MAIN);
  lv_obj_center(lblBack);

  lv_obj_t *btnConnect = lv_btn_create(scr_wifi_pass);
  lv_obj_set_size(btnConnect, 200, 52);
  lv_obj_align(btnConnect, LV_ALIGN_TOP_RIGHT, -20, 56);
  lv_obj_set_style_bg_color(btnConnect, lv_color_hex(0x7B74FF), LV_PART_MAIN);
  lv_obj_add_event_cb(btnConnect, cb_wifi_connect, LV_EVENT_CLICKED, nullptr);
  lv_obj_t *lblConnect = lv_label_create(btnConnect);
  lv_label_set_text(lblConnect, "Connect");
  lv_obj_set_style_text_font(lblConnect, &lv_font_montserrat_20, LV_PART_MAIN);
  lv_obj_center(lblConnect);

  // Row 3 (y=124): Password text area — full width, below the buttons
  ta_password = lv_textarea_create(scr_wifi_pass);
  lv_textarea_set_password_mode(ta_password, true);
  lv_textarea_set_one_line(ta_password, true);
  lv_textarea_set_placeholder_text(ta_password, "Enter password");
  lv_obj_set_width(ta_password, LCD_H_RES - 40);
  lv_obj_align(ta_password, LV_ALIGN_TOP_MID, 0, 124);
  lv_obj_set_style_text_font(ta_password, &lv_font_montserrat_20, LV_PART_MAIN);

  // Row 4 (y=178): Status label
  lbl_wifi_status = lv_label_create(scr_wifi_pass);
  lv_obj_set_style_text_font(lbl_wifi_status, &lv_font_montserrat_16, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_wifi_status, lv_color_hex(0x9090B8), LV_PART_MAIN);
  lv_obj_set_width(lbl_wifi_status, LCD_H_RES - 40);
  lv_label_set_long_mode(lbl_wifi_status, LV_LABEL_LONG_WRAP);
  lv_obj_align(lbl_wifi_status, LV_ALIGN_TOP_MID, 0, 178);
  lv_label_set_text(lbl_wifi_status, "");

  // On-screen keyboard at the bottom, linked to password field
  kb_password = lv_keyboard_create(scr_wifi_pass);
  lv_keyboard_set_textarea(kb_password, ta_password);
  lv_obj_set_size(kb_password, LCD_H_RES, 220);
  lv_obj_align(kb_password, LV_ALIGN_BOTTOM_MID, 0, 0);
}

void showWifiPassScreen(const char *ssid) {
  strncpy(g_selectedSsid, ssid, 32);
  g_selectedSsid[32] = '\0';
  buildWifiPassScreen();
  lv_disp_load_scr(scr_wifi_pass);
}

// ─── Clock face ────────────────────────────────────────────────────────────────

// Forward declaration for the More/theme picker screen
static void showThemePicker();

// Helper: build the two alarm labels stacked at bottom-left
static void buildAlarmLabels(lv_color_t col) {
  lbl_alarm1 = lv_label_create(scr_clock);
  lv_obj_set_style_text_font(lbl_alarm1, &lv_font_montserrat_20, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_alarm1, col, LV_PART_MAIN);
  lv_obj_align(lbl_alarm1, LV_ALIGN_BOTTOM_LEFT, 20, -36);
  lv_label_set_text(lbl_alarm1, "");

  lbl_alarm2 = lv_label_create(scr_clock);
  lv_obj_set_style_text_font(lbl_alarm2, &lv_font_montserrat_20, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_alarm2, col, LV_PART_MAIN);
  lv_obj_align(lbl_alarm2, LV_ALIGN_BOTTOM_LEFT, 20, -12);
  lv_label_set_text(lbl_alarm2, "");
  lv_obj_add_flag(lbl_alarm2, LV_OBJ_FLAG_HIDDEN);
}

// Helper: build the WiFi icon (top-right). Shows filled icon when connected, icon+X when not.
static void buildWifiDot(lv_color_t col_on, lv_color_t col_off) {
  lbl_wifi = lv_label_create(scr_clock);
  lv_obj_set_style_text_font(lbl_wifi, &lv_font_montserrat_18, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_wifi, col_off, LV_PART_MAIN);
  lv_obj_align(lbl_wifi, LV_ALIGN_TOP_RIGHT, -16, 10);
  // Initial state: disconnected — show wifi + X
  lv_label_set_text(lbl_wifi, LV_SYMBOL_WIFI " " LV_SYMBOL_CLOSE);
}

// Helper: build the "More" plain text label at bottom-right (no box)
static void buildMoreButton(lv_color_t col) {
  lv_obj_t *lbl = lv_label_create(scr_clock);
  lv_obj_set_style_text_font(lbl, &lv_font_montserrat_16, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl, col, LV_PART_MAIN);
  lv_obj_align(lbl, LV_ALIGN_BOTTOM_RIGHT, -20, -12);
  lv_label_set_text(lbl, "More");
  // Make it tappable
  lv_obj_add_flag(lbl, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_add_event_cb(lbl, [](lv_event_t *e) {
    if (lv_event_get_code(e) == LV_EVENT_CLICKED) showMorePanel();
  }, LV_EVENT_ALL, nullptr);
}

// ── THEME 0: MINIMAL ─────────────────────────────────────────────────────────
static void buildThemeMinimal() {
  lv_obj_set_style_bg_color(scr_clock, lv_color_hex(0x000000), LV_PART_MAIN);
  buildWifiDot(lv_color_hex(0x555580), lv_color_hex(0x222230));

  lbl_date = lv_label_create(scr_clock);
  lv_obj_set_style_text_font(lbl_date, &lv_font_montserrat_14, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_date, lv_color_hex(0x333344), LV_PART_MAIN);
  lv_obj_align(lbl_date, LV_ALIGN_TOP_MID, 0, 14);
  lv_label_set_text(lbl_date, "Monday, Jan 1");

  // Time — 150pt, centred
  lbl_time = lv_label_create(scr_clock);
  lv_obj_set_style_text_font(lbl_time, &montserrat_light_120, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_time, lv_color_hex(0xFFFFFF), LV_PART_MAIN);
  lv_obj_align(lbl_time, LV_ALIGN_CENTER, 0, 0);
  lv_label_set_text(lbl_time, "9:00");

  // AM/PM — anchored to the right edge of the time label
  lbl_ampm = lv_label_create(scr_clock);
  lv_obj_set_style_text_font(lbl_ampm, &montserrat_light_36, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_ampm, lv_color_hex(0x444466), LV_PART_MAIN);
  lv_obj_align_to(lbl_ampm, lbl_time, LV_ALIGN_OUT_RIGHT_BOTTOM, 8, 0);
  lv_label_set_text(lbl_ampm, "AM");

  buildAlarmLabels(lv_color_hex(0x8888BB));
  buildMoreButton(lv_color_hex(0x8888BB));
}

// ── THEME 1: LED ──────────────────────────────────────────────────────────────
static void buildThemeLED() {
  lv_obj_set_style_bg_color(scr_clock, lv_color_hex(0x000000), LV_PART_MAIN);
  buildWifiDot(lv_color_hex(0x00CC44), lv_color_hex(0x002200));

  lbl_date = lv_label_create(scr_clock);
  lv_obj_set_style_text_font(lbl_date, &lv_font_montserrat_12, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_date, lv_color_hex(0x001100), LV_PART_MAIN);
  lv_obj_align(lbl_date, LV_ALIGN_TOP_MID, 0, 14);
  lv_label_set_text(lbl_date, "");

  lbl_time = lv_label_create(scr_clock);
  lv_obj_set_style_text_font(lbl_time, &montserrat_light_120, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_time, lv_color_hex(0x00FF55), LV_PART_MAIN);
  lv_obj_align(lbl_time, LV_ALIGN_CENTER, 0, 0);
  lv_label_set_text(lbl_time, "10:42");

  lbl_ampm = lv_label_create(scr_clock);
  lv_obj_set_style_text_font(lbl_ampm, &montserrat_light_36, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_ampm, lv_color_hex(0x008833), LV_PART_MAIN);
  lv_obj_align_to(lbl_ampm, lbl_time, LV_ALIGN_OUT_RIGHT_BOTTOM, 8, 0);
  lv_label_set_text(lbl_ampm, "AM");

  buildAlarmLabels(lv_color_hex(0x00CC77));
  buildMoreButton(lv_color_hex(0x00CC77));
}

// ── THEME 2: WARM ─────────────────────────────────────────────────────────────
static void buildThemeWarm() {
  lv_obj_set_style_bg_color(scr_clock, lv_color_hex(0x000000), LV_PART_MAIN);
  buildWifiDot(lv_color_hex(0xCC5500), lv_color_hex(0x1A0800));

  lbl_date = lv_label_create(scr_clock);
  lv_obj_set_style_text_font(lbl_date, &lv_font_montserrat_12, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_date, lv_color_hex(0x442200), LV_PART_MAIN);
  lv_obj_align(lbl_date, LV_ALIGN_TOP_MID, 0, 14);
  lv_label_set_text(lbl_date, "THURSDAY  \xE2\x80\xA2  MARCH 12");

  lbl_time = lv_label_create(scr_clock);
  lv_obj_set_style_text_font(lbl_time, &montserrat_light_120, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_time, lv_color_hex(0xFF6600), LV_PART_MAIN);
  lv_obj_align(lbl_time, LV_ALIGN_CENTER, 0, 0);
  lv_label_set_text(lbl_time, "9:10");

  lbl_ampm = lv_label_create(scr_clock);
  lv_obj_set_style_text_font(lbl_ampm, &montserrat_light_36, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_ampm, lv_color_hex(0x663300), LV_PART_MAIN);
  lv_obj_align_to(lbl_ampm, lbl_time, LV_ALIGN_OUT_RIGHT_BOTTOM, 8, 0);
  lv_label_set_text(lbl_ampm, "PM");

  buildAlarmLabels(lv_color_hex(0xCC6600));
  buildMoreButton(lv_color_hex(0xCC6600));
}

// ── THEME 3: RED ──────────────────────────────────────────────────────────────
static void buildThemeRed() {
  lv_obj_set_style_bg_color(scr_clock, lv_color_hex(0x000000), LV_PART_MAIN);
  buildWifiDot(lv_color_hex(0xFF0000), lv_color_hex(0x330000));

  lbl_date = lv_label_create(scr_clock);
  lv_obj_set_style_text_font(lbl_date, &lv_font_montserrat_14, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_date, lv_color_hex(0x550000), LV_PART_MAIN);
  lv_obj_align(lbl_date, LV_ALIGN_TOP_MID, 0, 14);
  lv_label_set_text(lbl_date, "Monday, Jan 1");

  // Time — true red
  lbl_time = lv_label_create(scr_clock);
  lv_obj_set_style_text_font(lbl_time, &montserrat_light_120, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_time, lv_color_hex(0xFF0000), LV_PART_MAIN);
  lv_obj_align(lbl_time, LV_ALIGN_CENTER, 0, 0);
  lv_label_set_text(lbl_time, "9:00");

  lbl_ampm = lv_label_create(scr_clock);
  lv_obj_set_style_text_font(lbl_ampm, &montserrat_light_36, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_ampm, lv_color_hex(0x880000), LV_PART_MAIN);
  lv_obj_align_to(lbl_ampm, lbl_time, LV_ALIGN_OUT_RIGHT_BOTTOM, 8, 0);
  lv_label_set_text(lbl_ampm, "AM");

  buildAlarmLabels(lv_color_hex(0xCC2222));
  buildMoreButton(lv_color_hex(0xCC2222));
}

// ── More panel (full-screen overlay: brightness + theme picker) ───────────────
static void showMorePanel() {
  // Full-screen dark overlay
  lv_obj_t *panel = lv_obj_create(lv_scr_act());
  lv_obj_set_size(panel, 800, 480);
  lv_obj_set_pos(panel, 0, 0);
  lv_obj_set_style_bg_color(panel, lv_color_hex(0x0A0A0A), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(panel, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_border_width(panel, 0, LV_PART_MAIN);
  lv_obj_set_style_radius(panel, 0, LV_PART_MAIN);
  lv_obj_clear_flag(panel, LV_OBJ_FLAG_SCROLLABLE);

  // ── Title ──
  lv_obj_t *title = lv_label_create(panel);
  lv_obj_set_style_text_font(title, &lv_font_montserrat_18, LV_PART_MAIN);
  lv_obj_set_style_text_color(title, lv_color_hex(0x555555), LV_PART_MAIN);
  lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 18);
  lv_label_set_text(title, "SETTINGS");

  // ── Brightness section ──
  lv_obj_t *lblBr = lv_label_create(panel);
  lv_obj_set_style_text_font(lblBr, &lv_font_montserrat_14, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblBr, lv_color_hex(0x666666), LV_PART_MAIN);
  lv_obj_align(lblBr, LV_ALIGN_TOP_LEFT, 40, 58);
  lv_label_set_text(lblBr, "BRIGHTNESS");

  // Brightness value label
  lv_obj_t *lblBrVal = lv_label_create(panel);
  lv_obj_set_style_text_font(lblBrVal, &lv_font_montserrat_14, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblBrVal, lv_color_hex(0x888888), LV_PART_MAIN);
  lv_obj_align(lblBrVal, LV_ALIGN_TOP_RIGHT, -40, 58);
  // (label text set below after computing curStep)

  // Brightness slider — 6 discrete steps matching the STC8H1K28 backlight levels
  // Step 1=very dim(0x06), 2=dim(0x08), 3=medium(0x0A), 4=bright(0x0C), 5=max(0x10)
  // We map step -> pct: 1->10, 2->30, 3->50, 4->70, 5->100
  static const int BL_STEPS = 5;
  static const int BL_PCTS[5] = { 10, 30, 50, 70, 100 };
  static const char *BL_LABELS[5] = { "Very Dim", "Dim", "Medium", "Bright", "Max" };
  // Find current step from g_brightness
  int curStep = 4; // default max
  for (int i = 0; i < BL_STEPS; i++) {
    if (g_brightness <= BL_PCTS[i]) { curStep = i; break; }
  }
  // Update the value label to show the step name
  lv_label_set_text(lblBrVal, BL_LABELS[curStep]);

  lv_obj_t *slider = lv_slider_create(panel);
  lv_obj_set_size(slider, 720, 36);
  lv_obj_align(slider, LV_ALIGN_TOP_MID, 0, 84);
  lv_slider_set_range(slider, 0, BL_STEPS - 1);  // 0..4
  lv_slider_set_value(slider, curStep, LV_ANIM_OFF);
  lv_obj_set_style_bg_color(slider, lv_color_hex(0x222222), LV_PART_MAIN);
  lv_obj_set_style_bg_color(slider, lv_color_hex(0xFFFFFF), LV_PART_INDICATOR);
  lv_obj_set_style_bg_color(slider, lv_color_hex(0xFFFFFF), LV_PART_KNOB);
  lv_obj_set_style_radius(slider, 4, LV_PART_MAIN);
  lv_obj_set_style_radius(slider, 4, LV_PART_INDICATOR);
  lv_obj_set_style_radius(slider, 8, LV_PART_KNOB);
  lv_obj_set_style_pad_all(slider, 6, LV_PART_KNOB);

  // Callback: map slider step -> pct -> setBrightness
  lv_obj_add_event_cb(slider, [](lv_event_t *e) {
    lv_event_code_t code = lv_event_get_code(e);
    if (code == LV_EVENT_VALUE_CHANGED || code == LV_EVENT_RELEASED) {
      static const int pcts[5]  = { 10, 30, 50, 70, 100 };
      static const char *lbls[5] = { "Very Dim", "Dim", "Medium", "Bright", "Max" };
      lv_obj_t *sl = lv_event_get_target(e);
      int step = lv_slider_get_value(sl);
      step = (step < 0) ? 0 : (step > 4) ? 4 : step;
      int pct = pcts[step];
      setBrightness(pct);
      lv_obj_t *valLbl = (lv_obj_t *)lv_event_get_user_data(e);
      lv_label_set_text(valLbl, lbls[step]);
      if (code == LV_EVENT_RELEASED) saveBrightness(pct);
    }
  }, LV_EVENT_ALL, lblBrVal);

  // ── Theme section ──
  lv_obj_t *lblTh = lv_label_create(panel);
  lv_obj_set_style_text_font(lblTh, &lv_font_montserrat_14, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblTh, lv_color_hex(0x666666), LV_PART_MAIN);
  lv_obj_align(lblTh, LV_ALIGN_TOP_LEFT, 40, 148);
  lv_label_set_text(lblTh, "THEME");

  struct { const char *name; int id; uint32_t col; } themes[] = {
    { "Minimal", THEME_MINIMAL, 0xFFFFFF },
    { "LED",     THEME_LED,     0x00FF55 },
    { "Warm",    THEME_WARM,    0xFF6600 },
    { "Red",     THEME_RED,     0xFF1111 },
  };
  // 4 theme buttons in a row
  int btnW = 160, btnH = 56, gap = 16;
  int totalW = 4 * btnW + 3 * gap;
  int startX = (800 - totalW) / 2;
  for (int i = 0; i < 4; i++) {
    lv_obj_t *btn = lv_btn_create(panel);
    lv_obj_set_size(btn, btnW, btnH);
    lv_obj_set_pos(btn, startX + i * (btnW + gap), 178);
    bool active = (g_theme == themes[i].id);
    lv_obj_set_style_bg_color(btn,
      active ? lv_color_hex(0x222222) : lv_color_hex(0x141414), LV_PART_MAIN);
    lv_obj_set_style_border_color(btn,
      active ? lv_color_hex(themes[i].col) : lv_color_hex(0x333333), LV_PART_MAIN);
    lv_obj_set_style_border_width(btn, active ? 2 : 1, LV_PART_MAIN);
    lv_obj_set_style_radius(btn, 10, LV_PART_MAIN);

    lv_obj_t *lbl = lv_label_create(btn);
    lv_obj_set_style_text_font(lbl, &lv_font_montserrat_16, LV_PART_MAIN);
    lv_obj_set_style_text_color(lbl,
      lv_color_hex(active ? themes[i].col : 0x555555), LV_PART_MAIN);
    lv_label_set_text(lbl, themes[i].name);
    lv_obj_center(lbl);

    int *themeId = new int(themes[i].id);
    lv_obj_add_event_cb(btn, [](lv_event_t *e) {
      if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
      int id = *(int *)lv_event_get_user_data(e);
      g_theme = id;
      saveTheme(id);
      buildClockScreen();
      lv_disp_load_scr(scr_clock);
      updateClockLabel();
      updateAlarmLabels();
    }, LV_EVENT_ALL, themeId);
  }

  // ── Sync Now button ──
  lv_obj_t *lblSync = lv_label_create(panel);
  lv_obj_set_style_text_font(lblSync, &lv_font_montserrat_14, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblSync, lv_color_hex(0x666666), LV_PART_MAIN);
  lv_obj_align(lblSync, LV_ALIGN_TOP_LEFT, 40, 268);
  lv_label_set_text(lblSync, "SYNC");

  // Status label (shows OK / WiFi needed after sync)
  lv_obj_t *lblSyncStatus = lv_label_create(panel);
  lv_obj_set_style_text_font(lblSyncStatus, &lv_font_montserrat_14, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblSyncStatus, lv_color_hex(0x444444), LV_PART_MAIN);
  lv_obj_align(lblSyncStatus, LV_ALIGN_TOP_RIGHT, -40, 268);
  lv_label_set_text(lblSyncStatus, "");

  lv_obj_t *btnSync = lv_btn_create(panel);
  lv_obj_set_size(btnSync, 720, 52);
  lv_obj_align(btnSync, LV_ALIGN_TOP_MID, 0, 290);
  lv_obj_set_style_bg_color(btnSync, lv_color_hex(0x0A1A2A), LV_PART_MAIN);
  lv_obj_set_style_border_color(btnSync, lv_color_hex(0x1A4A7A), LV_PART_MAIN);
  lv_obj_set_style_border_width(btnSync, 1, LV_PART_MAIN);
  lv_obj_set_style_radius(btnSync, 10, LV_PART_MAIN);
  lv_obj_add_event_cb(btnSync, [](lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    lv_obj_t *statusLbl = (lv_obj_t *)lv_event_get_user_data(e);
    bool wifiOk = (WiFi.status() == WL_CONNECTED);
    if (!wifiOk) {
      lv_label_set_text(statusLbl, "No WiFi");
      lv_obj_set_style_text_color(statusLbl, lv_color_hex(0xFF4444), LV_PART_MAIN);
      return;
    }
    lv_label_set_text(statusLbl, "Syncing...");
    lv_obj_set_style_text_color(statusLbl, lv_color_hex(0x888888), LV_PART_MAIN);
    lv_timer_handler();  // flush UI before blocking HTTP
    fetchSchedule();
    sendHeartbeat();
    updateAlarmLabels();
    lv_label_set_text(statusLbl, LV_SYMBOL_OK "  Done");
    lv_obj_set_style_text_color(statusLbl, lv_color_hex(0x22C55E), LV_PART_MAIN);
  }, LV_EVENT_ALL, lblSyncStatus);
  lv_obj_t *lblSyncBtn = lv_label_create(btnSync);
  lv_obj_set_style_text_font(lblSyncBtn, &lv_font_montserrat_18, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblSyncBtn, lv_color_hex(0x4499DD), LV_PART_MAIN);
  lv_label_set_text(lblSyncBtn, LV_SYMBOL_REFRESH "  Sync Alarm & Habits Now");
  lv_obj_center(lblSyncBtn);

  // ── Change WiFi button ──
  lv_obj_t *lblWifi = lv_label_create(panel);
  lv_obj_set_style_text_font(lblWifi, &lv_font_montserrat_14, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblWifi, lv_color_hex(0x666666), LV_PART_MAIN);
  lv_obj_align(lblWifi, LV_ALIGN_TOP_LEFT, 40, 358);
  lv_label_set_text(lblWifi, "NETWORK");

  lv_obj_t *btnWifi = lv_btn_create(panel);
  lv_obj_set_size(btnWifi, 720, 52);
  lv_obj_align(btnWifi, LV_ALIGN_TOP_MID, 0, 380);
  lv_obj_set_style_bg_color(btnWifi, lv_color_hex(0x0A1A0A), LV_PART_MAIN);
  lv_obj_set_style_border_color(btnWifi, lv_color_hex(0x1A5A1A), LV_PART_MAIN);
  lv_obj_set_style_border_width(btnWifi, 1, LV_PART_MAIN);
  lv_obj_set_style_radius(btnWifi, 10, LV_PART_MAIN);
  lv_obj_add_event_cb(btnWifi, [](lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    // Close the More panel then open WiFi scan
    lv_obj_t *panel = lv_obj_get_parent(lv_event_get_target(e));
    lv_obj_del(panel);
    showWifiScanScreen();
  }, LV_EVENT_ALL, nullptr);
  lv_obj_t *lblWifiBtn = lv_label_create(btnWifi);
  lv_obj_set_style_text_font(lblWifiBtn, &lv_font_montserrat_18, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblWifiBtn, lv_color_hex(0x44BB44), LV_PART_MAIN);
  lv_label_set_text(lblWifiBtn, LV_SYMBOL_WIFI "  Change WiFi Network");
  lv_obj_center(lblWifiBtn);

  // ── Close / Back button ──
  lv_obj_t *btnBack = lv_btn_create(panel);
  lv_obj_set_size(btnBack, 160, 44);
  lv_obj_align(btnBack, LV_ALIGN_BOTTOM_MID, 0, -20);
  lv_obj_set_style_bg_color(btnBack, lv_color_hex(0x1A1A1A), LV_PART_MAIN);
  lv_obj_set_style_border_color(btnBack, lv_color_hex(0x444444), LV_PART_MAIN);
  lv_obj_set_style_border_width(btnBack, 1, LV_PART_MAIN);
  lv_obj_set_style_radius(btnBack, 22, LV_PART_MAIN);
  lv_obj_add_event_cb(btnBack, [](lv_event_t *e) {
    if (lv_event_get_code(e) == LV_EVENT_CLICKED) {
      lv_obj_del(lv_obj_get_parent(lv_event_get_target(e)));
    }
  }, LV_EVENT_ALL, nullptr);
  lv_obj_t *lblBack = lv_label_create(btnBack);
  lv_obj_set_style_text_font(lblBack, &lv_font_montserrat_16, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblBack, lv_color_hex(0x888888), LV_PART_MAIN);
  lv_label_set_text(lblBack, LV_SYMBOL_LEFT "  Back");
  lv_obj_center(lblBack);
}

void buildClockScreen() {
  // Destroy previous screen if rebuilding
  if (scr_clock) {
    lv_obj_del(scr_clock);
    scr_clock = nullptr;
    lbl_time = lbl_ampm = lbl_date = lbl_wifi = lbl_alarm1 = lbl_alarm2 = nullptr;
  }

  scr_clock = lv_obj_create(nullptr);
  lv_obj_clear_flag(scr_clock, LV_OBJ_FLAG_SCROLLABLE);

  switch (g_theme) {
    case THEME_LED:   buildThemeLED();   break;
    case THEME_WARM:  buildThemeWarm();  break;
    case THEME_RED:   buildThemeRed();   break;
    default:          buildThemeMinimal(); break;
  }
}

void updateClockLabel() {
  time_t now = time(nullptr);
  struct tm t;
  localtime_r(&now, &t);

  // Time
  int h12 = t.tm_hour % 12; if (h12 == 0) h12 = 12;
  char timeBuf[8];
  snprintf(timeBuf, sizeof(timeBuf), "%d:%02d", h12, t.tm_min);
  lv_label_set_text(lbl_time, timeBuf);
  lv_label_set_text(lbl_ampm, t.tm_hour < 12 ? "AM" : "PM");

  // Date — format depends on theme
  const char *days[]   = { "Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday" };
  const char *months[] = { "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec" };
  const char *MONTHS[] = { "JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC" };
  const char *DAYS[]   = { "SUNDAY","MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY" };
  char dateBuf[40];
  if (g_theme == THEME_WARM) {
    snprintf(dateBuf, sizeof(dateBuf), "%s  \xE2\x80\xA2  %s %d", DAYS[t.tm_wday], MONTHS[t.tm_mon], t.tm_mday);
  } else if (g_theme == THEME_LED) {
    dateBuf[0] = '\0';  // LED theme shows no date
  } else {
    snprintf(dateBuf, sizeof(dateBuf), "%s, %s %d", days[t.tm_wday], months[t.tm_mon], t.tm_mday);
  }
  lv_label_set_text(lbl_date, dateBuf);

  // WiFi indicator — symbol only when connected, symbol+X when not
  bool wifiOk = (WiFi.status() == WL_CONNECTED);
  lv_label_set_text(lbl_wifi, wifiOk ? LV_SYMBOL_WIFI : LV_SYMBOL_WIFI " " LV_SYMBOL_CLOSE);
  if (g_theme == THEME_LED) {
    lv_obj_set_style_text_color(lbl_wifi, wifiOk ? lv_color_hex(0x00FF66) : lv_color_hex(0x224422), LV_PART_MAIN);
  } else if (g_theme == THEME_WARM) {
    lv_obj_set_style_text_color(lbl_wifi, wifiOk ? lv_color_hex(0xFF6600) : lv_color_hex(0x442200), LV_PART_MAIN);
  } else if (g_theme == THEME_RED) {
    lv_obj_set_style_text_color(lbl_wifi, wifiOk ? lv_color_hex(0xFF0000) : lv_color_hex(0x550000), LV_PART_MAIN);
  } else {
    lv_obj_set_style_text_color(lbl_wifi, wifiOk ? lv_color_hex(0x5A5A9A) : lv_color_hex(0x333355), LV_PART_MAIN);
  }

  // Re-anchor AM/PM to right of time (text width changes each minute)
  lv_obj_align_to(lbl_ampm, lbl_time, LV_ALIGN_OUT_RIGHT_BOTTOM, 8, 0);

  // Check if any alarm should fire
  if (!g_alarmFired && !g_inCheckin) {
    for (int i = 0; i < g_alarmCount; i++) {
      if (alarmShouldFire(i, &t)) {
        g_firedAlarmIdx = i;
        g_alarmFired    = true;
        g_snoozeCount   = 0;
        sendEvent("alarm_fired", g_alarms[i].id.c_str(), now, 0, 0);
        showAlarmScreen(i);
        break;
      }
    }
  }
}

void showClockScreen() {
  lv_disp_load_scr(scr_clock);
  updateClockLabel();
  updateAlarmLabels();  // always refresh alarm text when showing clock
}

// ─── Pairing screen ────────────────────────────────────────────────────────────
static void cb_pair_connect(lv_event_t *e) {
  const char *token = lv_textarea_get_text(ta_pin);
  if (!token || strlen(token) < 4) {
    lv_label_set_text(lbl_status, "Enter the 6-char PIN from the Jack app");
    return;
  }
  // Uppercase the token — server stores tokens in uppercase only
  char upperToken[16] = {};
  for (int i = 0; token[i] && i < 15; i++) upperToken[i] = toupper((unsigned char)token[i]);
  lv_label_set_text(lbl_status, "Connecting...");
  lv_timer_handler();
  if (registerDevice(upperToken)) {
    lv_label_set_text(lbl_status, "Paired! Fetching schedule...");
    lv_timer_handler();
    fetchSchedule();
    showClockScreen();
  } else {
    lv_label_set_text(lbl_status, "Failed — check PIN and try again");
  }
}

void buildPairingScreen() {
  scr_pair = lv_obj_create(nullptr);
  lv_obj_set_style_bg_color(scr_pair, lv_color_hex(0x0D0D1A), LV_PART_MAIN);
  lv_obj_clear_flag(scr_pair, LV_OBJ_FLAG_SCROLLABLE);

  lv_obj_t *title = lv_label_create(scr_pair);
  lv_obj_set_style_text_font(title, &lv_font_montserrat_28, LV_PART_MAIN);
  lv_obj_set_style_text_color(title, lv_color_hex(0xEEEEFF), LV_PART_MAIN);
  lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 20);
  lv_label_set_text(title, "Pair with Jack App");

  lv_obj_t *instr = lv_label_create(scr_pair);
  lv_obj_set_style_text_font(instr, &lv_font_montserrat_16, LV_PART_MAIN);
  lv_obj_set_style_text_color(instr, lv_color_hex(0x9090B8), LV_PART_MAIN);
  lv_obj_set_width(instr, 600);
  lv_label_set_long_mode(instr, LV_LABEL_LONG_WRAP);
  lv_obj_align(instr, LV_ALIGN_TOP_MID, 0, 60);
  lv_label_set_text(instr, "In the Jack app, go to More > CrowPanel Display > Pair.\nEnter the 6-character PIN shown below:");

  ta_pin = lv_textarea_create(scr_pair);
  lv_textarea_set_max_length(ta_pin, 8);
  lv_textarea_set_one_line(ta_pin, true);
  lv_textarea_set_placeholder_text(ta_pin, "PIN");
  lv_obj_set_width(ta_pin, 200);
  lv_obj_align(ta_pin, LV_ALIGN_CENTER, 0, -60);
  lv_obj_set_style_text_font(ta_pin, &lv_font_montserrat_28, LV_PART_MAIN);

  lv_obj_t *btn = lv_btn_create(scr_pair);
  lv_obj_set_size(btn, 200, 56);
  lv_obj_align(btn, LV_ALIGN_CENTER, 0, 10);
  lv_obj_set_style_bg_color(btn, lv_color_hex(0x7B74FF), LV_PART_MAIN);
  lv_obj_add_event_cb(btn, cb_pair_connect, LV_EVENT_CLICKED, nullptr);
  lv_obj_t *btnLbl = lv_label_create(btn);
  lv_label_set_text(btnLbl, "Connect");
  lv_obj_set_style_text_font(btnLbl, &lv_font_montserrat_20, LV_PART_MAIN);
  lv_obj_center(btnLbl);

  lbl_status = lv_label_create(scr_pair);
  lv_obj_set_style_text_font(lbl_status, &lv_font_montserrat_16, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_status, lv_color_hex(0x9090B8), LV_PART_MAIN);
  lv_obj_set_width(lbl_status, 600);
  lv_label_set_long_mode(lbl_status, LV_LABEL_LONG_WRAP);
  lv_obj_align(lbl_status, LV_ALIGN_CENTER, 0, 70);
  lv_label_set_text(lbl_status, "");

  kb_pin = lv_keyboard_create(scr_pair);
  lv_keyboard_set_textarea(kb_pin, ta_pin);
  lv_keyboard_set_mode(kb_pin, LV_KEYBOARD_MODE_USER_1); // uppercase alpha
  lv_obj_set_size(kb_pin, LCD_H_RES, 200);
  lv_obj_align(kb_pin, LV_ALIGN_BOTTOM_MID, 0, 0);
}

void showPairingScreen() {
  lv_disp_load_scr(scr_pair);
}

// ─── Alarm + Habit Checklist ───────────────────────────────────────────────────
static time_t g_alarmFiredAt = 0;

// ─── Per-habit timed check-in state ─────────────────────────────────────────────────────
#define HABIT_TIMER_TICKS  100   // 100 ticks × 100ms = 10 s per habit
static int   g_ciHabitIdx  = 0;  // which habit we're currently rating
static int   g_ciTick      = 0;  // countdown tick (counts down from HABIT_TIMER_TICKS)
static lv_timer_t *g_ciTimer = nullptr;

// LVGL widgets on the check-in screen (rebuilt each call to showCheckinScreen)
static lv_obj_t *lbl_ci_progress = nullptr;
static lv_obj_t *lbl_ci_habit    = nullptr;
static lv_obj_t *bar_ci_timer    = nullptr;

// Forward-declare the advance function
static void ciAdvance(int rating);

// LVGL timer tick: called every 100ms
static void cb_ci_tick(lv_timer_t *timer) {
  if (g_ciTick > 0) {
    g_ciTick--;
    if (bar_ci_timer) lv_bar_set_value(bar_ci_timer, g_ciTick, LV_ANIM_OFF);
  }
  if (g_ciTick == 0) {
    // Time's up — re-fire buzzer and reset bar (do NOT advance; user must answer)
    buzzerOn();
    g_ciTick = HABIT_TIMER_TICKS;
    if (bar_ci_timer) lv_bar_set_value(bar_ci_timer, g_ciTick, LV_ANIM_OFF);
  }
}

// Advance to next habit or finish
static void ciAdvance(int rating) {
  // Stop timer and silence buzzer
  if (g_ciTimer) { lv_timer_del(g_ciTimer); g_ciTimer = nullptr; }
  buzzerOff();

  // Save rating for current habit (0=none, 1=red, 2=yellow, 3=green)
  if (g_ciHabitIdx < MAX_HABITS) g_ratings[g_ciHabitIdx] = rating;

  g_ciHabitIdx++;
  if (g_ciHabitIdx >= g_habitCount) {
    // All habits rated — submit, celebrate, then return to clock
    time_t now = time(nullptr);
    sendEvent("alarm_dismissed",
              g_firedAlarmIdx >= 0 ? g_alarms[g_firedAlarmIdx].id.c_str() : "",
              g_alarmFiredAt, now, g_snoozeCount);
    submitCheckin();
    g_alarmFired    = false;
    g_inCheckin     = false;
    g_firedAlarmIdx = -1;
    showCelebrationScreen();
    return;
  }
  // Show next habit
  showCheckinScreen();
}

// Rating button callbacks
static void cb_ci_red    (lv_event_t *e) { if (lv_event_get_code(e)==LV_EVENT_CLICKED) ciAdvance(1); }
static void cb_ci_yellow (lv_event_t *e) { if (lv_event_get_code(e)==LV_EVENT_CLICKED) ciAdvance(2); }
static void cb_ci_green  (lv_event_t *e) { if (lv_event_get_code(e)==LV_EVENT_CLICKED) ciAdvance(3); }

// Snooze: silence buzzer, go back to clock, alarm will re-fire next minute check
static void cb_snooze(lv_event_t *e) {
  buzzerOff();
  g_snoozeCount++;
  sendEvent("snooze", g_alarms[g_firedAlarmIdx].id.c_str(), g_alarmFiredAt, 0, g_snoozeCount);
  g_alarmFired = false;
  showClockScreen();
}

void buildAlarmScreen() {
  // Alarm screen is rebuilt each time it fires so it picks up the current theme.
  if (scr_alarm) { lv_obj_del(scr_alarm); scr_alarm = nullptr; }

  // ── Pick theme palette ──
  uint32_t bgCol, timeCol, subCol, snoozeCol, snoozeTextCol;
  switch (g_theme) {
    case THEME_LED:
      bgCol = 0x000000; timeCol = 0x00FF55; subCol = 0x005522; snoozeCol = 0x001100; snoozeTextCol = 0x007733; break;
    case THEME_WARM:
      bgCol = 0x000000; timeCol = 0xFF6600; subCol = 0x331100; snoozeCol = 0x1A0800; snoozeTextCol = 0x663300; break;
    case THEME_RED:
      bgCol = 0x000000; timeCol = 0xFF0000; subCol = 0x330000; snoozeCol = 0x1A0000; snoozeTextCol = 0x880000; break;
    default: // THEME_MINIMAL
      bgCol = 0x000000; timeCol = 0xFFFFFF; subCol = 0x444466; snoozeCol = 0x1A1A2E; snoozeTextCol = 0x9090B8; break;
  }

  scr_alarm = lv_obj_create(nullptr);
  lv_obj_set_style_bg_color(scr_alarm, lv_color_hex(bgCol), LV_PART_MAIN);
  lv_obj_clear_flag(scr_alarm, LV_OBJ_FLAG_SCROLLABLE);

  // Time display — large, centred, in theme colour
  lbl_alm_time = lv_label_create(scr_alarm);
  lv_obj_set_style_text_font(lbl_alm_time, &montserrat_light_120, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_alm_time, lv_color_hex(timeCol), LV_PART_MAIN);
  lv_obj_align(lbl_alm_time, LV_ALIGN_CENTER, 0, -60);
  lv_label_set_text(lbl_alm_time, "--:--");

  lv_obj_t *sub = lv_label_create(scr_alarm);
  lv_obj_set_style_text_font(sub, &lv_font_montserrat_20, LV_PART_MAIN);
  lv_obj_set_style_text_color(sub, lv_color_hex(subCol), LV_PART_MAIN);
  lv_obj_align(sub, LV_ALIGN_CENTER, 0, 60);
  lv_label_set_text(sub, "Good morning");

  // SNOOZE — left, muted in theme colour
  lv_obj_t *btnSnooze = lv_btn_create(scr_alarm);
  lv_obj_set_size(btnSnooze, 220, 72);
  lv_obj_align(btnSnooze, LV_ALIGN_CENTER, -130, 140);
  lv_obj_set_style_bg_color(btnSnooze, lv_color_hex(snoozeCol), LV_PART_MAIN);
  lv_obj_set_style_radius(btnSnooze, 12, LV_PART_MAIN);
  lv_obj_add_event_cb(btnSnooze, cb_snooze, LV_EVENT_CLICKED, nullptr);
  lv_obj_t *lblSnooze = lv_label_create(btnSnooze);
  lv_label_set_text(lblSnooze, "Snooze 9 min");
  lv_obj_set_style_text_font(lblSnooze, &lv_font_montserrat_18, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblSnooze, lv_color_hex(snoozeTextCol), LV_PART_MAIN);
  lv_obj_center(lblSnooze);

  // WAKE UP — right, always bright green (action colour)
  lv_obj_t *btnWake = lv_btn_create(scr_alarm);
  lv_obj_set_size(btnWake, 220, 72);
  lv_obj_align(btnWake, LV_ALIGN_CENTER, 130, 140);
  lv_obj_set_style_bg_color(btnWake, lv_color_hex(0x22C55E), LV_PART_MAIN);
  lv_obj_set_style_radius(btnWake, 12, LV_PART_MAIN);
  lv_obj_add_event_cb(btnWake, [](lv_event_t *e) {
    if (lv_event_get_code(e) == LV_EVENT_CLICKED) {
      buzzerOff();
      g_alarmFired  = true;
      g_inCheckin   = true;
      g_ciHabitIdx  = 0;
      memset(g_ratings, 0, sizeof(g_ratings));
      showCheckinScreen();
    }
  }, LV_EVENT_ALL, nullptr);
  lv_obj_t *lblWake = lv_label_create(btnWake);
  lv_label_set_text(lblWake, "Wake Up");
  lv_obj_set_style_text_font(lblWake, &lv_font_montserrat_20, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblWake, lv_color_hex(0x000000), LV_PART_MAIN);
  lv_obj_center(lblWake);
}

void showAlarmScreen(int alarmIdx) {
  g_alarmFiredAt = time(nullptr);
  // Rebuild alarm screen with current theme
  buildAlarmScreen();
  if (alarmIdx >= 0 && alarmIdx < g_alarmCount) {
    int h = g_alarms[alarmIdx].hour;
    int m = g_alarms[alarmIdx].minute;
    bool pm = h >= 12;
    int h12 = h % 12; if (h12 == 0) h12 = 12;
    char tbuf[16];
    snprintf(tbuf, sizeof(tbuf), "%d:%02d %s", h12, m, pm ? "PM" : "AM");
    lv_label_set_text(lbl_alm_time, tbuf);
  }
  buzzerOn();
  lv_disp_load_scr(scr_alarm);
}

// ─── Check-in screen ───────────────────────────────────────────────────────────
// buildCheckinScreen: creates the static skeleton (reused across all habits)
void buildCheckinScreen() {
  scr_checkin = lv_obj_create(nullptr);
  lv_obj_set_style_bg_color(scr_checkin, lv_color_hex(0x0A0A0A), LV_PART_MAIN);
  lv_obj_clear_flag(scr_checkin, LV_OBJ_FLAG_SCROLLABLE);

  // Progress label  e.g. "Habit 1 of 5"
  lbl_ci_progress = lv_label_create(scr_checkin);
  lv_obj_set_style_text_font(lbl_ci_progress, &lv_font_montserrat_18, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_ci_progress, lv_color_hex(0x888888), LV_PART_MAIN);
  lv_obj_align(lbl_ci_progress, LV_ALIGN_TOP_MID, 0, 14);
  lv_label_set_text(lbl_ci_progress, "Habit 1 of 1");

  // Countdown bar (full width, thin strip at top)
  bar_ci_timer = lv_bar_create(scr_checkin);
  lv_obj_set_size(bar_ci_timer, LCD_H_RES - 40, 8);
  lv_obj_align(bar_ci_timer, LV_ALIGN_TOP_MID, 0, 44);
  lv_bar_set_range(bar_ci_timer, 0, HABIT_TIMER_TICKS);
  lv_bar_set_value(bar_ci_timer, HABIT_TIMER_TICKS, LV_ANIM_OFF);
  lv_obj_set_style_bg_color(bar_ci_timer, lv_color_hex(0x222222), LV_PART_MAIN);
  lv_obj_set_style_bg_color(bar_ci_timer, lv_color_hex(0x5A5AFF), LV_PART_INDICATOR);
  lv_obj_set_style_radius(bar_ci_timer, 4, LV_PART_MAIN);
  lv_obj_set_style_radius(bar_ci_timer, 4, LV_PART_INDICATOR);

  // Habit name label — large, centred
  lbl_ci_habit = lv_label_create(scr_checkin);
  lv_obj_set_style_text_font(lbl_ci_habit, &lv_font_montserrat_28, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_ci_habit, lv_color_hex(0xFFFFFF), LV_PART_MAIN);
  lv_obj_set_width(lbl_ci_habit, LCD_H_RES - 60);
  lv_label_set_long_mode(lbl_ci_habit, LV_LABEL_LONG_WRAP);
  lv_obj_set_style_text_align(lbl_ci_habit, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
  lv_obj_align(lbl_ci_habit, LV_ALIGN_CENTER, 0, -40);
  lv_label_set_text(lbl_ci_habit, "");

  // Three rating buttons: RED | YELLOW | GREEN
  static const struct { const char *label; uint32_t col; lv_event_cb_t cb; } btns[3] = {
    { "MISS",  0xEF4444, cb_ci_red    },
    { "OKAY",  0xF59E0B, cb_ci_yellow },
    { "WIN",   0x22C55E, cb_ci_green  },
  };
  int btnW = (LCD_H_RES - 60) / 3;  // ~246px each on 800px wide
  for (int b = 0; b < 3; b++) {
    lv_obj_t *btn = lv_btn_create(scr_checkin);
    lv_obj_set_size(btn, btnW - 8, 80);
    lv_obj_align(btn, LV_ALIGN_BOTTOM_MID, (b - 1) * btnW, -20);
    lv_obj_set_style_bg_color(btn, lv_color_hex(btns[b].col), LV_PART_MAIN);
    lv_obj_set_style_radius(btn, 14, LV_PART_MAIN);
    lv_obj_add_event_cb(btn, btns[b].cb, LV_EVENT_CLICKED, nullptr);
    lv_obj_t *lbl = lv_label_create(btn);
    lv_label_set_text(lbl, btns[b].label);
    lv_obj_set_style_text_font(lbl, &lv_font_montserrat_20, LV_PART_MAIN);
    lv_obj_set_style_text_color(lbl, lv_color_hex(0x000000), LV_PART_MAIN);
    lv_obj_center(lbl);
  }
}

// showCheckinScreen: updates labels for current habit and restarts the timer
void showCheckinScreen() {
  // Kill any running timer first
  if (g_ciTimer) { lv_timer_del(g_ciTimer); g_ciTimer = nullptr; }

  int idx   = g_ciHabitIdx;
  int total = g_habitCount;

  // Update progress label
  if (lbl_ci_progress) {
    char pbuf[24];
    snprintf(pbuf, sizeof(pbuf), "Habit %d of %d", idx + 1, total);
    lv_label_set_text(lbl_ci_progress, pbuf);
  }

  // Update habit name
  if (lbl_ci_habit && idx < total) {
    lv_label_set_text(lbl_ci_habit, g_habits[idx].name.c_str());
  }

  // Reset and start countdown bar
  g_ciTick = HABIT_TIMER_TICKS;
  if (bar_ci_timer) lv_bar_set_value(bar_ci_timer, g_ciTick, LV_ANIM_OFF);

  // Start LVGL timer (100ms period)
  g_ciTimer = lv_timer_create(cb_ci_tick, 100, nullptr);

  lv_disp_load_scr(scr_checkin);
}

// ─── Morning routine screen ───────────────────────────────────────────────────
// Shown after celebration if the fired alarm has a meditationId set.
// For audio routines (meditation/breathwork/visualization) we display the card
// and a Start button; the user taps Start to begin (audio plays on the phone app
// side — the panel just shows the name/description as a visual cue).
// A Skip button always lets them dismiss immediately.

static const struct {
  const char *id;
  const char *label;
  const char *description;
  bool        hasAudio;
} ROUTINE_META[] = {
  { "meditation",    "Guided Meditation",  "Mindful awareness — 5 min",           true  },
  { "breathwork",    "Breathwork",         "Box breathing 4-4-4-4",               true  },
  { "visualization", "Visualizations",    "See your goals achieved",             true  },
  { "priming",       "Priming",           "Gratitude · Goals · Visualize",       false },
  { "journaling",    "Journaling",        "Morning pages — free write",          false },
};
static const int ROUTINE_META_COUNT = 5;

void showMorningRoutineScreen(const String &meditationId) {
  // Find meta
  const char *label = nullptr;
  const char *desc  = nullptr;
  for (int i = 0; i < ROUTINE_META_COUNT; i++) {
    if (meditationId == ROUTINE_META[i].id) {
      label = ROUTINE_META[i].label;
      desc  = ROUTINE_META[i].description;
      break;
    }
  }
  if (!label) { showClockScreen(); return; }  // unknown id — skip

  lv_obj_t *scr = lv_obj_create(nullptr);
  lv_obj_set_style_bg_color(scr, lv_color_hex(0x050D1A), LV_PART_MAIN);
  lv_obj_clear_flag(scr, LV_OBJ_FLAG_SCROLLABLE);

  // Card
  lv_obj_t *card = lv_obj_create(scr);
  lv_obj_set_size(card, 560, 260);
  lv_obj_align(card, LV_ALIGN_CENTER, 0, -40);
  lv_obj_set_style_bg_color(card, lv_color_hex(0x0F1E36), LV_PART_MAIN);
  lv_obj_set_style_border_color(card, lv_color_hex(0x2563EB), LV_PART_MAIN);
  lv_obj_set_style_border_width(card, 2, LV_PART_MAIN);
  lv_obj_set_style_radius(card, 20, LV_PART_MAIN);
  lv_obj_clear_flag(card, LV_OBJ_FLAG_SCROLLABLE);

  lv_obj_t *lbl_title = lv_label_create(card);
  lv_obj_set_style_text_font(lbl_title, &lv_font_montserrat_28, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_title, lv_color_hex(0xFFFFFF), LV_PART_MAIN);
  lv_obj_align(lbl_title, LV_ALIGN_TOP_MID, 0, 24);
  lv_label_set_text(lbl_title, label);

  lv_obj_t *lbl_desc = lv_label_create(card);
  lv_obj_set_style_text_font(lbl_desc, &lv_font_montserrat_18, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_desc, lv_color_hex(0x94A3B8), LV_PART_MAIN);
  lv_obj_align(lbl_desc, LV_ALIGN_TOP_MID, 0, 80);
  lv_label_set_text(lbl_desc, desc);

  lv_obj_t *lbl_hint = lv_label_create(card);
  lv_obj_set_style_text_font(lbl_hint, &lv_font_montserrat_14, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_hint, lv_color_hex(0x4B6A8A), LV_PART_MAIN);
  lv_obj_align(lbl_hint, LV_ALIGN_TOP_MID, 0, 130);
  lv_label_set_text(lbl_hint, "Open the Jack app to start audio");

  // Skip button
  lv_obj_t *btnSkip = lv_btn_create(scr);
  lv_obj_set_size(btnSkip, 200, 60);
  lv_obj_align(btnSkip, LV_ALIGN_BOTTOM_MID, 0, -24);
  lv_obj_set_style_bg_color(btnSkip, lv_color_hex(0x1E293B), LV_PART_MAIN);
  lv_obj_set_style_radius(btnSkip, 12, LV_PART_MAIN);
  lv_obj_add_event_cb(btnSkip, [](lv_event_t *e) {
    if (lv_event_get_code(e) == LV_EVENT_CLICKED) {
      g_alarmFired  = false;
      g_inCheckin   = false;
      g_firedAlarmIdx = -1;
      showClockScreen();
    }
  }, LV_EVENT_ALL, nullptr);
  lv_obj_t *lblSkip = lv_label_create(btnSkip);
  lv_label_set_text(lblSkip, "Done");
  lv_obj_set_style_text_font(lblSkip, &lv_font_montserrat_18, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblSkip, lv_color_hex(0xCBD5E1), LV_PART_MAIN);
  lv_obj_center(lblSkip);

  lv_disp_load_scr(scr);
}

// ─── Celebration screen ───────────────────────────────────────────────────────
void showCelebrationScreen() {
  // Build a full-screen green celebration overlay
  lv_obj_t *scr_cel = lv_obj_create(nullptr);
  lv_obj_set_style_bg_color(scr_cel, lv_color_hex(0x0A2A0A), LV_PART_MAIN);
  lv_obj_clear_flag(scr_cel, LV_OBJ_FLAG_SCROLLABLE);

  lv_obj_t *lbl_big = lv_label_create(scr_cel);
  lv_obj_set_style_text_font(lbl_big, &lv_font_montserrat_48, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_big, lv_color_hex(0x22C55E), LV_PART_MAIN);
  lv_obj_align(lbl_big, LV_ALIGN_CENTER, 0, -40);
  lv_label_set_text(lbl_big, "Great job!");

  lv_obj_t *lbl_sub = lv_label_create(scr_cel);
  lv_obj_set_style_text_font(lbl_sub, &lv_font_montserrat_20, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_sub, lv_color_hex(0x448844), LV_PART_MAIN);
  lv_obj_align(lbl_sub, LV_ALIGN_CENTER, 0, 20);
  lv_label_set_text(lbl_sub, "All habits complete");

  // Load screen FIRST so it appears instantly with no delay
  lv_disp_load_scr(scr_cel);
  lv_task_handler();  // force one LVGL render pass so the screen is visible immediately

  // Submit check-in AFTER screen is visible (non-blocking to UI)
  submitCheckin();

  // Non-blocking victory melody: schedule 3 buzzer pulses via LVGL timers
  // Pulse 0: on at t=0ms, off at t=100ms
  // Pulse 1: on at t=180ms, off at t=300ms
  // Pulse 2: on at t=400ms, off at t=540ms
  struct BuzzerPulse { uint32_t onMs; uint32_t offMs; };
  static const BuzzerPulse pulses[3] = {{0,100},{180,300},{400,540}};
  for (int i = 0; i < 3; i++) {
    uint32_t onMs  = pulses[i].onMs;
    uint32_t offMs = pulses[i].offMs;
    lv_timer_t *ton = lv_timer_create([](lv_timer_t *t) {
      Wire.beginTransmission(0x30); Wire.write(0x15); Wire.endTransmission();
      lv_timer_del(t);
    }, onMs + 1, nullptr);
    lv_timer_set_repeat_count(ton, 1);
    lv_timer_t *toff = lv_timer_create([](lv_timer_t *t) {
      Wire.beginTransmission(0x30); Wire.write(0x16); Wire.endTransmission();
      lv_timer_del(t);
    }, offMs + 1, nullptr);
    lv_timer_set_repeat_count(toff, 1);
  }
  g_buzzerOn = false;

  // Capture meditationId from the fired alarm before state is cleared
  String meditId = (g_firedAlarmIdx >= 0) ? g_alarms[g_firedAlarmIdx].meditationId : "";

  // After 2s: go to morning routine screen (if set) or clock
  // Use a heap-allocated String so the lambda can capture it safely
  String *pMeditId = new String(meditId);
  lv_timer_t *t = lv_timer_create([](lv_timer_t *tmr) {
    String *pm = (String *)tmr->user_data;
    String mid = *pm;
    delete pm;
    lv_timer_del(tmr);
    if (mid.length() > 0) {
      showMorningRoutineScreen(mid);
    } else {
      showClockScreen();
    }
  }, 2000, pMeditId);
  lv_timer_set_repeat_count(t, 1);
}

// ─── Setup ───────────────────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);

  // PSRAM init
#if CONFIG_SPIRAM_SUPPORT
  if (!psramInit()) { Serial.println("PSRAM init failed"); while (1); }
  Serial.printf("PSRAM: %d MB\n", ESP.getPsramSize() / 1024 / 1024);
#endif

  // I2C + backlight (Jason2866/IDF53 uses the old I2C driver, no conflict)
  Wire.begin(15, 16);
  delay(50);
  while (1) {
    if (i2cScanForAddress(0x30) && i2cScanForAddress(0x5D)) break;
    sendI2CCommand(0x19);
    pinMode(1, OUTPUT); digitalWrite(1, LOW); delay(120); pinMode(1, INPUT); delay(100);
  }
  Wire.beginTransmission(0x30); Wire.write(0x10); Wire.endTransmission();
  Wire.beginTransmission(0x30); Wire.write(0x18); Wire.endTransmission();

  // Display init
  gfx.init(); gfx.initDMA(); gfx.startWrite(); gfx.fillScreen(TFT_BLACK);

  // LVGL init
  lv_init();
  size_t buf_size = sizeof(lv_color_t) * LCD_H_RES * LCD_V_RES;
  buf  = (lv_color_t *)heap_caps_malloc(buf_size, MALLOC_CAP_SPIRAM);
  buf1 = (lv_color_t *)heap_caps_malloc(buf_size, MALLOC_CAP_SPIRAM);
  lv_disp_draw_buf_init(&draw_buf, buf, buf1, LCD_H_RES * LCD_V_RES);

  static lv_disp_drv_t disp_drv;
  lv_disp_drv_init(&disp_drv);
  disp_drv.hor_res  = LCD_H_RES;
  disp_drv.ver_res  = LCD_V_RES;
  disp_drv.flush_cb = my_disp_flush;
  disp_drv.draw_buf = &draw_buf;
  lv_disp_drv_register(&disp_drv);

  static lv_indev_drv_t indev_drv;
  lv_indev_drv_init(&indev_drv);
  indev_drv.type    = LV_INDEV_TYPE_POINTER;
  indev_drv.read_cb = my_touchpad_read;
  lv_indev_drv_register(&indev_drv);

  delay(100);
  gfx.fillScreen(TFT_BLACK);

  // Load saved theme and brightness before building the clock screen
  g_theme = loadTheme();
  g_brightness = loadBrightness();
  setBrightness(g_brightness);  // Apply saved brightness

  // Read PCF8563 RTC and set system clock immediately (before WiFi)
  // This ensures the clock shows correct time even if WiFi is unavailable.
  // configTime() is called here so localtime_r() uses the correct timezone.
  configTime(TZ_OFFSET_SEC, TZ_DST_SEC, NTP_SERVER);
  rtcApplyToSystem();

  // Build all screens up front
  buildClockScreen();
  buildPairingScreen();
  buildAlarmScreen();
  buildCheckinScreen();

  // Load cached schedule so alarm shows immediately even before WiFi connects
  {
    String cached = loadScheduleCache();
    if (!cached.isEmpty()) {
      Serial.println("[boot] loading cached schedule");
      parseScheduleJson(cached);
    }
  }

  // ── WiFi connection ──────────────────────────────────────────────────────────
  // Disconnect any auto-reconnect from previous sessions so we control the flow
  WiFi.disconnect(true);  // clears stored WiFiManager/SDK credentials too
  WiFi.mode(WIFI_STA);
  delay(100);

  // Try our own saved credentials first (saved by this firmware)
  String savedSsid, savedPass;
  bool hasSaved = loadWifiCredentials(savedSsid, savedPass);

  // If no WiFi credentials at all but already paired, go straight to clock (offline)
  if (!hasSaved) {
    loadApiKey();
    if (!g_apiKey.isEmpty()) {
      Serial.println("[boot] no WiFi creds but paired — offline clock mode");
      showClockScreen();
      g_lastClockUpd = millis();
      return;
    }
  }

  if (hasSaved) {
    // Show "Connecting..." on clock screen while we try saved credentials
    lv_label_set_text(lbl_time, "...");
    lv_label_set_text(lbl_date, "Connecting to WiFi...");
    showClockScreen();
    lv_timer_handler();

    Serial.printf("[WiFi] Trying saved SSID: %s\n", savedSsid.c_str());
    WiFi.begin(savedSsid.c_str(), savedPass.c_str());

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
      delay(500);
      lv_timer_handler();
      attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
      doPostWifiConnect();
      return; // setup done
    }

    // Saved credentials failed — fall through to scan screen
    WiFi.disconnect();
    Serial.println("[WiFi] Saved credentials failed");

    // If already paired, go straight to clock (offline mode)
    loadApiKey();
    if (!g_apiKey.isEmpty()) {
      Serial.println("[boot] offline mode — showing clock from RTC");
      showClockScreen();
      g_lastClockUpd = millis();
      return;
    }
    // Not paired yet — must connect to WiFi to pair
    Serial.println("[boot] not paired, showing scan screen");
  }

  // No saved credentials (or they failed and not paired) — show WiFi setup
  // The rest of setup (NTP, pairing, clock) happens inside cb_wifi_connect
  // after the user successfully connects.
  showWifiScanScreen();
}

// ─── Loop ──────────────────────────────────────────────────────────────────────
void loop() {
  lv_timer_handler();

  bool wifiOk = (WiFi.status() == WL_CONNECTED);
  bool paired = !g_apiKey.isEmpty();

  // Clock updates and alarm checks run whenever we're on the clock screen,
  // regardless of WiFi — the RTC keeps time even offline.
  unsigned long now = millis();

  if (now - g_lastClockUpd >= CLOCK_UPDATE_MS) {
    g_lastClockUpd = now;
    if (!g_alarmFired && !g_inCheckin && lv_disp_get_scr_act(nullptr) == scr_clock) {
      updateClockLabel();
      updateAlarmLabels();
    }
  }

  // Network-dependent tasks only when WiFi is up
  if (!wifiOk) {
    delay(1);
    return;
  }

  // Poll schedule every 5 min
  if (paired && now - g_lastPoll >= POLL_INTERVAL_MS) {
    g_lastPoll = now;
    fetchSchedule();
  }

  // Heartbeat every 5 min
  if (paired && now - g_lastHeartbeat >= POLL_INTERVAL_MS) {
    g_lastHeartbeat = now;
    sendHeartbeat();
  }

  delay(1);
}
