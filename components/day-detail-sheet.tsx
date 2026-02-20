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
  score: number | null;
  green: number;
  yellow: number;
  red: number;
  total: number;
};

interface DayDetailSheetProps {
  visible: boolean;
  date: string;
  displayDate: string;
  categoryScores: CategoryDayScore[];
  onClose: () => void;
  onEdit: () => void;
}

function scoreColor(score: number | null): string {
  if (score === null) return "#9BA1A6";
  if (score >= 0.75)  return "#22C55E";
  if (score >= 0.4)   return "#F59E0B";
  return "#EF4444";
}

function scoreLabel(score: number | null): string {
  if (score === null) return "No data";
  if (score >= 0.75)  return "Crushed it";
  if (score >= 0.4)   return "Okay";
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
  const [rendered, setRendered] = useState(visible);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 0, duration: 280, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: SCREEN_HEIGHT, duration: 220, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start(() => setRendered(false));
    }
  }, [visible]);

  if (!rendered) return null;

  return (
    <Modal transparent visible={rendered} animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          { backgroundColor: colors.background, borderColor: colors.border },
          { transform: [{ translateY: slideAnim }] },
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

        {/* Category rows — emoji + dot side by side */}
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
                {/* Emoji */}
                <Text style={styles.catEmoji}>{cs.category.emoji}</Text>

                {/* Category name */}
                <Text style={[styles.catName, { color: colors.foreground }]}>{cs.category.label}</Text>

                {/* Spacer */}
                <View style={{ flex: 1 }} />

                {/* Colored dot + label */}
                <View style={styles.dotWrap}>
                  <View style={[styles.scoreDot, { backgroundColor: dotColor }]} />
                  <Text style={[styles.scoreLabel, { color: dotColor }]}>{label}</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Close button */}
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [
            styles.closeBtn,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.closeBtnText, { color: colors.muted }]}>Close</Text>
        </Pressable>

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
    bottom: 0, left: 0, right: 0,
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
  editBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  editBtnText: { fontSize: 14, fontWeight: "700" },

  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 15,
    gap: 12,
  },
  catEmoji: { fontSize: 24 },
  catName: { fontSize: 15, fontWeight: "600" },

  dotWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  scoreDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  scoreLabel: {
    fontSize: 13,
    fontWeight: "700",
  },

  closeBtn: {
    borderRadius: 14, paddingVertical: 14,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  closeBtnText: { fontSize: 15, fontWeight: "600" },
});
