/**
 * CrowPanel Preview Screen
 *
 * Renders a pixel-accurate simulation of the 800×480 CrowPanel ESP32 display
 * inside the Jack app. The preview lets you tap through the full alarm flow:
 *
 *   1. ALARM_FIRING  — full-screen alarm popup with Snooze / Dismiss buttons
 *   2. CHECKIN       — habit rating grid (red / yellow / green per habit)
 *   3. DONE          — confirmation screen
 *
 * Nothing is saved. This is a pure design sandbox for tweaking colors, layout,
 * and button styles before translating them into LVGL C++ firmware code.
 *
 * Design constraints that mirror the real CrowPanel hardware:
 *   - Display: 800 × 480 px, landscape, IPS touch panel
 *   - Font: Montserrat (LVGL built-in), rendered here as System Bold
 *   - Colors: dark background (#0D0D1A), accent ('#6366F1'), status colors
 *   - Touch targets: minimum 60 × 60 px (finger-friendly on 7" glass)
 *   - No scroll — everything must fit on one screen (LVGL has no scroll by default)
 */

import React, { useState, useMemo } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView,
  useWindowDimensions, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { useApp } from '@/lib/app-context';
import { useColors } from '@/hooks/use-colors';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { CategoryIcon } from '@/components/category-icon';
import { yesterdayString, formatDisplayDate } from '@/lib/storage';
import * as Haptics from 'expo-haptics';

// ─── CrowPanel display constants ──────────────────────────────────────────────
const CP_W = 800;   // physical display width  (px)
const CP_H = 480;   // physical display height (px)
const CP_ASPECT = CP_W / CP_H; // 1.667

// ─── CrowPanel color palette (matches LVGL theme) ─────────────────────────────
const CP = {
  bg:        '#0D0D1A',   // lv_color_hex(0x0D0D1A)  — deep navy black
  surface:   '#1A1A2E',   // card / panel background
  border:    '#2E2D45',   // subtle divider
  accent:    '#6366F1',   // primary purple — matches Jack brand
  accentDim: '#4A45A0',   // dimmed accent for inactive states
  fg:        '#EEEEFF',   // primary text
  muted:     '#9090B8',   // secondary text
  red:       '#EF4444',   // missed / alarm
  yellow:    '#F59E0B',   // okay
  green:     '#22C55E',   // crushed it
  snooze:    '#374151',   // snooze button bg
  dismiss:   '#6366F1',   // dismiss button bg (accent)
  statusBar: '#050510',   // top status bar
};

// ─── Flow steps ───────────────────────────────────────────────────────────────
type FlowStep = 'alarm_firing' | 'checkin' | 'done';

type ActiveRating = 'red' | 'yellow' | 'green';
const RATING_COLORS: Record<ActiveRating, string> = {
  red:    CP.red,
  yellow: CP.yellow,
  green:  CP.green,
};
const RATING_LABELS: Record<ActiveRating, string> = {
  red:    'MISSED',
  yellow: 'OKAY',
  green:  'NAILED IT',
};

// ─── Sample habits for the preview (uses real app data if available) ──────────
const SAMPLE_HABITS = [
  { id: 's1', name: 'Morning workout',    emoji: '💪', category: 'body',  lifeArea: 'body' },
  { id: 's2', name: 'Drink 2L water',     emoji: '💧', category: 'body',  lifeArea: 'body' },
  { id: 's3', name: 'Meditate 10 min',    emoji: '🧘', category: 'mind',  lifeArea: 'mind' },
  { id: 's4', name: 'Read 20 pages',      emoji: '📖', category: 'mind',  lifeArea: 'mind' },
  { id: 's5', name: 'Deep work block',    emoji: '🎯', category: 'focus', lifeArea: 'focus' },
  { id: 's6', name: 'No phone 1st hr',    emoji: '📵', category: 'focus', lifeArea: 'focus' },
  { id: 's7', name: 'Call a friend',      emoji: '📱', category: 'relationships', lifeArea: 'relationships' },
  { id: 's8', name: 'Gratitude journal',  emoji: '🙏', category: 'spirituality', lifeArea: 'spirituality' },
];

// ─── CrowPanel Status Bar ──────────────────────────────────────────────────────
function CpStatusBar({ time }: { time: string }) {
  return (
    <View style={[cpStyles.statusBar, { backgroundColor: CP.statusBar }]}>
      <Text style={[cpStyles.statusTime, { color: CP.muted }]}>{time}</Text>
      <View style={cpStyles.statusRight}>
        <Text style={[cpStyles.statusIcon, { color: CP.muted }]}>WiFi</Text>
        <Text style={[cpStyles.statusIcon, { color: CP.muted }]}>🔋</Text>
      </View>
    </View>
  );
}

// ─── Screen 1: Alarm Firing ───────────────────────────────────────────────────
function AlarmFiringScreen({
  alarmTime,
  onSnooze,
  onDismiss,
  snoozeMinutes,
  scale,
}: {
  alarmTime: string;
  onSnooze: () => void;
  onDismiss: () => void;
  snoozeMinutes: number;
  scale: number;
}) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  return (
    <View style={[cpStyles.screen, { backgroundColor: CP.bg }]}>
      <CpStatusBar time={timeStr} />

      {/* ── Alarm icon + pulsing ring ── */}
      <View style={cpStyles.alarmIconWrap}>
        {/* Outer ring */}
        <View style={[cpStyles.alarmRingOuter, { borderColor: CP.accent + '40' }]} />
        <View style={[cpStyles.alarmRingMid,   { borderColor: CP.accent + '70' }]} />
        {/* Icon circle */}
        <View style={[cpStyles.alarmIconCircle, { backgroundColor: CP.accent + '22', borderColor: CP.accent }]}>
          <Text style={{ fontSize: 52 * scale, lineHeight: 60 * scale }}>⏰</Text>
        </View>
      </View>

      {/* ── Alarm time ── */}
      <Text style={[cpStyles.alarmTimeText, { color: CP.fg, fontSize: 72 * scale }]}>
        {alarmTime}
      </Text>
      <Text style={[cpStyles.alarmSubText, { color: CP.muted, fontSize: 18 * scale }]}>
        Good morning — time to rise
      </Text>

      {/* ── Divider ── */}
      <View style={[cpStyles.divider, { backgroundColor: CP.border, marginVertical: 20 * scale }]} />

      {/* ── Buttons ── */}
      <View style={[cpStyles.alarmBtnRow, { gap: 24 * scale }]}>
        {/* Snooze */}
        <Pressable
          onPress={onSnooze}
          style={({ pressed }) => [
            cpStyles.alarmBtn,
            {
              backgroundColor: pressed ? CP.snooze + 'CC' : CP.snooze,
              borderColor: CP.border,
              minWidth: 200 * scale,
              paddingVertical: 18 * scale,
              borderRadius: 16 * scale,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text style={[cpStyles.alarmBtnIcon, { fontSize: 22 * scale }]}>💤</Text>
          <View>
            <Text style={[cpStyles.alarmBtnLabel, { color: CP.muted, fontSize: 13 * scale }]}>
              SNOOZE
            </Text>
            <Text style={[cpStyles.alarmBtnValue, { color: CP.fg, fontSize: 20 * scale }]}>
              {snoozeMinutes} min
            </Text>
          </View>
        </Pressable>

        {/* Dismiss / Check in */}
        <Pressable
          onPress={onDismiss}
          style={({ pressed }) => [
            cpStyles.alarmBtn,
            {
              backgroundColor: pressed ? CP.accent + 'CC' : CP.accent,
              minWidth: 200 * scale,
              paddingVertical: 18 * scale,
              borderRadius: 16 * scale,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text style={[cpStyles.alarmBtnIcon, { fontSize: 22 * scale }]}>✅</Text>
          <View>
            <Text style={[cpStyles.alarmBtnLabel, { color: 'rgba(255,255,255,0.7)', fontSize: 13 * scale }]}>
              DISMISS &amp; CHECK IN
            </Text>
            <Text style={[cpStyles.alarmBtnValue, { color: '#fff', fontSize: 20 * scale }]}>
              Rate yesterday
            </Text>
          </View>
        </Pressable>
      </View>

      {/* ── Bottom hint ── */}
      <Text style={[cpStyles.alarmHint, { color: CP.muted, fontSize: 12 * scale, marginTop: 16 * scale }]}>
        Tap DISMISS to rate your habits and turn off the alarm
      </Text>
    </View>
  );
}

// ─── Screen 2: Check-in ───────────────────────────────────────────────────────
function CheckInScreen({
  habits,
  ratings,
  onRate,
  onRateAll,
  onDone,
  scale,
}: {
  habits: typeof SAMPLE_HABITS;
  ratings: Record<string, ActiveRating | undefined>;
  onRate: (id: string, r: ActiveRating) => void;
  onRateAll: (r: ActiveRating) => void;
  onDone: () => void;
  scale: number;
}) {
  const ratedCount = habits.filter((h) => ratings[h.id]).length;
  const allRated   = ratedCount === habits.length;
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const dateLabel = yesterday.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const timeStr = today.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  // Split habits into two columns for the 800px-wide display
  const leftCol  = habits.filter((_, i) => i % 2 === 0);
  const rightCol = habits.filter((_, i) => i % 2 !== 0);

  return (
    <View style={[cpStyles.screen, { backgroundColor: CP.bg }]}>
      <CpStatusBar time={timeStr} />

      {/* ── Header bar ── */}
      <View style={[cpStyles.checkinHeader, { backgroundColor: CP.surface, borderBottomColor: CP.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[cpStyles.checkinTitle, { color: CP.fg, fontSize: 20 * scale }]}>
            Yesterday's Check-in
          </Text>
          <Text style={[cpStyles.checkinDate, { color: CP.muted, fontSize: 13 * scale }]}>
            {dateLabel}
          </Text>
        </View>

        {/* Progress pill */}
        <View style={[cpStyles.progressPill, { backgroundColor: CP.accent + '22', borderColor: CP.accent + '55' }]}>
          <Text style={[cpStyles.progressPillText, { color: CP.accent, fontSize: 13 * scale }]}>
            {ratedCount}/{habits.length} rated
          </Text>
        </View>

        {/* Rate-all buttons */}
        <View style={[cpStyles.rateAllRow, { gap: 6 * scale, marginLeft: 16 * scale }]}>
          <Text style={[{ color: CP.muted, fontSize: 11 * scale, marginRight: 4 * scale, fontWeight: '600' }]}>
            ALL:
          </Text>
          {(['red', 'yellow', 'green'] as ActiveRating[]).map((r) => (
            <Pressable
              key={r}
              onPress={() => onRateAll(r)}
              style={({ pressed }) => [{
                width: 32 * scale,
                height: 32 * scale,
                borderRadius: 8 * scale,
                backgroundColor: RATING_COLORS[r] + (pressed ? 'FF' : '99'),
                alignItems: 'center',
                justifyContent: 'center',
              }]}
            />
          ))}
        </View>
      </View>

      {/* ── Progress bar ── */}
      <View style={[cpStyles.progressTrack, { backgroundColor: CP.border }]}>
        <View style={[
          cpStyles.progressFill,
          { width: `${Math.round((ratedCount / habits.length) * 100)}%` as any, backgroundColor: CP.accent },
        ]} />
      </View>

      {/* ── Two-column habit grid ── */}
      <View style={cpStyles.habitGrid}>
        {/* Left column */}
        <View style={cpStyles.habitCol}>
          {leftCol.map((habit) => (
            <HabitRow
              key={habit.id}
              habit={habit}
              rating={ratings[habit.id]}
              onRate={(r) => onRate(habit.id, r)}
              scale={scale}
            />
          ))}
        </View>
        {/* Vertical divider */}
        <View style={[cpStyles.colDivider, { backgroundColor: CP.border }]} />
        {/* Right column */}
        <View style={cpStyles.habitCol}>
          {rightCol.map((habit) => (
            <HabitRow
              key={habit.id}
              habit={habit}
              rating={ratings[habit.id]}
              onRate={(r) => onRate(habit.id, r)}
              scale={scale}
            />
          ))}
        </View>
      </View>

      {/* ── Done button ── */}
      <View style={[cpStyles.checkinFooter, { backgroundColor: CP.surface, borderTopColor: CP.border }]}>
        <View style={cpStyles.footerTally}>
          {(['green', 'yellow', 'red'] as ActiveRating[]).map((r) => {
            const count = habits.filter((h) => ratings[h.id] === r).length;
            return count > 0 ? (
              <View key={r} style={[cpStyles.tallyPill, { backgroundColor: RATING_COLORS[r] + '22' }]}>
                <View style={[cpStyles.tallyDot, { backgroundColor: RATING_COLORS[r] }]} />
                <Text style={[cpStyles.tallyText, { color: RATING_COLORS[r], fontSize: 13 * scale }]}>
                  {count}
                </Text>
              </View>
            ) : null;
          })}
        </View>

        <Pressable
          onPress={onDone}
          style={({ pressed }) => [
            cpStyles.doneBtn,
            {
              backgroundColor: allRated
                ? (pressed ? CP.accent + 'CC' : CP.accent)
                : CP.accentDim,
              opacity: allRated ? 1 : 0.6,
              paddingHorizontal: 40 * scale,
              paddingVertical: 14 * scale,
              borderRadius: 14 * scale,
            },
          ]}
        >
          <Text style={[cpStyles.doneBtnText, { color: '#fff', fontSize: 16 * scale }]}>
            {allRated ? 'Save & Done ✓' : `Rate all (${ratedCount}/${habits.length})`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Habit Row (used in check-in grid) ───────────────────────────────────────
function HabitRow({
  habit,
  rating,
  onRate,
  scale,
}: {
  habit: (typeof SAMPLE_HABITS)[0];
  rating: ActiveRating | undefined;
  onRate: (r: ActiveRating) => void;
  scale: number;
}) {
  return (
    <View style={[cpStyles.habitRow, { borderBottomColor: CP.border }]}>
      {/* Emoji + name */}
      <Text style={[cpStyles.habitEmoji, { fontSize: 18 * scale }]}>{habit.emoji}</Text>
      <Text
        style={[cpStyles.habitName, { color: CP.fg, fontSize: 13 * scale }]}
        numberOfLines={1}
      >
        {habit.name}
      </Text>

      {/* Rating buttons */}
      <View style={[cpStyles.ratingBtns, { gap: 5 * scale }]}>
        {(['red', 'yellow', 'green'] as ActiveRating[]).map((r) => {
          const isActive = rating === r;
          return (
            <Pressable
              key={r}
              onPress={() => onRate(r)}
              style={({ pressed }) => [
                cpStyles.ratingBtn,
                {
                  width:  38 * scale,
                  height: 38 * scale,
                  borderRadius: 9 * scale,
                  backgroundColor: isActive
                    ? RATING_COLORS[r]
                    : (pressed ? RATING_COLORS[r] + '55' : RATING_COLORS[r] + '22'),
                  borderWidth: isActive ? 0 : 1,
                  borderColor: RATING_COLORS[r] + '55',
                },
              ]}
            >
              {isActive && (
                <Text style={{ fontSize: 14 * scale, lineHeight: 18 * scale }}>
                  {r === 'green' ? '✓' : r === 'yellow' ? '~' : '✗'}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ─── Screen 3: Done ───────────────────────────────────────────────────────────
function DoneScreen({
  ratings,
  habits,
  onClose,
  scale,
}: {
  ratings: Record<string, ActiveRating | undefined>;
  habits: typeof SAMPLE_HABITS;
  onClose: () => void;
  scale: number;
}) {
  const greenCount  = habits.filter((h) => ratings[h.id] === 'green').length;
  const yellowCount = habits.filter((h) => ratings[h.id] === 'yellow').length;
  const redCount    = habits.filter((h) => ratings[h.id] === 'red').length;
  const score = habits.length > 0
    ? Math.round(((greenCount * 1 + yellowCount * 0.5) / habits.length) * 100)
    : 0;
  const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  return (
    <View style={[cpStyles.screen, { backgroundColor: CP.bg }]}>
      <CpStatusBar time={timeStr} />

      <View style={cpStyles.doneContent}>
        {/* Big checkmark */}
        <View style={[cpStyles.doneIconCircle, { backgroundColor: CP.green + '22', borderColor: CP.green }]}>
          <Text style={{ fontSize: 52 * scale }}>✅</Text>
        </View>

        <Text style={[cpStyles.doneTitle, { color: CP.fg, fontSize: 32 * scale }]}>
          Check-in Saved!
        </Text>
        <Text style={[cpStyles.doneSub, { color: CP.muted, fontSize: 16 * scale }]}>
          Your ratings have been synced to the Jack app
        </Text>

        {/* Score ring */}
        <View style={[cpStyles.scoreWrap, { marginTop: 24 * scale }]}>
          <View style={[cpStyles.scorePill, { backgroundColor: CP.accent + '22', borderColor: CP.accent + '55' }]}>
            <Text style={[cpStyles.scoreLabel, { color: CP.muted, fontSize: 12 * scale }]}>YESTERDAY'S SCORE</Text>
            <Text style={[cpStyles.scoreValue, { color: CP.accent, fontSize: 42 * scale }]}>
              {score}%
            </Text>
          </View>
        </View>

        {/* Tally */}
        <View style={[cpStyles.doneTally, { gap: 16 * scale, marginTop: 20 * scale }]}>
          {[
            { label: 'Crushed it', count: greenCount,  color: CP.green  },
            { label: 'Okay',       count: yellowCount, color: CP.yellow },
            { label: 'Missed',     count: redCount,    color: CP.red    },
          ].map((t) => (
            <View key={t.label} style={[cpStyles.doneTallyItem, { backgroundColor: t.color + '18', borderColor: t.color + '44', borderRadius: 12 * scale, paddingHorizontal: 20 * scale, paddingVertical: 10 * scale }]}>
              <Text style={[{ color: t.color, fontSize: 24 * scale, fontWeight: '700' }]}>{t.count}</Text>
              <Text style={[{ color: CP.muted, fontSize: 12 * scale, marginTop: 2 * scale }]}>{t.label}</Text>
            </View>
          ))}
        </View>

        {/* Close button */}
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [
            cpStyles.doneCloseBtn,
            {
              backgroundColor: pressed ? CP.surface + 'CC' : CP.surface,
              borderColor: CP.border,
              marginTop: 28 * scale,
              paddingHorizontal: 48 * scale,
              paddingVertical: 14 * scale,
              borderRadius: 14 * scale,
            },
          ]}
        >
          <Text style={[cpStyles.doneCloseBtnText, { color: CP.muted, fontSize: 15 * scale }]}>
            Close Display
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Main Preview Screen ──────────────────────────────────────────────────────
export default function CrowPanelPreviewScreen() {
  const { activeHabits, alarm } = useApp();
  const colors = useColors();
  const router = useRouter();
  const { width: screenW } = useWindowDimensions();

  // Use real habits if available, otherwise fall back to sample data
  const habitsToShow = useMemo(() => {
    if (activeHabits.length > 0) {
      return activeHabits.slice(0, 8).map((h) => ({
        id:       h.id,
        name:     h.name,
        emoji:    h.emoji,
        category: h.category,
        lifeArea: (h as any).lifeArea ?? '',
      }));
    }
    return SAMPLE_HABITS;
  }, [activeHabits]);

  const snoozeMinutes = alarm.snoozeMinutes ?? 10;
  const alarmHour     = alarm.hour ?? 7;
  const alarmMinute   = alarm.minute ?? 0;
  const period        = alarmHour >= 12 ? 'PM' : 'AM';
  const h12           = alarmHour % 12 === 0 ? 12 : alarmHour % 12;
  const alarmTime     = `${h12}:${String(alarmMinute).padStart(2, '0')} ${period}`;

  // ── Flow state ──
  const [step, setStep] = useState<FlowStep>('alarm_firing');
  const [ratings, setRatings] = useState<Record<string, ActiveRating | undefined>>({});

  function handleRate(id: string, r: ActiveRating) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRatings((prev) => ({ ...prev, [id]: prev[id] === r ? undefined : r }));
  }
  function handleRateAll(r: ActiveRating) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const next: Record<string, ActiveRating> = {};
    habitsToShow.forEach((h) => { next[h.id] = r; });
    setRatings(next);
  }
  function handleSnooze() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // In the real firmware, snooze re-fires the alarm after N minutes.
    // In preview, we just cycle back to alarm_firing after a brief reset.
    setStep('alarm_firing');
  }
  function handleDismiss() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setStep('checkin');
  }
  function handleDone() {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setStep('done');
  }
  function handleClose() {
    router.back();
  }
  function resetFlow() {
    setStep('alarm_firing');
    setRatings({});
  }

  // ── Calculate the display frame size ──
  // On narrow screens (phone), scale down so the 800×480 frame fits.
  // On wide screens (iPad / web), cap at a comfortable size.
  const maxW = Math.min(screenW - 32, 900);
  const frameW = maxW;
  const frameH = Math.round(frameW / CP_ASPECT);
  const scale  = frameW / CP_W;  // scale factor for all sizes inside the frame

  const stepLabel: Record<FlowStep, string> = {
    alarm_firing: 'Alarm Firing',
    checkin:      'Check-in Screen',
    done:         'Done Screen',
  };

  return (
    <ScreenContainer edges={['top', 'left', 'right']}>
      {/* ── App chrome header ── */}
      <View style={[appStyles.header, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [appStyles.headerBtn, { opacity: pressed ? 0.5 : 1 }]}
        >
          <IconSymbol name="xmark" size={18} color={colors.muted} />
        </Pressable>
        <View style={appStyles.headerCenter}>
          <Text style={[appStyles.headerTitle, { color: colors.foreground }]}>CrowPanel Preview</Text>
          <Text style={[appStyles.headerSub, { color: colors.muted }]}>800 × 480 display simulation</Text>
        </View>
        <Pressable
          onPress={resetFlow}
          style={({ pressed }) => [appStyles.headerBtn, { opacity: pressed ? 0.5 : 1 }]}
        >
          <IconSymbol name="arrow.up.arrow.down" size={18} color={colors.primary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={appStyles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Flow step indicator ── */}
        <View style={[appStyles.stepRow, { borderColor: colors.border }]}>
          {(['alarm_firing', 'checkin', 'done'] as FlowStep[]).map((s, i) => (
            <Pressable
              key={s}
              onPress={() => setStep(s)}
              style={({ pressed }) => [
                appStyles.stepBtn,
                {
                  backgroundColor: step === s ? colors.primary + '22' : 'transparent',
                  borderColor: step === s ? colors.primary : colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text style={[appStyles.stepNum, { color: step === s ? colors.primary : colors.muted }]}>
                {i + 1}
              </Text>
              <Text style={[appStyles.stepLabel, { color: step === s ? colors.primary : colors.muted }]}>
                {stepLabel[s]}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ── CrowPanel frame ── */}
        <View style={appStyles.frameWrap}>
          {/* Outer bezel */}
          <View style={[
            appStyles.bezel,
            { width: frameW + 24, height: frameH + 24, borderRadius: 18, backgroundColor: '#111' },
          ]}>
            {/* Screen area */}
            <View style={[
              appStyles.displayFrame,
              { width: frameW, height: frameH, borderRadius: 8, overflow: 'hidden' },
            ]}>
              {step === 'alarm_firing' && (
                <AlarmFiringScreen
                  alarmTime={alarmTime}
                  onSnooze={handleSnooze}
                  onDismiss={handleDismiss}
                  snoozeMinutes={snoozeMinutes}
                  scale={scale}
                />
              )}
              {step === 'checkin' && (
                <CheckInScreen
                  habits={habitsToShow}
                  ratings={ratings}
                  onRate={handleRate}
                  onRateAll={handleRateAll}
                  onDone={handleDone}
                  scale={scale}
                />
              )}
              {step === 'done' && (
                <DoneScreen
                  ratings={ratings}
                  habits={habitsToShow}
                  onClose={handleClose}
                  scale={scale}
                />
              )}
            </View>
          </View>

          {/* Frame label */}
          <Text style={[appStyles.frameLabel, { color: colors.muted }]}>
            CrowPanel 7" ESP32-S3 · 800 × 480 · IPS Touch
          </Text>
        </View>

        {/* ── Design notes ── */}
        <View style={[appStyles.notesCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[appStyles.notesTitle, { color: colors.foreground }]}>Design Notes</Text>
          <View style={appStyles.notesList}>
            {[
              ['Accent color', CP.accent + ' — matches Jack brand purple'],
              ['Background', CP.bg + ' — deep navy, easy on eyes in dark room'],
              ['Touch targets', '≥ 60 px tall — finger-friendly on 7" glass'],
              ['Font', 'Montserrat Bold (LVGL built-in) — rendered as System Bold here'],
              ['Layout', 'Two-column habit grid fits 8 habits without scroll'],
              ['Alarm screen', 'Full-screen takeover — no tab bar, no back button'],
              ['Snooze', `${snoozeMinutes} min (from your alarm settings)`],
            ].map(([key, val]) => (
              <View key={key} style={appStyles.noteRow}>
                <Text style={[appStyles.noteKey, { color: colors.muted }]}>{key}</Text>
                <Text style={[appStyles.noteVal, { color: colors.foreground }]}>{val}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Color palette swatches ── */}
        <View style={[appStyles.notesCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[appStyles.notesTitle, { color: colors.foreground }]}>CrowPanel Color Palette</Text>
          <View style={appStyles.swatchGrid}>
            {Object.entries(CP).map(([name, hex]) => (
              <View key={name} style={appStyles.swatchItem}>
                <View style={[appStyles.swatch, { backgroundColor: hex, borderColor: colors.border }]} />
                <Text style={[appStyles.swatchName, { color: colors.muted }]}>{name}</Text>
                <Text style={[appStyles.swatchHex, { color: colors.foreground }]}>{hex}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </ScreenContainer>
  );
}

// ─── Styles: CrowPanel internal (scaled) ─────────────────────────────────────
const cpStyles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    zIndex: 10,
  },
  statusTime: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  statusRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusIcon: {
    fontSize: 10,
    fontWeight: '600',
  },

  // ── Alarm Firing ──
  alarmIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    position: 'relative',
    width: 140,
    height: 140,
  },
  alarmRingOuter: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
  },
  alarmRingMid: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 2,
  },
  alarmIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alarmTimeText: {
    fontWeight: '800',
    letterSpacing: -2,
    marginTop: 4,
  },
  alarmSubText: {
    fontWeight: '500',
    letterSpacing: 0.3,
    marginTop: 4,
  },
  divider: {
    width: '60%',
    height: 1,
  },
  alarmBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alarmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  alarmBtnIcon: {
    lineHeight: 28,
  },
  alarmBtnLabel: {
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  alarmBtnValue: {
    fontWeight: '700',
    marginTop: 2,
  },
  alarmHint: {
    fontWeight: '500',
    letterSpacing: 0.2,
    textAlign: 'center',
  },

  // ── Check-in ──
  checkinHeader: {
    position: 'absolute',
    top: 24,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    zIndex: 5,
  },
  checkinTitle: {
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  checkinDate: {
    fontWeight: '500',
    marginTop: 1,
  },
  progressPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  progressPillText: {
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  rateAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressTrack: {
    position: 'absolute',
    top: 24 + 56, // statusBar + header
    left: 0,
    right: 0,
    height: 3,
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
  },
  habitGrid: {
    position: 'absolute',
    top: 24 + 56 + 3, // statusBar + header + progressBar
    left: 0,
    right: 0,
    bottom: 64, // footer height
    flexDirection: 'row',
  },
  habitCol: {
    flex: 1,
  },
  colDivider: {
    width: 1,
  },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  habitEmoji: {
    lineHeight: 24,
  },
  habitName: {
    flex: 1,
    fontWeight: '600',
  },
  ratingBtns: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkinFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    borderTopWidth: 1,
  },
  footerTally: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tallyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  tallyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tallyText: {
    fontWeight: '700',
  },
  doneBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // ── Done ──
  doneContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 24,
  },
  doneIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  doneTitle: {
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  doneSub: {
    fontWeight: '500',
    marginTop: 6,
    textAlign: 'center',
  },
  scoreWrap: {
    alignItems: 'center',
  },
  scorePill: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  scoreLabel: {
    fontWeight: '700',
    letterSpacing: 1,
  },
  scoreValue: {
    fontWeight: '900',
    letterSpacing: -2,
  },
  doneTally: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  doneTallyItem: {
    alignItems: 'center',
    borderWidth: 1,
  },
  doneCloseBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  doneCloseBtnText: {
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});

// ─── Styles: App chrome (outside the CrowPanel frame) ─────────────────────────
const appStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  headerSub: {
    fontSize: 11,
    marginTop: 1,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 16,
    alignItems: 'center',
  },

  // Step indicator
  stepRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    width: '100%',
    maxWidth: 900,
  },
  stepBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  stepNum: {
    fontSize: 12,
    fontWeight: '800',
    width: 20,
    height: 20,
    textAlign: 'center',
    lineHeight: 20,
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: '600',
  },

  // CrowPanel frame
  frameWrap: {
    alignItems: 'center',
    marginBottom: 20,
    width: '100%',
    maxWidth: 924,
  },
  bezel: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  displayFrame: {
    // overflow hidden set inline
  },
  frameLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 10,
    letterSpacing: 0.3,
  },

  // Design notes
  notesCard: {
    width: '100%',
    maxWidth: 900,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  notesTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
    letterSpacing: 0.2,
  },
  notesList: {
    gap: 8,
  },
  noteRow: {
    flexDirection: 'row',
    gap: 12,
  },
  noteKey: {
    fontSize: 12,
    fontWeight: '600',
    width: 110,
    flexShrink: 0,
  },
  noteVal: {
    fontSize: 12,
    flex: 1,
    fontWeight: '500',
  },

  // Color swatches
  swatchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  swatchItem: {
    alignItems: 'center',
    gap: 4,
    width: 72,
  },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
  },
  swatchName: {
    fontSize: 10,
    fontWeight: '600',
  },
  swatchHex: {
    fontSize: 9,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
});
