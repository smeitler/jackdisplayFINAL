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

// ─── Audio / SD card ──────────────────────────────────────────────────────────
// CrowPanel Advance 5" uses SD_MMC (1-bit SDIO) for the SD card — the CS pin
// is NOT connected to any GPIO (SD_CS = 0 per Elecrow schematic).
// Audio playback uses JackAudio (minimp3 + ESP-IDF I2S std driver) — a
// self-contained module with zero external library dependencies.
// I2S pins: BCLK=5, LRC=6, DOUT=4 (confirmed from official Elecrow source).
#include <SD_MMC.h>
#include "../lib/minimp3/JackAudio.h"

// CrowPanel Advance 5" I2S pin definitions (from Elecrow official source)
#define I2S_DOUT_PIN  4
#define I2S_BCLK_PIN  5
#define I2S_LRC_PIN   6

// NVS keys for audio and voice features
#define NVS_KEY_AUDIO       "audioEnabled"
#define NVS_KEY_VOICE       "voiceEnabled"   // "Hey Jack" wake word on/off
#define NVS_KEY_LOW_EMF     "lowEmfMode"     // WiFi off while sleeping
#define NVS_KEY_WIFI_OFF_H  "wifiOffHour"    // hour to turn WiFi off (0-23)
#define NVS_KEY_WIFI_ON_H   "wifiOnHour"     // hour to turn WiFi on  (0-23)

// Microphone pins (PDM mic built into CrowPanel Advance 5")
#define MIC_WS_PIN   2    // WS / clock
#define MIC_SCK_PIN  19   // SCK
#define MIC_SD_PIN   20   // SD / data

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
  time_t nextFire;      // unix timestamp of next scheduled fire (0 = not scheduled)
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
time_t     g_alarmFiredAt  = 0;   // unix timestamp when current alarm fired
int        g_firedAlarmIdx = 0;   // index into g_alarms of the currently firing alarm
HabitEntry g_habits[MAX_HABITS];
int        g_habitCount = 0;

// Ratings for check-in: 0=unrated, 1=red, 2=yellow, 3=green
int g_ratings[MAX_HABITS];

// Which alarm fired (index into g_alarms, -1 = none)
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
// Voice listening overlay (shown while mic is recording)
lv_obj_t *overlay_listening = nullptr;

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

// ─── Audio state ──────────────────────────────────────────────────────────
bool  g_audioEnabled  = false;  // "Read Habits Aloud" toggle
bool  g_sdMounted     = false;  // SD card successfully initialized
JackAudio g_audio;              // minimp3 + ESP-IDF I2S (no external library deps)

// Habit audio filenames cached from last manifest fetch
// Key = habit name (lowercase, sanitized), Value = SD path like "/habits/exercise.mp3"
struct AudioEntry { char name[64]; char path[96]; };
#define MAX_AUDIO_FILES 64
AudioEntry g_audioFiles[MAX_AUDIO_FILES];
int        g_audioFileCount = 0;

// ─── Voice system state ───────────────────────────────────────────────────────
bool   g_voiceEnabled  = false;  // "Hey Jack" wake word toggle
bool   g_listening     = false;  // currently recording a command
bool   g_wakeDetected  = false;  // wake word just fired (set by mic task)
uint8_t *g_micBuf      = nullptr; // raw PCM buffer for recording
size_t  g_micBufLen    = 0;

// Simple keyword spotting — we listen for these fixed commands offline
// (no ESP-SR dependency required; uses energy + keyword matching on PCM)
#define WAKE_WORD        "hey jack"
#define CMD_SNOOZE       "snooze"
#define CMD_STOP         "stop"
#define CMD_SKIP         "skip"
#define CMD_DONE         "done"

// ─── Journal/Gratitude/MindDump recording state ─────────────────────────────
bool            g_recActive    = false;  // currently recording a journal/gratitude/minddump
i2s_chan_handle_t g_recHandle  = nullptr; // I2S channel handle while recording
File            g_recFile;               // SD file being written
size_t          g_recDataBytes = 0;      // PCM bytes written so far (for WAV header)
lv_obj_t       *g_recScreen    = nullptr; // the full-screen recording UI
lv_obj_t       *g_recBars[8]   = {};      // VU-meter bar objects
lv_timer_t     *g_recTimer     = nullptr; // LVGL timer that drives the VU animation

// ─── Low EMF / WiFi sleep mode ────────────────────────────────────────────────
bool g_lowEmfMode   = false;  // WiFi off while sleeping
int  g_wifiOffHour  = 22;     // 10 PM
int  g_wifiOnHour   = 6;      // 6 AM
bool g_wifiManuallyOff = false; // WiFi was turned off by Low EMF scheduler

// Pending command queue — commands issued while WiFi is off
struct PendingCmd { char type[32]; int iVal1; int iVal2; bool bVal; };
#define MAX_PENDING 8
PendingCmd g_pendingCmds[MAX_PENDING];
int        g_pendingCount = 0;

// ─── Forward declarations ───────────────────────────────────────────────────────────────────
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
void showAlarmSetScreen();
void showJournalScreen();
void showGratitudeScreen();
void showHabitsScreen();
void showRecordMenu();
void showRecordingScreen(const char *category, const char *folder);
static void buildTopNavButtons(lv_color_t col);
bool rtcRead(struct tm *t);   // read PCF8563 -> struct tm (local time)
// Audio
bool  initSD();
void  syncAudioFiles();
void  playHabitAudio(const char *habitName);
void  stopAudio();
void  loopAudio();
bool  loadAudioEnabled();
void  saveAudioEnabled(bool enabled);
// Voice system
bool  loadVoiceEnabled();
void  saveVoiceEnabled(bool enabled);
void  initMic();
void  loopVoice();
void  startListening();
void  stopListening();
void  showListeningOverlay();
void  hideListeningOverlay();
void  sendVoiceToServer(uint8_t *buf, size_t len);
void  playSystemAudio(const char *key);
// Low EMF / WiFi scheduler
bool  loadLowEmfSettings();
void  saveLowEmfSettings();
void  checkWifiSchedule();
void  flushPendingCommands();
void  queueCommand(const char *type, int i1, int i2, bool b);
void rtcWrite(const struct tm *t); // write struct tm (local time) -> PCF8563
void rtcApplyToSystem();      // read RTC and set ESP32 system clock
String httpGet(const String &path);  // forward decl — defined after WiFi helpers
// Check-in state (used in sendVoiceToServer before the static block at line ~2255)
#define HABIT_TIMER_TICKS  100
static int  g_ciHabitIdx    = 0;
static int  g_ciTick        = 0;
static int  g_ciRereadCount = 0;
static bool g_ciListening   = false;
static void ciAdvance(int rating);  // defined at line ~2305
static lv_color_t recAccentColor();  // forward decl — defined in RECORD FEATURE section

// ─── Display flush ─────────────────────────────────────────────────────────────
void my_disp_flush(lv_disp_drv_t *disp, const lv_area_t *area, lv_color_t *color_p) {
  // NOTE: do NOT call gfx.endWrite() / gfx.startWrite() here.
  // The CrowPanel Advance 5" uses an RGB parallel bus (Panel_RGB), not SPI.
  // On RGB panels, startWrite/endWrite manage an internal transaction counter
  // that must stay > 0 at all times after gfx.startWrite() in setup().
  // Calling endWrite() from the flush callback resets that counter to 0,
  // which closes the RGB DMA descriptor chain and blanks the bottom half of
  // the display on the next frame.
  //
  // Correct pattern for RGB+DMA panels:
  //   - Call gfx.startWrite() ONCE in setup() (already done)
  //   - Never call endWrite() again
  //   - Call waitDMA() before flush_ready to prevent buffer race
  gfx.pushImageDMA(area->x1, area->y1, area->x2 - area->x1 + 1, area->y2 - area->y1 + 1,
                   (lgfx::rgb565_t *)&color_p->full);
  gfx.waitDMA();             // wait for DMA to finish before releasing buffer to LVGL
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

// ─── Audio functions ───────────────────────────────────────────────────────────────────

bool loadAudioEnabled() {
  prefs.begin(NVS_NAMESPACE, true);
  bool v = prefs.getBool(NVS_KEY_AUDIO, false);
  prefs.end();
  return v;
}

void saveAudioEnabled(bool enabled) {
  prefs.begin(NVS_NAMESPACE, false);
  prefs.putBool(NVS_KEY_AUDIO, enabled);
  prefs.end();
}

bool initSD() {
  // CrowPanel Advance 5" uses 1-bit SDIO mode via SD_MMC.
  // The CS pin is not connected (SD_CS = 0 per Elecrow schematic),
  // so standard SPI SD.begin() will never work on this board.
  // SD_MMC.begin("/sdcard", true) = 1-bit mode (required for this board).
  if (!SD_MMC.begin("/sdcard", true)) {
    Serial.println("[SD] SD_MMC mount failed — check card is inserted");
    return false;
  }
  uint64_t cardSize = SD_MMC.cardSize() / (1024 * 1024);
  Serial.printf("[SD] Card size: %llu MB\n", cardSize);
  // Ensure all audio directories exist
  const char *dirs[] = { "/habits", "/system", "/meditations", "/breathwork",
                         "/visualization", "/priming", "/journaling",
                         "/gratitudes", "/journal", "/minddump" };
  for (auto d : dirs) if (!SD_MMC.exists(d)) SD_MMC.mkdir(d);
  return true;
}

// Download a file from a URL and save it to the SD card.
// Returns true on success.
static bool downloadToSD(const String &url, const String &sdPath) {
  HTTPClient http;
  http.begin(url);
  http.setTimeout(30000);
  int code = http.GET();
  if (code != 200) {
    Serial.printf("[audio] download failed %d: %s\n", code, sdPath.c_str());
    http.end();
    return false;
  }
  // Stream to SD_MMC
  File f = SD_MMC.open(sdPath.c_str(), FILE_WRITE);
  if (!f) {
    Serial.printf("[audio] cannot open SD path: %s\n", sdPath.c_str());
    http.end();
    return false;
  }
  WiFiClient *stream = http.getStreamPtr();
  uint8_t buf[512];
  int total = 0;
  while (http.connected() && (http.getSize() < 0 || total < http.getSize())) {
    size_t avail = stream->available();
    if (avail) {
      int read = stream->readBytes(buf, min(avail, sizeof(buf)));
      f.write(buf, read);
      total += read;
    } else {
      delay(1);
    }
    if (!http.connected() && stream->available() == 0) break;
  }
  f.close();
  http.end();
  Serial.printf("[audio] downloaded %d bytes -> %s\n", total, sdPath.c_str());
  return total > 0;
}

// Sanitize a habit name to a filename-safe string (matches server logic)
static String sanitizeForFilename(const String &name) {
  String out = name;
  out.toLowerCase();
  String result = "";
  bool lastWasDash = false;
  for (int i = 0; i < (int)out.length() && i < 60; i++) {
    char c = out[i];
    if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) {
      result += c;
      lastWasDash = false;
    } else if (!lastWasDash && result.length() > 0) {
      result += '-';
      lastWasDash = true;
    }
  }
  // Strip trailing dash
  while (result.endsWith("-")) result = result.substring(0, result.length() - 1);
  return result;
}

// Fetch the audio manifest from the server and download any missing MP3s.
// Called once after WiFi connects and after each schedule sync.
void syncAudioFiles() {
  if (!g_sdMounted) return;
  if (WiFi.status() != WL_CONNECTED) return;
  if (g_apiKey.isEmpty()) return;

  Serial.println("[audio] fetching manifest...");
  String body = httpGet("/api/device/audio-manifest");
  if (body.isEmpty()) {
    Serial.println("[audio] manifest fetch failed");
    return;
  }

  JsonDocument doc;
  if (deserializeJson(doc, body) != DeserializationError::Ok) {
    Serial.println("[audio] manifest parse failed");
    return;
  }

  g_audioFileCount = 0;
  JsonArray files = doc["files"].as<JsonArray>();
  for (JsonObject f : files) {
    const char *filename = f["filename"] | "";
    const char *url      = f["url"]      | "";
    const char *text     = f["text"]     | "";
    if (!filename || !url || strlen(filename) == 0) continue;

    String sdPath = String("/") + filename;
    // Ensure parent directory exists
    String dir = sdPath.substring(0, sdPath.lastIndexOf('/'));
    if (!SD_MMC.exists(dir.c_str())) SD_MMC.mkdir(dir.c_str());

    // Download if not already on SD
    if (!SD_MMC.exists(sdPath.c_str())) {
      Serial.printf("[audio] downloading: %s\n", sdPath.c_str());
      downloadToSD(String(url), sdPath);
    } else {
      Serial.printf("[audio] already have: %s\n", sdPath.c_str());
    }

    // Cache the mapping: habit name -> SD path
    if (g_audioFileCount < MAX_AUDIO_FILES) {
      strncpy(g_audioFiles[g_audioFileCount].name, text, 63);
      strncpy(g_audioFiles[g_audioFileCount].path, sdPath.c_str(), 95);
      g_audioFileCount++;
    }
  }
  Serial.printf("[audio] manifest done, %d files\n", g_audioFileCount);
}

// Stop any currently playing audio.
void stopAudio() {
  g_audio.stop();
}

// Play the MP3 for a given habit name (looks up in g_audioFiles cache).
// Does nothing if audio is disabled, SD not mounted, or file not found.
void playHabitAudio(const char *habitName) {
  if (!g_audioEnabled || !g_sdMounted) return;

  // Find the SD path for this habit
  String target = sanitizeForFilename(String(habitName));
  const char *sdPath = nullptr;
  for (int i = 0; i < g_audioFileCount; i++) {
    if (sanitizeForFilename(String(g_audioFiles[i].name)) == target) {
      sdPath = g_audioFiles[i].path;
      break;
    }
  }
  if (!sdPath) {
    // Fallback: try the expected path directly
    String fallback = "/habits/" + target + ".mp3";
    if (SD_MMC.exists(fallback.c_str())) {
      static char fb[96];
      strncpy(fb, fallback.c_str(), 95);
      sdPath = fb;
    } else {
      Serial.printf("[audio] no file for habit: %s\n", habitName);
      return;
    }
  }

  stopAudio();
  g_audio.setVolume(18);  // 0..21, ~85% volume
  g_audio.play(sdPath);
  Serial.printf("[audio] playing: %s\n", sdPath);
}

// Call this every loop() iteration to keep the MP3 decoder fed.
void loopAudio() {
  g_audio.loop();  // JackAudio::loop() decodes one MP3 frame per call
}

// ─── Voice system ─────────────────────────────────────────────────────────────

bool loadVoiceEnabled() {
  prefs.begin(NVS_NAMESPACE, true);
  bool v = prefs.getBool(NVS_KEY_VOICE, false);
  prefs.end();
  return v;
}

void saveVoiceEnabled(bool enabled) {
  prefs.begin(NVS_NAMESPACE, false);
  prefs.putBool(NVS_KEY_VOICE, enabled);
  prefs.end();
}

// Play a system response audio file from /system/{key}.mp3 on SD card.
// Used for voice command confirmations (e.g. "Alarm set for 6:30 AM").
void playSystemAudio(const char *key) {
  if (!g_sdMounted) return;
  char path[96];
  snprintf(path, sizeof(path), "/system/%s.mp3", key);
  if (!SD_MMC.exists(path)) {
    Serial.printf("[voice] system audio not found: %s\n", path);
    return;
  }
  stopAudio();
  g_audio.setVolume(20);  // slightly louder for voice confirmations
  g_audio.play(path);
  Serial.printf("[voice] playing system audio: %s\n", path);
}

// Initialize the PDM microphone using the ESP32-S3 I2S peripheral.
void initMic() {
  // PDM mic on GPIO 2 (WS/CLK) and GPIO 20 (SD/DATA)
  // Uses I2S port 1 (port 0 is used by the speaker)
  // Note: ESP32-S3 Arduino I2S library supports PDM RX mode
  Serial.println("[mic] PDM mic init on GPIO 2/20");
  // Actual I2S/PDM init happens in startListening() to avoid
  // holding the peripheral open when not in use
}

// ─── Voice listening overlay ─────────────────────────────────────────────────
// Shows a semi-transparent overlay on the active screen with a pulsing mic icon
// and "Listening..." text so the user knows the device is recording.
void showListeningOverlay() {
  if (overlay_listening) return;  // already shown
  lv_obj_t *scr = lv_disp_get_scr_act(nullptr);
  overlay_listening = lv_obj_create(scr);
  lv_obj_set_size(overlay_listening, 320, 160);
  lv_obj_center(overlay_listening);
  lv_obj_set_style_bg_color(overlay_listening, lv_color_hex(0x0A0A1A), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(overlay_listening, LV_OPA_90, LV_PART_MAIN);
  lv_obj_set_style_border_color(overlay_listening, lv_color_hex(0x4444AA), LV_PART_MAIN);
  lv_obj_set_style_border_width(overlay_listening, 2, LV_PART_MAIN);
  lv_obj_set_style_radius(overlay_listening, 20, LV_PART_MAIN);
  lv_obj_clear_flag(overlay_listening, LV_OBJ_FLAG_SCROLLABLE);
  // Mic icon (large)
  lv_obj_t *lblMic = lv_label_create(overlay_listening);
  lv_obj_set_style_text_font(lblMic, &lv_font_montserrat_48, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblMic, lv_color_hex(0x6666FF), LV_PART_MAIN);
  lv_obj_align(lblMic, LV_ALIGN_TOP_MID, 0, 18);
  lv_label_set_text(lblMic, LV_SYMBOL_AUDIO);
  // "Listening..." text
  lv_obj_t *lblTxt = lv_label_create(overlay_listening);
  lv_obj_set_style_text_font(lblTxt, &lv_font_montserrat_18, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblTxt, lv_color_hex(0xAAAADD), LV_PART_MAIN);
  lv_obj_align(lblTxt, LV_ALIGN_BOTTOM_MID, 0, -18);
  lv_label_set_text(lblTxt, "Listening...");
  lv_timer_handler();  // force immediate render
}

void hideListeningOverlay() {
  if (!overlay_listening) return;
  lv_obj_del(overlay_listening);
  overlay_listening = nullptr;
  lv_timer_handler();  // force immediate redraw
}

// Start recording a voice command (called after wake word detected).
// Records ~3 seconds of 16kHz mono PCM into g_micBuf.
void startListening() {
  if (g_listening) return;
  g_listening = true;
  Serial.println("[voice] listening...");
  showListeningOverlay();  // show on-screen indicator immediately

  // Allocate 3 seconds at 16kHz 16-bit mono = 96KB
  const size_t RECORD_SAMPLES = 16000 * 3;
  const size_t RECORD_BYTES   = RECORD_SAMPLES * 2;
  if (!g_micBuf) {
    g_micBuf = (uint8_t *)ps_malloc(RECORD_BYTES);
    if (!g_micBuf) {
      Serial.println("[voice] failed to alloc mic buffer");
      g_listening = false;
      return;
    }
  }
  g_micBufLen = 0;

  // Configure I2S PDM RX using IDF5 new-style API
  // PDM mic: WS/CLK on GPIO 2, DATA on GPIO 20, using I2S port 1
  i2s_chan_handle_t rx_handle = nullptr;
  i2s_chan_config_t chan_cfg = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_1, I2S_ROLE_MASTER);
  chan_cfg.auto_clear = true;
  i2s_new_channel(&chan_cfg, nullptr, &rx_handle);

  i2s_pdm_rx_config_t pdm_cfg = {
    .clk_cfg  = I2S_PDM_RX_CLK_DEFAULT_CONFIG(16000),
    .slot_cfg = I2S_PDM_RX_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO),
    .gpio_cfg = {
      .clk  = (gpio_num_t)MIC_WS_PIN,   // GPIO 2
      .din  = (gpio_num_t)MIC_SD_PIN,   // GPIO 20
      .invert_flags = { .clk_inv = false }
    }
  };
  i2s_channel_init_pdm_rx_mode(rx_handle, &pdm_cfg);
  i2s_channel_enable(rx_handle);

  // Read 3 seconds of samples
  size_t bytesRead = 0;
  unsigned long start = millis();
  while (millis() - start < 3000 && g_micBufLen < RECORD_BYTES) {
    size_t toRead = min((size_t)1024, RECORD_BYTES - g_micBufLen);
    i2s_channel_read(rx_handle, g_micBuf + g_micBufLen, toRead, &bytesRead, pdMS_TO_TICKS(100));
    g_micBufLen += bytesRead;
  }

  i2s_channel_disable(rx_handle);
  i2s_del_channel(rx_handle);
  g_listening = false;
  hideListeningOverlay();  // remove on-screen indicator
  Serial.printf("[voice] recorded %d bytes\n", (int)g_micBufLen);
  // Send to server for transcription (requires WiFi)
  if (WiFi.status() == WL_CONNECTED && g_micBufLen > 0) {
    sendVoiceToServer(g_micBuf, g_micBufLen);
  } else if (g_micBufLen > 0) {
    // WiFi off — do simple local keyword matching
    // (energy-based: just check if audio is loud enough to be speech)
    Serial.println("[voice] no WiFi, using local keyword matching");
    // For now play "no wifi" response
    playSystemAudio("no_wifi");
  }
}

void stopListening() {
  g_listening = false;
  g_wakeDetected = false;
  hideListeningOverlay();
}

// Send recorded audio to the backend STT endpoint.
// The server transcribes it, parses the command, and returns a responseKey.
void sendVoiceToServer(uint8_t *buf, size_t len) {
  if (WiFi.status() != WL_CONNECTED || len == 0) return;

  HTTPClient http;
  String url = String(API_BASE_URL) + "/device/voice/transcribe";
  http.begin(url);
  http.addHeader("X-Device-Key", g_apiKey);
  http.addHeader("Content-Type", "audio/pcm");  // raw 16kHz 16-bit mono PCM
  http.setTimeout(15000);

  int code = http.POST(buf, len);
  if (code == 200) {
    String body = http.getString();
    // Parse responseKey from JSON: {"responseKey":"alarm_set_6_30_am", ...}
    DynamicJsonDocument doc(512);
    if (deserializeJson(doc, body) == DeserializationError::Ok) {
      const char *responseKey = doc["responseKey"] | "ok";
      const char *cmdType     = doc["command"]["type"] | "unknown";
      Serial.printf("[voice] cmd=%s responseKey=%s\n", cmdType, responseKey);

      // Handle local actions
      if (strcmp(cmdType, "snooze") == 0 && g_alarmFired) {
        int mins = doc["command"]["minutes"] | 9;
        Serial.printf("[voice] snooze %d min\n", mins);
        buzzerOff();
        g_snoozeCount++;
        sendEvent("snooze", g_alarms[g_firedAlarmIdx].id.c_str(), g_alarmFiredAt, 0, g_snoozeCount);
        // Re-arm alarm after snooze duration
        g_alarms[g_firedAlarmIdx].nextFire = time(nullptr) + (mins * 60);
        g_alarmFired = false;
        showClockScreen();
      } else if (strcmp(cmdType, "stop_alarm") == 0 && g_alarmFired) {
        Serial.println("[voice] stop alarm");
        buzzerOff();
        g_alarmFired = false;
        g_inCheckin  = true;
        g_ciHabitIdx = 0;
        memset(g_ratings, 0, sizeof(g_ratings));
        showCheckinScreen();
      } else if (strcmp(cmdType, "set_alarm") == 0) {
        // Server already updated the alarm; refresh local schedule
        fetchSchedule();
        updateAlarmLabels();
      } else if (strcmp(cmdType, "alarm_off") == 0 || strcmp(cmdType, "alarm_on") == 0) {
        // Server already updated; refresh
        fetchSchedule();
        updateAlarmLabels();
      } else if (strcmp(cmdType, "habit_green") == 0 && g_inCheckin) {
        ciAdvance(3);  // green = won
      } else if (strcmp(cmdType, "habit_yellow") == 0 && g_inCheckin) {
        ciAdvance(2);  // yellow = partial
      } else if (strcmp(cmdType, "habit_red") == 0 && g_inCheckin) {
        ciAdvance(1);  // red = missed
      } else if (strcmp(cmdType, "skip_habit") == 0 && g_inCheckin) {
        ciAdvance(0);  // 0 = no response / skipped
      }

      // Play the confirmation audio
      playSystemAudio(responseKey);
    }
  } else {
    Serial.printf("[voice] STT error %d\n", code);
    playSystemAudio("not_understood");
  }
  http.end();
}

// Called every loop() to check for voice activity (simple energy detection).
// When energy exceeds threshold, triggers startListening() for full recording.
void loopVoice() {
  if (!g_voiceEnabled || g_listening || (g_audioEnabled && g_audio.isPlaying())) return;
  // TODO: integrate ESP-SR wake word engine here.
  // For now this is a placeholder — the voice system is activated by a
  // dedicated "Listen" button on the clock face (long-press on the screen).
  // Full always-on wake word detection requires the esp-sr component which
  // needs an IDF-based build. This will be added in a future firmware update.
}

// ─── Low EMF / WiFi sleep mode ────────────────────────────────────────────────

bool loadLowEmfSettings() {
  prefs.begin(NVS_NAMESPACE, true);
  g_lowEmfMode  = prefs.getBool(NVS_KEY_LOW_EMF, false);
  g_wifiOffHour = prefs.getInt(NVS_KEY_WIFI_OFF_H, 22);
  g_wifiOnHour  = prefs.getInt(NVS_KEY_WIFI_ON_H, 6);
  prefs.end();
  return g_lowEmfMode;
}

void saveLowEmfSettings() {
  prefs.begin(NVS_NAMESPACE, false);
  prefs.putBool(NVS_KEY_LOW_EMF, g_lowEmfMode);
  prefs.putInt(NVS_KEY_WIFI_OFF_H, g_wifiOffHour);
  prefs.putInt(NVS_KEY_WIFI_ON_H, g_wifiOnHour);
  prefs.end();
}

// Queue a command to be flushed when WiFi reconnects.
void queueCommand(const char *type, int i1, int i2, bool b) {
  if (g_pendingCount >= MAX_PENDING) return;
  PendingCmd &cmd = g_pendingCmds[g_pendingCount++];
  strncpy(cmd.type, type, 31);
  cmd.iVal1 = i1; cmd.iVal2 = i2; cmd.bVal = b;
  Serial.printf("[emf] queued: %s %d %d\n", type, i1, i2);
}

// Flush any queued commands to the server now that WiFi is back.
void flushPendingCommands() {
  if (g_pendingCount == 0 || WiFi.status() != WL_CONNECTED) return;
  Serial.printf("[emf] flushing %d pending commands\n", g_pendingCount);
  for (int i = 0; i < g_pendingCount; i++) {
    PendingCmd &cmd = g_pendingCmds[i];
    if (strcmp(cmd.type, "set_alarm") == 0) {
      // POST alarm to server
      String body = String("{\"hour\":") + cmd.iVal1 +
                    ",\"minute\":\"" + cmd.iVal2 +
                    ",\"enabled\":true}";
      HTTPClient http;
      http.begin(String(API_BASE_URL) + "/device/alarm");
      http.addHeader("X-Device-Key", g_apiKey);
      http.addHeader("Content-Type", "application/json");
      http.POST(body);
      http.end();
    }
  }
  g_pendingCount = 0;
}

// Check if WiFi should be turned on or off based on current time and Low EMF schedule.
void checkWifiSchedule() {
  if (!g_lowEmfMode) return;

  struct tm t;
  if (!getLocalTime(&t)) return;
  int hour = t.tm_hour;

  bool shouldBeOff;
  if (g_wifiOffHour > g_wifiOnHour) {
    // e.g. off at 22, on at 6: off during 22-23 and 0-5
    shouldBeOff = (hour >= g_wifiOffHour || hour < g_wifiOnHour);
  } else {
    // e.g. off at 2, on at 6: off during 2-5
    shouldBeOff = (hour >= g_wifiOffHour && hour < g_wifiOnHour);
  }

  if (shouldBeOff && WiFi.status() == WL_CONNECTED) {
    Serial.println("[emf] Low EMF: turning WiFi off");
    WiFi.disconnect(true);
    WiFi.mode(WIFI_OFF);
    g_wifiManuallyOff = true;
    playSystemAudio("wifi_off");
  } else if (!shouldBeOff && g_wifiManuallyOff) {
    Serial.println("[emf] Low EMF: turning WiFi back on");
    WiFi.mode(WIFI_STA);
    String ssid = prefs.getString(NVS_KEY_WIFI_SSID, "");
    String pass = prefs.getString(NVS_KEY_WIFI_PASS, "");
    if (ssid.length() > 0) {
      WiFi.begin(ssid.c_str(), pass.c_str());
      unsigned long t0 = millis();
      while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000) delay(200);
      if (WiFi.status() == WL_CONNECTED) {
        g_wifiManuallyOff = false;
        playSystemAudio("wifi_on");
        flushPendingCommands();
        fetchSchedule();
        syncAudioFiles();
      }
    }
  }
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
  if (!lbl_alarm1 || !lbl_alarm2) return;

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
    syncAudioFiles();  // Download any new/missing habit audio files to SD card
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

  // Long-press anywhere on the clock face triggers voice command
  lv_obj_add_event_cb(scr_clock, [](lv_event_t *e) {
    if (lv_event_get_code(e) == LV_EVENT_LONG_PRESSED) {
      if (g_voiceEnabled && !g_listening) {
        Serial.println("[voice] long-press detected, starting listen");
        playSystemAudio("wake_ack");
        // FIX: run the 600ms delay + startListening in a background task so
        // the main LVGL task is never suspended (no vTaskDelay on main task).
        xTaskCreate([](void *) {
          vTaskDelay(pdMS_TO_TICKS(600));
          startListening();
          vTaskDelete(nullptr);
        }, "voice_ack", 4096, nullptr, 1, nullptr);
      }
    }
  }, LV_EVENT_ALL, nullptr);
}

// ── THEME 0: MINIMAL ─────────────────────────────────────────────────────────
static void buildThemeMinimal() {
  lv_obj_set_style_bg_color(scr_clock, lv_color_hex(0x000000), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(scr_clock, LV_OPA_COVER, LV_PART_MAIN);
  buildWifiDot(lv_color_hex(0x555580), lv_color_hex(0x222230));

  // Time — 120pt, centred slightly above mid so date fits below
  lbl_time = lv_label_create(scr_clock);
  lv_obj_set_style_text_font(lbl_time, &montserrat_light_120, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_time, lv_color_hex(0xFFFFFF), LV_PART_MAIN);
  lv_obj_align(lbl_time, LV_ALIGN_CENTER, 0, -20);
  lv_label_set_text(lbl_time, "9:00");

  // AM/PM — anchored to the right edge of the time label
  lbl_ampm = lv_label_create(scr_clock);
  lv_obj_set_style_text_font(lbl_ampm, &montserrat_light_36, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_ampm, lv_color_hex(0x444466), LV_PART_MAIN);
  lv_obj_align_to(lbl_ampm, lbl_time, LV_ALIGN_OUT_RIGHT_BOTTOM, 8, 0);
  lv_label_set_text(lbl_ampm, "AM");

  // Date — anchored below the time label
  lbl_date = lv_label_create(scr_clock);
  lv_obj_set_style_text_font(lbl_date, &lv_font_montserrat_14, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_date, lv_color_hex(0x888899), LV_PART_MAIN);
  lv_obj_align_to(lbl_date, lbl_time, LV_ALIGN_OUT_BOTTOM_MID, 0, 10);
  lv_label_set_text(lbl_date, "Monday, Jan 1");

  buildAlarmLabels(lv_color_hex(0x8888BB));
  buildMoreButton(lv_color_hex(0x8888BB));
  buildTopNavButtons(lv_color_hex(0x8888BB));
}

// ── THEME 1: LED ──────────────────────────────────────────────────────────────
static void buildThemeLED() {
  lv_obj_set_style_bg_color(scr_clock, lv_color_hex(0x000000), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(scr_clock, LV_OPA_COVER, LV_PART_MAIN);
  buildWifiDot(lv_color_hex(0x00CC44), lv_color_hex(0x002200));

  lbl_time = lv_label_create(scr_clock);
  lv_obj_set_style_text_font(lbl_time, &montserrat_light_120, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_time, lv_color_hex(0x00FF55), LV_PART_MAIN);
  lv_obj_align(lbl_time, LV_ALIGN_CENTER, 0, -20);
  lv_label_set_text(lbl_time, "10:42");

  lbl_ampm = lv_label_create(scr_clock);
  lv_obj_set_style_text_font(lbl_ampm, &montserrat_light_36, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_ampm, lv_color_hex(0x008833), LV_PART_MAIN);
  lv_obj_align_to(lbl_ampm, lbl_time, LV_ALIGN_OUT_RIGHT_BOTTOM, 8, 0);
  lv_label_set_text(lbl_ampm, "AM");

  // LED theme: date hidden (empty string)
  lbl_date = lv_label_create(scr_clock);
  lv_obj_set_style_text_font(lbl_date, &lv_font_montserrat_12, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_date, lv_color_hex(0x004422), LV_PART_MAIN);
  lv_obj_align_to(lbl_date, lbl_time, LV_ALIGN_OUT_BOTTOM_MID, 0, 10);
  lv_label_set_text(lbl_date, "");

  buildAlarmLabels(lv_color_hex(0x00CC77));
  buildMoreButton(lv_color_hex(0x00CC77));
  buildTopNavButtons(lv_color_hex(0x00CC77));
}

// ── THEME 2: WARM ─────────────────────────────────────────────────────────────
static void buildThemeWarm() {
  lv_obj_set_style_bg_color(scr_clock, lv_color_hex(0x000000), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(scr_clock, LV_OPA_COVER, LV_PART_MAIN);
  buildWifiDot(lv_color_hex(0xCC5500), lv_color_hex(0x1A0800));

  lbl_time = lv_label_create(scr_clock);
  lv_obj_set_style_text_font(lbl_time, &montserrat_light_120, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_time, lv_color_hex(0xFF6600), LV_PART_MAIN);
  lv_obj_align(lbl_time, LV_ALIGN_CENTER, 0, -20);
  lv_label_set_text(lbl_time, "9:10");

  lbl_ampm = lv_label_create(scr_clock);
  lv_obj_set_style_text_font(lbl_ampm, &montserrat_light_36, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_ampm, lv_color_hex(0x663300), LV_PART_MAIN);
  lv_obj_align_to(lbl_ampm, lbl_time, LV_ALIGN_OUT_RIGHT_BOTTOM, 8, 0);
  lv_label_set_text(lbl_ampm, "PM");

  // Date — below time, warm amber
  lbl_date = lv_label_create(scr_clock);
  lv_obj_set_style_text_font(lbl_date, &lv_font_montserrat_12, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_date, lv_color_hex(0x885522), LV_PART_MAIN);
  lv_obj_align_to(lbl_date, lbl_time, LV_ALIGN_OUT_BOTTOM_MID, 0, 10);
  lv_label_set_text(lbl_date, "THURSDAY  \xE2\x80\xA2  MARCH 12");

  buildAlarmLabels(lv_color_hex(0xCC6600));
  buildMoreButton(lv_color_hex(0xCC6600));
  buildTopNavButtons(lv_color_hex(0xCC6600));
}

// ── THEME 3: RED ──────────────────────────────────────────────────────────────
static void buildThemeRed() {
  lv_obj_set_style_bg_color(scr_clock, lv_color_hex(0x000000), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(scr_clock, LV_OPA_COVER, LV_PART_MAIN);
  buildWifiDot(lv_color_hex(0xFF0000), lv_color_hex(0x330000));

  // Time — true red, slightly above centre
  lbl_time = lv_label_create(scr_clock);
  lv_obj_set_style_text_font(lbl_time, &montserrat_light_120, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_time, lv_color_hex(0xFF0000), LV_PART_MAIN);
  lv_obj_align(lbl_time, LV_ALIGN_CENTER, 0, -20);
  lv_label_set_text(lbl_time, "9:00");

  lbl_ampm = lv_label_create(scr_clock);
  lv_obj_set_style_text_font(lbl_ampm, &montserrat_light_36, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_ampm, lv_color_hex(0x880000), LV_PART_MAIN);
  lv_obj_align_to(lbl_ampm, lbl_time, LV_ALIGN_OUT_RIGHT_BOTTOM, 8, 0);
  lv_label_set_text(lbl_ampm, "AM");

  // Date — below time, dim red
  lbl_date = lv_label_create(scr_clock);
  lv_obj_set_style_text_font(lbl_date, &lv_font_montserrat_14, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_date, lv_color_hex(0x882222), LV_PART_MAIN);
  lv_obj_align_to(lbl_date, lbl_time, LV_ALIGN_OUT_BOTTOM_MID, 0, 10);
  lv_label_set_text(lbl_date, "Monday, Jan 1");

  buildAlarmLabels(lv_color_hex(0xCC2222));
  buildMoreButton(lv_color_hex(0xCC2222));
  buildTopNavButtons(lv_color_hex(0xCC2222));
}

// ── More panel (full-screen overlay: brightness + theme picker) ───────────────
static void showMorePanel() {
  // Single scrollable panel — 800px wide, 710px tall (content height).
  // LVGL clips it to the 480px viewport automatically via the screen.
  // Using ONE container avoids the scroll-chain blocking issue where a
  // non-scrollable outer panel consumed touch/scroll events.
  lv_obj_t *panel = lv_obj_create(lv_scr_act());
  lv_obj_set_size(panel, 800, 710);    // full content height — LVGL clips to 480px
  lv_obj_set_pos(panel, 0, 0);
  lv_obj_set_style_bg_color(panel, lv_color_hex(0x0A0A0A), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(panel, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_border_width(panel, 0, LV_PART_MAIN);
  lv_obj_set_style_radius(panel, 0, LV_PART_MAIN);
  lv_obj_set_style_pad_all(panel, 0, LV_PART_MAIN);
  lv_obj_add_flag(panel, LV_OBJ_FLAG_SCROLLABLE);   // THIS is the scrollable container
  lv_obj_set_scroll_dir(panel, LV_DIR_VER);
  lv_obj_set_scroll_snap_y(panel, LV_SCROLL_SNAP_NONE);
  lv_obj_clear_flag(panel, LV_OBJ_FLAG_SCROLL_ELASTIC);  // no bounce
  // Use panel as both the outer viewport and the scroll container
  lv_obj_t *scroll = panel;  // alias — all children go on panel directly

  // ── Title ──
  lv_obj_t *title = lv_label_create(scroll);
  lv_obj_set_style_text_font(title, &lv_font_montserrat_18, LV_PART_MAIN);
  lv_obj_set_style_text_color(title, lv_color_hex(0x555555), LV_PART_MAIN);
  lv_obj_set_pos(title, 360, 18);   // centred on 800px
  lv_label_set_text(title, "SETTINGS");

  // ── Brightness section ──
  lv_obj_t *lblBr = lv_label_create(scroll);
  lv_obj_set_style_text_font(lblBr, &lv_font_montserrat_14, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblBr, lv_color_hex(0x666666), LV_PART_MAIN);
  lv_obj_set_pos(lblBr, 40, 58);
  lv_label_set_text(lblBr, "BRIGHTNESS");

  // Brightness value label
  lv_obj_t *lblBrVal = lv_label_create(scroll);
  lv_obj_set_style_text_font(lblBrVal, &lv_font_montserrat_14, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblBrVal, lv_color_hex(0x888888), LV_PART_MAIN);
  lv_obj_set_pos(lblBrVal, 680, 58);
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

  lv_obj_t *slider = lv_slider_create(scroll);
  lv_obj_set_size(slider, 720, 36);
  lv_obj_set_pos(slider, 40, 84);
  lv_slider_set_range(slider, 0, BL_STEPS - 1);  // 0..4
  lv_slider_set_value(slider, curStep, LV_ANIM_OFF);
  lv_obj_set_style_bg_color(slider, lv_color_hex(0x222222), LV_PART_MAIN);
  lv_obj_set_style_bg_color(slider, recAccentColor(), LV_PART_INDICATOR);  // theme accent
  lv_obj_set_style_bg_color(slider, recAccentColor(), LV_PART_KNOB);       // theme accent
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
  lv_obj_t *lblTh = lv_label_create(scroll);
  lv_obj_set_style_text_font(lblTh, &lv_font_montserrat_14, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblTh, lv_color_hex(0x666666), LV_PART_MAIN);
  lv_obj_set_pos(lblTh, 40, 148);
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
    lv_obj_t *btn = lv_btn_create(scroll);
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
      // btn -> panel (single container — scroll is now the panel itself)
      // We must delete the panel BEFORE buildClockScreen() destroys scr_clock.
      lv_obj_t *outerPanel = lv_obj_get_parent(lv_event_get_target(e));
      lv_obj_del(outerPanel);  // delete panel first (safe: we're about to nuke scr_clock)
      buildClockScreen();       // destroys old scr_clock, creates new one
      lv_disp_load_scr(scr_clock);
      updateClockLabel();
      updateAlarmLabels();
    }, LV_EVENT_ALL, themeId);
  }

  // ── Alarm section header ──
  lv_obj_t *lblAlarmSec = lv_label_create(scroll);
  lv_obj_set_style_text_font(lblAlarmSec, &lv_font_montserrat_14, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblAlarmSec, lv_color_hex(0x666666), LV_PART_MAIN);
  lv_obj_set_pos(lblAlarmSec, 40, 268);
  lv_label_set_text(lblAlarmSec, "ALARM");

  // Set Alarm button
  lv_obj_t *btnAlarmSet = lv_btn_create(scroll);
  lv_obj_set_size(btnAlarmSet, 346, 48);
  lv_obj_set_pos(btnAlarmSet, 40, 290);
  lv_obj_set_style_bg_color(btnAlarmSet, lv_color_hex(0x1A0A0A), LV_PART_MAIN);
  lv_obj_set_style_border_color(btnAlarmSet, lv_color_hex(0x882222), LV_PART_MAIN);
  lv_obj_set_style_border_width(btnAlarmSet, 1, LV_PART_MAIN);
  lv_obj_set_style_radius(btnAlarmSet, 10, LV_PART_MAIN);
  lv_obj_add_event_cb(btnAlarmSet, [](lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    // btn -> panel (single container)
    lv_obj_t *outerPanel = lv_obj_get_parent(lv_event_get_target(e));
    lv_obj_del(outerPanel);
    showAlarmSetScreen();
  }, LV_EVENT_ALL, nullptr);
  lv_obj_t *lblAlarmSetBtn = lv_label_create(btnAlarmSet);
  lv_obj_set_style_text_font(lblAlarmSetBtn, &lv_font_montserrat_16, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblAlarmSetBtn, lv_color_hex(0xFF4444), LV_PART_MAIN);
  lv_label_set_text(lblAlarmSetBtn, LV_SYMBOL_BELL "  Set Alarm");
  lv_obj_center(lblAlarmSetBtn);

  // ── Sync Now button ──
  lv_obj_t *lblSync = lv_label_create(scroll);
  lv_obj_set_style_text_font(lblSync, &lv_font_montserrat_14, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblSync, lv_color_hex(0x666666), LV_PART_MAIN);
  lv_obj_set_pos(lblSync, 420, 268);
  lv_label_set_text(lblSync, "SYNC");

  // Status label (shows OK / WiFi needed after sync)
  lv_obj_t *lblSyncStatus = lv_label_create(scroll);
  lv_obj_set_style_text_font(lblSyncStatus, &lv_font_montserrat_14, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblSyncStatus, lv_color_hex(0x444444), LV_PART_MAIN);
  lv_obj_set_pos(lblSyncStatus, 620, 268);
  lv_label_set_text(lblSyncStatus, "");

  lv_obj_t *btnSync = lv_btn_create(scroll);
  lv_obj_set_size(btnSync, 358, 48);
  lv_obj_set_pos(btnSync, 402, 290);
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
    syncAudioFiles();  // Download any new habit audio files
    updateAlarmLabels();
    lv_label_set_text(statusLbl, LV_SYMBOL_OK "  Done");
    lv_obj_set_style_text_color(statusLbl, lv_color_hex(0x22C55E), LV_PART_MAIN);
  }, LV_EVENT_ALL, lblSyncStatus);
  lv_obj_t *lblSyncBtn = lv_label_create(btnSync);
  lv_obj_set_style_text_font(lblSyncBtn, &lv_font_montserrat_18, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblSyncBtn, lv_color_hex(0x4499DD), LV_PART_MAIN);
  lv_label_set_text(lblSyncBtn, LV_SYMBOL_REFRESH "  Sync Now");
  lv_obj_center(lblSyncBtn);

  // ── Read Habits Aloud toggle ──
  lv_obj_t *lblAudioSec = lv_label_create(scroll);
  lv_obj_set_style_text_font(lblAudioSec, &lv_font_montserrat_14, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblAudioSec, lv_color_hex(0x666666), LV_PART_MAIN);
  lv_obj_set_pos(lblAudioSec, 40, 360);
  lv_label_set_text(lblAudioSec, "AUDIO");

  // Audio toggle row
  lv_obj_t *rowAudio = lv_obj_create(scroll);
  lv_obj_set_size(rowAudio, 720, 52);
  lv_obj_set_pos(rowAudio, 40, 382);
  lv_obj_set_style_bg_color(rowAudio, lv_color_hex(0x0E0E0E), LV_PART_MAIN);
  lv_obj_set_style_border_color(rowAudio, lv_color_hex(0x2A2A2A), LV_PART_MAIN);  // neutral
  lv_obj_set_style_border_width(rowAudio, 1, LV_PART_MAIN);
  lv_obj_set_style_radius(rowAudio, 10, LV_PART_MAIN);
  lv_obj_clear_flag(rowAudio, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_clear_flag(rowAudio, LV_OBJ_FLAG_SCROLL_CHAIN);  // don't bubble scroll up

  lv_obj_t *lblAudioToggle = lv_label_create(rowAudio);
  lv_obj_set_style_text_font(lblAudioToggle, &lv_font_montserrat_16, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblAudioToggle, lv_color_hex(0xAAAAAA), LV_PART_MAIN);  // neutral
  lv_obj_align(lblAudioToggle, LV_ALIGN_LEFT_MID, 16, 0);
  lv_label_set_text(lblAudioToggle, LV_SYMBOL_AUDIO "  Read Habits Aloud");

  lv_obj_t *sw = lv_switch_create(rowAudio);
  lv_obj_align(sw, LV_ALIGN_RIGHT_MID, -16, 0);
  lv_obj_add_flag(sw, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_clear_flag(sw, LV_OBJ_FLAG_SCROLL_CHAIN);
  lv_obj_set_style_bg_color(sw, lv_color_hex(0x222222), LV_PART_MAIN);
  lv_obj_set_style_bg_color(sw, recAccentColor(), LV_PART_INDICATOR);  // theme accent
  if (g_audioEnabled) lv_obj_add_state(sw, LV_STATE_CHECKED);
  lv_obj_add_event_cb(sw, [](lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_VALUE_CHANGED) return;
    lv_obj_t *s = lv_event_get_target(e);
    g_audioEnabled = lv_obj_has_state(s, LV_STATE_CHECKED);
    saveAudioEnabled(g_audioEnabled);
    Serial.printf("[audio] toggle -> %d\n", g_audioEnabled);
  }, LV_EVENT_ALL, nullptr);

  // ── Voice toggle row ──
  lv_obj_t *rowVoice = lv_obj_create(scroll);
  lv_obj_set_size(rowVoice, 720, 52);
  lv_obj_set_pos(rowVoice, 40, 446);
  lv_obj_set_style_bg_color(rowVoice, lv_color_hex(0x0E0E0E), LV_PART_MAIN);
  lv_obj_set_style_border_color(rowVoice, lv_color_hex(0x2A2A2A), LV_PART_MAIN);  // neutral
  lv_obj_set_style_border_width(rowVoice, 1, LV_PART_MAIN);
  lv_obj_set_style_radius(rowVoice, 10, LV_PART_MAIN);
  lv_obj_clear_flag(rowVoice, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_clear_flag(rowVoice, LV_OBJ_FLAG_SCROLL_CHAIN);  // don't bubble scroll up

  lv_obj_t *lblVoiceToggle = lv_label_create(rowVoice);
  lv_obj_set_style_text_font(lblVoiceToggle, &lv_font_montserrat_16, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblVoiceToggle, lv_color_hex(0xAAAAAA), LV_PART_MAIN);  // neutral
  lv_obj_align(lblVoiceToggle, LV_ALIGN_LEFT_MID, 16, 0);
  lv_label_set_text(lblVoiceToggle, LV_SYMBOL_CALL "  Hey Jack (Voice)");

  lv_obj_t *swVoice = lv_switch_create(rowVoice);
  lv_obj_align(swVoice, LV_ALIGN_RIGHT_MID, -16, 0);
  lv_obj_add_flag(swVoice, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_clear_flag(swVoice, LV_OBJ_FLAG_SCROLL_CHAIN);
  lv_obj_set_style_bg_color(swVoice, lv_color_hex(0x222222), LV_PART_MAIN);
  lv_obj_set_style_bg_color(swVoice, recAccentColor(), LV_PART_INDICATOR);  // theme accent
  if (g_voiceEnabled) lv_obj_add_state(swVoice, LV_STATE_CHECKED);
  lv_obj_add_event_cb(swVoice, [](lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_VALUE_CHANGED) return;
    lv_obj_t *s = lv_event_get_target(e);
    g_voiceEnabled = lv_obj_has_state(s, LV_STATE_CHECKED);
    saveVoiceEnabled(g_voiceEnabled);
    if (g_voiceEnabled) initMic();
    Serial.printf("[voice] toggle -> %d\n", g_voiceEnabled);
  }, LV_EVENT_ALL, nullptr);

  // ── Low EMF section ──
  lv_obj_t *lblEmfSec = lv_label_create(scroll);
  lv_obj_set_style_text_font(lblEmfSec, &lv_font_montserrat_14, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblEmfSec, lv_color_hex(0x666666), LV_PART_MAIN);
  lv_obj_set_pos(lblEmfSec, 40, 518);
  lv_label_set_text(lblEmfSec, "LOW EMF MODE");

  lv_obj_t *rowEmf = lv_obj_create(scroll);
  lv_obj_set_size(rowEmf, 720, 52);
  lv_obj_set_pos(rowEmf, 40, 540);
  lv_obj_set_style_bg_color(rowEmf, lv_color_hex(0x0E0E0E), LV_PART_MAIN);
  lv_obj_set_style_border_color(rowEmf, lv_color_hex(0x2A2A2A), LV_PART_MAIN);  // neutral
  lv_obj_set_style_border_width(rowEmf, 1, LV_PART_MAIN);
  lv_obj_set_style_radius(rowEmf, 10, LV_PART_MAIN);
  lv_obj_clear_flag(rowEmf, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_clear_flag(rowEmf, LV_OBJ_FLAG_SCROLL_CHAIN);  // don't bubble scroll up

  lv_obj_t *lblEmfToggle = lv_label_create(rowEmf);
  lv_obj_set_style_text_font(lblEmfToggle, &lv_font_montserrat_16, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblEmfToggle, lv_color_hex(0xAAAAAA), LV_PART_MAIN);  // neutral
  lv_obj_align(lblEmfToggle, LV_ALIGN_LEFT_MID, 16, 0);
  lv_label_set_text(lblEmfToggle, LV_SYMBOL_WIFI "  WiFi Off While Sleeping");

  lv_obj_t *swEmf = lv_switch_create(rowEmf);
  lv_obj_align(swEmf, LV_ALIGN_RIGHT_MID, -16, 0);
  lv_obj_add_flag(swEmf, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_clear_flag(swEmf, LV_OBJ_FLAG_SCROLL_CHAIN);
  lv_obj_set_style_bg_color(swEmf, lv_color_hex(0x222222), LV_PART_MAIN);
  lv_obj_set_style_bg_color(swEmf, recAccentColor(), LV_PART_INDICATOR);  // theme accent
  if (g_lowEmfMode) lv_obj_add_state(swEmf, LV_STATE_CHECKED);
  lv_obj_add_event_cb(swEmf, [](lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_VALUE_CHANGED) return;
    lv_obj_t *s = lv_event_get_target(e);
    g_lowEmfMode = lv_obj_has_state(s, LV_STATE_CHECKED);
    saveLowEmfSettings();
    // Sync setting to server if WiFi available
    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      http.begin(String(API_BASE_URL) + "/device/settings");
      http.addHeader("X-Device-Key", g_apiKey);
      http.addHeader("Content-Type", "application/json");
      String body = String("{\"lowEmfMode\":") + (g_lowEmfMode ? "true" : "false") +
                    ",\"wifiOffHour\":" + g_wifiOffHour +
                    ",\"wifiOnHour\":" + g_wifiOnHour + "}";
      http.POST(body);
      http.end();
    }
    Serial.printf("[emf] toggle -> %d\n", g_lowEmfMode);
  }, LV_EVENT_ALL, nullptr);

  // ── Change WiFi button ──
  lv_obj_t *lblWifi = lv_label_create(scroll);
  lv_obj_set_style_text_font(lblWifi, &lv_font_montserrat_14, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblWifi, lv_color_hex(0x666666), LV_PART_MAIN);
  lv_obj_set_pos(lblWifi, 40, 612);
  lv_label_set_text(lblWifi, "NETWORK");

  lv_obj_t *btnWifi = lv_btn_create(scroll);
  lv_obj_set_size(btnWifi, 720, 52);
  lv_obj_set_pos(btnWifi, 40, 634);
  lv_obj_set_style_bg_color(btnWifi, lv_color_hex(0x0E0E0E), LV_PART_MAIN);
  lv_obj_set_style_border_color(btnWifi, lv_color_hex(0x2A2A2A), LV_PART_MAIN);  // neutral
  lv_obj_set_style_border_width(btnWifi, 1, LV_PART_MAIN);
  lv_obj_set_style_radius(btnWifi, 10, LV_PART_MAIN);
  lv_obj_add_event_cb(btnWifi, [](lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    // btn -> panel (single container)
    lv_obj_t *outerPanel = lv_obj_get_parent(lv_event_get_target(e));
    lv_obj_del(outerPanel);
    showWifiScanScreen();
  }, LV_EVENT_ALL, nullptr);
  lv_obj_t *lblWifiBtn = lv_label_create(btnWifi);
  lv_obj_set_style_text_font(lblWifiBtn, &lv_font_montserrat_18, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblWifiBtn, recAccentColor(), LV_PART_MAIN);  // theme accent
  lv_label_set_text(lblWifiBtn, LV_SYMBOL_WIFI "  Change WiFi Network");
  lv_obj_center(lblWifiBtn);

  // ── Close button — fixed top-right, sibling of panel so it never scrolls ──
  // Create on the screen directly (not inside panel) so it stays fixed
  lv_obj_t *btnClose = lv_btn_create(lv_scr_act());
  lv_obj_set_size(btnClose, 52, 52);
  lv_obj_set_pos(btnClose, 800 - 52 - 12, 12);  // top-right corner
  lv_obj_set_style_bg_color(btnClose, lv_color_hex(0x1A1A1A), LV_PART_MAIN);
  lv_obj_set_style_border_color(btnClose, lv_color_hex(0x444444), LV_PART_MAIN);
  lv_obj_set_style_border_width(btnClose, 1, LV_PART_MAIN);
  lv_obj_set_style_radius(btnClose, 26, LV_PART_MAIN);  // circle
  // btnClose lives on scr_clock (sibling of panel), so lv_obj_del(pnl) is safe.
  // We then async-delete btnClose itself since we are inside its own callback.
  lv_obj_add_event_cb(btnClose, [](lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    lv_obj_t *btn   = lv_event_get_target(e);
    lv_obj_t *pnl   = (lv_obj_t *)lv_event_get_user_data(e);
    lv_obj_del(pnl);        // delete the outer panel (and its children) — safe, btn is a sibling
    lv_obj_del_async(btn);  // async-delete self (safe from within own callback)
  }, LV_EVENT_ALL, panel);
  lv_obj_t *lblX = lv_label_create(btnClose);
  lv_obj_set_style_text_font(lblX, &lv_font_montserrat_18, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblX, lv_color_hex(0x888888), LV_PART_MAIN);
  lv_label_set_text(lblX, LV_SYMBOL_CLOSE);
  lv_obj_center(lblX);
}

// ── Helper: build the Record / Gratitude / Habits top nav labels ────────────
// Three plain tap-targets (no button box) — Record left, Gratitude center,
// Habits right.  Each has the word on top and a small upward chevron (∧) below
// to hint at the physical button beneath it.
static void buildTopNavButtons(lv_color_t col) {
  // x-centres for left / mid / right thirds of the 800px screen
  const int cx[3]   = { 133, 400, 667 };
  const char *names[3]  = { "Record", "Gratitude", "Habits" };

  for (int i = 0; i < 3; i++) {
    // Invisible hit-area container — transparent, no border, clickable
    lv_obj_t *hit = lv_obj_create(scr_clock);
    lv_obj_set_size(hit, 200, 46);
    lv_obj_set_pos(hit, cx[i] - 100, 2);
    lv_obj_set_style_bg_opa(hit, LV_OPA_TRANSP, LV_PART_MAIN);
    lv_obj_set_style_border_width(hit, 0, LV_PART_MAIN);
    lv_obj_set_style_pad_all(hit, 0, LV_PART_MAIN);
    lv_obj_clear_flag(hit, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(hit, LV_OBJ_FLAG_CLICKABLE);

    // Word label — 14pt, accent colour
    lv_obj_t *lblName = lv_label_create(hit);
    lv_obj_set_style_text_font(lblName, &lv_font_montserrat_14, LV_PART_MAIN);
    lv_obj_set_style_text_color(lblName, col, LV_PART_MAIN);
    lv_label_set_text(lblName, names[i]);
    lv_obj_align(lblName, LV_ALIGN_TOP_MID, 0, 0);

    // Chevron label — small upward-pointing ∧ below the word
    lv_obj_t *lblChev = lv_label_create(hit);
    lv_obj_set_style_text_font(lblChev, &lv_font_montserrat_14, LV_PART_MAIN);
    lv_obj_set_style_text_color(lblChev, col, LV_PART_MAIN);
    lv_label_set_text(lblChev, "^");  // ASCII caret — upward-pointing chevron hint
    lv_obj_align(lblChev, LV_ALIGN_BOTTOM_MID, 0, 0);

    // Tap callback: Record (0) -> showRecordMenu, Gratitude (1) -> showGratitudeScreen, Habits (2) -> showHabitsScreen
    int *idx = new int(i);
    lv_obj_add_event_cb(hit, [](lv_event_t *e) {
      if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
      int i = *(int *)lv_event_get_user_data(e);
      static void (*h[3])() = { showRecordMenu, showGratitudeScreen, showHabitsScreen };
      h[i]();
    }, LV_EVENT_ALL, idx);
  }
}

// ── Stub screens for Journal, Gratitude, Habits ───────────────────────────────
// These show a placeholder card with a Back button. Replace with full UI later.
static void buildSimpleScreen(const char *title, lv_color_t accentCol) {
  lv_obj_t *scr = lv_obj_create(nullptr);
  lv_obj_set_style_bg_color(scr, lv_color_hex(0x000000), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(scr, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_clear_flag(scr, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_t *lblTitle = lv_label_create(scr);
  lv_obj_set_style_text_font(lblTitle, &lv_font_montserrat_40, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblTitle, accentCol, LV_PART_MAIN);
  lv_obj_align(lblTitle, LV_ALIGN_CENTER, 0, -40);
  lv_label_set_text(lblTitle, title);
  lv_obj_t *lblSub = lv_label_create(scr);
  lv_obj_set_style_text_font(lblSub, &lv_font_montserrat_18, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblSub, lv_color_hex(0x333333), LV_PART_MAIN);  // neutral dim grey
  lv_obj_align(lblSub, LV_ALIGN_CENTER, 0, 20);
  lv_label_set_text(lblSub, "Coming soon");
  // Back button
  lv_obj_t *btnBack = lv_btn_create(scr);
  lv_obj_set_size(btnBack, 160, 48);
  lv_obj_align(btnBack, LV_ALIGN_BOTTOM_LEFT, 20, -20);
  lv_obj_set_style_bg_color(btnBack, lv_color_hex(0x111111), LV_PART_MAIN);  // neutral dark
  lv_obj_set_style_border_color(btnBack, accentCol, LV_PART_MAIN);
  lv_obj_set_style_border_width(btnBack, 1, LV_PART_MAIN);
  lv_obj_set_style_radius(btnBack, 10, LV_PART_MAIN);
  lv_obj_t *lblBack = lv_label_create(btnBack);
  lv_obj_set_style_text_font(lblBack, &lv_font_montserrat_16, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblBack, accentCol, LV_PART_MAIN);
  lv_label_set_text(lblBack, LV_SYMBOL_LEFT "  Back");
  lv_obj_center(lblBack);
  lv_obj_add_event_cb(btnBack, [](lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    // Load clock screen first, then async-delete this screen so we don't
    // destroy an object from within its own event callback (use-after-free).
    lv_obj_t *s = lv_disp_get_scr_act(nullptr);
    showClockScreen();
    lv_obj_del_async(s);
  }, LV_EVENT_ALL, nullptr);
  lv_disp_load_scr(scr);
}

void showJournalScreen()   { buildSimpleScreen("Journal",   recAccentColor()); }
void showGratitudeScreen() { buildSimpleScreen("Gratitude", recAccentColor()); }
void showHabitsScreen()    { buildSimpleScreen("Habits",    recAccentColor()); }

// ─────────────────────────────────────────────────────────────────────────────
// RECORD FEATURE: Gratitude / Journal Entry / Mind Dump
// ─────────────────────────────────────────────────────────────────────────────

// Return the theme accent color for the recording UI
static lv_color_t recAccentColor() {
  switch (g_theme) {
    case THEME_LED:  return lv_color_hex(0x00FF55);
    case THEME_WARM: return lv_color_hex(0xFF6600);
    case THEME_RED:  return lv_color_hex(0xFF1111);
    default:         return lv_color_hex(0xFFFFFF);
  }
}

// Write a 44-byte PCM WAV header into the first 44 bytes of an open File.
// dataBytes = total number of PCM data bytes that follow.
static void writeWavHeader(File &f, size_t dataBytes) {
  const uint32_t sampleRate  = 16000;
  const uint16_t numChannels = 1;
  const uint16_t bitsPerSamp = 16;
  const uint32_t byteRate    = sampleRate * numChannels * (bitsPerSamp / 8);
  const uint16_t blockAlign  = numChannels * (bitsPerSamp / 8);
  uint32_t chunkSize = 36 + (uint32_t)dataBytes;
  uint32_t dataSize  = (uint32_t)dataBytes;
  uint8_t hdr[44];
  // RIFF chunk
  hdr[0]='R'; hdr[1]='I'; hdr[2]='F'; hdr[3]='F';
  hdr[4]=(chunkSize)&0xFF; hdr[5]=(chunkSize>>8)&0xFF; hdr[6]=(chunkSize>>16)&0xFF; hdr[7]=(chunkSize>>24)&0xFF;
  hdr[8]='W'; hdr[9]='A'; hdr[10]='V'; hdr[11]='E';
  // fmt sub-chunk
  hdr[12]='f'; hdr[13]='m'; hdr[14]='t'; hdr[15]=' ';
  hdr[16]=16; hdr[17]=0; hdr[18]=0; hdr[19]=0;  // sub-chunk size = 16
  hdr[20]=1;  hdr[21]=0;                         // PCM = 1
  hdr[22]=numChannels&0xFF; hdr[23]=(numChannels>>8)&0xFF;
  hdr[24]=(sampleRate)&0xFF; hdr[25]=(sampleRate>>8)&0xFF; hdr[26]=(sampleRate>>16)&0xFF; hdr[27]=(sampleRate>>24)&0xFF;
  hdr[28]=(byteRate)&0xFF;   hdr[29]=(byteRate>>8)&0xFF;   hdr[30]=(byteRate>>16)&0xFF;   hdr[31]=(byteRate>>24)&0xFF;
  hdr[32]=blockAlign&0xFF; hdr[33]=(blockAlign>>8)&0xFF;
  hdr[34]=bitsPerSamp&0xFF; hdr[35]=(bitsPerSamp>>8)&0xFF;
  // data sub-chunk
  hdr[36]='d'; hdr[37]='a'; hdr[38]='t'; hdr[39]='a';
  hdr[40]=(dataSize)&0xFF; hdr[41]=(dataSize>>8)&0xFF; hdr[42]=(dataSize>>16)&0xFF; hdr[43]=(dataSize>>24)&0xFF;
  f.seek(0);
  f.write(hdr, 44);
}

// Open the I2S PDM mic and start streaming to SD.  Returns true on success.
static bool recStart(const char *folder) {
  if (g_recActive) return false;
  if (!g_sdMounted) {
    Serial.println("[rec] SD not mounted");
    return false;
  }
  // Ensure folder exists
  if (!SD_MMC.exists(folder)) SD_MMC.mkdir(folder);

  // Build timestamped filename
  time_t now = time(nullptr);
  struct tm t;
  localtime_r(&now, &t);
  char path[96];
  snprintf(path, sizeof(path), "%s/%04d-%02d-%02d_%02d-%02d.wav",
           folder,
           t.tm_year + 1900, t.tm_mon + 1, t.tm_mday,
           t.tm_hour, t.tm_min);

  // Open file and write placeholder WAV header (will be finalised on stop)
  g_recFile = SD_MMC.open(path, FILE_WRITE);
  if (!g_recFile) {
    Serial.printf("[rec] cannot open %s\n", path);
    return false;
  }
  // Reserve 44 bytes for WAV header (filled with zeros for now)
  uint8_t zeros[44] = {};
  g_recFile.write(zeros, 44);
  g_recDataBytes = 0;

  // Init I2S PDM RX (same config as startListening)
  i2s_chan_config_t chan_cfg = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_1, I2S_ROLE_MASTER);
  chan_cfg.auto_clear = true;
  i2s_new_channel(&chan_cfg, nullptr, &g_recHandle);
  i2s_pdm_rx_config_t pdm_cfg = {
    .clk_cfg  = I2S_PDM_RX_CLK_DEFAULT_CONFIG(16000),
    .slot_cfg = I2S_PDM_RX_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO),
    .gpio_cfg = {
      .clk  = (gpio_num_t)MIC_WS_PIN,
      .din  = (gpio_num_t)MIC_SD_PIN,
      .invert_flags = { .clk_inv = false }
    }
  };
  i2s_channel_init_pdm_rx_mode(g_recHandle, &pdm_cfg);
  i2s_channel_enable(g_recHandle);
  g_recActive = true;
  Serial.printf("[rec] started -> %s\n", path);
  return true;
}

// Read one chunk of audio from I2S, write to SD, return RMS amplitude (0-32767).
// Called from the LVGL timer every 80 ms.
static int16_t recPump() {
  if (!g_recActive || !g_recHandle) return 0;
  static uint8_t buf[1024];
  size_t bytesRead = 0;
  i2s_channel_read(g_recHandle, buf, sizeof(buf), &bytesRead, pdMS_TO_TICKS(10));
  if (bytesRead > 0) {
    g_recFile.write(buf, bytesRead);
    g_recDataBytes += bytesRead;
    // Compute RMS of this chunk for VU meter
    int16_t *samples = (int16_t *)buf;
    size_t   count   = bytesRead / 2;
    int64_t  sumSq   = 0;
    for (size_t i = 0; i < count; i++) sumSq += (int64_t)samples[i] * samples[i];
    return (int16_t)sqrt((double)sumSq / count);
  }
  return 0;
}

// Stop recording: finalise WAV header, close file, tear down I2S.
static void recStop() {
  if (!g_recActive) return;
  g_recActive = false;
  i2s_channel_disable(g_recHandle);
  i2s_del_channel(g_recHandle);
  g_recHandle = nullptr;
  // Patch WAV header with actual data size
  writeWavHeader(g_recFile, g_recDataBytes);
  g_recFile.close();
  Serial.printf("[rec] stopped, %u bytes PCM\n", (unsigned)g_recDataBytes);
}

// LVGL timer callback: pump audio, update VU bars
static void recTimerCb(lv_timer_t *tmr) {
  int16_t amp = recPump();
  if (!g_recBars[0]) return;  // bars not yet built
  // Normalise amplitude to 0-100
  int level = (int)(amp / 327);  // 32767 -> 100
  if (level > 100) level = 100;
  // Each bar gets a random-ish height around the level for a natural look
  static uint8_t phase = 0;
  phase++;
  lv_color_t accent = recAccentColor();
  for (int i = 0; i < 8; i++) {
    // Stagger bars with a sine-like offset
    int offset = (int)(sinf((phase + i * 40) * 0.08f) * 20);
    int h = level + offset;
    if (h < 4)   h = 4;    // minimum visible height
    if (h > 100) h = 100;
    lv_obj_set_height(g_recBars[i], h * 2);  // bar height in px (max 200)
    lv_obj_set_style_bg_color(g_recBars[i], accent, LV_PART_MAIN);
    // Dim bars below the level threshold
    lv_obj_set_style_bg_opa(g_recBars[i], (h > 10) ? LV_OPA_COVER : LV_OPA_30, LV_PART_MAIN);
  }
}

// Full-screen recording UI
void showRecordingScreen(const char *category, const char *folder) {
  lv_color_t accent = recAccentColor();

  g_recScreen = lv_obj_create(nullptr);
  lv_obj_set_style_bg_color(g_recScreen, lv_color_hex(0x000000), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(g_recScreen, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_clear_flag(g_recScreen, LV_OBJ_FLAG_SCROLLABLE);

  // Category title (e.g. "Gratitude")
  lv_obj_t *lblCat = lv_label_create(g_recScreen);
  lv_obj_set_style_text_font(lblCat, &lv_font_montserrat_40, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblCat, accent, LV_PART_MAIN);
  lv_obj_align(lblCat, LV_ALIGN_TOP_MID, 0, 28);
  lv_label_set_text(lblCat, category);

  // Mic icon
  lv_obj_t *lblMic = lv_label_create(g_recScreen);
  lv_obj_set_style_text_font(lblMic, &lv_font_montserrat_48, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblMic, accent, LV_PART_MAIN);
  lv_obj_align(lblMic, LV_ALIGN_TOP_MID, 0, 88);
  lv_label_set_text(lblMic, LV_SYMBOL_AUDIO);

  // "Recording..." subtitle
  lv_obj_t *lblStatus = lv_label_create(g_recScreen);
  lv_obj_set_style_text_font(lblStatus, &lv_font_montserrat_18, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblStatus, lv_color_hex(0x888888), LV_PART_MAIN);
  lv_obj_align(lblStatus, LV_ALIGN_TOP_MID, 0, 150);
  lv_label_set_text(lblStatus, "Recording...");

  // VU meter — 8 vertical bars centred on screen
  // Each bar: 28px wide, 4px gap, max 200px tall, bottom-anchored at y=360
  const int barW   = 28;
  const int barGap = 8;
  const int totalW = 8 * barW + 7 * barGap;  // 8*28 + 7*8 = 280
  const int startX = (800 - totalW) / 2;      // 260
  const int baseY  = 360;                     // bottom of bars
  for (int i = 0; i < 8; i++) {
    g_recBars[i] = lv_obj_create(g_recScreen);
    lv_obj_set_style_bg_color(g_recBars[i], accent, LV_PART_MAIN);
    lv_obj_set_style_bg_opa(g_recBars[i], LV_OPA_30, LV_PART_MAIN);
    lv_obj_set_style_border_width(g_recBars[i], 0, LV_PART_MAIN);
    lv_obj_set_style_radius(g_recBars[i], 4, LV_PART_MAIN);
    lv_obj_set_style_pad_all(g_recBars[i], 0, LV_PART_MAIN);
    lv_obj_set_width(g_recBars[i], barW);
    lv_obj_set_height(g_recBars[i], 8);  // initial minimal height
    // Position: bottom edge at baseY, left edge at startX + i*(barW+barGap)
    lv_obj_set_pos(g_recBars[i], startX + i * (barW + barGap), baseY - 8);
  }

  // Stop button
  lv_obj_t *btnStop = lv_btn_create(g_recScreen);
  lv_obj_set_size(btnStop, 220, 56);
  lv_obj_align(btnStop, LV_ALIGN_BOTTOM_MID, 0, -28);
  lv_obj_set_style_bg_color(btnStop, lv_color_hex(0x1A0000), LV_PART_MAIN);
  lv_obj_set_style_border_color(btnStop, lv_color_hex(0xFF2222), LV_PART_MAIN);
  lv_obj_set_style_border_width(btnStop, 2, LV_PART_MAIN);
  lv_obj_set_style_radius(btnStop, 28, LV_PART_MAIN);
  lv_obj_t *lblStop = lv_label_create(btnStop);
  lv_obj_set_style_text_font(lblStop, &lv_font_montserrat_20, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblStop, lv_color_hex(0xFF4444), LV_PART_MAIN);
  lv_label_set_text(lblStop, LV_SYMBOL_STOP "  Stop & Save");
  lv_obj_center(lblStop);

  // Store category label pointer in btnStop user data so callback can update it
  lv_obj_add_event_cb(btnStop, [](lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    // Stop I2S + close WAV file
    recStop();
    // Kill VU timer
    if (g_recTimer) { lv_timer_del(g_recTimer); g_recTimer = nullptr; }
    // Clear bar pointers
    for (int i = 0; i < 8; i++) g_recBars[i] = nullptr;
    // Show "Saved!" on the status label (passed as user data)
    lv_obj_t *statusLbl = (lv_obj_t *)lv_event_get_user_data(e);
    if (statusLbl) {
      lv_label_set_text(statusLbl, LV_SYMBOL_OK "  Saved!");
      lv_obj_set_style_text_color(statusLbl, lv_color_hex(0x22CC66), LV_PART_MAIN);
    }
    lv_timer_handler();  // flush UI so user sees "Saved!"
    // Return to clock after a brief moment (use async delete)
    lv_obj_t *scr = g_recScreen;
    g_recScreen = nullptr;
    showClockScreen();
    lv_obj_del_async(scr);
  }, LV_EVENT_ALL, lblStatus);

  // Start I2S recording
  if (!recStart(folder)) {
    // SD not available — show error and schedule return to clock after 1.5s.
    // FIX: use lv_timer_create instead of delay(1500) so the display keeps
    // rendering the error message during the wait (no frozen frame).
    lv_label_set_text(lblStatus, "SD card not found!");
    lv_obj_set_style_text_color(lblStatus, lv_color_hex(0xFF4444), LV_PART_MAIN);
    lv_disp_load_scr(g_recScreen);  // show error screen first
    lv_timer_t *tRet = lv_timer_create([](lv_timer_t *t) {
      lv_timer_del(t);
      lv_obj_t *scr = g_recScreen;
      g_recScreen = nullptr;
      showClockScreen();
      if (scr) lv_obj_del_async(scr);
    }, 1500, nullptr);
    lv_timer_set_repeat_count(tRet, 1);
    return;
  }

  // Start VU animation timer — fires every 80 ms
  g_recTimer = lv_timer_create(recTimerCb, 80, nullptr);

  lv_disp_load_scr(g_recScreen);
}

// Record sub-menu: three buttons — Gratitude, Journal Entry, Mind Dump
void showRecordMenu() {
  lv_color_t accent = recAccentColor();

  lv_obj_t *scr = lv_obj_create(nullptr);
  lv_obj_set_style_bg_color(scr, lv_color_hex(0x000000), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(scr, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_clear_flag(scr, LV_OBJ_FLAG_SCROLLABLE);

  // Title
  lv_obj_t *lblTitle = lv_label_create(scr);
  lv_obj_set_style_text_font(lblTitle, &lv_font_montserrat_40, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblTitle, accent, LV_PART_MAIN);
  lv_obj_align(lblTitle, LV_ALIGN_TOP_MID, 0, 30);
  lv_label_set_text(lblTitle, "Record");

  // Sub-title hint
  lv_obj_t *lblHint = lv_label_create(scr);
  lv_obj_set_style_text_font(lblHint, &lv_font_montserrat_16, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblHint, lv_color_hex(0x555555), LV_PART_MAIN);
  lv_obj_align(lblHint, LV_ALIGN_TOP_MID, 0, 86);
  lv_label_set_text(lblHint, "What would you like to record?");

  // Three buttons — same x-centres as the top nav (133, 400, 667)
  struct { const char *label; const char *folder; int cx; } opts[3] = {
    { "Gratitude",     "/gratitudes", 133 },
    { "Journal Entry", "/journal",    400 },
    { "Mind Dump",     "/minddump",   667 },
  };

  for (int i = 0; i < 3; i++) {
    lv_obj_t *btn = lv_btn_create(scr);
    lv_obj_set_size(btn, 200, 200);
    lv_obj_set_pos(btn, opts[i].cx - 100, 140);
    lv_obj_set_style_bg_color(btn, lv_color_hex(0x0A0A0A), LV_PART_MAIN);
    lv_obj_set_style_border_color(btn, accent, LV_PART_MAIN);
    lv_obj_set_style_border_width(btn, 2, LV_PART_MAIN);
    lv_obj_set_style_radius(btn, 20, LV_PART_MAIN);

    // Mic icon
    lv_obj_t *ico = lv_label_create(btn);
    lv_obj_set_style_text_font(ico, &lv_font_montserrat_48, LV_PART_MAIN);
    lv_obj_set_style_text_color(ico, accent, LV_PART_MAIN);
    lv_obj_align(ico, LV_ALIGN_TOP_MID, 0, 20);
    lv_label_set_text(ico, LV_SYMBOL_AUDIO);

    // Category name
    lv_obj_t *lbl = lv_label_create(btn);
    lv_obj_set_style_text_font(lbl, &lv_font_montserrat_18, LV_PART_MAIN);
    lv_obj_set_style_text_color(lbl, accent, LV_PART_MAIN);
    lv_obj_set_style_text_align(lbl, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
    lv_obj_set_width(lbl, 180);
    lv_obj_align(lbl, LV_ALIGN_BOTTOM_MID, 0, -18);
    lv_label_set_text(lbl, opts[i].label);

    // Pass category + folder as a small struct via user data
    struct RecOpt { const char *cat; const char *fld; };
    RecOpt *opt = new RecOpt{ opts[i].label, opts[i].folder };
    lv_obj_add_event_cb(btn, [](lv_event_t *e) {
      if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
      RecOpt *o = (RecOpt *)lv_event_get_user_data(e);
      // Async-delete this menu screen, then open recording screen
      lv_obj_t *menuScr = lv_disp_get_scr_act(nullptr);
      showRecordingScreen(o->cat, o->fld);
      lv_obj_del_async(menuScr);
      delete o;
    }, LV_EVENT_ALL, opt);
  }

  // Back button (bottom-left, same style as buildSimpleScreen)
  lv_obj_t *btnBack = lv_btn_create(scr);
  lv_obj_set_size(btnBack, 160, 48);
  lv_obj_align(btnBack, LV_ALIGN_BOTTOM_LEFT, 20, -20);
  lv_obj_set_style_bg_color(btnBack, lv_color_hex(0x0A0A0A), LV_PART_MAIN);
  lv_obj_set_style_border_color(btnBack, accent, LV_PART_MAIN);
  lv_obj_set_style_border_width(btnBack, 1, LV_PART_MAIN);
  lv_obj_set_style_radius(btnBack, 10, LV_PART_MAIN);
  lv_obj_t *lblBack = lv_label_create(btnBack);
  lv_obj_set_style_text_font(lblBack, &lv_font_montserrat_16, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblBack, accent, LV_PART_MAIN);
  lv_label_set_text(lblBack, LV_SYMBOL_LEFT "  Back");
  lv_obj_center(lblBack);
  lv_obj_add_event_cb(btnBack, [](lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    lv_obj_t *s = lv_disp_get_scr_act(nullptr);
    showClockScreen();
    lv_obj_del_async(s);
  }, LV_EVENT_ALL, nullptr);

  lv_disp_load_scr(scr);
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
  // Guard: if clock screen objects are not yet built, skip silently
  if (!lbl_time || !lbl_ampm || !lbl_date || !lbl_wifi) return;

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

  // Re-anchor AM/PM and date relative to time (text width changes each minute)
  lv_obj_align_to(lbl_ampm, lbl_time, LV_ALIGN_OUT_RIGHT_BOTTOM, 8, 0);
  lv_obj_align_to(lbl_date, lbl_time, LV_ALIGN_OUT_BOTTOM_MID, 0, 10);

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

// ─── Alarm + Habit Checklist ──────────────────────────────────────────────────
// g_alarmFiredAt and g_firedAlarmIdx are declared in the globals section above

// ─── Per-habit timed check-in state ──────────────────────────────────────────
// HABIT_TIMER_TICKS, g_ciHabitIdx, g_ciTick, g_ciRereadCount, g_ciListening,
// and ciAdvance forward declaration are all in the forward declarations section above.
static lv_timer_t *g_ciTimer = nullptr;

// LVGL widgets on the check-in screen (rebuilt each call to showCheckinScreen)
static lv_obj_t *lbl_ci_progress = nullptr;
static lv_obj_t *lbl_ci_habit    = nullptr;
static lv_obj_t *bar_ci_timer    = nullptr;

// LVGL timer tick: called every 100ms
static void cb_ci_tick(lv_timer_t *timer) {
  if (g_ciTick > 0) {
    g_ciTick--;
    if (bar_ci_timer) lv_bar_set_value(bar_ci_timer, g_ciTick, LV_ANIM_OFF);

    // At 50% of the countdown (5s), start listening for voice response if enabled
    // Only trigger once per habit (when g_ciListening is false)
    if (g_voiceEnabled && !g_ciListening && g_ciTick == HABIT_TIMER_TICKS / 2) {
      g_ciListening = true;
      // Run voice listen in a background task so it doesn't block the UI
      xTaskCreate([](void *) {
        startListening();
        g_ciListening = false;
        vTaskDelete(nullptr);
      }, "ci_voice", 8192, nullptr, 1, nullptr);
    }
  }
  if (g_ciTick == 0) {
    // Time's up — re-read the habit name and reset the bar
    // Never auto-skip: keep prompting until the user physically responds
    g_ciRereadCount++;
    // FIX: use one-shot LVGL timers instead of vTaskDelay so LVGL is never
    // suspended mid-render (same pattern as showCelebrationScreen).
    buzzerOn();
    lv_timer_t *toff = lv_timer_create([](lv_timer_t *t) {
      buzzerOff();
      lv_timer_del(t);
    }, 300, nullptr);
    lv_timer_set_repeat_count(toff, 1);
    // Re-play the habit audio
    if (g_ciHabitIdx < g_habitCount) {
      playHabitAudio(g_habits[g_ciHabitIdx].name.c_str());
    }
    g_ciTick = HABIT_TIMER_TICKS;
    g_ciListening = false;  // allow voice listen again on next cycle
    if (bar_ci_timer) lv_bar_set_value(bar_ci_timer, g_ciTick, LV_ANIM_OFF);
  }
}

// Advance to next habit or finish
static void ciAdvance(int rating) {
  // Stop timer and silence buzzer
  if (g_ciTimer) { lv_timer_del(g_ciTimer); g_ciTimer = nullptr; }
  buzzerOff();
  g_ciRereadCount = 0;  // reset re-read counter for next habit
  g_ciListening   = false;

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

  // Long-press on alarm screen triggers voice command (snooze / stop)
  lv_obj_add_event_cb(scr_alarm, [](lv_event_t *e) {
    if (lv_event_get_code(e) == LV_EVENT_LONG_PRESSED) {
      if (g_voiceEnabled && !g_listening) {
        Serial.println("[voice] alarm long-press, starting listen");
        playSystemAudio("wake_ack");
        // FIX: background task so main LVGL task is never suspended.
        xTaskCreate([](void *) {
          vTaskDelay(pdMS_TO_TICKS(600));
          startListening();
          vTaskDelete(nullptr);
        }, "alm_voice", 4096, nullptr, 1, nullptr);
      }
    }
  }, LV_EVENT_ALL, nullptr);
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
// buildCheckinScreen: creates the check-in screen fresh each time it is called.
// Always deletes the previous scr_checkin first to avoid leaking LVGL objects.
void buildCheckinScreen() {
  // Delete previous screen and null out all widget pointers
  if (scr_checkin) { lv_obj_del(scr_checkin); scr_checkin = nullptr; }
  lbl_ci_progress = nullptr;
  lbl_ci_habit    = nullptr;
  bar_ci_timer    = nullptr;

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
  lv_obj_set_style_bg_color(bar_ci_timer, recAccentColor(), LV_PART_INDICATOR);  // theme accent
  lv_obj_set_style_radius(bar_ci_timer, 4, LV_PART_MAIN);
  lv_obj_set_style_radius(bar_ci_timer, 4, LV_PART_INDICATOR);

  // Habit name label — large, centred
  lbl_ci_habit = lv_label_create(scr_checkin);
  lv_obj_set_style_text_font(lbl_ci_habit, &lv_font_montserrat_28, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_ci_habit, recAccentColor(), LV_PART_MAIN);  // theme accent
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
    lv_obj_add_event_cb(btn, btns[b].cb, LV_EVENT_ALL, nullptr);
    lv_obj_t *lbl = lv_label_create(btn);
    lv_label_set_text(lbl, btns[b].label);
    lv_obj_set_style_text_font(lbl, &lv_font_montserrat_20, LV_PART_MAIN);
    lv_obj_set_style_text_color(lbl, lv_color_hex(0x000000), LV_PART_MAIN);
    lv_obj_center(lbl);
  }
}

// showCheckinScreen: rebuilds the screen fresh for the current habit index,
// then loads it. Rebuilding each time ensures widgets are always valid.
void showCheckinScreen() {
  // Kill any running timer first
  if (g_ciTimer) { lv_timer_del(g_ciTimer); g_ciTimer = nullptr; }

  // Always rebuild the screen so widgets are fresh and correctly sized
  buildCheckinScreen();

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
    // Play the ElevenLabs-generated audio for this habit (if enabled and SD has the file)
    playHabitAudio(g_habits[idx].name.c_str());
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

  // Audio status hint — shows whether SD audio is available
  lv_obj_t *lbl_hint = lv_label_create(card);
  lv_obj_set_style_text_font(lbl_hint, &lv_font_montserrat_14, LV_PART_MAIN);
  lv_obj_set_style_text_color(lbl_hint, lv_color_hex(0x4B6A8A), LV_PART_MAIN);
  lv_obj_align(lbl_hint, LV_ALIGN_TOP_MID, 0, 130);
  // Check if the SD audio file exists
  char audioPath[64];
  snprintf(audioPath, sizeof(audioPath), "/system/%s.mp3", meditationId.c_str());
  bool audioAvail = g_sdMounted && SD_MMC.exists(audioPath);
  lv_label_set_text(lbl_hint, audioAvail ? LV_SYMBOL_AUDIO "  Playing from SD card..." : "No audio file on SD card");
  lv_obj_set_style_text_color(lbl_hint, audioAvail ? lv_color_hex(0x22C55E) : lv_color_hex(0xFF6666), LV_PART_MAIN);

  // Done button
  lv_obj_t *btnSkip = lv_btn_create(scr);
  lv_obj_set_size(btnSkip, 200, 60);
  lv_obj_align(btnSkip, LV_ALIGN_BOTTOM_MID, 0, -24);
  lv_obj_set_style_bg_color(btnSkip, lv_color_hex(0x1E293B), LV_PART_MAIN);
  lv_obj_set_style_radius(btnSkip, 12, LV_PART_MAIN);
  lv_obj_add_event_cb(btnSkip, [](lv_event_t *e) {
    if (lv_event_get_code(e) == LV_EVENT_CLICKED) {
      stopAudio();
      g_alarmFired    = false;
      g_inCheckin     = false;
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

  // Start SD audio playback immediately after screen is loaded
  if (audioAvail) {
    playSystemAudio(meditationId.c_str());
  }
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
  lv_timer_handler();  // FIX: was lv_task_handler() (LVGL 7 API) — correct LVGL 8 call is lv_timer_handler()

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

// ─── Alarm Set Screen ────────────────────────────────────────────────────────────────────────
// Full-screen alarm time picker. Lets the user set the alarm directly on the panel
// and POSTs it to /api/device/alarm so the DB is updated without needing the app.
void showAlarmSetScreen() {
  // State for this screen — use static so lambdas can capture pointers
  static int s_hour   = 7;
  static int s_minute = 0;
  static bool s_enabled = true;

  // Seed from the first cached alarm if available
  if (g_alarmCount > 0) {
    s_hour    = g_alarms[0].hour;
    s_minute  = g_alarms[0].minute;
    s_enabled = g_alarms[0].enabled;
  }

  lv_obj_t *scr = lv_obj_create(nullptr);
  lv_obj_set_style_bg_color(scr, lv_color_hex(0x080808), LV_PART_MAIN);
  lv_obj_clear_flag(scr, LV_OBJ_FLAG_SCROLLABLE);

  // Title
  lv_obj_t *title = lv_label_create(scr);
  lv_obj_set_style_text_font(title, &lv_font_montserrat_20, LV_PART_MAIN);
  lv_obj_set_style_text_color(title, lv_color_hex(0x666666), LV_PART_MAIN);
  lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 24);
  lv_label_set_text(title, "SET ALARM");

  // ── Hour display + up/down ──
  // Hour up button
  lv_obj_t *btnHrUp = lv_btn_create(scr);
  lv_obj_set_size(btnHrUp, 120, 60);
  lv_obj_set_pos(btnHrUp, 160, 80);
  lv_obj_set_style_bg_color(btnHrUp, lv_color_hex(0x1A1A1A), LV_PART_MAIN);
  lv_obj_set_style_border_width(btnHrUp, 0, LV_PART_MAIN);
  lv_obj_set_style_radius(btnHrUp, 10, LV_PART_MAIN);
  lv_obj_t *lblHrUp = lv_label_create(btnHrUp);
  lv_obj_set_style_text_font(lblHrUp, &lv_font_montserrat_28, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblHrUp, lv_color_hex(0xAAAAAA), LV_PART_MAIN);
  lv_label_set_text(lblHrUp, LV_SYMBOL_UP);
  lv_obj_center(lblHrUp);

  // Hour label
  lv_obj_t *lblHr = lv_label_create(scr);
  lv_obj_set_style_text_font(lblHr, &montserrat_light_120, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblHr, lv_color_hex(0xFFFFFF), LV_PART_MAIN);
  lv_obj_set_pos(lblHr, 120, 148);
  lv_obj_set_width(lblHr, 200);
  lv_obj_set_style_text_align(lblHr, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
  char hrBuf[4]; snprintf(hrBuf, sizeof(hrBuf), "%d", s_hour > 12 ? s_hour - 12 : (s_hour == 0 ? 12 : s_hour));
  lv_label_set_text(lblHr, hrBuf);

  // Hour down button
  lv_obj_t *btnHrDn = lv_btn_create(scr);
  lv_obj_set_size(btnHrDn, 120, 60);
  lv_obj_set_pos(btnHrDn, 160, 330);
  lv_obj_set_style_bg_color(btnHrDn, lv_color_hex(0x1A1A1A), LV_PART_MAIN);
  lv_obj_set_style_border_width(btnHrDn, 0, LV_PART_MAIN);
  lv_obj_set_style_radius(btnHrDn, 10, LV_PART_MAIN);
  lv_obj_t *lblHrDn = lv_label_create(btnHrDn);
  lv_obj_set_style_text_font(lblHrDn, &lv_font_montserrat_28, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblHrDn, lv_color_hex(0xAAAAAA), LV_PART_MAIN);
  lv_label_set_text(lblHrDn, LV_SYMBOL_DOWN);
  lv_obj_center(lblHrDn);

  // Colon
  lv_obj_t *lblColon = lv_label_create(scr);
  lv_obj_set_style_text_font(lblColon, &montserrat_light_120, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblColon, lv_color_hex(0x444444), LV_PART_MAIN);
  lv_obj_set_pos(lblColon, 330, 148);
  lv_label_set_text(lblColon, ":");

  // ── Minute display + up/down ──
  lv_obj_t *btnMinUp = lv_btn_create(scr);
  lv_obj_set_size(btnMinUp, 120, 60);
  lv_obj_set_pos(btnMinUp, 520, 80);
  lv_obj_set_style_bg_color(btnMinUp, lv_color_hex(0x1A1A1A), LV_PART_MAIN);
  lv_obj_set_style_border_width(btnMinUp, 0, LV_PART_MAIN);
  lv_obj_set_style_radius(btnMinUp, 10, LV_PART_MAIN);
  lv_obj_t *lblMinUp = lv_label_create(btnMinUp);
  lv_obj_set_style_text_font(lblMinUp, &lv_font_montserrat_28, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblMinUp, lv_color_hex(0xAAAAAA), LV_PART_MAIN);
  lv_label_set_text(lblMinUp, LV_SYMBOL_UP);
  lv_obj_center(lblMinUp);

  lv_obj_t *lblMin = lv_label_create(scr);
  lv_obj_set_style_text_font(lblMin, &montserrat_light_120, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblMin, lv_color_hex(0xFFFFFF), LV_PART_MAIN);
  lv_obj_set_pos(lblMin, 370, 148);
  lv_obj_set_width(lblMin, 200);
  lv_obj_set_style_text_align(lblMin, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
  char minBuf[4]; snprintf(minBuf, sizeof(minBuf), "%02d", s_minute);
  lv_label_set_text(lblMin, minBuf);

  lv_obj_t *btnMinDn = lv_btn_create(scr);
  lv_obj_set_size(btnMinDn, 120, 60);
  lv_obj_set_pos(btnMinDn, 520, 330);
  lv_obj_set_style_bg_color(btnMinDn, lv_color_hex(0x1A1A1A), LV_PART_MAIN);
  lv_obj_set_style_border_width(btnMinDn, 0, LV_PART_MAIN);
  lv_obj_set_style_radius(btnMinDn, 10, LV_PART_MAIN);
  lv_obj_t *lblMinDn = lv_label_create(btnMinDn);
  lv_obj_set_style_text_font(lblMinDn, &lv_font_montserrat_28, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblMinDn, lv_color_hex(0xAAAAAA), LV_PART_MAIN);
  lv_label_set_text(lblMinDn, LV_SYMBOL_DOWN);
  lv_obj_center(lblMinDn);

  // AM/PM label (updates with hour)
  lv_obj_t *lblAmPm = lv_label_create(scr);
  lv_obj_set_style_text_font(lblAmPm, &lv_font_montserrat_28, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblAmPm, lv_color_hex(0x888888), LV_PART_MAIN);
  lv_obj_set_pos(lblAmPm, 600, 220);
  lv_label_set_text(lblAmPm, s_hour < 12 ? "AM" : "PM");

  // Status label (shows saving... / saved / error)
  lv_obj_t *lblStatus = lv_label_create(scr);
  lv_obj_set_style_text_font(lblStatus, &lv_font_montserrat_16, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblStatus, lv_color_hex(0x444444), LV_PART_MAIN);
  lv_obj_align(lblStatus, LV_ALIGN_BOTTOM_MID, 0, -80);
  lv_label_set_text(lblStatus, "");

  // ── Hour up callback ──
  struct AlarmPickerState { lv_obj_t *lblHr; lv_obj_t *lblMin; lv_obj_t *lblAmPm; lv_obj_t *lblStatus; };
  AlarmPickerState *st = new AlarmPickerState{lblHr, lblMin, lblAmPm, lblStatus};

  lv_obj_add_event_cb(btnHrUp, [](lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    s_hour = (s_hour + 1) % 24;
    AlarmPickerState *s = (AlarmPickerState *)lv_event_get_user_data(e);
    char buf[4]; snprintf(buf, sizeof(buf), "%d", s_hour > 12 ? s_hour - 12 : (s_hour == 0 ? 12 : s_hour));
    lv_label_set_text(s->lblHr, buf);
    lv_label_set_text(s->lblAmPm, s_hour < 12 ? "AM" : "PM");
    lv_label_set_text(s->lblStatus, "");
  }, LV_EVENT_ALL, st);

  lv_obj_add_event_cb(btnHrDn, [](lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    s_hour = (s_hour + 23) % 24;
    AlarmPickerState *s = (AlarmPickerState *)lv_event_get_user_data(e);
    char buf[4]; snprintf(buf, sizeof(buf), "%d", s_hour > 12 ? s_hour - 12 : (s_hour == 0 ? 12 : s_hour));
    lv_label_set_text(s->lblHr, buf);
    lv_label_set_text(s->lblAmPm, s_hour < 12 ? "AM" : "PM");
    lv_label_set_text(s->lblStatus, "");
  }, LV_EVENT_ALL, st);

  lv_obj_add_event_cb(btnMinUp, [](lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    s_minute = (s_minute + 1) % 60;
    AlarmPickerState *s = (AlarmPickerState *)lv_event_get_user_data(e);
    char buf[4]; snprintf(buf, sizeof(buf), "%02d", s_minute);
    lv_label_set_text(s->lblMin, buf);
    lv_label_set_text(s->lblStatus, "");
  }, LV_EVENT_ALL, st);

  lv_obj_add_event_cb(btnMinDn, [](lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    s_minute = (s_minute + 59) % 60;
    AlarmPickerState *s = (AlarmPickerState *)lv_event_get_user_data(e);
    char buf[4]; snprintf(buf, sizeof(buf), "%02d", s_minute);
    lv_label_set_text(s->lblMin, buf);
    lv_label_set_text(s->lblStatus, "");
  }, LV_EVENT_ALL, st);

  // ── Set Alarm button ──
  lv_obj_t *btnSet = lv_btn_create(scr);
  lv_obj_set_size(btnSet, 280, 56);
  lv_obj_align(btnSet, LV_ALIGN_BOTTOM_MID, -80, -16);
  lv_obj_set_style_bg_color(btnSet, lv_color_hex(0x1A3A1A), LV_PART_MAIN);
  lv_obj_set_style_border_color(btnSet, lv_color_hex(0x22C55E), LV_PART_MAIN);
  lv_obj_set_style_border_width(btnSet, 1, LV_PART_MAIN);
  lv_obj_set_style_radius(btnSet, 12, LV_PART_MAIN);
  lv_obj_t *lblSet = lv_label_create(btnSet);
  lv_obj_set_style_text_font(lblSet, &lv_font_montserrat_18, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblSet, lv_color_hex(0x22C55E), LV_PART_MAIN);
  lv_label_set_text(lblSet, LV_SYMBOL_OK "  Set Alarm");
  lv_obj_center(lblSet);
  lv_obj_add_event_cb(btnSet, [](lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    AlarmPickerState *s = (AlarmPickerState *)lv_event_get_user_data(e);
    lv_label_set_text(s->lblStatus, "Saving...");
    lv_obj_set_style_text_color(s->lblStatus, lv_color_hex(0x888888), LV_PART_MAIN);
    lv_timer_handler();
    // POST to /api/device/alarm
    bool ok = false;
    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      String url = String(API_BASE_URL) + "/api/device/alarm";
      http.begin(url);
      http.addHeader("Content-Type", "application/json");
      String apiKey = ""; { Preferences p; p.begin(NVS_NAMESPACE, true); apiKey = p.getString(NVS_KEY_APIKEY, ""); p.end(); }
      http.addHeader("X-Device-Key", apiKey);
      char body[80];
      snprintf(body, sizeof(body), "{\"hour\":%d,\"minute\":%d,\"days\":\"0,1,2,3,4,5,6\",\"enabled\":true}", s_hour, s_minute);
      int code = http.POST(body);
      ok = (code == 200);
      http.end();
    }
    if (ok) {
      // Update local cache
      if (g_alarmCount == 0) g_alarmCount = 1;
      g_alarms[0].hour    = s_hour;
      g_alarms[0].minute  = s_minute;
      g_alarms[0].enabled = true;
      for (int d = 0; d < 7; d++) g_alarms[0].daysOfWeek[d] = d;
      g_alarms[0].daysCount = 7;
      updateAlarmLabels();
      lv_label_set_text(s->lblStatus, LV_SYMBOL_OK "  Alarm set!");
      lv_obj_set_style_text_color(s->lblStatus, lv_color_hex(0x22C55E), LV_PART_MAIN);
    } else {
      lv_label_set_text(s->lblStatus, "Failed — check WiFi");
      lv_obj_set_style_text_color(s->lblStatus, lv_color_hex(0xFF4444), LV_PART_MAIN);
    }
  }, LV_EVENT_ALL, st);

  // ── Back button ──
  lv_obj_t *btnBack = lv_btn_create(scr);
  lv_obj_set_size(btnBack, 140, 56);
  lv_obj_align(btnBack, LV_ALIGN_BOTTOM_MID, 100, -16);
  lv_obj_set_style_bg_color(btnBack, lv_color_hex(0x1A1A1A), LV_PART_MAIN);
  lv_obj_set_style_border_color(btnBack, lv_color_hex(0x444444), LV_PART_MAIN);
  lv_obj_set_style_border_width(btnBack, 1, LV_PART_MAIN);
  lv_obj_set_style_radius(btnBack, 12, LV_PART_MAIN);
  lv_obj_t *lblBack = lv_label_create(btnBack);
  lv_obj_set_style_text_font(lblBack, &lv_font_montserrat_18, LV_PART_MAIN);
  lv_obj_set_style_text_color(lblBack, lv_color_hex(0x888888), LV_PART_MAIN);
  lv_label_set_text(lblBack, LV_SYMBOL_LEFT "  Back");
  lv_obj_center(lblBack);
  lv_obj_add_event_cb(btnBack, [](lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    lv_obj_t *s = lv_disp_get_scr_act(nullptr);
    showClockScreen();
    lv_obj_del_async(s);  // safe: don't delete active screen from within its own callback
  }, LV_EVENT_ALL, nullptr);

  lv_disp_load_scr(scr);
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
  lv_disp_t *disp = lv_disp_drv_register(&disp_drv);
  // Belt-and-suspenders: set display background to black so even if a screen's
  // own bg_color is somehow transparent, the fallback is black (not white).
  lv_disp_set_bg_color(disp, lv_color_hex(0x000000));
  lv_disp_set_bg_opa(disp, LV_OPA_COVER);
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

  // Initialize SD card and load audio preferences
  g_audioEnabled = loadAudioEnabled();
  g_sdMounted = initSD();
  g_audio.begin(I2S_BCLK_PIN, I2S_LRC_PIN, I2S_DOUT_PIN);  // init JackAudio I2S
  Serial.printf("[audio] SD=%s audioEnabled=%d\n", g_sdMounted ? "OK" : "FAIL", g_audioEnabled);

  // Load voice and Low EMF settings from NVS
  g_voiceEnabled = loadVoiceEnabled();
  loadLowEmfSettings();
  Serial.printf("[voice] voiceEnabled=%d lowEmfMode=%d wifiOff=%d wifiOn=%d\n",
    g_voiceEnabled, g_lowEmfMode, g_wifiOffHour, g_wifiOnHour);
  if (g_voiceEnabled) initMic();

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
  loopAudio();  // keep MP3 decoder fed

  bool wifiOk = (WiFi.status() == WL_CONNECTED);
  bool paired = !g_apiKey.isEmpty();

  // Keep audio decoder fed every loop
  loopAudio();

  // Check voice activity (wake word polling)
  loopVoice();

  // Check Low EMF WiFi schedule (turns WiFi on/off based on time)
  static unsigned long lastEmfCheck = 0;
  if (millis() - lastEmfCheck >= 60000) {  // check every minute
    lastEmfCheck = millis();
    checkWifiSchedule();
  }

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
