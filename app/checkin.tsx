import {
  ScrollView, Text, View, Pressable, StyleSheet, Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useState, useMemo, useRef } from "react";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring } from "react-native-reanimated";
import { ScreenContainer } from "@/components/screen-container";
import { useApp } from "@/lib/app-context";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import {
  yesterdayString, formatDisplayDate, toDateString,
  Rating, Category,
} from "@/lib/storage";
import * as Haptics from "expo-haptics";

const RATINGS = ['red', 'yellow', 'green'] as const;
type ActiveRating = 'red' | 'yellow' | 'green';

const RATING_CONFIG: Record<ActiveRating, {
  label: string;
  emoji: string;
  activeColor: string;
  bgColor: string;
}> = {
  red:    { label: 'Missed',      emoji: '😔', activeColor: '#EF4444', bgColor: '#EF444415' },
  yellow: { label: 'Okay',        emoji: '😐', activeColor: '#F59E0B', bgColor: '#F59E0B15' },
  green:  { label: 'Crushed it!', emoji: '🔥', activeColor: '#22C55E', bgColor: '#22C55E15' },
};

// Animated habit card
function HabitCard({
  habit,
  habitIndex,
  current,
  onRate,
  colors,
}: {
  habit: { id: string; name: string; description?: string };
  habitIndex: number;
  current: Rating;
  onRate: (rating: Rating) => void;
  colors: ReturnType<typeof import("@/hooks/use-colors").useColors>;
}) {
  const isRated = current !== 'none';
  const ratedCfg = isRated ? RATING_CONFIG[current as ActiveRating] : null;

  // Scale animation for the card when rated
  const cardScale = useSharedValue(1);
  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
  }));

  function handleRate(rating: Rating) {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(
        rating === 'green'
          ? Haptics.ImpactFeedbackStyle.Medium
          : Haptics.ImpactFeedbackStyle.Light
      );
    }
    // Bounce the card
    cardScale.value = withSpring(0.97, { damping: 12, stiffness: 300 }, () => {
      cardScale.value = withSpring(1, { damping: 14, stiffness: 280 });
    });
    onRate(rating);
  }

  const borderColor = ratedCfg ? ratedCfg.activeColor + '80' : colors.border;
  const cardBg = ratedCfg ? ratedCfg.bgColor : colors.surface;

  return (
    <Animated.View style={[cardStyle, styles.habitCard, { backgroundColor: cardBg, borderColor }]}>
      {/* Habit header */}
      <View style={styles.habitCardHeader}>
        <View style={[styles.habitNumBadge, {
          backgroundColor: ratedCfg ? ratedCfg.activeColor + '22' : colors.primary + '22',
          borderColor: ratedCfg ? ratedCfg.activeColor + '55' : colors.primary + '44',
        }]}>
          <Text style={[styles.habitNumText, { color: ratedCfg ? ratedCfg.activeColor : colors.primary }]}>
            {habitIndex + 1}
          </Text>
        </View>
        <View style={styles.habitCardTitleWrap}>
          <Text style={[styles.habitCardName, { color: colors.foreground }]} numberOfLines={2}>
            {habit.name}
          </Text>
          {habit.description ? (
            <Text style={[styles.habitCardDesc, { color: colors.muted }]} numberOfLines={2}>
              {habit.description}
            </Text>
          ) : null}
        </View>
        {isRated && (
          <View style={[styles.checkBadge, { backgroundColor: ratedCfg!.activeColor }]}>
            <Text style={styles.checkBadgeText}>✓</Text>
          </View>
        )}
      </View>

      {/* Rating buttons */}
      <View style={styles.ratingRow}>
        {RATINGS.map((rating) => {
          const cfg = RATING_CONFIG[rating as Exclude<Rating, 'none'>];
          const isSelected = current === rating;
          return (
            <RatingButton
              key={rating}
              cfg={cfg}
              isSelected={isSelected}
              onPress={() => handleRate(rating)}
              colors={colors}
            />
          );
        })}
      </View>
    </Animated.View>
  );
}

function RatingButton({
  cfg,
  isSelected,
  onPress,
  colors,
}: {
  cfg: { label: string; emoji: string; activeColor: string; bgColor: string };
  isSelected: boolean;
  onPress: () => void;
  colors: ReturnType<typeof import("@/hooks/use-colors").useColors>;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  function handlePress() {
    scale.value = withTiming(0.94, { duration: 70 }, () => {
      scale.value = withSpring(1, { damping: 10, stiffness: 300 });
    });
    onPress();
  }

  return (
    <Animated.View style={[styles.ratingBtnWrap, animStyle]}>
      <Pressable
        onPress={handlePress}
        style={[
          styles.ratingBtn,
          {
            backgroundColor: isSelected ? cfg.activeColor : cfg.bgColor,
            borderColor: isSelected ? cfg.activeColor : cfg.activeColor + '30',
          },
        ]}
      >
        <Text style={styles.ratingBtnEmoji}>{cfg.emoji}</Text>
        <Text style={[styles.ratingBtnLabel, { color: isSelected ? '#fff' : cfg.activeColor }]}>
          {cfg.label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export default function CheckInScreen() {
  const { activeHabits, categories, submitCheckIn, getRatingsForDate } = useApp();
  const sortedCategories = [...categories].sort((a, b) => a.order - b.order);
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();
  const scrollRef = useRef<ScrollView>(null);

  const [currentDate, setCurrentDate] = useState(params.date ?? yesterdayString());
  const [ratings, setRatings] = useState<Record<string, Rating>>(() => getRatingsForDate(currentDate));
  const [submitted, setSubmitted] = useState(false);

  const today = toDateString();
  const canGoForward = currentDate < yesterdayString();

  function navigateDate(direction: -1 | 1) {
    const d = new Date(currentDate + 'T12:00:00');
    d.setDate(d.getDate() + direction);
    const newDate = toDateString(d);
    if (newDate >= today) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentDate(newDate);
    setRatings(getRatingsForDate(newDate));
    setSubmitted(false);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  const habitsByCategory = useMemo(() => {
    const map: Record<string, typeof activeHabits> = {};
    for (const cat of categories) map[cat.id] = [];
    for (const h of activeHabits) {
      if (!map[h.category]) map[h.category] = [];
      map[h.category].push(h);
    }
    return map;
  }, [activeHabits, categories]);

  function setRating(habitId: string, rating: Rating) {
    setRatings((prev) => ({ ...prev, [habitId]: prev[habitId] === rating ? 'none' : rating }));
  }

  async function handleSubmit() {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await submitCheckIn(currentDate, ratings);
    setSubmitted(true);
    setTimeout(() => router.back(), 2000);
  }

  const allRated = activeHabits.length > 0 &&
    activeHabits.every((h) => ratings[h.id] && ratings[h.id] !== 'none');

  const ratedEntries = Object.values(ratings).filter((r) => r !== 'none' && r !== undefined);
  const greenCount  = ratedEntries.filter((r) => r === 'green').length;
  const yellowCount = ratedEntries.filter((r) => r === 'yellow').length;
  const redCount    = ratedEntries.filter((r) => r === 'red').length;
  const totalActive = activeHabits.length;
  const progress    = totalActive > 0 ? ratedEntries.length / totalActive : 0;

  if (submitted) {
    const score = totalActive > 0
      ? Math.round(((greenCount * 1 + yellowCount * 0.5) / totalActive) * 100)
      : 0;
    const scoreColor = score >= 70 ? '#22C55E' : score >= 40 ? '#F59E0B' : '#EF4444';
    return (
      <ScreenContainer>
        <View style={styles.successContainer}>
          <Text style={styles.successEmoji}>
            {score >= 70 ? '🎉' : score >= 40 ? '💪' : '🙏'}
          </Text>
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
            {greenCount  > 0 && (
              <View style={[styles.successPill, { backgroundColor: '#22C55E' }]}>
                <Text style={styles.successPillText}>🔥 {greenCount} crushed</Text>
              </View>
            )}
            {yellowCount > 0 && (
              <View style={[styles.successPill, { backgroundColor: '#F59E0B' }]}>
                <Text style={styles.successPillText}>😐 {yellowCount} okay</Text>
              </View>
            )}
            {redCount > 0 && (
              <View style={[styles.successPill, { backgroundColor: '#EF4444' }]}>
                <Text style={styles.successPillText}>😔 {redCount} missed</Text>
              </View>
            )}
          </View>
        </View>
      </ScreenContainer>
    );
  }

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

        {/* Date nav */}
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
            <Text style={[styles.dateSub, { color: colors.muted }]}>
              {new Date(currentDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
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
        <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` as any, backgroundColor: colors.primary }]} />
      </View>

      {/* ── Progress label ── */}
      {totalActive > 0 && (
        <View style={[styles.progressLabel, { borderBottomColor: colors.border }]}>
          <Text style={[styles.progressLabelText, { color: colors.muted }]}>
            {ratedEntries.length === totalActive
              ? '✓ All rated — tap Save to finish'
              : `${ratedEntries.length} of ${totalActive} rated`}
          </Text>
        </View>
      )}

      {/* ── Habit cards ── */}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {sortedCategories.map((cat) => {
          const habits = habitsByCategory[cat.id] ?? [];
          if (habits.length === 0) return null;

          return (
            <View key={cat.id} style={styles.section}>
              {/* Category label */}
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionEmoji}>{cat.emoji}</Text>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{cat.label}</Text>
              </View>

              {habits.map((habit, idx) => (
                <HabitCard
                  key={habit.id}
                  habit={habit}
                  habitIndex={idx}
                  current={ratings[habit.id] ?? 'none'}
                  onRate={(rating) => setRating(habit.id, rating)}
                  colors={colors}
                />
              ))}
            </View>
          );
        })}

        <View style={{ height: 16 }} />
      </ScrollView>

      {/* ── Footer ── */}
      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        {ratedEntries.length > 0 && (
          <View style={styles.tally}>
            {greenCount  > 0 && <View style={[styles.tallyPill, { backgroundColor: '#22C55E18' }]}><Text style={[styles.tallyText, { color: '#22C55E' }]}>🔥 {greenCount}</Text></View>}
            {yellowCount > 0 && <View style={[styles.tallyPill, { backgroundColor: '#F59E0B18' }]}><Text style={[styles.tallyText, { color: '#F59E0B' }]}>😐 {yellowCount}</Text></View>}
            {redCount    > 0 && <View style={[styles.tallyPill, { backgroundColor: '#EF444418' }]}><Text style={[styles.tallyText, { color: '#EF4444' }]}>😔 {redCount}</Text></View>}
            <Text style={[styles.tallyOf, { color: colors.muted }]}>{ratedEntries.length}/{totalActive}</Text>
          </View>
        )}

        <Pressable
          onPress={allRated ? handleSubmit : undefined}
          style={({ pressed }) => [
            styles.saveBtn,
            {
              backgroundColor: allRated ? colors.primary : colors.border,
              transform: [{ scale: allRated && pressed ? 0.97 : 1 }],
              opacity: allRated ? 1 : 0.55,
            },
          ]}
        >
          <Text style={[styles.saveBtnText, { color: allRated ? '#fff' : colors.muted }]}>
            {allRated ? '🎉 Save Review' : `Rate all habits (${ratedEntries.length}/${totalActive})`}
          </Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  // Header
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
  dateSub: { fontSize: 11, marginTop: 1 },

  // Progress
  progressTrack: { height: 3 },
  progressFill: { height: 3, borderRadius: 1.5 },
  progressLabel: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  progressLabelText: { fontSize: 12, fontWeight: '500' },

  // Scroll
  scroll: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },

  // Section
  section: { marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  sectionEmoji: { fontSize: 18 },
  sectionTitle: { fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },

  // Habit card
  habitCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  habitCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  habitNumBadge: {
    width: 30, height: 30, borderRadius: 8, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  habitNumText: { fontSize: 13, fontWeight: '800' },
  habitCardTitleWrap: { flex: 1, gap: 2 },
  habitCardName: { fontSize: 16, fontWeight: '600', lineHeight: 22 },
  habitCardDesc: { fontSize: 12, lineHeight: 16 },
  checkBadge: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  checkBadgeText: { color: '#fff', fontSize: 13, fontWeight: '800' },

  // Rating buttons
  ratingRow: { flexDirection: 'row', gap: 8 },
  ratingBtnWrap: { flex: 1 },
  ratingBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  ratingBtnEmoji: { fontSize: 20 },
  ratingBtnLabel: { fontSize: 11, fontWeight: '700', textAlign: 'center' },

  // Footer
  footer: {
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28,
    borderTopWidth: StyleSheet.hairlineWidth, gap: 10,
  },
  tally: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tallyPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20,
  },
  tallyText: { fontSize: 13, fontWeight: '700' },
  tallyOf: { fontSize: 12, marginLeft: 4 },
  saveBtn: {
    borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },

  // Success
  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  successEmoji: { fontSize: 64 },
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
