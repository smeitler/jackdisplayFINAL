/**
 * SixMonthHeatmap (now supports 1–5 year ranges)
 * - Dropdown to select 1 / 2 / 3 / 4 / 5 years
 * - Days flow LEFT → RIGHT across each row (26 days per row)
 * - Oldest top-left, newest bottom-right
 * - No labels, no scrolling
 * - Green / yellow / red by weighted score, × for skipped past days
 */
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  LayoutChangeEvent,
  TouchableOpacity,
  Modal,
  FlatList,
  Platform,
} from "react-native";
import { useColors } from "@/hooks/use-colors";
import { toDateString } from "@/lib/storage";

const GAP = 2;
const DAYS_PER_ROW = 26;

const YEAR_OPTIONS = [
  { label: "1 Year", years: 1 },
  { label: "2 Years", years: 2 },
  { label: "3 Years", years: 3 },
  { label: "4 Years", years: 4 },
  { label: "5 Years", years: 5 },
];

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
  const [selectedYears, setSelectedYears] = useState(1);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const totalDays = selectedYears * 365;

  // Cell size: fill full width across DAYS_PER_ROW cells
  const cellSize = containerWidth > 0
    ? Math.floor((containerWidth - (DAYS_PER_ROW - 1) * GAP) / DAYS_PER_ROW)
    : 10;

  const rows = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = toDateString(today);

    const startDate = new Date(today);
    startDate.setDate(today.getDate() - totalDays + 1);

    const days: DayData[] = [];
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      const dateStr = toDateString(d);
      const isFuture = dateStr > todayStr;
      const hasData = !isFuture && dateStr in scoreByDate;
      const score = hasData ? scoreByDate[dateStr] : null;
      days.push({ dateStr, score, hasData, isFuture });
    }

    const result: DayData[][] = [];
    for (let i = 0; i < days.length; i += DAYS_PER_ROW) {
      result.push(days.slice(i, i + DAYS_PER_ROW));
    }
    return result;
  }, [scoreByDate, totalDays]);

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

  const selectedLabel = YEAR_OPTIONS.find((o) => o.years === selectedYears)?.label ?? "1 Year";

  return (
    <View onLayout={handleLayout} style={styles.container}>
      {/* Header row with dropdown */}
      <View style={styles.header}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>History</Text>
        <TouchableOpacity
          style={[styles.dropdownBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => setDropdownOpen(true)}
        >
          <Text style={[styles.dropdownBtnText, { color: colors.foreground }]}>{selectedLabel}</Text>
          <Text style={[styles.dropdownChevron, { color: colors.muted }]}>▾</Text>
        </TouchableOpacity>
      </View>

      {/* Dropdown modal */}
      <Modal
        visible={dropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDropdownOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setDropdownOpen(false)}
        >
          <View style={[styles.dropdownMenu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {YEAR_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.years}
                style={[
                  styles.dropdownItem,
                  opt.years === selectedYears && { backgroundColor: colors.primary + "22" },
                ]}
                onPress={() => {
                  setSelectedYears(opt.years);
                  setDropdownOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.dropdownItemText,
                    { color: opt.years === selectedYears ? colors.primary : colors.foreground },
                  ]}
                >
                  {opt.label}
                </Text>
                {opt.years === selectedYears && (
                  <Text style={{ color: colors.primary, fontSize: 14 }}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Grid */}
      {containerWidth > 0 && (
        <>
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
                            fontSize: Math.max(5, cellSize * 0.6),
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

          {/* Legend */}
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
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 15, fontWeight: "700" },
  dropdownBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  dropdownBtnText: { fontSize: 13, fontWeight: "600" },
  dropdownChevron: { fontSize: 12 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  dropdownMenu: {
    width: 200,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dropdownItemText: { fontSize: 15, fontWeight: "500" },
  legend: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" },
  legendCell: { width: 10, height: 10 },
  legendText: { fontSize: 10 },
});
