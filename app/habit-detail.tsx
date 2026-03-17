/**
 * Habit Detail Screen
 *
 * Layout (top → bottom):
 *  1. Month calendar (navigable, tappable days)
 *  2. Six-month heatmap
 *  3. Stat tiles (streak, best streak, total)
 *  4. Goal progress
 *  5. Rating breakdown
 *  6. Recent history list
 *
 * Tapping a past/today day on the month calendar opens a DayEntryModal
 * where the user can set the rating (green/yellow/red) and add a note.
 */
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState, useMemo, useEffect, useCallback } from "react";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { SixMonthHeatmap } from "@/components/six-month-heatmap";
import { useApp } from "@/lib/app-context";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import {
  toDateString, loadDayNotes, saveDayNotes, type DayNotes,
  type Rating,
} from "@/lib/storage";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const CELL_GAP = 4;

function ratingColor(r: string | null) {
  if (r === "green")  return "#22C55E";
  if (r === "yellow") return "#F59E0B";
  if (r === "red")    return "#EF4444";
  return null;
}

// ─── Day Entry Modal ──────────────────────────────────────────────────────────
interface DayEntryModalProps {
  visible: boolean;
  dateStr: string | null;
  habitName: string;
  currentRating: Rating | null;
  currentNote: string;
  onSave: (date: string, rating: Rating | null, note: string) => void;
  onClose: () => void;
  colors: ReturnType<typeof import("@/hooks/use-colors").useColors>;
}

function DayEntryModal({
  visible, dateStr, habitName, currentRating, currentNote,
  onSave, onClose, colors,
}: DayEntryModalProps) {
  const [rating, setRating] = useState<Rating | null>(currentRating);
  const [note, setNote] = useState(currentNote);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible) {
      setRating(currentRating);
      setNote(currentNote);
    }
  }, [visible, currentRating, currentNote]);

  const dateLabel = useMemo(() => {
    if (!dateStr) return "";
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  }, [dateStr]);

  function handleSave() {
    if (!dateStr) return;
    onSave(dateStr, rating, note.trim());
    onClose();
  }

  const ratingOptions: { value: Rating; label: string; color: string; icon: string }[] = [
    { value: "green",  label: "Crushed it",  color: "#22C55E", icon: "🟢" },
    { value: "yellow", label: "Okay",        color: "#F59E0B", icon: "🟡" },
    { value: "red",    label: "Missed",      color: "#EF4444", icon: "🔴" },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Header */}
        <View style={[modalStyles.header, {
          borderBottomColor: colors.border,
          paddingTop: Math.max(insets.top, 16),
        }]}>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 4 })}
          >
            <Text style={[modalStyles.cancelBtn, { color: colors.muted }]}>Cancel</Text>
          </Pressable>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={[modalStyles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
              {habitName}
            </Text>
            <Text style={[modalStyles.headerDate, { color: colors.muted }]}>{dateLabel}</Text>
          </View>
          <Pressable
            onPress={handleSave}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 4 })}
          >
            <Text style={[modalStyles.saveBtn, { color: colors.primary }]}>Save</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={modalStyles.body} keyboardShouldPersistTaps="handled">
          {/* Rating picker */}
          <Text style={[modalStyles.sectionLabel, { color: colors.muted }]}>HOW DID IT GO?</Text>
          <View style={modalStyles.ratingRow}>
            {ratingOptions.map((opt) => {
              const isSelected = rating === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setRating(isSelected ? null : opt.value)}
                  style={({ pressed }) => [
                    modalStyles.ratingBtn,
                    {
                      backgroundColor: isSelected ? opt.color + "22" : colors.surface,
                      borderColor: isSelected ? opt.color : colors.border,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Text style={{ fontSize: 22 }}>{opt.icon}</Text>
                  <Text style={[
                    modalStyles.ratingLabel,
                    { color: isSelected ? opt.color : colors.muted },
                  ]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Note input */}
          <Text style={[modalStyles.sectionLabel, { color: colors.muted, marginTop: 20 }]}>
            NOTE (OPTIONAL)
          </Text>
          <TextInput
            style={[modalStyles.input, {
              color: colors.foreground,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            }]}
            value={note}
            onChangeText={setNote}
            placeholder="What did you do? Any reflections..."
            placeholderTextColor={colors.muted}
            multiline
            returnKeyType="default"
          />

          {/* Clear button */}
          {(rating !== null || note.trim().length > 0) && (
            <Pressable
              onPress={() => { setRating(null); setNote(""); }}
              style={({ pressed }) => [
                modalStyles.clearBtn,
                { opacity: pressed ? 0.5 : 1, borderColor: colors.border },
              ]}
            >
              <IconSymbol name="trash" size={14} color="#EF4444" />
              <Text style={modalStyles.clearBtnText}>Clear entry</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Month Calendar (inline, for single habit) ───────────────────────────────
interface MonthCalendarProps {
  year: number;
  month: number;
  ratingByDate: Record<string, string>;
  noteByDate: Record<string, string>;
  onDayPress: (dateStr: string) => void;
  colors: ReturnType<typeof import("@/hooks/use-colors").useColors>;
  containerWidth: number;
}

function MonthCalendar({
  year, month, ratingByDate, noteByDate, onDayPress, colors, containerWidth,
}: MonthCalendarProps) {
  const today = toDateString();
  const COLS = 7;
  const cellSize = Math.floor((containerWidth - CELL_GAP * (COLS - 1)) / COLS);

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: Array<{ type: "blank" } | { type: "day"; day: number; dateStr: string }> = [];
  for (let i = 0; i < firstDow; i++) cells.push({ type: "blank" });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ type: "day", day: d, dateStr });
  }

  const rows: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  return (
    <View style={{ width: "100%" }}>
      {/* Day-of-week header */}
      <View style={{ flexDirection: "row", gap: CELL_GAP, marginBottom: CELL_GAP }}>
        {DAY_LABELS.map((d, i) => (
          <View key={i} style={{ width: cellSize, height: 18, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 10, fontWeight: "600", color: colors.muted }}>{d}</Text>
          </View>
        ))}
      </View>

      {rows.map((row, ri) => (
        <View key={ri} style={{ flexDirection: "row", gap: CELL_GAP, marginBottom: CELL_GAP }}>
          {row.map((cell, ci) => {
            if (cell.type === "blank") {
              return <View key={`b-${ci}`} style={{ width: cellSize, height: cellSize }} />;
            }

            const { day, dateStr } = cell;
            const isToday   = dateStr === today;
            const isFuture  = dateStr > today;
            const rating    = ratingByDate[dateStr] ?? null;
            const hasNote   = !!noteByDate[dateStr];
            const bgColor   = ratingColor(rating);
            const canTap    = !isFuture;

            return (
              <Pressable
                key={dateStr}
                onPress={() => canTap && onDayPress(dateStr)}
                style={({ pressed }) => ({
                  width: cellSize,
                  height: cellSize,
                  borderRadius: cellSize * 0.22,
                  backgroundColor: bgColor ?? (isToday ? colors.primary + "18" : colors.surface),
                  borderWidth: isToday ? 2 : 1,
                  borderColor: isToday
                    ? colors.primary
                    : bgColor
                      ? "transparent"
                      : colors.border,
                  opacity: isFuture ? 0.25 : pressed ? 0.65 : 1,
                  alignItems: "center",
                  justifyContent: "center",
                })}
              >
                <Text style={{
                  fontSize: cellSize * 0.32,
                  fontWeight: isToday ? "800" : "600",
                  color: bgColor
                    ? "rgba(255,255,255,0.95)"
                    : isToday
                      ? colors.primary
                      : colors.foreground,
                  lineHeight: cellSize * 0.38,
                }}>
                  {day}
                </Text>
                {hasNote && !bgColor && (
                  <View style={{
                    width: 4, height: 4, borderRadius: 2,
                    backgroundColor: colors.primary,
                    marginTop: 1,
                  }} />
                )}
              </Pressable>
            );
          })}
          {/* Trailing blanks */}
          {row.length < 7 && Array.from({ length: 7 - row.length }).map((_, i) => (
            <View key={`t-${i}`} style={{ width: cellSize, height: cellSize }} />
          ))}
        </View>
      ))}

      {/* Legend */}
      <View style={{ flexDirection: "row", gap: 14, marginTop: 8 }}>
        {[
          { color: "#22C55E", label: "Crushed" },
          { color: "#F59E0B", label: "Okay" },
          { color: "#EF4444", label: "Missed" },
        ].map((item) => (
          <View key={item.label} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.color }} />
            <Text style={{ fontSize: 11, color: colors.muted }}>{item.label}</Text>
          </View>
        ))}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.primary }} />
          <Text style={{ fontSize: 11, color: colors.muted }}>Note</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function HabitDetailScreen() {
  const { habitId } = useLocalSearchParams<{ habitId: string }>();
  const { checkIns, activeHabits, categories, submitCheckIn } = useApp();
  const colors = useColors();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();

  const today = new Date();
  const todayStr = toDateString(today);

  const [calYear, setCalYear]   = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  // Day notes state
  const [dayNotes, setDayNotes] = useState<DayNotes>({});

  // Day entry modal state
  const [entryDate, setEntryDate]   = useState<string | null>(null);

  // Reload day notes every time this screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadDayNotes().then(setDayNotes);
    }, [])
  );

  const saveEntry = useCallback(async (date: string, rating: Rating | null, note: string) => {
    // Save note
    const key = `${habitId}:${date}`;
    const updatedNotes = { ...dayNotes };
    if (note) {
      updatedNotes[key] = note;
    } else {
      delete updatedNotes[key];
    }
    setDayNotes(updatedNotes);
    await saveDayNotes(updatedNotes);

    // Save rating via submitCheckIn (which handles merge + server sync)
    if (rating !== null) {
      const ratingsMap: Record<string, Rating> = { [habitId]: rating };
      await submitCheckIn(date, ratingsMap);
    }
  }, [dayNotes, habitId, submitCheckIn]);

  const habit    = useMemo(() => activeHabits.find((h) => h.id === habitId), [activeHabits, habitId]);
  const category = useMemo(() => habit ? categories.find((c) => c.id === habit.category) : null, [habit, categories]);
  const globalRank = useMemo(() => {
    const idx = activeHabits.findIndex((h) => h.id === habitId);
    return idx >= 0 ? idx + 1 : null;
  }, [activeHabits, habitId]);

  const habitCheckIns = useMemo(
    () => checkIns.filter((e) => e.habitId === habitId && e.rating !== "none").sort((a, b) => a.date.localeCompare(b.date)),
    [checkIns, habitId],
  );

  const ratingByDate = useMemo(() => {
    const m: Record<string, string> = {};
    for (const e of habitCheckIns) m[e.date] = e.rating;
    return m;
  }, [habitCheckIns]);

  // Note lookup: habitId:date → note text
  const noteByDate = useMemo(() => {
    const m: Record<string, string> = {};
    for (const [key, val] of Object.entries(dayNotes)) {
      if (key.startsWith(habitId + ":")) {
        const date = key.slice(habitId.length + 1);
        m[date] = val;
      }
    }
    return m;
  }, [dayNotes, habitId]);

  const ratedDates = useMemo(() => new Set(habitCheckIns.map((e) => e.date)), [habitCheckIns]);

  const { currentStreak, bestStreak } = useMemo(() => {
    const yesterdayD = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const yesterdayStr = toDateString(yesterdayD);
    let cur = 0;
    let anchorStr: string | null = null;
    if (ratedDates.has(todayStr)) anchorStr = todayStr;
    else if (ratedDates.has(yesterdayStr)) anchorStr = yesterdayStr;
    if (anchorStr) {
      const anchorD = new Date(anchorStr + "T12:00:00");
      for (let i = 0; i < 365; i++) {
        const d = new Date(anchorD.getFullYear(), anchorD.getMonth(), anchorD.getDate() - i);
        if (ratedDates.has(toDateString(d))) cur++;
        else break;
      }
    }
    const greenDates = new Set(habitCheckIns.filter((e) => e.rating === "green").map((e) => e.date));
    const sortedGreen = [...greenDates].sort();
    let best = 0, run = 0;
    let prevD: Date | null = null;
    for (const ds of sortedGreen) {
      const d = new Date(ds + "T12:00:00");
      if (prevD) {
        const diff = Math.round(
          (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
           new Date(prevD.getFullYear(), prevD.getMonth(), prevD.getDate()).getTime()) / 86400000
        );
        run = diff === 1 ? run + 1 : 1;
      } else { run = 1; }
      if (run > best) best = run;
      prevD = d;
    }
    return { currentStreak: cur, bestStreak: best };
  }, [ratedDates, habitCheckIns, todayStr]);

  const { green, yellow, red, total } = useMemo(() => {
    let g = 0, y = 0, r = 0;
    for (const e of habitCheckIns) {
      if (e.rating === "green") g++;
      else if (e.rating === "yellow") y++;
      else if (e.rating === "red") r++;
    }
    return { green: g, yellow: y, red: r, total: g + y + r };
  }, [habitCheckIns]);

  const score = total > 0 ? (green * 1 + yellow * 0.5) / total : null;

  const habitScoreByDate = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of habitCheckIns) {
      if (e.rating === "green") m[e.date] = 1;
      else if (e.rating === "yellow") m[e.date] = 0.5;
      else if (e.rating === "red") m[e.date] = 0;
    }
    return m;
  }, [habitCheckIns]);

  const goalInfo = useMemo(() => {
    if (!habit) return null;
    const isMonthly = habit.frequencyType === "monthly";
    if (isMonthly && habit.monthlyGoal) {
      const prefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
      const done = habitCheckIns.filter((e) => e.date.startsWith(prefix)).length;
      return { done, goal: habit.monthlyGoal, label: "This Month" };
    }
    if (!isMonthly && habit.weeklyGoal) {
      const dow = today.getDay();
      const mondayOffset = dow === 0 ? -6 : 1 - dow;
      const monday = new Date(today); monday.setDate(today.getDate() + mondayOffset);
      let done = 0;
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday); d.setDate(monday.getDate() + i);
        if (ratedDates.has(toDateString(d))) done++;
      }
      return { done, goal: habit.weeklyGoal, label: "This Week" };
    }
    return null;
  }, [habit, habitCheckIns, ratedDates, today]);

  const recentEntries = useMemo(() => {
    const checkinDates = new Set(habitCheckIns.map((e) => e.date));
    const journalOnlyDates = Object.keys(dayNotes)
      .filter((key) => key.startsWith(habitId + ":"))
      .map((key) => key.replace(habitId + ":", ""))
      .filter((d) => !checkinDates.has(d));
    const journalEntries = journalOnlyDates.map((d) => ({
      date: d, habitId, rating: "none" as const, loggedAt: d,
    }));
    const combined = [...habitCheckIns, ...journalEntries];
    combined.sort((a, b) => b.date.localeCompare(a.date));
    return combined.slice(0, 20);
  }, [habitCheckIns, dayNotes, habitId]);

  function prevMonth() {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  }
  function nextMonth() {
    if (calYear === today.getFullYear() && calMonth >= today.getMonth()) return;
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  }
  const canGoForward = !(calYear === today.getFullYear() && calMonth >= today.getMonth());

  // Width for the calendar: screen width minus card padding (16px each side) minus card margin (20px each side)
  const calContainerWidth = screenWidth - 40 - 32; // 20px scroll padding + 16px card padding, each side

  if (!habit) {
    return (
      <ScreenContainer>
        <View style={styles.center}>
          <Text style={{ color: colors.muted, fontSize: 16 }}>Habit not found.</Text>
        </View>
      </ScreenContainer>
    );
  }

  const entryRating = entryDate ? (ratingByDate[entryDate] as Rating ?? null) : null;
  const entryNote   = entryDate ? (noteByDate[entryDate] ?? "") : "";

  return (
    <ScreenContainer>
      {/* Nav bar */}
      <View style={[styles.navBar, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.5 : 1 }]}
        >
          <IconSymbol name="chevron.left" size={20} color={colors.primary} />
          <Text style={[styles.backText, { color: colors.primary }]}>Back</Text>
        </Pressable>
        <Text style={[styles.navTitle, { color: colors.foreground }]} numberOfLines={1}>
          {globalRank != null ? `#${globalRank} ` : ""}{habit.name}
        </Text>
        <Pressable
          onPress={() => router.push(`/checkin?date=${todayStr}` as never)}
          style={({ pressed }) => [
            styles.logTodayBtn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <IconSymbol name="plus" size={14} color="#fff" />
          <Text style={styles.logTodayText}>Log</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── 1. Month Calendar ── */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Month navigation */}
          <View style={[styles.monthNav, { borderBottomColor: colors.border }]}>
            <Pressable
              onPress={prevMonth}
              style={({ pressed }) => [styles.monthNavBtn, { opacity: pressed ? 0.5 : 1 }]}
            >
              <IconSymbol name="chevron.left" size={18} color={colors.primary} />
            </Pressable>
            <Text style={[styles.monthTitle, { color: colors.foreground }]}>
              {MONTH_NAMES[calMonth]} {calYear}
            </Text>
            <Pressable
              onPress={canGoForward ? nextMonth : undefined}
              style={({ pressed }) => [styles.monthNavBtn, { opacity: canGoForward ? (pressed ? 0.5 : 1) : 0.2 }]}
            >
              <IconSymbol name="chevron.right" size={18} color={colors.primary} />
            </Pressable>
          </View>

          <View style={{ padding: 16 }}>
            <MonthCalendar
              year={calYear}
              month={calMonth}
              ratingByDate={ratingByDate}
              noteByDate={noteByDate}
              onDayPress={(dateStr) => setEntryDate(dateStr)}
              colors={colors}
              containerWidth={calContainerWidth}
            />
          </View>

          <Text style={[styles.calHint, { color: colors.muted }]}>
            Tap any day to log your rating and notes
          </Text>
        </View>

        {/* ── 2. Six-month heatmap ── */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <SixMonthHeatmap scoreByDate={habitScoreByDate} />
        </View>

        {/* ── 3. Stat tiles ── */}
        <View style={styles.statRow}>
          <View style={[styles.statTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <IconSymbol name="flame.fill" size={22} color="#FF6B35" />
            <Text style={[styles.statValue, { color: colors.foreground }]}>{currentStreak}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Streak</Text>
          </View>
          <View style={[styles.statTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <IconSymbol name="trophy.fill" size={22} color="#22C55E" />
            <Text style={[styles.statValue, { color: "#22C55E" }]}>{bestStreak}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Best Streak</Text>
          </View>
          <View style={[styles.statTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <IconSymbol name="calendar" size={22} color={colors.primary} />
            <Text style={[styles.statValue, { color: colors.foreground }]}>{total}</Text>
            <Text style={[styles.statLabel, { color: colors.muted }]}>Total Days</Text>
          </View>
        </View>

        {/* ── 4. Goal progress ── */}
        {goalInfo && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.goalHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{goalInfo.label} Goal</Text>
              <Text style={[styles.goalCount, { color: goalInfo.done >= goalInfo.goal ? "#22C55E" : colors.primary }]}>
                {goalInfo.done} / {goalInfo.goal}
              </Text>
            </View>
            <View style={[styles.goalBarBg, { backgroundColor: colors.border }]}>
              <View style={[
                styles.goalBarFill,
                {
                  width: `${Math.min(goalInfo.done / goalInfo.goal, 1) * 100}%` as any,
                  backgroundColor: goalInfo.done >= goalInfo.goal ? "#22C55E" : colors.primary,
                },
              ]} />
            </View>
            {goalInfo.done >= goalInfo.goal && (
              <Text style={styles.goalMet}>✓ Goal met — great work!</Text>
            )}
          </View>
        )}

        {/* ── 5. Rating breakdown ── */}
        {total > 0 && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Rating Breakdown</Text>
            <View style={styles.distRow}>
              {[
                { label: "Crushed", count: green,  color: "#22C55E" },
                { label: "Okay",    count: yellow, color: "#F59E0B" },
                { label: "Missed",  count: red,    color: "#EF4444" },
              ].map((item) => (
                <View key={item.label} style={styles.distItem}>
                  <View style={[styles.distDot, { backgroundColor: item.color }]} />
                  <Text style={[styles.distCount, { color: item.color }]}>{item.count}</Text>
                  <Text style={[styles.distLabel, { color: colors.muted }]}>{item.label}</Text>
                  <View style={[styles.distBarBg, { backgroundColor: colors.border }]}>
                    <View style={[
                      styles.distBarFill,
                      { height: total > 0 ? `${(item.count / total) * 100}%` as any : "0%", backgroundColor: item.color },
                    ]} />
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── 6. Recent history ── */}
        <View style={[styles.historyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.historyHeader}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent History</Text>
            <Text style={[styles.historyHint, { color: colors.muted }]}>Tap to edit</Text>
          </View>
          {recentEntries.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              No entries yet. Tap a day above to get started.
            </Text>
          ) : (
            recentEntries.map((entry) => {
              const d = new Date(entry.date + "T12:00:00");
              const label = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
              const isJournalOnly = entry.rating === "none";
              const rc = isJournalOnly ? colors.primary : (ratingColor(entry.rating) ?? colors.muted);
              const ratingLabel = isJournalOnly
                ? "Journal note"
                : entry.rating === "green" ? "Crushed it"
                : entry.rating === "yellow" ? "Okay"
                : "Missed";
              const note = noteByDate[entry.date];

              return (
                <Pressable
                  key={entry.date}
                  onPress={() => setEntryDate(entry.date)}
                  style={({ pressed }) => [
                    styles.historyRow,
                    { borderBottomColor: colors.border, backgroundColor: pressed ? colors.border + "40" : "transparent" },
                  ]}
                >
                  <View style={[styles.historyDot, { backgroundColor: rc }]} />
                  <View style={styles.historyContent}>
                    <View style={styles.historyTopRow}>
                      <Text style={[styles.historyDate, { color: colors.foreground }]}>{label}</Text>
                      <Text style={[styles.historyRating, { color: rc }]}>{ratingLabel}</Text>
                    </View>
                    {note ? (
                      <Text style={[styles.historyNote, { color: colors.muted }]} numberOfLines={2}>{note}</Text>
                    ) : (
                      <Text style={[styles.historyNoteEmpty, { color: colors.border }]}>+ Add note</Text>
                    )}
                  </View>
                  <IconSymbol name="chevron.right" size={14} color={colors.border} />
                </Pressable>
              );
            })
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Day Entry Modal */}
      <DayEntryModal
        visible={entryDate !== null}
        dateStr={entryDate}
        habitName={habit.name}
        currentRating={entryRating}
        currentNote={entryNote}
        onSave={saveEntry}
        onClose={() => setEntryDate(null)}
        colors={colors}
      />
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 20, paddingBottom: 40 },

  navBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5,
  },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 4, width: 80 },
  backText: { fontSize: 15, fontWeight: "600" },
  navTitle: { flex: 1, fontSize: 15, fontWeight: "700", textAlign: "center" },
  logTodayBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    width: 80, justifyContent: "center",
  },
  logTodayText: { fontSize: 13, fontWeight: "700", color: "#fff" },

  card: {
    borderRadius: 16, borderWidth: 1, marginBottom: 14, overflow: "hidden",
  },
  monthNav: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5,
  },
  monthNavBtn: { padding: 6 },
  monthTitle: { fontSize: 17, fontWeight: "700" },
  calHint: {
    fontSize: 11, textAlign: "center", paddingBottom: 12, paddingHorizontal: 16,
  },

  statRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  statTile: {
    flex: 1, borderRadius: 14, padding: 12, borderWidth: 1,
    alignItems: "center", gap: 2,
  },
  statValue: { fontSize: 22, fontWeight: "800" },
  statLabel: { fontSize: 10, fontWeight: "500", textAlign: "center" },

  goalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, paddingBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: "700" },
  goalCount: { fontSize: 15, fontWeight: "800" },
  goalBarBg: { height: 10, borderRadius: 5, overflow: "hidden", marginHorizontal: 16, marginBottom: 8 },
  goalBarFill: { height: 10, borderRadius: 5 },
  goalMet: { fontSize: 13, fontWeight: "700", color: "#22C55E", paddingHorizontal: 16, paddingBottom: 14 },

  distRow: { flexDirection: "row", justifyContent: "space-around", marginTop: 12, paddingHorizontal: 8, paddingBottom: 16 },
  distItem: { alignItems: "center", gap: 4, flex: 1 },
  distDot: { width: 10, height: 10, borderRadius: 5, marginBottom: 2 },
  distCount: { fontSize: 20, fontWeight: "800" },
  distLabel: { fontSize: 11, fontWeight: "500" },
  distBarBg: { width: 8, height: 60, borderRadius: 4, overflow: "hidden", justifyContent: "flex-end" },
  distBarFill: { width: 8, borderRadius: 4 },

  historyCard: { borderRadius: 16, borderWidth: 1, marginBottom: 14, overflow: "hidden" },
  historyHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4,
  },
  historyHint: { fontSize: 11 },
  historyRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5,
  },
  historyDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  historyContent: { flex: 1, gap: 2 },
  historyTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  historyDate: { fontSize: 15, fontWeight: "500" },
  historyRating: { fontSize: 14, fontWeight: "700" },
  historyNote: { fontSize: 13, lineHeight: 18 },
  historyNoteEmpty: { fontSize: 12, fontStyle: "italic" },
  emptyText: { fontSize: 14, padding: 16 },
});

const modalStyles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 16, fontWeight: "700" },
  headerDate: { fontSize: 12, marginTop: 2 },
  cancelBtn: { fontSize: 16, width: 60 },
  saveBtn: { fontSize: 16, fontWeight: "700", width: 60, textAlign: "right" },
  body: { padding: 20, gap: 8, paddingBottom: 60 },
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8, marginBottom: 4 },
  ratingRow: { flexDirection: "row", gap: 10 },
  ratingBtn: {
    flex: 1, alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 14, borderRadius: 14, borderWidth: 1.5,
  },
  ratingLabel: { fontSize: 12, fontWeight: "600" },
  input: {
    fontSize: 16, lineHeight: 24, borderWidth: 1, borderRadius: 12,
    padding: 14, minHeight: 120, textAlignVertical: "top",
  },
  clearBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10, borderWidth: 1,
  },
  clearBtnText: { fontSize: 13, color: "#EF4444", fontWeight: "600" },
});
