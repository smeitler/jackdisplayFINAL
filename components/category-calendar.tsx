/**
 * CategoryCalendar
 *
 * A full-month calendar for a single category. Each day cell shows:
 *  - A background tint based on overall day score (green/amber/red/soft-red for skipped)
 *  - The day number
 *  - One small dot per habit in this category, colored green/yellow/red
 *
 * Dots are arranged in a wrapping row at the bottom of the cell.
 * Future days are dimmed. Tapping a past day calls onDayPress.
 */
import { View, Text, Pressable, StyleSheet, Dimensions } from "react-native";
import { useMemo } from "react";
import { useColors } from "@/hooks/use-colors";
import { toDateString, CheckInEntry, Habit } from "@/lib/storage";

const SCREEN_WIDTH = Dimensions.get("window").width;
// The card has 14px padding on each side inside a 20px screen margin = 68px total
const H_PAD = 68;
const CELL_GAP = 3;
const COLS = 7;
const CELL_W = Math.floor((SCREEN_WIDTH - H_PAD - CELL_GAP * (COLS - 1)) / COLS);
// Taller cells to fit dots — scale with habit count but cap at a reasonable max
const BASE_CELL_H = CELL_W + 10;

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

const DOT_SIZE = 5;
const DOT_GAP = 2;

interface CategoryCalendarProps {
  year: number;
  month: number; // 0-indexed
  habits: Habit[];         // habits in this category (active only)
  checkIns: CheckInEntry[]; // all check-ins (will be filtered)
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
  // Only show red if the day was completely skipped (zero entries saved)
  if (!hasAnyEntry) return { color: "#EF4444", opacity: 0.25 };
  // Day has data — score based on rated dots
  const rated = dots.filter((c) => c !== "transparent");
  if (rated.length === 0) return { color: "#F59E0B", opacity: 0.35 }; // entries exist but all 'none'
  const score =
    rated.reduce((s, c) => s + (c === "#22C55E" ? 1 : c === "#F59E0B" ? 0.5 : 0), 0) / rated.length;
  const color = score >= 0.75 ? "#22C55E" : score >= 0.4 ? "#F59E0B" : "#EF4444";
  const opacity = 0.35 + score * 0.45;
  return { color, opacity };
}

export function CategoryCalendar({
  year, month, habits, checkIns, onDayPress,
}: CategoryCalendarProps) {
  const colors = useColors();
  const today = toDateString();

  const habitIds = useMemo(() => habits.map((h) => h.id), [habits]);

  // Build a lookup: date -> { habitId -> ratingColor }
  // Also track which dates have ANY saved entry (even if rating=none) for this category
  const { dayHabitColors, datesWithEntries } = useMemo(() => {
    const map: Record<string, Record<string, string>> = {};
    const withEntries = new Set<string>();
    for (const entry of checkIns) {
      if (!habitIds.includes(entry.habitId)) continue;
      withEntries.add(entry.date);
      if (entry.rating === "none") continue;
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
              return <View key={`b-${ci}`} style={styles.cell} />;
            }
            const { day, dateStr } = cell;
            const isToday  = dateStr === today;
            const isFuture = dateStr > today;
            const isPast   = dateStr < today;

            // Dots: one per habit in order, colored by rating (transparent if not rated)
            const habitColorMap = dayHabitColors[dateStr] ?? {};
            const dots = habits.map((h) => habitColorMap[h.id] ?? "transparent");
            const visibleDots = isPast ? dots : [];

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

                {/* Habit dots */}
                {visibleDots.length > 0 && (
                  <View style={styles.dotsWrap}>
                    {visibleDots.map((dotColor, di) =>
                      dotColor !== "transparent" ? (
                        <View
                          key={di}
                          style={[styles.dot, { backgroundColor: dotColor }]}
                        />
                      ) : (
                        // Unrated habit: tiny ghost dot
                        <View
                          key={di}
                          style={[styles.dot, { backgroundColor: "rgba(255,255,255,0.25)" }]}
                        />
                      )
                    )}
                  </View>
                )}
              </Pressable>
            );
          })}
          {row.length < 7 &&
            Array.from({ length: 7 - row.length }).map((_, i) => (
              <View key={`t-${i}`} style={styles.cell} />
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
  cell: { width: CELL_W, height: BASE_CELL_H },
  dayCell: {
    borderRadius: CELL_W * 0.2,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 4,
    overflow: "hidden",
  },
  dayText: { fontSize: 10, lineHeight: 13 },
  dotsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: DOT_GAP,
    paddingHorizontal: 2,
    marginTop: 2,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
});
