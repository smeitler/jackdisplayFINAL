/**
 * CategoryCalendar
 *
 * A full-month calendar for a single category. Each day cell shows:
 *  - A background tint based on overall day score (green/amber/red/soft-red for skipped)
 *  - The day number
 *  - Per-habit indicators: emoji + colored dot (up to 6 habits), or dots-only for more
 *
 * Future days are dimmed. Tapping a past day calls onDayPress.
 */
import { View, Text, Pressable, StyleSheet, Dimensions } from "react-native";
import { useMemo } from "react";
import { useColors } from "@/hooks/use-colors";
import { toDateString, CheckInEntry, Habit } from "@/lib/storage";

const SCREEN_WIDTH = Dimensions.get("window").width;
const H_PAD = 68;
const CELL_GAP = 3;
const COLS = 7;
const CELL_W = Math.floor((SCREEN_WIDTH - H_PAD - CELL_GAP * (COLS - 1)) / COLS);

// Taller cells to accommodate habit indicators
const BASE_CELL_H = CELL_W + 18;

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

// Threshold: if ≤ this many habits, show emoji+dot; otherwise dots-only
const EMOJI_THRESHOLD = 6;

const DOT_SIZE = 5;
const MINI_DOT = 4;

interface CategoryCalendarProps {
  year: number;
  month: number; // 0-indexed
  habits: Habit[];
  checkIns: CheckInEntry[];
  onDayPress?: (date: string) => void;
}

function ratingColor(rating: string): string {
  if (rating === "green")  return "#22C55E";
  if (rating === "yellow") return "#F59E0B";
  if (rating === "red")    return "#EF4444";
  return "transparent";
}

function overallBg(
  dots: string[],
  dateStr: string,
  today: string,
  hasAnyEntry: boolean,
): { color: string; opacity: number } {
  if (dateStr >= today) return { color: "transparent", opacity: 0 };
  if (!hasAnyEntry) return { color: "#EF4444", opacity: 0.22 };
  const rated = dots.filter((c) => c !== "transparent");
  if (rated.length === 0) return { color: "#F59E0B", opacity: 0.3 };
  const score =
    rated.reduce((s, c) => s + (c === "#22C55E" ? 1 : c === "#F59E0B" ? 0.5 : 0), 0) / rated.length;
  const color = score >= 0.75 ? "#22C55E" : score >= 0.4 ? "#F59E0B" : "#EF4444";
  const opacity = 0.3 + score * 0.4;
  return { color, opacity };
}

export function CategoryCalendar({
  year, month, habits, checkIns, onDayPress,
}: CategoryCalendarProps) {
  const colors = useColors();
  const today = toDateString();

  const habitIds = useMemo(() => habits.map((h) => h.id), [habits]);
  const useEmojiMode = habits.length <= EMOJI_THRESHOLD;

  const { dayHabitColors, datesWithEntries } = useMemo(() => {
    const map: Record<string, Record<string, string>> = {};
    const withEntries = new Set<string>();
    for (const entry of checkIns) {
      if (!habitIds.includes(entry.habitId)) continue;
      if (entry.rating === "none") continue;
      withEntries.add(entry.date);
      if (!map[entry.date]) map[entry.date] = {};
      map[entry.date][entry.habitId] = ratingColor(entry.rating);
    }
    return { dayHabitColors: map, datesWithEntries: withEntries };
  }, [checkIns, habitIds]);

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
    <View style={styles.container}>
      {/* Day-of-week header */}
      <View style={styles.headerRow}>
        {DAY_LABELS.map((d, i) => (
          <View key={i} style={styles.headerCell}>
            <Text style={[styles.headerText, { color: colors.muted }]}>{d}</Text>
          </View>
        ))}
      </View>

      {rows.map((row, ri) => (
        <View key={ri} style={styles.row}>
          {row.map((cell, ci) => {
            if (cell.type === "blank") {
              return <View key={`b-${ci}`} style={[styles.cell, { height: BASE_CELL_H }]} />;
            }
            const { day, dateStr } = cell;
            const isToday  = dateStr === today;
            const isFuture = dateStr > today;
            const isPast   = dateStr < today;

            const habitColorMap = dayHabitColors[dateStr] ?? {};
            const dots = habits.map((h) => habitColorMap[h.id] ?? "transparent");

            const hasAnyEntry = datesWithEntries.has(dateStr);
            const { color: bgColor, opacity: bgOpacity } = overallBg(dots, dateStr, today, hasAnyEntry);

            return (
              <Pressable
                key={dateStr}
                onPress={() => !isFuture && onDayPress?.(dateStr)}
                style={({ pressed }) => [
                  styles.cell,
                  styles.dayCell,
                  {
                    height: BASE_CELL_H,
                    backgroundColor: bgColor,
                    opacity: isFuture ? 0.12 : pressed ? 0.7 : bgOpacity === 0 ? 1 : bgOpacity,
                    borderWidth: isToday ? 1.5 : 0,
                    borderColor: isToday ? colors.primary : "transparent",
                  },
                ]}
              >
                {/* Day number */}
                <Text
                  style={[
                    styles.dayText,
                    {
                      color: isPast ? "#fff" : colors.muted,
                      fontWeight: isToday ? "800" : "400",
                      opacity: isFuture ? 0.35 : 1,
                    },
                  ]}
                >
                  {day}
                </Text>

                {/* Habit indicators — only for past days */}
                {isPast && habits.length > 0 && (
                  <View style={styles.indicatorsWrap}>
                    {useEmojiMode
                      ? habits.map((h) => {
                          const dotColor = habitColorMap[h.id] ?? "transparent";
                          const hasRating = dotColor !== "transparent";
                          return (
                            <View key={h.id} style={styles.emojiRow}>
                              <Text style={styles.habitEmoji}>{h.emoji}</Text>
                              <View
                                style={[
                                  styles.miniDot,
                                  {
                                    backgroundColor: hasRating
                                      ? dotColor
                                      : "rgba(255,255,255,0.2)",
                                  },
                                ]}
                              />
                            </View>
                          );
                        })
                      : dots.map((dotColor, di) => (
                          <View
                            key={di}
                            style={[
                              styles.dot,
                              {
                                backgroundColor:
                                  dotColor !== "transparent"
                                    ? dotColor
                                    : "rgba(255,255,255,0.2)",
                              },
                            ]}
                          />
                        ))}
                  </View>
                )}
              </Pressable>
            );
          })}
          {row.length < 7 &&
            Array.from({ length: 7 - row.length }).map((_, i) => (
              <View key={`t-${i}`} style={[styles.cell, { height: BASE_CELL_H }]} />
            ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%" },
  headerRow: { flexDirection: "row", gap: CELL_GAP, marginBottom: CELL_GAP },
  headerCell: {
    width: CELL_W, height: 16,
    alignItems: "center", justifyContent: "center",
  },
  headerText: { fontSize: 9, fontWeight: "600" },
  row: { flexDirection: "row", gap: CELL_GAP, marginBottom: CELL_GAP },
  cell: { width: CELL_W },
  dayCell: {
    borderRadius: CELL_W * 0.18,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 3,
    paddingHorizontal: 2,
    overflow: "hidden",
  },
  dayText: { fontSize: 9, lineHeight: 12 },
  indicatorsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    gap: 1,
    marginTop: 2,
    paddingHorizontal: 1,
  },
  // Emoji mode: tiny emoji + mini dot side by side
  emojiRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
  },
  habitEmoji: {
    fontSize: 7,
    lineHeight: 9,
  },
  miniDot: {
    width: MINI_DOT,
    height: MINI_DOT,
    borderRadius: MINI_DOT / 2,
  },
  // Dots-only mode
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
});
