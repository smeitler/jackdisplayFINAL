/**
 * DatePickerSheet — bottom-sheet date (and optional time) picker.
 * Design matches reference: quick chips, scrollable month calendar, time wheel sub-sheet.
 */
import React, { useRef, useCallback } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";

const { width: SCREEN_W } = Dimensions.get("window");
const DAY_LABELS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayStr(): string {
  const d = new Date();
  return (
    d.getFullYear() +
    "-" + String(d.getMonth() + 1).padStart(2, "0") +
    "-" + String(d.getDate()).padStart(2, "0")
  );
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return (
    d.getFullYear() +
    "-" + String(d.getMonth() + 1).padStart(2, "0") +
    "-" + String(d.getDate()).padStart(2, "0")
  );
}

function nextWeekday(dateStr: string, weekday: number): string {
  const d = new Date(dateStr + "T00:00:00");
  const diff = (weekday - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return (
    d.getFullYear() +
    "-" + String(d.getMonth() + 1).padStart(2, "0") +
    "-" + String(d.getDate()).padStart(2, "0")
  );
}

function formatDisplay(dateStr: string, timeStr: string | null): string {
  const today = todayStr();
  const tomorrow = addDays(today, 1);
  let label = "";
  if (dateStr === today) label = "Today";
  else if (dateStr === tomorrow) label = "Tomorrow";
  else {
    const parts = dateStr.split("-");
    const m = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    label = MONTH_NAMES[m - 1].slice(0, 3) + " " + day;
  }
  if (timeStr) label += " at " + timeStr;
  return label;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

// ─── Time Wheel ───────────────────────────────────────────────────────────────

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));
const PERIODS = ["AM", "PM"];
const ITEM_H = 52;
const VISIBLE = 3;

function WheelPicker({
  items,
  selected,
  onSelect,
  colors,
}: {
  items: string[];
  selected: number;
  onSelect: (i: number) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const ref = useRef<ScrollView>(null);
  const height = ITEM_H * VISIBLE;

  const onMomentumEnd = useCallback(
    (e: any) => {
      const y = e.nativeEvent.contentOffset.y;
      const idx = Math.round(y / ITEM_H);
      onSelect(Math.max(0, Math.min(idx, items.length - 1)));
    },
    [items.length, onSelect]
  );

  return (
    <View style={{ width: 90, height, overflow: "hidden" }}>
      {/* selection highlight */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            top: ITEM_H,
            bottom: ITEM_H,
            borderRadius: 12,
            backgroundColor: colors.surface,
          },
        ]}
      />
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        contentOffset={{ x: 0, y: selected * ITEM_H }}
        onMomentumScrollEnd={onMomentumEnd}
        contentContainerStyle={{ paddingVertical: ITEM_H }}
      >
        {items.map((item, i) => (
          <TouchableOpacity
            key={item}
            style={{ height: ITEM_H, justifyContent: "center", alignItems: "center" }}
            onPress={() => {
              ref.current?.scrollTo({ y: i * ITEM_H, animated: true });
              onSelect(i);
            }}
          >
            <Text
              style={{
                fontSize: 22,
                fontWeight: i === selected ? "700" : "400",
                color: i === selected ? colors.primary : colors.muted,
              }}
            >
              {item}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Time Sub-Sheet ───────────────────────────────────────────────────────────

function TimeSheet({
  visible,
  initial,
  onDone,
  onClose,
  colors,
}: {
  visible: boolean;
  initial: string | null;
  onDone: (time: string) => void;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const [hourIdx, setHourIdx] = React.useState(() => {
    if (!initial) return 8; // default 9 AM
    const [h] = initial.split(":");
    const hr = parseInt(h, 10) % 12 || 12;
    return HOURS.indexOf(String(hr));
  });
  const [minIdx, setMinIdx] = React.useState(() => {
    if (!initial) return 0;
    const [, m] = initial.split(":");
    const idx = MINUTES.indexOf(m.padStart(2, "0"));
    return idx >= 0 ? idx : 0;
  });
  const [periodIdx, setPeriodIdx] = React.useState(() => {
    if (!initial) return 0; // AM
    const [h] = initial.split(":");
    return parseInt(h, 10) >= 12 ? 1 : 0;
  });

  function handleDone() {
    const hr = parseInt(HOURS[hourIdx], 10);
    const min = MINUTES[minIdx];
    const period = PERIODS[periodIdx];
    let h24 = hr;
    if (period === "AM" && hr === 12) h24 = 0;
    if (period === "PM" && hr !== 12) h24 = hr + 12;
    const display = `${HOURS[hourIdx]}:${min} ${period}`;
    onDone(display);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.5)" }]}
        onPress={onClose}
      />
      <View
        style={[
          tStyles.timeSheet,
          { backgroundColor: colors.surface },
        ]}
      >
        <View style={tStyles.timeHeader}>
          <Text style={[tStyles.timeTitle, { color: colors.foreground }]}>Add Time</Text>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
          >
            <MaterialIcons name="close" size={22} color={colors.muted} />
          </Pressable>
        </View>

        <View style={tStyles.wheelRow}>
          <WheelPicker items={HOURS} selected={hourIdx} onSelect={setHourIdx} colors={colors} />
          <WheelPicker items={MINUTES} selected={minIdx} onSelect={setMinIdx} colors={colors} />
          <WheelPicker items={PERIODS} selected={periodIdx} onSelect={setPeriodIdx} colors={colors} />
        </View>

        <Pressable
          style={[tStyles.doneBtn, { backgroundColor: colors.primary }]}
          onPress={handleDone}
        >
          <Text style={tStyles.doneBtnText}>Done</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

// ─── Main DatePickerSheet ─────────────────────────────────────────────────────

export interface DatePickerSheetProps {
  visible: boolean;
  value: string | null;       // YYYY-MM-DD or null
  timeValue: string | null;   // "9:00 AM" or null
  onDone: (date: string, time: string | null) => void;
  onCancel: () => void;
}

export function DatePickerSheet({
  visible,
  value,
  timeValue,
  onDone,
  onCancel,
}: DatePickerSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const today = todayStr();

  const [selectedDate, setSelectedDate] = React.useState<string>(value ?? today);
  const [selectedTime, setSelectedTime] = React.useState<string | null>(timeValue);
  const [showTime, setShowTime] = React.useState(false);

  // Reset when opened
  React.useEffect(() => {
    if (visible) {
      setSelectedDate(value ?? today);
      setSelectedTime(timeValue);
      setShowTime(false);
    }
  }, [visible]);

  // Calendar state: start from selected date's month
  const initDate = new Date((value ?? today) + "T00:00:00");
  const [calYear, setCalYear] = React.useState(initDate.getFullYear());
  const [calMonth, setCalMonth] = React.useState(initDate.getMonth());

  // Quick chips
  const tomorrow = addDays(today, 1);
  const nextWeek = addDays(today, 7);
  const thisSat = nextWeekday(today, 6);
  const chips = [
    { label: "Today", value: today },
    { label: "Tomorrow", value: tomorrow },
    { label: "Next week", value: nextWeek },
    { label: "This weekend", value: thisSat },
  ];

  // Build calendar grid for current month
  function renderMonth(year: number, month: number) {
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfWeek(year, month);
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    // pad to full rows
    while (cells.length % 7 !== 0) cells.push(null);

    const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;

    return (
      <View key={`${year}-${month}`} style={{ marginBottom: 24 }}>
        <Text style={[tStyles.monthLabel, { color: colors.muted }]}>
          {MONTH_NAMES[month]} {year}
        </Text>
        <View style={tStyles.calGrid}>
          {cells.map((day, idx) => {
            if (!day) return <View key={idx} style={tStyles.calCell} />;
            const dateStr = `${monthStr}-${String(day).padStart(2, "0")}`;
            const isToday = dateStr === today;
            const isSelected = dateStr === selectedDate;
            const isPast = dateStr < today;
            return (
              <Pressable
                key={idx}
                style={[
                  tStyles.calCell,
                  isSelected && { backgroundColor: colors.primary, borderRadius: 10 },
                ]}
                onPress={() => setSelectedDate(dateStr)}
              >
                <Text
                  style={[
                    tStyles.calDayText,
                    {
                      color: isSelected
                        ? "#fff"
                        : isToday
                        ? colors.primary
                        : isPast
                        ? colors.muted + "88"
                        : colors.foreground,
                      fontWeight: isToday || isSelected ? "700" : "400",
                    },
                  ]}
                >
                  {day}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  // Render 3 months: current, next, next+1
  const months = [
    { year: calYear, month: calMonth },
    { year: calMonth === 11 ? calYear + 1 : calYear, month: (calMonth + 1) % 12 },
    { year: calMonth >= 10 ? calYear + 1 : calYear, month: (calMonth + 2) % 12 },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.5)" }]}
        onPress={onCancel}
      />
      <View
        style={[
          tStyles.sheet,
          { backgroundColor: colors.background, paddingBottom: insets.bottom + 8 },
        ]}
      >
        {/* Header */}
        <View style={[tStyles.sheetHeader, { borderBottomColor: colors.border }]}>
          <Text style={[tStyles.sheetTitle, { color: colors.foreground }]}>Due Date</Text>
        </View>

        {/* Quick chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={tStyles.chipsScroll}
          contentContainerStyle={tStyles.chipsContent}
        >
          {chips.map((chip) => (
            <Pressable
              key={chip.label}
              style={[
                tStyles.chip,
                {
                  backgroundColor:
                    selectedDate === chip.value ? colors.primary + "22" : colors.surface,
                  borderColor:
                    selectedDate === chip.value ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setSelectedDate(chip.value)}
            >
              <Text
                style={[
                  tStyles.chipText,
                  {
                    color:
                      selectedDate === chip.value ? colors.primary : colors.foreground,
                    fontWeight: selectedDate === chip.value ? "600" : "400",
                  },
                ]}
              >
                {chip.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Day-of-week header */}
        <View style={tStyles.dowRow}>
          {DAY_LABELS.map((d) => (
            <Text key={d} style={[tStyles.dowText, { color: colors.muted }]}>
              {d}
            </Text>
          ))}
        </View>

        {/* Calendar scroll */}
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8 }}
        >
          {months.map(({ year, month }) => renderMonth(year, month))}
        </ScrollView>

        {/* Add Time row */}
        <Pressable
          style={[tStyles.addTimeRow, { borderColor: colors.border, backgroundColor: colors.surface }]}
          onPress={() => setShowTime(true)}
        >
          <MaterialIcons name="access-time" size={18} color={colors.primary} />
          <Text style={[tStyles.addTimeText, { color: selectedTime ? colors.foreground : colors.muted }]}>
            {selectedTime ?? "Add Time"}
          </Text>
          {selectedTime ? (
            <Pressable
              onPress={() => setSelectedTime(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="close" size={16} color={colors.muted} />
            </Pressable>
          ) : (
            <MaterialIcons name="add" size={18} color={colors.primary} />
          )}
        </Pressable>

        {/* Cancel / Done */}
        <View style={tStyles.footerRow}>
          <Pressable
            style={[tStyles.cancelBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={onCancel}
          >
            <Text style={[tStyles.cancelText, { color: colors.muted }]}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[tStyles.doneBtn, { backgroundColor: colors.primary }]}
            onPress={() => onDone(selectedDate, selectedTime)}
          >
            <Text style={tStyles.doneBtnText}>Done</Text>
          </Pressable>
        </View>
      </View>

      {/* Time sub-sheet */}
      <TimeSheet
        visible={showTime}
        initial={selectedTime}
        onDone={(t) => { setSelectedTime(t); setShowTime(false); }}
        onClose={() => setShowTime(false)}
        colors={colors}
      />
    </Modal>
  );
}

// ─── Trigger Button (used in TasksPanel form) ─────────────────────────────────

export function DatePickerButton({
  value,
  timeValue,
  onPress,
  colors,
}: {
  value: string | null;
  timeValue: string | null;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const hasDate = !!value;
  return (
    <Pressable
      style={[
        dpbStyles.btn,
        {
          backgroundColor: colors.surface,
          borderColor: hasDate ? colors.primary : colors.border,
        },
      ]}
      onPress={onPress}
    >
      <MaterialIcons
        name="calendar-today"
        size={16}
        color={hasDate ? colors.primary : colors.muted}
      />
      <Text style={[dpbStyles.label, { color: hasDate ? colors.foreground : colors.muted }]}>
        {hasDate ? formatDisplay(value!, timeValue) : "Set date"}
      </Text>
      <MaterialIcons name="add" size={16} color={hasDate ? colors.primary : colors.muted} />
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const tStyles = StyleSheet.create({
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "80%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  sheetHeader: {
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  chipsScroll: {
    flexGrow: 0,
    marginTop: 12,
  },
  chipsContent: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: "row",
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 14,
  },
  dowRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
  },
  dowText: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "600",
  },
  monthLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  calGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  calCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  calDayText: {
    fontSize: 15,
  },
  addTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  addTimeText: {
    flex: 1,
    fontSize: 15,
  },
  footerRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "500",
  },
  doneBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  doneBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  // Time sheet
  timeSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
  },
  timeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  timeTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  wheelRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: 24,
  },
});

const dpbStyles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  label: {
    flex: 1,
    fontSize: 15,
  },
});
