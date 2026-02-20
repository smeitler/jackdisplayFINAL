/**
 * CategoryCalendar
 *
 * A full-month calendar for a single category. Each day cell:
 *  - Past, no data:   completely blank (transparent background, no fill)
 *  - Past, logged:    subtle blue/primary tinted background
 *                     + one row per habit: emoji on left, colored dot on right
 *  - Today:           primary-color border
 *  - Future:          dimmed day number only
 *
 * Tapping a past day calls onDayPress.
 */
import { View, Text, Pressable, StyleSheet, Dimensions } from "react-native";
import { useMemo } from "react";
import { useColors } from "@/hooks/use-colors";
import { toDateString, CheckInEntry, Habit } from "@/lib/storage";

const SCREEN_WIDTH = Dimensions.get("window").width;
const H_PAD = 68;        // card horizontal padding (14px each side) + screen margin (20px each side)
const CELL_GAP = 3;
const COLS = 7;
const CELL_W = Math.floor((SCREEN_WIDTH - H_PAD - CELL_GAP * (COLS - 1)) / COLS);

// Cell height scales with number of habits: day number + per-habit rows
// Each habit row is ~12px; minimum cell height = CELL_W
function cellHeight(habitCount: number): number {
  const rowH = 12;
  const padding = 8; // top + bottom padding
  return Math.max(CELL_W, 20 + habitCount * rowH + padding);
}

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

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

export function CategoryCalendar({
  year, month, habits, checkIns, onDayPress,
}: CategoryCalendarProps) {
  const colors = useColors();
  const today = toDateString();
  const CELL_H = cellHeight(habits.length);

  const habitIds = useMemo(() => habits.map((h) => h.id), [habits]);

  // Build lookup: date -> { habitId -> ratingColor }
  // Only count entries with real ratings (not 'none')
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

  // Primary color with low opacity for logged-day background
  const loggedBg = colors.primary + "22"; // ~13% opacity blue tint

  return (
    <View style={styles.container}>
      {/* Day-of-week header */}
      <View style={styles.headerRow}>
        {DAY_LABELS.map((d, i) => (
          <View key={i} style={[styles.headerCell, { width: CELL_W }]}>
            <Text style={[styles.headerText, { color: colors.muted }]}>{d}</Text>
          </View>
        ))}
      </View>

      {rows.map((row, ri) => (
        <View key={ri} style={styles.row}>
          {row.map((cell, ci) => {
            if (cell.type === "blank") {
              return <View key={`b-${ci}`} style={{ width: CELL_W, height: CELL_H }} />;
            }

            const { day, dateStr } = cell;
            const isToday  = dateStr === today;
            const isFuture = dateStr > today;
            const isPast   = dateStr < today;
            const hasData  = datesWithEntries.has(dateStr);

            const habitColorMap = dayHabitColors[dateStr] ?? {};

            // Background logic:
            // - future / today (no data): transparent
            // - past, no data: transparent (blank)
            // - past, has data: subtle blue tint
            const bgColor = (isPast && hasData) ? loggedBg : "transparent";

            return (
              <Pressable
                key={dateStr}
                onPress={() => (isPast || isToday) && onDayPress?.(dateStr)}
                style={({ pressed }) => [
                  styles.dayCell,
                  {
                    width: CELL_W,
                    height: CELL_H,
                    backgroundColor: bgColor,
                    opacity: isFuture ? 0.2 : pressed ? 0.6 : 1,
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
                      color: (isPast && hasData) ? colors.foreground : colors.muted,
                      fontWeight: isToday ? "800" : "500",
                    },
                  ]}
                >
                  {day}
                </Text>

                {/* Habit rows — one per habit, stacked vertically */}
                {isPast && hasData && habits.map((h) => {
                  const dotColor = habitColorMap[h.id];
                  if (!dotColor) return null; // not rated — skip row entirely
                  return (
                    <View key={h.id} style={styles.habitRow}>
                      <Text style={styles.habitEmoji}>{h.emoji}</Text>
                      <View style={[styles.dot, { backgroundColor: dotColor }]} />
                    </View>
                  );
                })}
              </Pressable>
            );
          })}
          {/* Fill remaining cells in last row */}
          {row.length < 7 &&
            Array.from({ length: 7 - row.length }).map((_, i) => (
              <View key={`t-${i}`} style={{ width: CELL_W, height: CELL_H }} />
            ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%" },
  headerRow: { flexDirection: "row", gap: CELL_GAP, marginBottom: CELL_GAP },
  headerCell: { height: 16, alignItems: "center", justifyContent: "center" },
  headerText: { fontSize: 9, fontWeight: "600" },
  row: { flexDirection: "row", gap: CELL_GAP, marginBottom: CELL_GAP },

  dayCell: {
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 3,
    paddingBottom: 3,
    overflow: "hidden",
  },
  dayText: {
    fontSize: 9,
    lineHeight: 13,
    marginBottom: 1,
  },

  // One row per habit: emoji + colored dot
  habitRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    height: 12,
  },
  habitEmoji: {
    fontSize: 7,
    lineHeight: 10,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
});
