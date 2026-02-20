import {
  View, Text, Pressable, Modal, StyleSheet,
  Animated, Dimensions, Platform,
} from "react-native";
import { useRef, useEffect, useState } from "react";
import { useColors } from "@/hooks/use-colors";
import { CategoryDef } from "@/lib/storage";

const SCREEN_HEIGHT = Dimensions.get("window").height;

export type CategoryDayScore = {
  category: CategoryDef;
  /** 0–1 weighted score, or null if no entries */
  score: number | null;
  green: number;
  yellow: number;
  red: number;
  total: number;
};

interface DayDetailSheetProps {
  visible: boolean;
  date: string;           // YYYY-MM-DD
  displayDate: string;    // human-readable label
  categoryScores: CategoryDayScore[];
  onClose: () => void;
  onEdit: () => void;
}

function scoreColor(score: number | null): string {
  if (score === null) return "#9BA1A6";
  if (score >= 0.75) return "#22C55E";
  if (score >= 0.4)  return "#F59E0B";
  return "#EF4444";
}

function scoreLabel(score: number | null): string {
  if (score === null) return "No data";
  if (score >= 0.75) return "Crushed it";
  if (score >= 0.4)  return "Okay";
  return "Missed";
}

export function DayDetailSheet({
  visible,
  date,
  displayDate,
  categoryScores,
  onClose,
  onEdit,
}: DayDetailSheetProps) {
  const colors = useColors();
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const [rendered, setRendered] = useState(visible);
  useEffect(() => { if (visible) setRendered(true); }, [visible]);
  if (!rendered) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Animated.View
        style={[styles.backdrop, { opacity: backdropAnim }]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.background,
            borderColor: colors.border,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        {/* Handle */}
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.dateLabel, { color: colors.foreground }]}>{displayDate}</Text>
            <Text style={[styles.dateSub, { color: colors.muted }]}>Daily Review</Text>
          </View>
          <Pressable
            onPress={onEdit}
            style={({ pressed }) => [
              styles.editBtn,
              { backgroundColor: colors.primary + "18", opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={[styles.editBtnText, { color: colors.primary }]}>Edit</Text>
          </Pressable>
        </View>

        {/* Category rows */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {categoryScores.map((cs, idx) => {
            const dotColor = scoreColor(cs.score);
            const label    = scoreLabel(cs.score);
            const isLast   = idx === categoryScores.length - 1;

            return (
              <View
                key={cs.category.id}
                style={[
                  styles.row,
                  !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                ]}
              >
                {/* Emoji + category name */}
                <View style={styles.rowLeft}>
                  <Text style={styles.catEmoji}>{cs.category.emoji}</Text>
                  <Text style={[styles.catName, { color: colors.foreground }]}>{cs.category.label}</Text>
                </View>

                {/* Score indicator */}
                <View style={styles.rowRight}>
                  {cs.total > 0 ? (
                    <>
                      {/* Mini dot row: one dot per habit entry */}
                      <View style={styles.dotRow}>
                        {cs.green  > 0 && Array.from({ length: Math.min(cs.green,  5) }).map((_, i) => (
                          <View key={`g${i}`} style={[styles.miniDot, { backgroundColor: "#22C55E" }]} />
                        ))}
                        {cs.yellow > 0 && Array.from({ length: Math.min(cs.yellow, 5) }).map((_, i) => (
                          <View key={`y${i}`} style={[styles.miniDot, { backgroundColor: "#F59E0B" }]} />
                        ))}
                        {cs.red    > 0 && Array.from({ length: Math.min(cs.red,    5) }).map((_, i) => (
                          <View key={`r${i}`} style={[styles.miniDot, { backgroundColor: "#EF4444" }]} />
                        ))}
                      </View>
                      {/* Big status dot + label */}
                      <View style={styles.statusRow}>
                        <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
                        <Text style={[styles.statusLabel, { color: dotColor }]}>{label}</Text>
                      </View>
                    </>
                  ) : (
                    <Text style={[styles.noDataText, { color: colors.muted }]}>—</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* Bottom close button */}
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [
            styles.closeBtn,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.closeBtnText, { color: colors.muted }]}>Close</Text>
        </Pressable>

        {/* Bottom safe area spacer */}
        <View style={{ height: Platform.OS === "ios" ? 28 : 16 }} />
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    alignSelf: "center", marginBottom: 14,
  },
  header: {
    flexDirection: "row", alignItems: "flex-start",
    justifyContent: "space-between", marginBottom: 16,
  },
  dateLabel: { fontSize: 20, fontWeight: "700" },
  dateSub: { fontSize: 13, marginTop: 2 },
  editBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20,
  },
  editBtnText: { fontSize: 14, fontWeight: "700" },

  card: {
    borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden", marginBottom: 12,
  },
  row: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 14,
    gap: 10,
  },
  rowLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  catEmoji: { fontSize: 22 },
  catName: { fontSize: 15, fontWeight: "600" },

  rowRight: { alignItems: "flex-end", gap: 5 },
  dotRow: { flexDirection: "row", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" },
  miniDot: { width: 8, height: 8, borderRadius: 4 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusLabel: { fontSize: 12, fontWeight: "700" },
  noDataText: { fontSize: 15 },

  closeBtn: {
    borderRadius: 14, paddingVertical: 14,
    alignItems: "center", borderWidth: StyleSheet.hairlineWidth,
  },
  closeBtnText: { fontSize: 15, fontWeight: "600" },
});
