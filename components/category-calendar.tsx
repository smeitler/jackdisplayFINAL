/**
 * CategoryCalendar
 *
 * A full-month calendar for a single category.
 *
 * Cell states:
 *  - Past, no data:   completely blank (transparent)
 *  - Past, logged:    subtle blue tint + vertical emoji+dot rows (clipped)
 *  - Today:           primary-color border
 *  - Future:          dimmed day number only
 *
 * Pass `containerWidth` (the available width inside the card) so cells are
 * sized correctly without relying on screen-level constants.
 */
import { View, Text, Pressable, StyleSheet, Dimensions } from "react-native";
import { useMemo } from "react";
import { useColors } from "@/hooks/use-colors";
import { toDateString, CheckInEntry, Habit } from "@/lib/storage";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CELL_GAP = 3;
const COLS = 7;

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

// Fixed cell height — tall enough for ~4 habit rows, same for every cell
const CELL_H = 58;

interface CategoryCalendarProps {
  year: number;
  month: number; // 0-indexed
  habits: Habit[];
  checkIns: CheckInEntry[];
  onDayPress?: (date: string) => void;
  /** Available width inside the parent card. Defaults to screen width - 80. */
  containerWidth?: number;
}

function ratingColor(rating: string): string {
  if (rating === "green")  return "#22C55E";
  if (rating === "yellow") return "#F59E0B";
  if (rating === "red")    return "#EF4444";
  return "transparent";
}

export function CategoryCalendar({
  year, month, habits, checkIns, onDayPress,
  containerWidth,
}: CategoryCalendarProps) {
  const colors = useColors();
  const today = toDateString();

  // Derive cell width from the container width passed in, or fall back to screen estimate
  const availableWidth = containerWidth ?? (SCREEN_WIDTH - 80);
  const CELL_W = Math.floor((availableWidth - CELL_GAP * (COLS - 1)) / COLS);

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
    <View style={{ width: "100%" }}>
      {/* Day-of-week header */}
      <View style={[styles.headerRow, { gap: CELL_GAP }]}>
        {DAY_LABELS.map((d, i) => (
          <View key={i} style={{ width: CELL_W, height: 16, alignItems: "center", justifyContent: "center" }}>
            <Text style={[styles.headerText, { color: colors.muted }]}>{d}</Text>
          </View>
        ))}
      </View>

      {rows.map((row, ri) => (
        <View key={ri} style={[styles.row, { gap: CELL_GAP }]}>
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
            const ratedHabits = (isPast && hasData)
              ? habits.filter((h) => !!habitColorMap[h.id])
              : [];

            return (
              <Pressable
                key={dateStr}
                onPress={() => (isPast || isToday) && onDayPress?.(dateStr)}
                style={({ pressed }) => ({
                  width: CELL_W,
                  height: CELL_H,
                  borderRadius: 8,
                  backgroundColor: bgColor,
                  opacity: isFuture ? 0.2 : pressed ? 0.6 : 1,
                  borderWidth: isToday ? 1.5 : 0,
                  borderColor: isToday ? colors.primary : "transparent",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  paddingTop: 4,
                  overflow: "hidden",
                })}
              >
                {/* Day number */}
                <Text
                  style={{
                    fontSize: 10,
                    lineHeight: 13,
                    marginBottom: 2,
                    color: (isPast && hasData) ? colors.foreground : colors.muted,
                    fontWeight: isToday ? "800" : "500",
                  }}
                >
                  {day}
                </Text>

                {/* Habit rows — one per habit, clipped inside fixed cell height */}
                {ratedHabits.map((h) => (
                  <View
                    key={h.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 2,
                      height: 11,
                    }}
                  >
                    <Text style={{ fontSize: 7, lineHeight: 10 }}>{h.emoji}</Text>
                    <View
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: 3,
                        backgroundColor: habitColorMap[h.id],
                      }}
                    />
                  </View>
                ))}
              </Pressable>
            );
          })}
          {/* Fill trailing empty cells */}
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
  headerRow: { flexDirection: "row", marginBottom: CELL_GAP },
  headerText: { fontSize: 9, fontWeight: "600" },
  row: { flexDirection: "row", marginBottom: CELL_GAP },
});
