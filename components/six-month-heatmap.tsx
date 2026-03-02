/**
 * SixMonthHeatmap
 * A GitHub-style contribution grid showing 6 months of daily check-in data.
 * - Columns = weeks (oldest left → newest right)
 * - Rows = days of week (Sun top → Sat bottom)
 * - Cell colors: green / yellow / red based on weighted score
 * - "X" mark for days in the past that had no check-in
 * - Future days are empty (no fill, no X)
 */
import React, { useMemo } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { toDateString } from "@/lib/storage";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const CELL = 14;
const GAP = 3;
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface DayData {
  dateStr: string;
  score: number | null;   // null = no data, 0–1 = weighted score
  hasData: boolean;
  isFuture: boolean;
}

interface Props {
  /** Map of dateStr → weighted score (0–1). Only include dates with actual data. */
  scoreByDate: Record<string, number>;
  /** Total weeks to show (default 26 = ~6 months) */
  weeks?: number;
}

export function SixMonthHeatmap({ scoreByDate, weeks = 26 }: Props) {
  const colors = useColors();

  const { grid, monthMarkers } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = toDateString(today);

    // Find the Sunday that starts the current week
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() - today.getDay());

    // Build week columns: oldest first, newest last
    const cols: DayData[][] = [];
    const markers: { colIndex: number; month: number }[] = [];

    for (let w = weeks - 1; w >= 0; w--) {
      const weekStart = new Date(currentWeekStart);
      weekStart.setDate(currentWeekStart.getDate() - w * 7);

      const col: DayData[] = [];
      for (let d = 0; d < 7; d++) {
        const day = new Date(weekStart);
        day.setDate(weekStart.getDate() + d);
        const dateStr = toDateString(day);
        const isFuture = dateStr > todayStr;
        const hasData = !isFuture && dateStr in scoreByDate;
        const score = hasData ? scoreByDate[dateStr] : null;
        col.push({ dateStr, score, hasData, isFuture });
      }

      // Track month label position: show label when month changes
      const colIndex = cols.length;
      const firstDay = new Date(weekStart);
      if (colIndex === 0 || firstDay.getMonth() !== new Date(weekStart).getMonth()) {
        // Check if this week starts a new month
        const prevWeekStart = new Date(weekStart);
        prevWeekStart.setDate(weekStart.getDate() - 7);
        if (colIndex === 0 || prevWeekStart.getMonth() !== weekStart.getMonth()) {
          markers.push({ colIndex, month: weekStart.getMonth() });
        }
      }

      cols.push(col);
    }

    return { grid: cols, monthMarkers: markers };
  }, [scoreByDate, weeks]);

  function cellColor(day: DayData): string {
    if (day.isFuture) return "transparent";
    if (!day.hasData) return "transparent"; // X mark shown separately
    const s = day.score ?? 0;
    if (s >= 0.75) return "#22C55E";
    if (s >= 0.4) return "#F59E0B";
    return "#EF4444";
  }

  function cellBg(day: DayData): string {
    if (day.isFuture) return colors.border + "33";
    if (!day.hasData) return colors.border + "55"; // slightly visible for X
    return cellColor(day);
  }

  const totalWidth = grid.length * (CELL + GAP) - GAP;

  return (
    <View style={styles.container}>
      {/* Month labels row */}
      <View style={[styles.monthRow, { width: totalWidth + 20 }]}>
        {monthMarkers.map((m, i) => (
          <Text
            key={i}
            style={[
              styles.monthLabel,
              {
                color: colors.muted,
                left: 20 + m.colIndex * (CELL + GAP),
              },
            ]}
          >
            {MONTH_LABELS[m.month]}
          </Text>
        ))}
      </View>

      <View style={styles.gridRow}>
        {/* Day-of-week labels */}
        <View style={styles.dayLabels}>
          {DAY_LABELS.map((label, i) => (
            <Text
              key={i}
              style={[
                styles.dayLabel,
                { color: colors.muted, height: CELL, lineHeight: CELL },
              ]}
            >
              {i % 2 === 0 ? label : ""}
            </Text>
          ))}
        </View>

        {/* Heatmap grid */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {grid.map((col, colIdx) => (
            <View key={colIdx} style={[styles.col, { gap: GAP }]}>
              {col.map((day, rowIdx) => {
                const isPastNoData = !day.isFuture && !day.hasData;
                return (
                  <View
                    key={rowIdx}
                    style={[
                      styles.cell,
                      {
                        width: CELL,
                        height: CELL,
                        backgroundColor: day.hasData ? cellBg(day) : colors.border + "44",
                        borderRadius: 3,
                        opacity: day.isFuture ? 0.25 : 1,
                      },
                    ]}
                  >
                    {isPastNoData && (
                      <Text style={styles.xMark}>×</Text>
                    )}
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <Text style={[styles.legendLabel, { color: colors.muted }]}>Less</Text>
        {[colors.border + "44", "#EF4444", "#F59E0B", "#22C55E"].map((c, i) => (
          <View
            key={i}
            style={[styles.legendCell, { backgroundColor: c, borderRadius: 3 }]}
          />
        ))}
        <Text style={[styles.legendLabel, { color: colors.muted }]}>More</Text>
        <View style={[styles.legendCell, { backgroundColor: colors.border + "44", borderRadius: 3 }]}>
          <Text style={styles.xMark}>×</Text>
        </View>
        <Text style={[styles.legendLabel, { color: colors.muted }]}>Skipped</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  monthRow: { position: "relative", height: 16, marginLeft: 0 },
  monthLabel: { position: "absolute", fontSize: 10, fontWeight: "600" },
  gridRow: { flexDirection: "row", gap: 4 },
  dayLabels: { gap: GAP, paddingTop: 0, width: 14 },
  dayLabel: { fontSize: 9, fontWeight: "600", textAlign: "center" },
  scrollContent: { flexDirection: "row", gap: GAP },
  col: { flexDirection: "column" },
  cell: { alignItems: "center", justifyContent: "center" },
  xMark: { fontSize: 10, fontWeight: "900", color: "#EF4444", lineHeight: 14, textAlign: "center" },
  legend: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4, flexWrap: "wrap" },
  legendCell: { width: CELL, height: CELL },
  legendLabel: { fontSize: 10 },
});
