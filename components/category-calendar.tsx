/**
 * CategoryCalendar
 *
 * A full-month calendar for a single category. All cells share a fixed uniform height.
 * Each day cell:
 *  - Past, no data:   completely blank (transparent)
 *  - Past, logged:    subtle blue tint + vertical emoji+dot rows (clipped to cell)
 *  - Today:           primary-color border
 *  - Future:          dimmed day number only
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

// Fixed cell height — tall enough for up to ~4 habit rows, same for every cell
const CELL_H = CELL_W + 24;

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

  const habitIds = useMemo(() => habits.map((h) => h.id), [habits]);

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

  const loggedBg = colors.primary + "22";

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

            const bgColor = (isPast && hasData) ? loggedBg : "transparent";

            // Only show habits that were actually rated
            const ratedHabits = isPast && hasData
              ? habits.filter((h) => !!habitColorMap[h.id])
              : [];

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

                {/* Habit rows — clipped inside the fixed cell height */}
                {ratedHabits.length > 0 && (
                  <View style={styles.habitsContainer}>
                    {ratedHabits.map((h) => (
                      <View key={h.id} style={styles.habitRow}>
                        <Text style={styles.habitEmoji}>{h.emoji}</Text>
                        <View
                          style={[
                            styles.dot,
                            { backgroundColor: habitColorMap[h.id] },
                          ]}
                        />
                      </View>
                    ))}
                  </View>
                )}
              </Pressable>
            );
          })}
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
    paddingHorizontal: 1,
    overflow: "hidden", // clips content that exceeds fixed height
  },
  dayText: {
    fontSize: 9,
    lineHeight: 12,
    marginBottom: 1,
  },

  // Container for habit rows — fills remaining space, clips overflow
  habitsContainer: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    overflow: "hidden",
    gap: 1,
  },

  // One row per habit: emoji + dot side by side, centered
  habitRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  habitEmoji: {
    fontSize: 7,
    lineHeight: 10,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    flexShrink: 0,
  },
});
