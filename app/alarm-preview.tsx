/**
 * Alarm Preview Screen
 *
 * Shows the user exactly what they will see when their alarm fires:
 *  - The alarm banner (red if requireCheckin, primary otherwise)
 *  - The habit list with rating buttons
 *  - The snooze button (if requireCheckin is off)
 *  - The Save Review button
 *
 * After tapping Save Review, shows the full post-submission screen:
 *  - Celebration confetti overlay
 *  - Score summary
 *  - Morning practice card (green/yellow/red buttons)
 *
 * Nothing is saved in preview mode.
 */
import {
  ScrollView, Text, View, Pressable, StyleSheet, Platform, Animated, TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { useState, useMemo, useEffect, useRef } from "react";
import { ScreenContainer } from "@/components/screen-container";
import { useApp } from "@/lib/app-context";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { CategoryIcon } from "@/components/category-icon";
import { yesterdayString, formatDisplayDate, Rating } from "@/lib/storage";
import * as Haptics from "expo-haptics";
import { trpc } from "@/lib/trpc";
import { useRouter as useExpoRouter } from "expo-router";

type ActiveRating = 'red' | 'yellow' | 'green';
const RATINGS: ActiveRating[] = ['red', 'yellow', 'green'];
const RATING_COLORS: Record<ActiveRating, string> = {
  red:    '#EF4444',
  yellow: '#F59E0B',
  green:  '#22C55E',
};

// ─── Celebration Overlay ─────────────────────────────────────────────────────
const CONFETTI_COLORS = ['#22C55E', '#F59E0B', '#3B82F6', '#EF4444', '#60A5FA', '#F472B6', '#34D399', '#FBBF24'];
const NUM_PARTICLES = 40;

function CelebrationOverlay({ score }: { score: number }) {
  const [visible, setVisible] = useState(true);
  const particles = useRef(
    Array.from({ length: NUM_PARTICLES }, (_, i) => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      opacity: new Animated.Value(1),
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 6 + Math.random() * 8,
      startX: 0.1 + Math.random() * 0.8,
    }))
  ).current;

  useEffect(() => {
    if (!visible) return;
    const animations = particles.map((p) => {
      const endX = (Math.random() - 0.5) * 300;
      const endY = 200 + Math.random() * 400;
      return Animated.parallel([
        Animated.timing(p.x, { toValue: endX, duration: 1800 + Math.random() * 800, useNativeDriver: true }),
        Animated.timing(p.y, { toValue: endY, duration: 1800 + Math.random() * 800, useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(800),
          Animated.timing(p.opacity, { toValue: 0, duration: 800, useNativeDriver: true }),
        ]),
      ]);
    });
    Animated.parallel(animations).start();
    const timer = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible || score < 40) return null;

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {particles.map((p, i) => (
        <Animated.View
          key={i}
          style={[
            {
              position: 'absolute',
              top: 80,
              left: `${Math.round(p.startX * 100)}%` as `${number}%`,
              width: p.size,
              height: p.size,
              borderRadius: p.size / 4,
              backgroundColor: p.color,
            },
            { transform: [{ translateX: p.x }, { translateY: p.y }], opacity: p.opacity },
          ]}
        />
      ))}
    </View>
  );
}

// ─── Morning Practice Card ────────────────────────────────────────────────────
const MP_META: Record<string, { emoji: string; label: string }> = {
  priming:       { emoji: '⚡', label: 'Priming' },
  meditation:    { emoji: '🧘', label: 'Guided Meditation' },
  breathwork:    { emoji: '💨', label: 'Breathwork' },
  visualization: { emoji: '🎯', label: 'Visualization' },
};

// Test audio URL for Priming 5-min
const PRIMING_5MIN_TEST_URL = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663287248938/lYxzlZcwkYrgInjh.mp3";

function MorningPracticeCard({ alarm, colors }: { alarm: ReturnType<typeof useApp>['alarm']; colors: ReturnType<typeof useColors> }) {
  const router = useExpoRouter();
  const [mpSelectedType, setMpSelectedType] = useState<string>(
    alarm?.meditationId && alarm.meditationId !== 'none' ? alarm.meditationId : 'priming'
  );
  const [mpSelectedDuration, setMpSelectedDuration] = useState<number>(
    alarm?.practiceDurations?.[mpSelectedType] ?? 10
  );
  const [mpCustomDuration, setMpCustomDuration] = useState('');
  const [mpCustomPickerVisible, setMpCustomPickerVisible] = useState(false);
  const [mpDismissed, setMpDismissed] = useState(false);
  const [mpGenerating, setMpGenerating] = useState(false);

  const generatePracticeMutation = trpc.morningPractice.generate.useMutation();

  if (mpDismissed) return null;

  const meta = MP_META[mpSelectedType] ?? MP_META.priming;
  const customMins = parseInt(mpCustomDuration, 10);
  const effectiveDuration = (!isNaN(customMins) && customMins > 0) ? customMins : mpSelectedDuration;

  async function handleLaunch() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Test shortcut: Priming 5-min uses the pre-recorded MP3
    if (mpSelectedType === 'priming' && effectiveDuration === 5) {
      router.push({
        pathname: '/practice-player',
        params: {
          type: 'priming',
          chunkUrls: JSON.stringify([PRIMING_5MIN_TEST_URL]),
          pausesBetweenChunks: JSON.stringify([0]),
          totalDurationMinutes: '5',
          breathworkStyle: 'box',
        },
      } as never);
      return;
    }

    // All other types/durations: generate via TTS
    setMpGenerating(true);
    try {
      const result = await generatePracticeMutation.mutateAsync({
        type: mpSelectedType as 'priming' | 'meditation' | 'breathwork' | 'visualization',
        voiceId: '21m00Tcm4TlvDq8ikWAM', // rachel
        lengthMinutes: effectiveDuration,
        name: 'Friend',
        goals: [],
        rewards: [],
        habits: [],
        gratitudes: [],
      });
      router.push({
        pathname: '/practice-player',
        params: {
          type: mpSelectedType,
          chunkUrls: JSON.stringify(result.chunkUrls),
          pausesBetweenChunks: JSON.stringify(result.pausesBetweenChunks ?? []),
          totalDurationMinutes: String(effectiveDuration),
          breathworkStyle: 'box',
        },
      } as never);
    } catch {
      // fail silently
    } finally {
      setMpGenerating(false);
    }
  }

  return (
    <View style={[styles.practiceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.practiceTitle, { color: colors.foreground }]}>🌅  Morning Practice</Text>
      <Text style={[styles.practiceDesc, { color: colors.muted }]}>
        {meta.emoji} {meta.label} · {effectiveDuration} min
      </Text>

      {/* Practice type chips */}
      <View style={styles.typeChips}>
        {(['priming', 'meditation', 'breathwork', 'visualization'] as const).map((id) => {
          const m = MP_META[id];
          const isSelected = mpSelectedType === id;
          return (
            <Pressable
              key={id}
              onPress={() => {
                setMpSelectedType(id);
                setMpSelectedDuration(alarm?.practiceDurations?.[id] ?? 10);
                setMpCustomDuration('');
                setMpCustomPickerVisible(false);
              }}
              style={({ pressed }) => ({
                paddingHorizontal: 11, paddingVertical: 6, borderRadius: 16, borderWidth: 1.5,
                borderColor: isSelected ? '#3B82F6' : colors.border,
                backgroundColor: isSelected ? '#3B82F618' : 'transparent',
                opacity: pressed ? 0.7 : 1,
                flexDirection: 'row', alignItems: 'center', gap: 4,
              })}
            >
              <Text style={{ fontSize: 13 }}>{m.emoji}</Text>
              <Text style={{ fontSize: 12, fontWeight: '600', color: isSelected ? '#3B82F6' : colors.muted }}>{m.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Custom time picker */}
      {mpCustomPickerVisible && (
        <View style={{ marginBottom: 14, gap: 8 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.muted, letterSpacing: 0.5 }}>PICK DURATION</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {[5, 10, 15, 20].map(min => (
              <Pressable
                key={min}
                onPress={() => { setMpSelectedDuration(min); setMpCustomDuration(''); }}
                style={({ pressed }) => ({
                  paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5,
                  borderColor: mpSelectedDuration === min && !mpCustomDuration ? '#3B82F6' : colors.border,
                  backgroundColor: mpSelectedDuration === min && !mpCustomDuration ? '#3B82F618' : 'transparent',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: mpSelectedDuration === min && !mpCustomDuration ? '#3B82F6' : colors.foreground }}>{min} min</Text>
              </Pressable>
            ))}
            <View style={{
              flexDirection: 'row', alignItems: 'center', borderWidth: 1.5,
              borderColor: mpCustomDuration ? '#3B82F6' : colors.border, borderRadius: 20,
              paddingHorizontal: 10, paddingVertical: 4,
              backgroundColor: mpCustomDuration ? '#3B82F618' : 'transparent',
            }}>
              <TextInput
                value={mpCustomDuration}
                onChangeText={setMpCustomDuration}
                placeholder="Custom"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                style={{ fontSize: 13, fontWeight: '600', color: mpCustomDuration ? '#3B82F6' : colors.foreground, minWidth: 50, textAlign: 'center' }}
                returnKeyType="done"
              />
              {mpCustomDuration ? <Text style={{ fontSize: 12, color: '#3B82F6', marginLeft: 2 }}>min</Text> : null}
            </View>
          </View>
        </View>
      )}

      {/* Green / Yellow / Red buttons */}
      <View style={{ gap: 10 }}>
        <Pressable
          style={({ pressed }) => ({
            backgroundColor: mpGenerating ? colors.border : '#16A34A',
            borderRadius: 12, paddingVertical: 14, alignItems: 'center',
            opacity: pressed ? 0.85 : 1,
          })}
          onPress={handleLaunch}
          disabled={mpGenerating}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
            {mpGenerating ? 'Generating...' : `▶  Begin ${meta.label} · ${effectiveDuration} min`}
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => ({
            backgroundColor: '#D97706' + '18', borderWidth: 1.5, borderColor: '#D97706',
            borderRadius: 12, paddingVertical: 12, alignItems: 'center',
            opacity: pressed ? 0.8 : 1,
          })}
          onPress={() => setMpCustomPickerVisible(v => !v)}
        >
          <Text style={{ color: '#D97706', fontWeight: '700', fontSize: 14 }}>
            ⏱  {mpCustomPickerVisible ? 'Hide time picker' : 'Pick a different time'}
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => ({
            backgroundColor: '#DC2626' + '12', borderWidth: 1.5, borderColor: '#DC2626',
            borderRadius: 12, paddingVertical: 12, alignItems: 'center',
            opacity: pressed ? 0.8 : 1,
          })}
          onPress={() => setMpDismissed(true)}
        >
          <Text style={{ color: '#DC2626', fontWeight: '700', fontSize: 14 }}>✕  Skip Morning Practice</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function AlarmPreviewScreen() {
  const { activeHabits, categories, alarm } = useApp();
  const sortedCategories = useMemo(() => [...categories].sort((a, b) => a.order - b.order), [categories]);
  const colors = useColors();
  const router = useRouter();

  const currentDate = yesterdayString();
  const [ratings, setRatings] = useState<Record<string, Rating>>({});
  const [submitted, setSubmitted] = useState(false);

  const requireCheckin = alarm.requireCheckin ?? false;
  const baseSnoozeMinutes = alarm.snoozeMinutes ?? 5;
  // Incremental snooze: each tap adds baseSnoozeMinutes more time
  const [snoozeAdded, setSnoozeAdded] = useState(0);
  const totalSnoozeMinutes = baseSnoozeMinutes + snoozeAdded;

  const habitsByCategory = useMemo(() => {
    const map: Record<string, typeof activeHabits> = {};
    for (const cat of categories) map[cat.id] = [];
    for (const h of activeHabits) {
      if (!map[h.category]) map[h.category] = [];
      map[h.category].push(h);
    }
    return map;
  }, [activeHabits, categories]);

  const globalRankMap = useMemo(() => {
    const m: Record<string, number> = {};
    activeHabits.forEach((h, i) => { m[h.id] = i + 1; });
    return m;
  }, [activeHabits]);

  function setRating(habitId: string, rating: ActiveRating) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRatings((prev) => ({ ...prev, [habitId]: prev[habitId] === rating ? 'none' : rating }));
  }

  function rateCategory(categoryId: string, rating: ActiveRating) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const habits = habitsByCategory[categoryId] ?? [];
    setRatings((prev) => {
      const next = { ...prev };
      for (const h of habits) next[h.id] = rating;
      return next;
    });
  }

  function rateAll(rating: ActiveRating) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setRatings((prev) => {
      const next = { ...prev };
      for (const h of activeHabits) next[h.id] = rating;
      return next;
    });
  }

  const activeHabitIds = new Set(activeHabits.map((h) => h.id));
  const activeRatings = Object.entries(ratings)
    .filter(([id, r]) => activeHabitIds.has(id) && r !== 'none' && r !== undefined)
    .map(([, r]) => r);
  const ratedEntries = activeRatings;
  const greenCount  = ratedEntries.filter((r) => r === 'green').length;
  const yellowCount = ratedEntries.filter((r) => r === 'yellow').length;
  const redCount    = ratedEntries.filter((r) => r === 'red').length;
  const totalActive = activeHabits.length;
  const progress    = totalActive > 0 ? ratedEntries.length / totalActive : 0;
  const allRated    = totalActive > 0 && activeHabits.every((h) => ratings[h.id] && ratings[h.id] !== 'none');

  // Compute score (same logic as checkin.tsx)
  const score = useMemo(() => {
    if (totalActive === 0) return 0;
    const total = activeHabits.reduce((sum, h) => {
      const r = ratings[h.id] ?? 'none';
      return sum + (r === 'green' ? 100 : r === 'yellow' ? 50 : 0);
    }, 0);
    return Math.round(total / totalActive);
  }, [ratings, activeHabits, totalActive]);

  const scoreColor = score >= 70 ? '#22C55E' : score >= 40 ? '#F59E0B' : '#EF4444';

  // ── Submitted screen ──────────────────────────────────────────────────────
  if (submitted) {
    return (
      <ScreenContainer>
        <CelebrationOverlay score={score} />
        <ScrollView contentContainerStyle={styles.successScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.successContainer}>
            <Text style={[styles.successTitle, { color: colors.foreground }]}>
              {score >= 70 ? '🎉 Crushed it!' : score >= 40 ? '✨ Good effort!' : '💪 Keep going!'}
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

            <MorningPracticeCard alarm={alarm} colors={colors} />

            <Pressable
              style={({ pressed }) => [styles.doneBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
              onPress={() => router.back()}
            >
              <Text style={styles.doneBtnText}>Close Preview</Text>
            </Pressable>
          </View>
        </ScrollView>
      </ScreenContainer>
    );
  }

  // ── Check-in screen ───────────────────────────────────────────────────────
  return (
    <ScreenContainer edges={["top", "left", "right"]}>

      {/* ── Alarm banner ── */}
      <View style={[styles.alarmBanner, { backgroundColor: requireCheckin ? '#DC2626' : colors.primary }]}>
        <Text style={styles.alarmBannerText}>
          {requireCheckin
            ? '🔒 Complete your habits to turn off the alarm'
            : '⏰ Complete your check-in to dismiss the alarm'}
        </Text>
      </View>

      {/* ── Preview label ── */}
      <View style={[styles.previewLabel, { backgroundColor: '#00000040' }]}>
        <Text style={styles.previewLabelText}>👁 PREVIEW — nothing will be saved</Text>
      </View>

      {/* ── Header ── */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.5 : 1 }]}
        >
          <IconSymbol name="xmark" size={16} color={colors.muted} />
        </Pressable>

        <View style={styles.dateRow}>
          <View style={styles.dateLabelWrap}>
            <Text style={[styles.dateLabel, { color: colors.foreground }]}>
              {formatDisplayDate(currentDate)}
            </Text>
            <Text style={[styles.dateSub, { color: colors.muted }]}>
              {new Date(currentDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </Text>
          </View>
        </View>

        <View style={styles.headerBtn} />
      </View>

      {/* ── Progress bar ── */}
      <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
        <View style={[styles.progressFill, {
          width: `${Math.round(progress * 100)}%` as never,
          backgroundColor: colors.primary,
        }]} />
      </View>

      {/* ── Legend ── */}
      <View style={[styles.legendRow, { borderBottomColor: colors.border }]}>
        {RATINGS.map((r) => (
          <View key={r} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: RATING_COLORS[r] }]} />
            <Text style={[styles.legendText, { color: colors.muted }]}>
              {r === 'red' ? 'Missed' : r === 'yellow' ? 'Okay' : 'Crushed it'}
            </Text>
          </View>
        ))}
      </View>

      {/* ── Global rate-all row ── */}
      <View style={[styles.rateAllRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.rateAllLabel, { color: colors.muted }]}>Rate All</Text>
        <View style={[styles.segmentedBtn, { backgroundColor: colors.border }]}>
          {RATINGS.map((r, i) => (
            <Pressable
              key={r}
              onPress={() => rateAll(r)}
              style={({ pressed }) => [
                styles.segment,
                i === 0 && styles.segmentFirst,
                i === RATINGS.length - 1 && styles.segmentLast,
                { backgroundColor: RATING_COLORS[r] + (pressed ? 'CC' : '88'), opacity: pressed ? 0.8 : 1 },
              ]}
            />
          ))}
        </View>
      </View>

      {/* ── Habit list ── */}
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {sortedCategories.map((cat) => {
          const habits = habitsByCategory[cat.id] ?? [];
          if (habits.length === 0) return null;

          return (
            <View key={cat.id} style={styles.section}>
              <View style={styles.sectionHeader}>
                <CategoryIcon
                  categoryId={cat.id}
                  lifeArea={cat.lifeArea}
                  size={18}
                  color={colors.primary}
                />
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{cat.label}</Text>
                <View style={{ flex: 1 }} />
                <View style={[styles.segmentedBtn, { backgroundColor: colors.border }]}>
                  {RATINGS.map((r, i) => (
                    <Pressable
                      key={r}
                      onPress={() => rateCategory(cat.id, r)}
                      style={({ pressed }) => [
                        styles.segment,
                        styles.segmentSmall,
                        i === 0 && styles.segmentFirst,
                        i === RATINGS.length - 1 && styles.segmentLast,
                        { backgroundColor: RATING_COLORS[r] + (pressed ? 'CC' : '88'), opacity: pressed ? 0.8 : 1 },
                      ]}
                    />
                  ))}
                </View>
              </View>

              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {habits.map((habit, idx) => {
                  const current: Rating = ratings[habit.id] ?? 'none';
                  const isLast = idx === habits.length - 1;
                  const rank = globalRankMap[habit.id] ?? (idx + 1);

                  return (
                    <View
                      key={habit.id}
                      style={[
                        styles.habitRow,
                        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                      ]}
                    >
                      <View style={styles.habitNameRow}>
                        <View style={[styles.habitNumBadge, {
                          backgroundColor: colors.primary + '22',
                          borderColor: colors.primary + '44',
                        }]}>
                          <Text style={[styles.habitNumText, { color: colors.primary }]}>{rank}</Text>
                        </View>
                        <Text style={[styles.habitName, { color: colors.foreground }]}>
                          {habit.name}
                        </Text>
                      </View>

                      <View style={[styles.segmentedBtn, { backgroundColor: colors.border }]}>
                        {RATINGS.map((rating, i) => {
                          const isSelected = current === rating;
                          const col = RATING_COLORS[rating];
                          return (
                            <Pressable
                              key={rating}
                              onPress={() => setRating(habit.id, rating)}
                              style={({ pressed }) => [
                                styles.segment,
                                i === 0 && styles.segmentFirst,
                                i === RATINGS.length - 1 && styles.segmentLast,
                                {
                                  backgroundColor: isSelected ? col : col + '28',
                                  opacity: pressed ? 0.75 : 1,
                                },
                              ]}
                            />
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}

        <View style={{ height: 16 }} />
      </ScrollView>

      {/* ── Footer ── */}
      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        {ratedEntries.length > 0 && (
          <View style={styles.tally}>
            {greenCount  > 0 && <View style={[styles.tallyPill, { backgroundColor: '#22C55E18' }]}><Text style={[styles.tallyText, { color: '#22C55E' }]}>{greenCount} crushed</Text></View>}
            {yellowCount > 0 && <View style={[styles.tallyPill, { backgroundColor: '#F59E0B18' }]}><Text style={[styles.tallyText, { color: '#F59E0B' }]}>{yellowCount} okay</Text></View>}
            {redCount    > 0 && <View style={[styles.tallyPill, { backgroundColor: '#EF444418' }]}><Text style={[styles.tallyText, { color: '#EF4444' }]}>{redCount} missed</Text></View>}
            <Text style={[styles.tallyOf, { color: colors.muted }]}>{ratedEntries.length}/{totalActive}</Text>
          </View>
        )}

        {/* Snooze button — only shown when requireCheckin is off */}
        {/* Tap once to snooze; tap again to add more time before it fires */}
        {!requireCheckin && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                router.back();
              }}
              style={({ pressed }) => [
                styles.snoozeBtn,
                { flex: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <IconSymbol name="clock.arrow.circlepath" size={16} color={colors.muted} />
              <Text style={[styles.snoozeBtnText, { color: colors.muted }]}>
                Snooze {totalSnoozeMinutes} min
              </Text>
            </Pressable>
            {/* +N min tap to add more snooze time */}
            <Pressable
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSnoozeAdded(prev => prev + baseSnoozeMinutes);
              }}
              style={({ pressed }) => [{
                paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1,
                borderColor: colors.border, backgroundColor: colors.surface,
                alignItems: 'center', justifyContent: 'center',
                opacity: pressed ? 0.7 : 1,
              }]}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.muted }}>+{baseSnoozeMinutes}m</Text>
            </Pressable>
          </View>
        )}

        <Pressable
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setSubmitted(true);
          }}
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
            {allRated ? 'Save Review (Preview)' : `Rate all habits (${ratedEntries.length}/${totalActive})`}
          </Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  alarmBanner: {
    paddingVertical: 10, paddingHorizontal: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  alarmBannerText: {
    color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'center',
  },
  previewLabel: {
    paddingVertical: 5, paddingHorizontal: 16,
    alignItems: 'center',
  },
  previewLabelText: {
    color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600', letterSpacing: 0.5,
  },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  dateRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  dateLabelWrap: { alignItems: 'center', minWidth: 140 },
  dateLabel: { fontSize: 15, fontWeight: '700' },
  dateSub: { fontSize: 11, marginTop: 1 },

  progressTrack: { height: 2 },
  progressFill: { height: 2, borderRadius: 1 },

  legendRow: {
    flexDirection: 'row', justifyContent: 'center', gap: 20,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { fontSize: 12, fontWeight: '500' },

  scroll: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 , flexGrow: 1 },

  section: { marginBottom: 18 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },

  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },

  habitRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 13, gap: 12,
  },
  habitNameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, flex: 1 },
  habitNumBadge: {
    width: 26, height: 26, borderRadius: 7, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  habitNumText: { fontSize: 12, fontWeight: '700' },
  habitName: { fontSize: 15, lineHeight: 20, flex: 1 },

  segmentedBtn: {
    flexDirection: 'row',
    borderRadius: 11,
    overflow: 'hidden',
    gap: 2,
    padding: 2,
  },
  segment: { width: 36, height: 34, borderRadius: 8 },
  segmentFirst: { borderTopLeftRadius: 9, borderBottomLeftRadius: 9 },
  segmentLast:  { borderTopRightRadius: 9, borderBottomRightRadius: 9 },
  segmentSmall: { width: 28, height: 26 },

  rateAllRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rateAllLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },

  footer: {
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 20,
    borderTopWidth: StyleSheet.hairlineWidth, gap: 10,
  },
  tally: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  tallyPill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  tallyText: { fontSize: 12, fontWeight: '700' },
  tallyOf: { fontSize: 12, fontWeight: '500', marginLeft: 2 },

  snoozeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 11, borderRadius: 12, borderWidth: 1,
  },
  snoozeBtnText: { fontSize: 14, fontWeight: '600' },

  saveBtn: {
    paddingVertical: 15, borderRadius: 14, alignItems: 'center',
  },
  saveBtnText: { fontSize: 16, fontWeight: '700' },

  // Submitted screen styles
  successScroll: { flexGrow: 1, paddingBottom: 40 },
  successContainer: { flex: 1, alignItems: 'center', paddingHorizontal: 20, paddingTop: 40, gap: 16 },
  successTitle: { fontSize: 28, fontWeight: '800', textAlign: 'center' },
  successDate: { fontSize: 14, fontWeight: '500' },
  successScoreWrap: {
    borderRadius: 20, borderWidth: 1.5,
    paddingHorizontal: 28, paddingVertical: 14, alignItems: 'center',
  },
  successScore: { fontSize: 48, fontWeight: '900', lineHeight: 54 },
  successScoreLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  successPills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  successPill: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  successPillText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  practiceCard: {
    width: '100%', borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
    padding: 16, gap: 12,
  },
  practiceTitle: { fontSize: 17, fontWeight: '800' },
  practiceDesc: { fontSize: 13, fontWeight: '500', marginTop: -6 },
  typeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },

  doneBtn: { borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40, alignItems: 'center', marginTop: 8 },
  doneBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
