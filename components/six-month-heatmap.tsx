/**
 * SixMonthHeatmap
 * Days flow LEFT → RIGHT across each row, like reading a book.
 * - Oldest day = top-left, newest day = bottom-right
 * - Each row = one week (7 cells)
 * - ~26 rows = 6 months
 * - No labels, no scrolling
 * - Green / yellow / red by weighted score, × for skipped past days
 */
import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, LayoutChangeEvent } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { toDateString } from "@/lib/storage";

const GAP = 2;
const DAYS_PER_ROW = 7;   // one week per row
const TOTAL_DAYS = 182;   // ~6 months

interface DayData {
  dateStr: string;
  score: number | null;
  hasData: boolean;
  isFuture: boolean;
}

interface Props {
  scoreByDate: Record<string, number>;
}

export function SixMonthHeatmap({ scoreByDate }: Props) {
  const colors = useColors();
  const [containerWidth, setContainerWidth] = useState(0);

  // Cell size: fill full width across 7 cells per row
  const cellSize = containerWidth > 0
    ? Math.floor((containerWidth - (DAYS_PER_ROW - 1) * GAP) / DAYS_PER_ROW)
    : 10;

  // Build a flat array of days oldest → newest, then chunk into rows of 7
  const rows = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = toDateString(today);

    // Start from TOTAL_DAYS ago
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - TOTAL_DAYS + 1);

    const days: DayData[] = [];
    for (let i = 0; i < TOTAL_DAYS; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      const dateStr = toDateString(d);
      const isFuture = dateStr > todayStr;
      const hasData = !isFuture && dateStr in scoreByDate;
      const score = hasData ? scoreByDate[dateStr] : null;
      days.push({ dateStr, score, hasData, isFuture });
    }

    // Chunk into rows of DAYS_PER_ROW
    const result: DayData[][] = [];
    for (let i = 0; i < days.length; i += DAYS_PER_ROW) {
      result.push(days.slice(i, i + DAYS_PER_ROW));
    }
    return result;
  }, [scoreByDate]);

  function cellBg(day: DayData): string {
    if (day.isFuture) return colors.border + "33";
    if (!day.hasData) return colors.border + "55";
    const s = day.score ?? 0;
    if (s >= 0.75) return "#22C55E";
    if (s >= 0.4) return "#F59E0B";
    return "#EF4444";
  }

  const handleLayout = (e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  };

  return (
    <View onLayout={handleLayout} style={styles.container}>
      {containerWidth > 0 && (
        <>
          {/* Rows of days */}
          <View style={{ gap: GAP }}>
            {rows.map((row, rowIdx) => (
              <View key={rowIdx} style={{ flexDirection: "row", gap: GAP }}>
                {row.map((day, colIdx) => {
                  const isPastNoData = !day.isFuture && !day.hasData;
                  return (
                    <View
                      key={colIdx}
                      style={{
                        width: cellSize,
                        height: cellSize,
                        borderRadius: Math.max(2, cellSize * 0.2),
                        backgroundColor: cellBg(day),
                        opacity: day.isFuture ? 0.3 : 1,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {isPastNoData && (
                        <Text
                          style={{
                            fontSize: Math.max(6, cellSize * 0.6),
                            fontWeight: "900",
                            color: "#EF4444",
                            lineHeight: cellSize,
                            textAlign: "center",
                          }}
                        >
                          ×
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            ))}
          </View>

          {/* Minimal legend */}
          <View style={styles.legend}>
            <Text style={[styles.legendText, { color: colors.muted }]}>Less</Text>
            {[colors.border + "55", "#EF4444", "#F59E0B", "#22C55E"].map((c, i) => (
              <View key={i} style={[styles.legendCell, { backgroundColor: c, borderRadius: 2 }]} />
            ))}
            <Text style={[styles.legendText, { color: colors.muted }]}>More</Text>
            <View style={[styles.legendCell, { backgroundColor: colors.border + "55", borderRadius: 2, alignItems: "center", justifyContent: "center" }]}>
              <Text style={{ fontSize: 7, fontWeight: "900", color: "#EF4444", lineHeight: 10 }}>×</Text>
            </View>
            <Text style={[styles.legendText, { color: colors.muted }]}>Skipped</Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%", gap: 8 },
  legend: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" },
  legendCell: { width: 10, height: 10 },
  legendText: { fontSize: 10 },
});
