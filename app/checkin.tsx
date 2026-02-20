import {
  Text, View, Pressable, StyleSheet, Platform, Dimensions,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useState, useMemo, useCallback } from "react";
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSpring,
  runOnJS, FadeIn, FadeOut, SlideInRight, SlideOutLeft,
} from "react-native-reanimated";
import { ScreenContainer } from "@/components/screen-container";
import { useApp } from "@/lib/app-context";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import {
  yesterdayString, formatDisplayDate, toDateString, Rating,
} from "@/lib/storage";
import * as Haptics from "expo-haptics";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

type ActiveRating = 'red' | 'yellow' | 'green';

const ZONES: { rating: ActiveRating; label: string; color: string }[] = [
  { rating: 'red',    label: 'Missed',     color: '#EF4444' },
  { rating: 'yellow', label: 'Okay',       color: '#F59E0B' },
  { rating: 'green',  label: 'Crushed it', color: '#22C55E' },
];

export default function CheckInScreen() {
  const { activeHabits, categories, submitCheckIn, getRatingsForDate } = useApp();
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();

  const [currentDate, setCurrentDate] = useState(params.date ?? yesterdayString());
  const [ratings, setRatings] = useState<Record<string, Rating>>(() => getRatingsForDate(currentDate));
  const [habitIndex, setHabitIndex] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [flashColor, setFlashColor] = useState<string | null>(null);

  const today = toDateString();
  const canGoForward = currentDate < yesterdayString();

  // Flatten habits in category order
  const sortedCategories = useMemo(() => [...categories].sort((a, b) => a.order - b.order), [categories]);
  const orderedHabits = useMemo(() => {
    const result: typeof activeHabits = [];
    for (const cat of sortedCategories) {
      result.push(...activeHabits.filter((h) => h.category === cat.id));
    }
    return result;
  }, [activeHabits, sortedCategories]);

  const totalHabits = orderedHabits.length;
  const currentHabit = orderedHabits[habitIndex];
  const currentCategory = currentHabit
    ? categories.find((c) => c.id === currentHabit.category)
    : null;

  // Flash animation on tap
  const flashOpacity = useSharedValue(0);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flashOpacity.value }));

  async function handleRate(rating: ActiveRating) {
    if (!currentHabit) return;

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(
        rating === 'green'
          ? Haptics.ImpactFeedbackStyle.Medium
          : Haptics.ImpactFeedbackStyle.Light
      );
    }

    const zone = ZONES.find((z) => z.rating === rating)!;
    setFlashColor(zone.color);
    flashOpacity.value = withTiming(0.35, { duration: 60 }, () => {
      flashOpacity.value = withTiming(0, { duration: 180 });
    });

    const newRatings = { ...ratings, [currentHabit.id]: rating };
    setRatings(newRatings);

    const nextIndex = habitIndex + 1;
    if (nextIndex >= totalHabits) {
      // All done — auto save
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await submitCheckIn(currentDate, newRatings);
      setSubmitted(true);
      setTimeout(() => router.back(), 2200);
    } else {
      setHabitIndex(nextIndex);
    }
  }

  function navigateDate(direction: -1 | 1) {
    const d = new Date(currentDate + 'T12:00:00');
    d.setDate(d.getDate() + direction);
    const newDate = toDateString(d);
    if (newDate >= today) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentDate(newDate);
    setRatings(getRatingsForDate(newDate));
    setHabitIndex(0);
    setSubmitted(false);
  }

  const ratedCount = Object.values(ratings).filter((r) => r && r !== 'none').length;
  const greenCount  = Object.values(ratings).filter((r) => r === 'green').length;
  const yellowCount = Object.values(ratings).filter((r) => r === 'yellow').length;
  const redCount    = Object.values(ratings).filter((r) => r === 'red').length;
  const progress    = totalHabits > 0 ? habitIndex / totalHabits : 0;

  // ── Completion screen ──
  if (submitted) {
    const score = totalHabits > 0
      ? Math.round(((greenCount * 1 + yellowCount * 0.5) / totalHabits) * 100)
      : 0;
    const scoreColor = score >= 70 ? '#22C55E' : score >= 40 ? '#F59E0B' : '#EF4444';
    return (
      <ScreenContainer>
        <View style={styles.successContainer}>
          <Text style={[styles.successTitle, { color: colors.foreground }]}>
            {score >= 70 ? 'Crushed it!' : score >= 40 ? 'Good effort!' : 'Keep going!'}
          </Text>
          <Text style={[styles.successDate, { color: colors.muted }]}>
            {formatDisplayDate(currentDate)}
          </Text>
          <View style={[styles.successScoreWrap, { backgroundColor: scoreColor + '18', borderColor: scoreColor + '40' }]}>
            <Text style={[styles.successScore, { color: scoreColor }]}>{score}%</Text>
            <Text style={[styles.successScoreLabel, { color: scoreColor }]}>overall</Text>
          </View>
          <View style={styles.successPills}>
            {greenCount  > 0 && <View style={[styles.successPill, { backgroundColor: '#22C55E' }]}><Text style={styles.successPillText}>{greenCount} crushed</Text></View>}
            {yellowCount > 0 && <View style={[styles.successPill, { backgroundColor: '#F59E0B' }]}><Text style={styles.successPillText}>{yellowCount} okay</Text></View>}
            {redCount    > 0 && <View style={[styles.successPill, { backgroundColor: '#EF4444' }]}><Text style={styles.successPillText}>{redCount} missed</Text></View>}
          </View>
        </View>
      </ScreenContainer>
    );
  }

  if (!currentHabit) return null;

  return (
    <ScreenContainer edges={["top", "left", "right"]}>

      {/* ── Header ── */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.5 : 1 }]}
        >
          <IconSymbol name="xmark" size={16} color={colors.muted} />
        </Pressable>

        <View style={styles.dateRow}>
          <Pressable
            onPress={() => navigateDate(-1)}
            style={({ pressed }) => [styles.arrowBtn, { opacity: pressed ? 0.5 : 1 }]}
          >
            <IconSymbol name="chevron.left" size={16} color={colors.primary} />
          </Pressable>
          <View style={styles.dateLabelWrap}>
            <Text style={[styles.dateLabel, { color: colors.foreground }]}>
              {formatDisplayDate(currentDate)}
            </Text>
          </View>
          <Pressable
            onPress={() => canGoForward ? navigateDate(1) : undefined}
            style={({ pressed }) => [styles.arrowBtn, { opacity: canGoForward ? (pressed ? 0.5 : 1) : 0.2 }]}
          >
            <IconSymbol name="chevron.right" size={16} color={colors.primary} />
          </Pressable>
        </View>

        <View style={styles.headerBtn} />
      </View>

      {/* ── Progress bar ── */}
      <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
        <View style={[
          styles.progressFill,
          { width: `${Math.round(progress * 100)}%` as any, backgroundColor: colors.primary },
        ]} />
      </View>

      {/* ── Habit counter ── */}
      <View style={[styles.counterRow, { borderBottomColor: colors.border }]}>
        <Text style={[styles.counterText, { color: colors.muted }]}>
          {habitIndex + 1} of {totalHabits}
        </Text>
        <Text style={[styles.categoryLabel, { color: colors.primary }]}>
          {currentCategory?.emoji} {currentCategory?.label}
        </Text>
      </View>

      {/* ── Main habit card ── */}
      <Animated.View
        key={currentHabit.id}
        entering={SlideInRight.duration(180)}
        exiting={SlideOutLeft.duration(150)}
        style={[styles.habitArea, { backgroundColor: colors.background }]}
      >
        {/* Habit name */}
        <View style={styles.habitNameArea}>
          <View style={[styles.habitNumBadge, { backgroundColor: colors.primary + '22', borderColor: colors.primary + '44' }]}>
            <Text style={[styles.habitNumText, { color: colors.primary }]}>
              {activeHabits.filter((h) => h.category === currentHabit.category).indexOf(currentHabit) + 1}
            </Text>
          </View>
          <Text style={[styles.habitName, { color: colors.foreground }]}>
            {currentHabit.name}
          </Text>
          {currentHabit.description ? (
            <Text style={[styles.habitDesc, { color: colors.muted }]}>
              {currentHabit.description}
            </Text>
          ) : null}
        </View>

        {/* ── 3 tap zones ── */}
        <View style={styles.zonesRow}>
          {ZONES.map((zone) => (
            <Pressable
              key={zone.rating}
              onPress={() => handleRate(zone.rating)}
              style={({ pressed }) => [
                styles.zone,
                { backgroundColor: zone.color + (pressed ? 'CC' : '22') },
              ]}
            >
              <View style={[styles.zoneColorBar, { backgroundColor: zone.color }]} />
              <Text style={[styles.zoneLabel, { color: zone.color }]}>{zone.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Flash overlay */}
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: flashColor ?? '#fff' },
            flashStyle,
          ]}
        />
      </Animated.View>

      {/* ── Back button (if not on first habit) ── */}
      {habitIndex > 0 && (
        <View style={[styles.backRow, { borderTopColor: colors.border }]}>
          <Pressable
            onPress={() => setHabitIndex(habitIndex - 1)}
            style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.5 : 1 }]}
          >
            <IconSymbol name="chevron.left" size={14} color={colors.muted} />
            <Text style={[styles.backBtnText, { color: colors.muted }]}>Back</Text>
          </Pressable>
        </View>
      )}

    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  dateRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  arrowBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  dateLabelWrap: { alignItems: 'center', minWidth: 140 },
  dateLabel: { fontSize: 15, fontWeight: '700' },

  progressTrack: { height: 3 },
  progressFill: { height: 3, borderRadius: 1.5 },

  counterRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  counterText: { fontSize: 13, fontWeight: '500' },
  categoryLabel: { fontSize: 13, fontWeight: '600' },

  habitArea: {
    flex: 1,
    overflow: 'hidden',
  },

  habitNameArea: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 20,
    gap: 8,
    alignItems: 'center',
  },
  habitNumBadge: {
    width: 36, height: 36, borderRadius: 10, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  habitNumText: { fontSize: 15, fontWeight: '800' },
  habitName: { fontSize: 24, fontWeight: '700', textAlign: 'center', lineHeight: 30 },
  habitDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  zonesRow: {
    flexDirection: 'row',
    flex: 1,
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  zone: {
    flex: 1,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 20,
    gap: 8,
    overflow: 'hidden',
  },
  zoneColorBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 6,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  zoneLabel: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },

  backRow: {
    paddingHorizontal: 16, paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'flex-start',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  backBtnText: { fontSize: 14, fontWeight: '500' },

  // Success
  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  successTitle: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  successDate: { fontSize: 14 },
  successScoreWrap: {
    borderRadius: 20, borderWidth: 1.5,
    paddingHorizontal: 28, paddingVertical: 14,
    alignItems: 'center', marginVertical: 4,
  },
  successScore: { fontSize: 48, fontWeight: '900', letterSpacing: -1 },
  successScoreLabel: { fontSize: 13, fontWeight: '600', marginTop: -4 },
  successPills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 },
  successPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  successPillText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
