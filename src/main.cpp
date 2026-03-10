/**
 * Jack Alarm Clock — CrowPanel ESP32-S3 Firmware
 *
 * Connects to the Jack app backend at https://api.jackalarm.com
 *
 * Flow:
 *   1. Boot → WiFiManager captive portal (if no saved credentials)
 *   2. NTP sync → Mountain Time (auto DST)
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
#include <WiFiManager.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <time.h>

// ─── Server config ─────────────────────────────────────────────────────────────
#define API_BASE_URL   "https://api.jackalarm.com"
#define NTP_SERVER     "pool.ntp.org"
#define TZ_OFFSET_SEC  (-7 * 3600)   // Mountain Standard Time (UTC-7)
#define TZ_DST_SEC     3600          // 1 hour DST

// ─── NVS keys ──────────────────────────────────────────────────────────────────
#define NVS_NAMESPACE  "jack"
#define NVS_KEY_APIKEY "apiKey"

// ─── Timing ────────────────────────────────────────────────────────────────────
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

// ─── LVGL objects ──────────────────────────────────────────────────────────────
// Clock face
lv_obj_t *scr_clock   = nullptr;
lv_obj_t *lbl_time    = nullptr;
lv_obj_t *lbl_ampm    = nullptr;
lv_obj_t *lbl_date    = nullptr;
lv_obj_t *lbl_wifi    = nullptr;
lv_obj_t *lbl_alarm   = nullptr;

// Pairing screen
lv_obj_t *scr_pair    = nullptr;
lv_obj_t *lbl_pin     = nullptr;
lv_obj_t *ta_pin      = nullptr;
lv_obj_t *kb_pin      = nullptr;
lv_obj_t *lbl_status  = nullptr;

// Alarm popup
lv_obj_t *scr_alarm   = nullptr;
lv_obj_t *lbl_alm_time = nullptr;

// Check-in screen
lv_obj_t *scr_checkin = nullptr;
lv_obj_t *cont_habits = nullptr;

// ─── Forward declarations ───────────────────────────────────────────────────────
void buildClockScreen();
void buildPairingScreen();
void buildAlarmScreen();
void buildCheckinScreen();
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

// ─── NVS helpers ───────────────────────────────────────────────────────────────
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

// ─── HTTP helpers ──────────────────────────────────────────────────────────────
String httpGet(const String &path) {
  if (WiFi.status() != WL_CONNECTED) return "";
  HTTPClient http;
  http.begin(String(API_BASE_URL) + path);
  http.addHeader("X-Device-Key", g_apiKey);
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

// ─── Schedule fetch ────────────────────────────────────────────────────────────
void fetchSchedule() {
  String resp = httpGet("/api/device/schedule");
  if (resp.isEmpty()) return;

  StaticJsonDocument<2048> doc;
  if (deserializeJson(doc, resp)) { Serial.println("[schedule] parse error"); return; }

  // Parse alarms
  g_alarmCount = 0;
  JsonArray alarms = doc["alarms"].as<JsonArray>();
  for (JsonObject a : alarms) {
    if (g_alarmCount >= MAX_ALARMS) break;
    AlarmEntry &e = g_alarms[g_alarmCount];
    e.id      = a["id"].as<String>();
    e.hour    = a["hour"]   | 9;
    e.minute  = a["minute"] | 0;
    e.enabled = a["enabled"] | true;
    e.daysCount = 0;
    JsonArray days = a["daysOfWeek"].as<JsonArray>();
    for (int d : days) {
      if (e.daysCount < 7) e.daysOfWeek[e.daysCount++] = d;
    }
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

  // Refresh alarm label on clock face
  if (lbl_alarm) lv_label_set_text(lbl_alarm, nextAlarmString().c_str());
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
  char buf[32];
  if (firedAt > 0) {
    struct tm t; gmtime_r(&firedAt, &t);
    strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &t);
    doc["firedAt"] = buf;
  }
  if (dismissedAt > 0) {
    struct tm t; gmtime_r(&dismissedAt, &t);
    strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &t);
    doc["dismissedAt"] = buf;
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

String nextAlarmString() {
  if (g_alarmCount == 0) return "No alarm set";
  // Find first enabled alarm
  for (int i = 0; i < g_alarmCount; i++) {
    if (g_alarms[i].enabled) {
      int h = g_alarms[i].hour;
      int m = g_alarms[i].minute;
      bool pm = h >= 12;
      int h12 = h % 12; if (h12 == 0) h12 = 12;
      char buf[16];
      snprintf(buf, sizeof(buf), "%d:%02d %s", h12, m, pm ? "PM" : "AM");
      return String(buf);
    }
  }
  return "No alarm set";
}

// ─── Clock face ────────────────────────────────────────────────────────────────
void buildClockScreen() {
  scr_clock = lv_obj_create(nullptr);
  lv_obj_set_style_bg_color(scr_clock, lv_color_hex(0x0D0D1A), LV_PART_MAIN);
  lv_obj_clear_flag(scr_clock, LV_OBJ_FLAG_SCROLLABLE);

  // Time label — large, centred
  lbl_time = lv_label_create(scr_clock);
  lv_obj_set_style_text_font(lbl_time, &lv_font_montserrat_48, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_time, lv_color_hex(0xEEEEFF), LV_PART_MAIN);
  lv_obj_align(lbl_time, LV_ALIGN_CENTER, -40, -30);
  lv_label_set_text(lbl_time, "00:00");

  // AM/PM label
  lbl_ampm = lv_label_create(scr_clock);
  lv_obj_set_style_text_font(lbl_ampm, &lv_font_montserrat_20, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_ampm, lv_color_hex(0x9090B8), LV_PART_MAIN);
  lv_obj_align(lbl_ampm, LV_ALIGN_CENTER, 160, -20);
  lv_label_set_text(lbl_ampm, "AM");

  // Date label
  lbl_date = lv_label_create(scr_clock);
  lv_obj_set_style_text_font(lbl_date, &lv_font_montserrat_20, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_date, lv_color_hex(0x9090B8), LV_PART_MAIN);
  lv_obj_align(lbl_date, LV_ALIGN_CENTER, 0, 30);
  lv_label_set_text(lbl_date, "Monday, Jan 1");

  // WiFi status
  lbl_wifi = lv_label_create(scr_clock);
  lv_obj_set_style_text_font(lbl_wifi, &lv_font_montserrat_14, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_wifi, lv_color_hex(0x9090B8), LV_PART_MAIN);
  lv_obj_align(lbl_wifi, LV_ALIGN_TOP_RIGHT, -16, 12);
  lv_label_set_text(lbl_wifi, "WiFi");

  // Next alarm label
  lbl_alarm = lv_label_create(scr_clock);
  lv_obj_set_style_text_font(lbl_alarm, &lv_font_montserrat_20, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_alarm, lv_color_hex(0x7B74FF), LV_PART_MAIN);
  lv_obj_align(lbl_alarm, LV_ALIGN_BOTTOM_MID, 0, -20);
  lv_label_set_text(lbl_alarm, "No alarm set");
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

  // Date
  const char *days[]   = { "Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday" };
  const char *months[] = { "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec" };
  char dateBuf[32];
  snprintf(dateBuf, sizeof(dateBuf), "%s, %s %d", days[t.tm_wday], months[t.tm_mon], t.tm_mday);
  lv_label_set_text(lbl_date, dateBuf);

  // WiFi
  lv_label_set_text(lbl_wifi, WiFi.status() == WL_CONNECTED ? "WiFi" : "No WiFi");

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
}

// ─── Pairing screen ────────────────────────────────────────────────────────────
static void cb_pair_connect(lv_event_t *e) {
  const char *token = lv_textarea_get_text(ta_pin);
  if (!token || strlen(token) < 4) {
    lv_label_set_text(lbl_status, "Enter the 6-char PIN from the Jack app");
    return;
  }
  lv_label_set_text(lbl_status, "Connecting...");
  lv_timer_handler();

  if (registerDevice(token)) {
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
  lv_obj_set_size(kb_pin, LCD_H_RES, 200);
  lv_obj_align(kb_pin, LV_ALIGN_BOTTOM_MID, 0, 0);
}

void showPairingScreen() {
  lv_disp_load_scr(scr_pair);
}

// ─── Alarm popup ───────────────────────────────────────────────────────────────
static time_t g_alarmFiredAt = 0;

static void cb_snooze(lv_event_t *e) {
  g_snoozeCount++;
  sendEvent("snooze", g_alarms[g_firedAlarmIdx].id.c_str(), g_alarmFiredAt, 0, g_snoozeCount);
  g_alarmFired = false;
  showClockScreen();
}

static void cb_dismiss(lv_event_t *e) {
  g_alarmFired = true; // keep true so alarm doesn't re-fire this minute
  g_inCheckin  = true;
  // Reset ratings
  for (int i = 0; i < MAX_HABITS; i++) g_ratings[i] = 0;
  showCheckinScreen();
}

void buildAlarmScreen() {
  scr_alarm = lv_obj_create(nullptr);
  lv_obj_set_style_bg_color(scr_alarm, lv_color_hex(0x0D0D1A), LV_PART_MAIN);
  lv_obj_clear_flag(scr_alarm, LV_OBJ_FLAG_SCROLLABLE);

  lv_obj_t *icon = lv_label_create(scr_alarm);
  lv_obj_set_style_text_font(icon, &lv_font_montserrat_48, LV_PART_MAIN);
  lv_obj_set_style_text_color(icon, lv_color_hex(0x7B74FF), LV_PART_MAIN);
  lv_obj_align(icon, LV_ALIGN_CENTER, 0, -120);
  lv_label_set_text(icon, LV_SYMBOL_BELL);

  lbl_alm_time = lv_label_create(scr_alarm);
  lv_obj_set_style_text_font(lbl_alm_time, &lv_font_montserrat_48, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_alm_time, lv_color_hex(0xEEEEFF), LV_PART_MAIN);
  lv_obj_align(lbl_alm_time, LV_ALIGN_CENTER, 0, -50);
  lv_label_set_text(lbl_alm_time, "00:00 AM");

  lv_obj_t *sub = lv_label_create(scr_alarm);
  lv_obj_set_style_text_font(sub, &lv_font_montserrat_20, LV_PART_MAIN);
  lv_obj_set_style_text_color(sub, lv_color_hex(0x9090B8), LV_PART_MAIN);
  lv_obj_align(sub, LV_ALIGN_CENTER, 0, 10);
  lv_label_set_text(sub, "Good morning — time to rise");

  // Snooze button
  lv_obj_t *btnSnooze = lv_btn_create(scr_alarm);
  lv_obj_set_size(btnSnooze, 220, 72);
  lv_obj_align(btnSnooze, LV_ALIGN_CENTER, -130, 90);
  lv_obj_set_style_bg_color(btnSnooze, lv_color_hex(0x374151), LV_PART_MAIN);
  lv_obj_add_event_cb(btnSnooze, cb_snooze, LV_EVENT_CLICKED, nullptr);
  lv_obj_t *lblSnooze = lv_label_create(btnSnooze);
  lv_label_set_text(lblSnooze, "SNOOZE  9 min");
  lv_obj_set_style_text_font(lblSnooze, &lv_font_montserrat_20, LV_PART_MAIN);
  lv_obj_center(lblSnooze);

  // Dismiss button
  lv_obj_t *btnDismiss = lv_btn_create(scr_alarm);
  lv_obj_set_size(btnDismiss, 220, 72);
  lv_obj_align(btnDismiss, LV_ALIGN_CENTER, 130, 90);
  lv_obj_set_style_bg_color(btnDismiss, lv_color_hex(0x7B74FF), LV_PART_MAIN);
  lv_obj_add_event_cb(btnDismiss, cb_dismiss, LV_EVENT_CLICKED, nullptr);
  lv_obj_t *lblDismiss = lv_label_create(btnDismiss);
  lv_label_set_text(lblDismiss, "DISMISS & CHECK IN");
  lv_obj_set_style_text_font(lblDismiss, &lv_font_montserrat_16, LV_PART_MAIN);
  lv_obj_center(lblDismiss);
}

void showAlarmScreen(int alarmIdx) {
  g_alarmFiredAt = time(nullptr);
  if (alarmIdx >= 0 && alarmIdx < g_alarmCount) {
    int h = g_alarms[alarmIdx].hour;
    int m = g_alarms[alarmIdx].minute;
    bool pm = h >= 12;
    int h12 = h % 12; if (h12 == 0) h12 = 12;
    char buf[16];
    snprintf(buf, sizeof(buf), "%d:%02d %s", h12, m, pm ? "PM" : "AM");
    lv_label_set_text(lbl_alm_time, buf);
  }
  lv_disp_load_scr(scr_alarm);
}

// ─── Check-in screen ───────────────────────────────────────────────────────────
static lv_obj_t *g_ratingBtns[MAX_HABITS][3]; // [habit][0=red,1=yellow,2=green]

static void cb_rate(lv_event_t *e) {
  uint32_t data = (uint32_t)(uintptr_t)lv_event_get_user_data(e);
  int habitIdx  = (data >> 4) & 0xF;
  int rating    = (data & 0xF);  // 1=red,2=yellow,3=green
  g_ratings[habitIdx] = rating;

  // Update button styles
  static const uint32_t colors[] = { 0, 0xEF4444, 0xF59E0B, 0x22C55E };
  static const uint32_t dimmed[] = { 0, 0x4A1010, 0x4A3010, 0x103010 };
  for (int r = 1; r <= 3; r++) {
    lv_obj_t *btn = g_ratingBtns[habitIdx][r - 1];
    if (btn) {
      lv_obj_set_style_bg_color(btn,
        lv_color_hex(g_ratings[habitIdx] == r ? colors[r] : dimmed[r]),
        LV_PART_MAIN);
    }
  }
}

static void cb_done(lv_event_t *e) {
  time_t now = time(nullptr);
  sendEvent("alarm_dismissed",
            g_firedAlarmIdx >= 0 ? g_alarms[g_firedAlarmIdx].id.c_str() : "",
            g_alarmFiredAt, now, g_snoozeCount);
  submitCheckin();
  g_alarmFired = false;
  g_inCheckin  = false;
  g_firedAlarmIdx = -1;
  showClockScreen();
}

void buildCheckinScreen() {
  scr_checkin = lv_obj_create(nullptr);
  lv_obj_set_style_bg_color(scr_checkin, lv_color_hex(0x0D0D1A), LV_PART_MAIN);
  lv_obj_clear_flag(scr_checkin, LV_OBJ_FLAG_SCROLLABLE);

  lv_obj_t *title = lv_label_create(scr_checkin);
  lv_obj_set_style_text_font(title, &lv_font_montserrat_28, LV_PART_MAIN);
  lv_obj_set_style_text_color(title, lv_color_hex(0xEEEEFF), LV_PART_MAIN);
  lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 12);
  lv_label_set_text(title, "Yesterday's Check-in");

  // Scrollable habit container
  cont_habits = lv_obj_create(scr_checkin);
  lv_obj_set_size(cont_habits, LCD_H_RES - 20, LCD_V_RES - 100);
  lv_obj_align(cont_habits, LV_ALIGN_TOP_MID, 0, 50);
  lv_obj_set_style_bg_color(cont_habits, lv_color_hex(0x0D0D1A), LV_PART_MAIN);
  lv_obj_set_style_border_width(cont_habits, 0, LV_PART_MAIN);
  lv_obj_set_flex_flow(cont_habits, LV_FLEX_FLOW_COLUMN);
  lv_obj_set_flex_align(cont_habits, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
  lv_obj_set_style_pad_row(cont_habits, 6, LV_PART_MAIN);

  // Done button
  lv_obj_t *btnDone = lv_btn_create(scr_checkin);
  lv_obj_set_size(btnDone, 200, 52);
  lv_obj_align(btnDone, LV_ALIGN_BOTTOM_MID, 0, -8);
  lv_obj_set_style_bg_color(btnDone, lv_color_hex(0x7B74FF), LV_PART_MAIN);
  lv_obj_add_event_cb(btnDone, cb_done, LV_EVENT_CLICKED, nullptr);
  lv_obj_t *lblDone = lv_label_create(btnDone);
  lv_label_set_text(lblDone, "Done");
  lv_obj_set_style_text_font(lblDone, &lv_font_montserrat_20, LV_PART_MAIN);
  lv_obj_center(lblDone);
}

void showCheckinScreen() {
  // Clear and rebuild habit rows
  lv_obj_clean(cont_habits);
  memset(g_ratingBtns, 0, sizeof(g_ratingBtns));

  int count = g_habitCount > MAX_HABITS ? MAX_HABITS : g_habitCount;
  for (int i = 0; i < count; i++) {
    lv_obj_t *row = lv_obj_create(cont_habits);
    lv_obj_set_size(row, LCD_H_RES - 40, 52);
    lv_obj_set_style_bg_color(row, lv_color_hex(0x1A1A2E), LV_PART_MAIN);
    lv_obj_set_style_border_width(row, 0, LV_PART_MAIN);
    lv_obj_set_style_radius(row, 8, LV_PART_MAIN);
    lv_obj_clear_flag(row, LV_OBJ_FLAG_SCROLLABLE);

    // Habit name
    lv_obj_t *lbl = lv_label_create(row);
    lv_obj_set_style_text_font(lbl, &lv_font_montserrat_16, LV_PART_MAIN);
    lv_obj_set_style_text_color(lbl, lv_color_hex(0xEEEEFF), LV_PART_MAIN);
    lv_obj_align(lbl, LV_ALIGN_LEFT_MID, 10, 0);
    lv_obj_set_width(lbl, 400);
    lv_label_set_long_mode(lbl, LV_LABEL_LONG_DOT);
    lv_label_set_text(lbl, g_habits[i].name.c_str());

    // Rating buttons: Red, Yellow, Green
    static const char *rLabels[] = { "MISS", "OKAY", "WIN" };
    static const uint32_t rDimmed[] = { 0x4A1010, 0x4A3010, 0x103010 };
    for (int r = 1; r <= 3; r++) {
      lv_obj_t *btn = lv_btn_create(row);
      lv_obj_set_size(btn, 80, 36);
      lv_obj_align(btn, LV_ALIGN_RIGHT_MID, -10 - (3 - r) * 90, 0);
      lv_obj_set_style_bg_color(btn, lv_color_hex(rDimmed[r - 1]), LV_PART_MAIN);
      lv_obj_set_style_radius(btn, 6, LV_PART_MAIN);
      uint32_t ud = ((uint32_t)i << 4) | (uint32_t)r;
      lv_obj_add_event_cb(btn, cb_rate, LV_EVENT_CLICKED, (void *)(uintptr_t)ud);
      lv_obj_t *bl = lv_label_create(btn);
      lv_label_set_text(bl, rLabels[r - 1]);
      lv_obj_set_style_text_font(bl, &lv_font_montserrat_14, LV_PART_MAIN);
      lv_obj_center(bl);
      g_ratingBtns[i][r - 1] = btn;
    }
  }

  lv_disp_load_scr(scr_checkin);
}

// ─── Setup ─────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);

  // PSRAM init
#if CONFIG_SPIRAM_SUPPORT
  if (!psramInit()) { Serial.println("PSRAM init failed"); while (1); }
  Serial.printf("PSRAM: %d MB\n", ESP.getPsramSize() / 1024 / 1024);
#endif

  // I2C + backlight
  Wire.begin(15, 16);
  delay(50);
  while (1) {
    if (i2cScanForAddress(0x30) && i2cScanForAddress(0x5D)) break;
    sendI2CCommand(0x19);
    pinMode(1, OUTPUT); digitalWrite(1, LOW); delay(120); pinMode(1, INPUT); delay(100);
  }
  Wire.beginTransmission(0x30); Wire.write(0x10); Wire.endTransmission();
  Wire.write(0x18); Wire.endTransmission();

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

  // Build all screens
  buildClockScreen();
  buildPairingScreen();
  buildAlarmScreen();
  buildCheckinScreen();

  // Show clock screen with "Connecting..." while WiFi starts
  lv_label_set_text(lbl_time, "...");
  lv_label_set_text(lbl_date, "Connecting to WiFi");
  showClockScreen();
  lv_timer_handler();

  // WiFiManager — auto-connects or opens captive portal
  WiFiManager wm;
  wm.setConfigPortalTimeout(120);
  if (!wm.autoConnect("Jack-Clock")) {
    Serial.println("[WiFi] Portal timeout, rebooting");
    ESP.restart();
  }
  Serial.printf("[WiFi] Connected: %s\n", WiFi.localIP().toString().c_str());

  // NTP sync
  configTime(TZ_OFFSET_SEC, TZ_DST_SEC, NTP_SERVER);
  Serial.println("[NTP] Syncing...");
  time_t now = 0;
  for (int i = 0; i < 20 && now < 1000000000; i++) { delay(500); now = time(nullptr); }
  Serial.printf("[NTP] Time: %ld\n", now);

  // Load NVS API key
  loadApiKey();

  if (g_apiKey.isEmpty()) {
    // No key — show pairing screen
    showPairingScreen();
  } else {
    // Fetch schedule and show clock
    fetchSchedule();
    showClockScreen();
  }

  g_lastPoll      = millis();
  g_lastHeartbeat = millis();
  g_lastClockUpd  = millis();

  Serial.println("[setup] done");
}

// ─── Loop ──────────────────────────────────────────────────────────────────────
void loop() {
  lv_timer_handler();

  unsigned long now = millis();

  // Update clock every second (only on clock screen)
  if (now - g_lastClockUpd >= CLOCK_UPDATE_MS) {
    g_lastClockUpd = now;
    if (!g_alarmFired && !g_inCheckin && lv_disp_get_scr_act(nullptr) == scr_clock) {
      updateClockLabel();
    }
  }

  // Poll schedule every 5 min
  if (!g_apiKey.isEmpty() && now - g_lastPoll >= POLL_INTERVAL_MS) {
    g_lastPoll = now;
    fetchSchedule();
  }

  // Heartbeat every 5 min
  if (!g_apiKey.isEmpty() && now - g_lastHeartbeat >= POLL_INTERVAL_MS) {
    g_lastHeartbeat = now;
    sendHeartbeat();
  }

  delay(1);
}
