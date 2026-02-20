import { View, Text, Pressable, StyleSheet, Dimensions } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { toDateString } from "@/lib/storage";

const SCREEN_WIDTH = Dimensions.get("window").width;
const H_PAD = 32;
const CELL_GAP = 4;
const COLS = 7;
const CELL_SIZE = Math.floor((SCREEN_WIDTH - H_PAD - CELL_GAP * (COLS - 1)) / COLS);

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type DayScore = {
  date: string;
  score: number | null;
};

export type CategoryDot = {
  categoryId: string;
  color: string;
};

interface CalendarHeatmapProps {
  year: number;
  month: number;
  scores: DayScore[];
  categoryDots?: Record<string, CategoryDot[]>;
  onDayPress?: (date: string) => void;
}

export function CalendarHeatmap({ year, month, scores, onDayPress }: CalendarHeatmapProps) {
  const colors = useColors();
  const today = toDateString();

  const scoreMap: Record<string, number | null> = {};
  for (const s of scores) scoreMap[s.date] = s.score;

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: Array<{ type: "blank" } | { type: "day"; day: number; dateStr: string }> = [];
  for (let i = 0; i < firstDow; i++) cells.push({ type: "blank" });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ type: "day", day: d, dateStr });
  }

  function cellColor(score: number | null, dateStr: string): string {
    if (dateStr >= today) return "transparent";
    if (score === null)   return "#EF4444";
    if (score >= 0.75)    return "#22C55E";
    if (score >= 0.4)     return "#F59E0B";
    return "#EF4444";
  }

  function cellOpacity(score: number | null, dateStr: string): number {
    if (dateStr >= today) return 0;
    if (score === null)   return 0.35;
    return 0.4 + score * 0.6;
  }

  const rows: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        {DAY_LABELS.map((d) => (
          <View key={d} style={[styles.cell, styles.headerCell]}>
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
            const score   = scoreMap[dateStr] ?? null;
            const bg      = cellColor(score, dateStr);
            const opacity = cellOpacity(score, dateStr);
            const isToday  = dateStr === today;
            const isFuture = dateStr > today;
            const isPast   = dateStr < today;

            return (
              <Pressable
                key={dateStr}
                onPress={() => !isFuture && onDayPress?.(dateStr)}
                style={({ pressed }) => [
                  styles.cell,
                  styles.dayCell,
                  {
                    backgroundColor: bg,
                    opacity: isFuture ? 0.12 : pressed ? 0.65 : opacity,
                    borderWidth: isToday ? 2 : 0,
                    borderColor: isToday ? colors.primary : "transparent",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.dayText,
                    {
                      color: isPast ? "#fff" : colors.muted,
                      fontWeight: isToday ? "800" : "500",
                      opacity: isFuture ? 0.35 : 1,
                    },
                  ]}
                >
                  {day}
                </Text>
              </Pressable>
            );
          })}
          {row.length < 7 &&
            Array.from({ length: 7 - row.length }).map((_, i) => (
              <View key={`t-${i}`} style={styles.cell} />
            ))}
        </View>
      ))}

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#EF4444", opacity: 0.35 }]} />
          <Text style={[styles.legendText, { color: colors.muted }]}>Skipped</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#EF4444" }]} />
          <Text style={[styles.legendText, { color: colors.muted }]}>Missed</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#F59E0B" }]} />
          <Text style={[styles.legendText, { color: colors.muted }]}>Okay</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#22C55E" }]} />
          <Text style={[styles.legendText, { color: colors.muted }]}>Crushed</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%" },
  headerRow: { flexDirection: "row", gap: CELL_GAP, marginBottom: CELL_GAP },
  row: { flexDirection: "row", gap: CELL_GAP, marginBottom: CELL_GAP },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCell: {},
  headerText: { fontSize: 10, fontWeight: "600" },
  dayCell: { borderRadius: CELL_SIZE * 0.22 },
  dayText: { fontSize: 12 },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 14,
    marginTop: 10,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11 },
});
