/**
 * "You" Tab Screen
 * Three sub-tabs: Analytics | Vision Board | Rewards
 * Gear icon (top-right) navigates to the full Settings screen.
 */
import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  View, Text, Pressable, StyleSheet, Platform, ScrollView,
  TouchableOpacity, Modal, FlatList, Alert, Image, Dimensions,
  TextInput, KeyboardAvoidingView, Animated,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenContainer } from "@/components/screen-container";
import { useApp } from "@/lib/app-context";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { CategoryIcon } from "@/components/category-icon";
import { useIsCalm } from "@/components/calm-effects";
import { useIsNova } from "@/components/nova-effects";
import { Habit, LIFE_AREAS, loadVisionBoard, saveVisionBoard, VisionBoard, loadVisionMotivations, saveVisionMotivations, VisionMotivations } from "@/lib/storage";
import Svg, { Circle } from "react-native-svg";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useContentMaxWidth } from "@/hooks/use-is-ipad";
import { formatDisplayDate } from "@/lib/storage";

const LIFE_AREA_MAP = Object.fromEntries(LIFE_AREAS.map((a) => [a.id, a]));

// ── Ring sizes ────────────────────────────────────────────────────────────────
const RING_SIZE = 60;
const RING_SIZE_SM = 48;
const DOT_SIZE_LG = 44;
const DOT_SIZE_SM = 36;

// ── Carousel dimensions ───────────────────────────────────────────────────────
const { width: SCREEN_W } = Dimensions.get("window");
const PADDING = 20;
const CARD_W = SCREEN_W - PADDING * 2;
const CAROUSEL_H = Math.floor(CARD_W * 0.62);

// ─── Copy a URI to permanent app storage ─────────────────────────────────────
async function persistUri(uri: string): Promise<string | null> {
  if (Platform.OS === "web") return uri;
  const docDir = FileSystem.documentDirectory ?? "";
  if (uri.startsWith(docDir)) {
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists) return uri;
    } catch { /* fall through */ }
    return null;
  }
  let resolvedUri: string | null = null;
  if (Platform.OS === "ios" && uri.startsWith("ph://")) {
    try {
      const assetId = uri.replace("ph://", "").split("/")[0];
      const assetInfo = await MediaLibrary.getAssetInfoAsync(assetId);
      if (assetInfo?.localUri) resolvedUri = assetInfo.localUri;
    } catch { return null; }
    if (!resolvedUri) return null;
  } else {
    resolvedUri = uri;
  }
  try {
    const ext = resolvedUri.split(".").pop()?.split("?")[0] ?? "jpg";
    const dest = `${docDir}vision_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    await FileSystem.copyAsync({ from: resolvedUri, to: dest });
    return dest;
  } catch { return null; }
}

// ── CircleRing ────────────────────────────────────────────────────────────────
function CircleRing({ done, goal, size = RING_SIZE, periodLabel }: {
  done: number; goal: number; size?: number; periodLabel?: string;
}) {
  const pct = goal > 0 ? Math.min(done / goal, 1) : 0;
  const hit = goal > 0 && done >= goal;
  const ringColor = hit ? '#22C55E' : pct >= 0.6 ? '#F59E0B' : pct > 0 ? '#EF4444' : '#334155';
  const textColor = hit ? '#22C55E' : pct >= 0.6 ? '#F59E0B' : pct > 0 ? '#EF4444' : '#9BA1A6';
  const strokeWidth = size <= 24 ? 2.5 : size <= 48 ? 4 : 5;
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const dash = pct * circumference;
  const gap = circumference - dash;
  const fractionText = goal > 0 ? `${done}/${goal}` : '—';
  const fractionFontSize = size <= 24 ? 7 : size <= 48 ? 12 : 14;
  return (
    <View style={{ alignItems: 'center', gap: 3 }}>
      {periodLabel && (
        <Text style={{ fontSize: size <= 48 ? 10 : 11, color: '#9BA1A6', textAlign: 'center' }}>{periodLabel}</Text>
      )}
      <View style={{ width: size, height: size, position: 'relative' }}>
        <Svg width={size} height={size}>
          <Circle cx={cx} cy={cy} r={r} stroke="#334155" strokeWidth={strokeWidth} fill="none" />
          {pct > 0 && (
            <Circle
              cx={cx} cy={cy} r={r}
              stroke={ringColor} strokeWidth={strokeWidth} fill="none"
              strokeDasharray={`${dash} ${gap}`}
              strokeLinecap="round"
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          )}
        </Svg>
        <View style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={{ fontSize: fractionFontSize, fontWeight: '700', color: textColor }}>{fractionText}</Text>
        </View>
      </View>
    </View>
  );
}

// ── HabitPillDots (Calm mode) ─────────────────────────────────────────────────
function HabitPillDots({ p0Done, p1Done, p2Done, goal, p0Label, p1Label, p2Label }: {
  p0Done: number; p1Done: number; p2Done: number; goal: number;
  p0Label: string; p1Label: string; p2Label: string;
}) {
  function dotColor(done: number, g: number) {
    if (g <= 0 || done <= 0) return '#1E2A4A';
    const pct = done / g;
    if (pct >= 0.8) return '#22C55E';
    if (pct >= 0.5) return '#F59E0B';
    return '#EF4444';
  }
  function splitLabel(label: string) {
    const parts = label.toUpperCase().split(' ');
    if (parts.length === 1) return { top: '', bottom: parts[0] };
    if (parts[0] === 'THIS') return { top: 'THIS', bottom: parts[1] };
    if (parts[0] === 'LAST') return { top: 'LAST', bottom: parts[1] };
    return { top: parts.slice(0, -1).join(' '), bottom: parts[parts.length - 1] };
  }
  const dots = [
    { done: p0Done, label: p0Label, isCurrent: false, size: DOT_SIZE_SM },
    { done: p1Done, label: p1Label, isCurrent: false, size: DOT_SIZE_SM },
    { done: p2Done, label: p2Label, isCurrent: true, size: DOT_SIZE_LG },
  ];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {dots.map(({ done, label, isCurrent, size }, i) => {
        const bg = dotColor(done, goal);
        const fg = goal > 0 && done > 0 ? '#FFFFFF' : '#4A5A7A';
        const fraction = goal > 0 ? `${done}/${goal}` : '—';
        const { top, bottom } = splitLabel(label);
        const labelColor = isCurrent ? '#FFFFFF' : '#5A6A8A';
        const labelSize = 7;
        return (
          <View key={i} style={{ alignItems: 'center', gap: 2 }}>
            <Text style={{ fontSize: labelSize, fontWeight: isCurrent ? '700' : '400', color: labelColor, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center', width: size + 4 }}>{top}</Text>
            <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: isCurrent ? 11 : 9, fontWeight: '700', color: fg, textAlign: 'center' }}>{fraction}</Text>
            </View>
            <Text style={{ fontSize: labelSize, fontWeight: isCurrent ? '700' : '400', color: labelColor, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center', width: size + 4 }}>{bottom}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ── HabitGoalRow ──────────────────────────────────────────────────────────────
function HabitGoalRow({ habit, colors, onPress, isCalm = false }: {
  habit: Habit;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
  isCalm?: boolean;
}) {
  const { getHabitWeeklyDone, getHabitMonthlyDone, getHabitLastWeekDone, getHabitLastMonthDone, getHabitWeekBeforeDone, getHabitMonthBeforeDone } = useApp();
  const isMonthly = habit.frequencyType === 'monthly';
  const goal = isMonthly ? (habit.monthlyGoal ?? 0) : (habit.weeklyGoal ?? 0);
  const p0Done = isMonthly ? getHabitMonthBeforeDone(habit.id) : getHabitWeekBeforeDone(habit.id);
  const p1Done = isMonthly ? getHabitLastMonthDone(habit.id) : getHabitLastWeekDone(habit.id);
  const p2Done = isMonthly ? getHabitMonthlyDone(habit.id) : getHabitWeeklyDone(habit.id);
  const p0Label = isMonthly ? '2 Mo Ago' : '2 Wks';
  const p1Label = isMonthly ? 'Last Mo' : 'Last Wk';
  const p2Label = isMonthly ? 'This Mo' : 'This Wk';
  return (
    <TouchableOpacity onPress={onPress} style={[aStyles.habitRow, { borderTopColor: colors.border }]} activeOpacity={0.7}>
      <Text style={[aStyles.habitName, { color: colors.foreground }]}>{habit.name}</Text>
      <View style={aStyles.habitRight}>
        {goal > 0 ? (
          isCalm ? (
            <HabitPillDots p0Done={p0Done} p1Done={p1Done} p2Done={p2Done} goal={goal} p0Label={p0Label} p1Label={p1Label} p2Label={p2Label} />
          ) : (
            <View style={aStyles.ringTriple}>
              <CircleRing done={p0Done} goal={goal} size={RING_SIZE_SM} periodLabel={p0Label} />
              <View style={[aStyles.ringDivider, { backgroundColor: colors.border }]} />
              <CircleRing done={p1Done} goal={goal} size={RING_SIZE_SM} periodLabel={p1Label} />
              <View style={[aStyles.ringDivider, { backgroundColor: colors.border }]} />
              <CircleRing done={p2Done} goal={goal} size={RING_SIZE} periodLabel={p2Label} />
            </View>
          )
        ) : (
          <Text style={[aStyles.noGoalText, { color: colors.muted }]}>{isMonthly ? 'No monthly goal' : 'No weekly goal'}</Text>
        )}
        <IconSymbol name="chevron.right" size={13} color={colors.muted} />
      </View>
    </TouchableOpacity>
  );
}

// ── GoalCard ──────────────────────────────────────────────────────────────────
function GoalCard({ cat, habits, rate, colors, onPressGoal, onPressHabit, isCalm = false }: {
  cat: import('@/lib/storage').CategoryDef;
  habits: Habit[];
  rate: number;
  colors: ReturnType<typeof useColors>;
  onPressGoal: () => void;
  onPressHabit: (habitId: string) => void;
  isCalm?: boolean;
}) {
  const pct = Math.min(Math.max(rate, 0), 1);
  const isOnTrack = pct >= 0.8;
  const isOkay = pct >= 0.5 && pct < 0.8;
  const isBehind = pct > 0 && pct < 0.5;
  const accentColor = isOnTrack ? '#22C55E' : isOkay ? '#F59E0B' : isBehind ? '#EF4444' : colors.muted as string;
  const lifeAreaDef = cat.lifeArea ? LIFE_AREA_MAP[cat.lifeArea] : null;
  let deadlineLabel = '';
  let deadlineColor = colors.muted;
  if (cat.deadline) {
    const dl = new Date(cat.deadline + 'T12:00:00');
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const days = Math.ceil((dl.getTime() - now.getTime()) / 86400000);
    deadlineLabel = days < 0 ? 'Overdue' : days === 0 ? 'Due today' : `${days}d left`;
    deadlineColor = days < 0 ? '#EF4444' : days <= 7 ? '#F59E0B' : '#6b7280';
  }
  return (
    <View style={[aStyles.goalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <TouchableOpacity onPress={onPressGoal} style={aStyles.goalCardHeader} activeOpacity={0.8}>
        <CategoryIcon categoryId={cat.id} lifeArea={cat.lifeArea} size={20} color={accentColor} bgColor={accentColor + '22'} bgSize={38} borderRadius={10} />
        <View style={{ flex: 1 }}>
          <Text style={[aStyles.goalCardTitle, { color: colors.foreground }]} numberOfLines={1}>{cat.label}</Text>
          {lifeAreaDef && <Text style={[aStyles.goalCardLifeArea, { color: accentColor + 'bb' }]}>{lifeAreaDef.label}</Text>}
        </View>
        {deadlineLabel ? (
          <View style={[aStyles.deadlineTag, { borderColor: deadlineColor + '55', backgroundColor: deadlineColor + '18' }]}>
            <Text style={[aStyles.deadlineText, { color: deadlineColor }]}>{deadlineLabel}</Text>
          </View>
        ) : null}
        <IconSymbol name="chevron.right" size={14} color={accentColor + '88'} />
      </TouchableOpacity>
      <View style={[aStyles.goalCardDivider, { backgroundColor: accentColor + '25' }]} />
      {habits.length === 0 ? (
        <Text style={[aStyles.noHabitsText, { color: colors.muted }]}>No habits yet</Text>
      ) : (
        habits.map((h) => (
          <HabitGoalRow key={h.id} habit={h} colors={colors} onPress={() => onPressHabit(h.id)} isCalm={isCalm} />
        ))
      )}
    </View>
  );
}

// ── Analytics Tab ─────────────────────────────────────────────────────────────
function AnalyticsTab() {
  const colors = useColors();
  const isCalm = useIsCalm();
  const isNova = useIsNova();
  const router = useRouter();
  const [showLegend, setShowLegend] = useState(false);
  const { categories, activeHabits, getCategoryRate } = useApp();
  const sortedCategories = useMemo(() => [...categories].sort((a, b) => a.order - b.order), [categories]);
  const rateRange = 7;
  const bgColor = isNova ? '#050510' : isCalm ? '#0D1135' : colors.background;

  return (
    <ScrollView
      contentContainerStyle={[aStyles.scroll, { backgroundColor: bgColor }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Legend modal */}
      <Modal visible={showLegend} transparent animationType="fade" onRequestClose={() => setShowLegend(false)}>
        <Pressable style={aStyles.legendOverlay} onPress={() => setShowLegend(false)}>
          <View style={[aStyles.legendModal, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[aStyles.legendModalTitle, { color: colors.foreground }]}>Ring Colors</Text>
            {(['#22C55E', '#F59E0B', '#EF4444'] as const).map((c, i) => (
              <View key={c} style={aStyles.legendItem}>
                <View style={[aStyles.legendDot, { backgroundColor: c }]} />
                <Text style={[aStyles.legendText, { color: colors.muted }]}>
                  {i === 0 ? 'Hit — goal reached' : i === 1 ? 'On Track — ≥60% of goal' : 'Behind — <60% of goal'}
                </Text>
              </View>
            ))}
            <View style={aStyles.legendItem}>
              <IconSymbol name="crown.fill" size={11} color="#FFD700" />
              <Text style={[aStyles.legendText, { color: colors.muted }]}>Last period hit</Text>
            </View>
            <Text style={[aStyles.legendHint, { color: colors.muted }]}>
              Rings: left = 2 periods ago, middle = last period, right = current period
            </Text>
          </View>
        </Pressable>
      </Modal>

      {/* Legend info button row */}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 }}>
        <Pressable
          onPress={() => setShowLegend(true)}
          style={({ pressed }) => [aStyles.legendInfoBtn, { borderColor: isCalm ? '#252D6E' : colors.border, backgroundColor: isCalm ? '#1A2050' : colors.surface, opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[aStyles.legendInfoBtnText, { color: isCalm ? '#8B9CC8' : colors.muted }]}>?</Text>
        </Pressable>
      </View>

      {sortedCategories.length === 0 ? (
        <View style={[aStyles.emptyState, { borderColor: colors.border }]}>
          <Text style={[aStyles.emptyText, { color: colors.muted }]}>No goals yet — add one in Manage Habits</Text>
        </View>
      ) : (
        <View style={aStyles.goalList}>
          {sortedCategories.map((cat) => {
            const catHabits = activeHabits.filter((h) => h.category === cat.id);
            return (
              <GoalCard
                key={cat.id}
                cat={cat}
                habits={catHabits}
                rate={getCategoryRate(cat.id, rateRange)}
                colors={colors}
                onPressGoal={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push((`/category-detail?categoryId=${cat.id}`) as never);
                }}
                onPressHabit={(habitId) => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push((`/habit-detail?habitId=${habitId}`) as never);
                }}
                isCalm={isCalm}
              />
            );
          })}
        </View>
      )}

      <Pressable
        onPress={() => router.push('/habits' as never)}
        style={({ pressed }) => [aStyles.manageBtn, { backgroundColor: isCalm ? '#1A2050' : colors.surface, borderColor: isCalm ? '#252D6E' : colors.border, opacity: pressed ? 0.7 : 1 }]}
      >
        <IconSymbol name="plus.circle.fill" size={18} color={isCalm ? '#F5A623' : colors.primary} />
        <Text style={[aStyles.manageBtnText, { color: isCalm ? '#F5A623' : colors.primary }]}>Manage Habits</Text>
      </Pressable>
    </ScrollView>
  );
}

// ─── Photo Carousel ───────────────────────────────────────────────────────────
function PhotoCarousel({ uris, height, onPhotoPress }: {
  uris: string[]; height: number; onPhotoPress?: (uri: string, index: number) => void;
}) {
  const [index, setIndex] = useState(0);
  const flatRef = useRef<FlatList>(null);
  if (uris.length === 0) return null;
  return (
    <View style={{ height, borderRadius: 12, overflow: "hidden" }}>
      <FlatList
        ref={flatRef}
        data={uris}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(u, i) => `${u}-${i}`}
        onMomentumScrollEnd={(e) => {
          const newIdx = Math.round(e.nativeEvent.contentOffset.x / CARD_W);
          setIndex(newIdx);
        }}
        renderItem={({ item, index: i }) => (
          <Pressable
            onPress={() => onPhotoPress?.(item, i)}
            style={({ pressed }) => [{ width: CARD_W, height, opacity: pressed ? 0.9 : 1 }]}
          >
            <Image source={{ uri: item }} style={{ width: CARD_W, height }} resizeMode="cover" />
          </Pressable>
        )}
      />
      {uris.length > 1 && (
        <View style={vStyles.dotRow}>
          {uris.map((_, i) => (
            <View key={i} style={[vStyles.dot, { backgroundColor: i === index ? "#fff" : "rgba(255,255,255,0.45)", width: i === index ? 16 : 6 }]} />
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Goal Detail Modal ────────────────────────────────────────────────────────
function GoalDetailModal({
  visible, cat, images, motivations, onClose, onAddPhoto, onRemovePhoto,
  onAddMotivation, onEditMotivation, onDeleteMotivation, colors,
}: {
  visible: boolean;
  cat: { id: string; label: string; emoji: string; lifeArea?: string; deadline?: string };
  images: string[];
  motivations: string[];
  onClose: () => void;
  onAddPhoto: () => void;
  onRemovePhoto: (uri: string) => void;
  onAddMotivation: (text: string) => void;
  onEditMotivation: (index: number, text: string) => void;
  onDeleteMotivation: (index: number) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const [newText, setNewText] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [photoIndex, setPhotoIndex] = useState(0);
  const flatRef = useRef<FlatList>(null);

  function submitNew() {
    const t = newText.trim();
    if (!t) return;
    onAddMotivation(t);
    setNewText("");
  }
  function startEdit(i: number) { setEditingIndex(i); setEditText(motivations[i]); }
  function submitEdit() {
    if (editingIndex === null) return;
    const t = editText.trim();
    if (t) onEditMotivation(editingIndex, t);
    setEditingIndex(null); setEditText("");
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={[dStyles.header, { borderBottomColor: colors.border }]}>
          <CategoryIcon categoryId={cat.id} lifeArea={cat.lifeArea} size={22} color={colors.primary} bgColor={colors.primary + '22'} bgSize={44} borderRadius={12} />
          <Text style={[dStyles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>{cat.label}</Text>
          <Pressable onPress={onClose} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 4 })}>
            <IconSymbol name="xmark.circle.fill" size={26} color={colors.muted} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={dStyles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text style={[dStyles.sectionLabel, { color: colors.muted }]}>WHY THIS MATTERS</Text>
          {motivations.length === 0 && <Text style={[dStyles.emptyMotive, { color: colors.muted }]}>Add your reasons below — why is this goal important to you?</Text>}
          {motivations.map((m, i) => (
            <View key={i} style={[dStyles.motiveRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              {editingIndex === i ? (
                <TextInput style={[dStyles.motiveEditInput, { color: colors.foreground, borderColor: colors.primary }]} value={editText} onChangeText={setEditText} onSubmitEditing={submitEdit} onBlur={submitEdit} returnKeyType="done" autoFocus multiline />
              ) : (
                <Pressable onPress={() => startEdit(i)} style={{ flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                  <Text style={[dStyles.motiveBullet, { color: colors.primary }]}>•</Text>
                  <Text style={[dStyles.motiveText, { color: colors.foreground }]}>{m}</Text>
                </Pressable>
              )}
              {editingIndex !== i && (
                <Pressable onPress={() => onDeleteMotivation(i)} style={({ pressed }) => [dStyles.deleteBtn, { opacity: pressed ? 0.5 : 1 }]}>
                  <IconSymbol name="trash.fill" size={14} color="#EF4444" />
                </Pressable>
              )}
            </View>
          ))}
          <View style={[dStyles.addMotiveRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <TextInput style={[dStyles.addMotiveInput, { color: colors.foreground }]} placeholder="Add a reason this goal matters..." placeholderTextColor={colors.muted} value={newText} onChangeText={setNewText} returnKeyType="done" onSubmitEditing={submitNew} multiline={false} />
            <Pressable onPress={submitNew} style={({ pressed }) => [dStyles.addMotiveBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}>
              <IconSymbol name="plus" size={16} color="#fff" />
            </Pressable>
          </View>
          <View style={dStyles.photoHeader}>
            <Text style={[dStyles.sectionLabel, { color: colors.muted }]}>PHOTOS</Text>
            <Pressable onPress={onAddPhoto} style={({ pressed }) => [dStyles.addPhotoBtn, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "44", opacity: pressed ? 0.7 : 1 }]}>
              <IconSymbol name="plus" size={13} color={colors.primary} />
              <Text style={[dStyles.addPhotoBtnText, { color: colors.primary }]}>Add Photos</Text>
            </Pressable>
          </View>
          {images.length === 0 ? (
            <Pressable onPress={onAddPhoto} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, paddingVertical: 8 })}>
              <Text style={[dStyles.emptyMotive, { color: colors.primary }]}>+ Add your first photo</Text>
            </Pressable>
          ) : (
            <>
              <View style={{ borderRadius: 14, overflow: "hidden", marginBottom: 12 }}>
                <FlatList ref={flatRef} data={images} horizontal pagingEnabled showsHorizontalScrollIndicator={false} keyExtractor={(u, i) => `detail-${u}-${i}`}
                  onMomentumScrollEnd={(e) => { const newIdx = Math.round(e.nativeEvent.contentOffset.x / (SCREEN_W - PADDING * 2)); setPhotoIndex(newIdx); }}
                  renderItem={({ item }) => <Image source={{ uri: item }} style={{ width: SCREEN_W - PADDING * 2, height: Math.floor((SCREEN_W - PADDING * 2) * 0.75) }} resizeMode="cover" />}
                />
                {images.length > 1 && (
                  <View style={vStyles.dotRow}>
                    {images.map((_, i) => <View key={i} style={[vStyles.dot, { backgroundColor: i === photoIndex ? "#fff" : "rgba(255,255,255,0.45)", width: i === photoIndex ? 16 : 6 }]} />)}
                  </View>
                )}
              </View>
              <View style={dStyles.thumbStrip}>
                {images.map((uri, i) => (
                  <View key={`thumb-${i}`} style={dStyles.thumbWrap}>
                    <Image source={{ uri }} style={dStyles.thumb} resizeMode="cover" />
                    <Pressable onPress={() => Alert.alert("Remove Photo", "Remove this photo?", [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: () => onRemovePhoto(uri) }])} style={dStyles.thumbDelete}>
                      <IconSymbol name="xmark.circle.fill" size={18} color="#fff" />
                    </Pressable>
                  </View>
                ))}
              </View>
            </>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Vision Board Tab ─────────────────────────────────────────────────────────
function VisionBoardTab() {
  const { categories, isDemoMode } = useApp();
  const colors = useColors();
  const maxWidth = useContentMaxWidth();
  const sortedCategories = [...categories].sort((a, b) => a.order - b.order);
  const [board, setBoard] = useState<VisionBoard>({});
  const [motivations, setMotivations] = useState<VisionMotivations>({});
  const [detailCatId, setDetailCatId] = useState<string | null>(null);

  useEffect(() => {
    loadVisionBoard().then(async (loaded) => {
      if (Platform.OS !== "web") {
        const docDir = FileSystem.documentDirectory ?? "";
        let needsSave = false;
        const cleaned: VisionBoard = {};
        for (const [catId, uris] of Object.entries(loaded)) {
          const valid: string[] = [];
          for (const uri of uris) {
            if (uri.startsWith(docDir)) {
              try {
                const info = await FileSystem.getInfoAsync(uri);
                if (info.exists) valid.push(uri); else needsSave = true;
              } catch { needsSave = true; }
            } else { needsSave = true; }
          }
          cleaned[catId] = valid;
        }
        setBoard(cleaned);
        if (needsSave) await saveVisionBoard(cleaned);
      } else { setBoard(loaded); }
    });
    loadVisionMotivations().then(setMotivations);
  }, [isDemoMode]);

  async function updateBoard(newBoard: VisionBoard) { setBoard(newBoard); await saveVisionBoard(newBoard); }
  async function updateMotivations(newMot: VisionMotivations) { setMotivations(newMot); await saveVisionMotivations(newMot); }

  const pickImage = useCallback(async (catId: string) => {
    if (Platform.OS !== "web") {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") { Alert.alert("Permission needed", "Please allow access to your photo library."); return; }
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, quality: 0.8, selectionLimit: 10 });
    if (!result.canceled && result.assets.length > 0) {
      const results = await Promise.all(result.assets.map((a) => persistUri(a.uri)));
      const persistedUris = results.filter((u): u is string => u !== null);
      if (persistedUris.length === 0) { Alert.alert("Could not save photos", "Unable to copy photos to app storage. Please try again."); return; }
      const existing = board[catId] ?? [];
      const updated = { ...board, [catId]: [...existing, ...persistedUris] };
      await updateBoard(updated);
      if (persistedUris.length < result.assets.length) Alert.alert("Some photos skipped", `${result.assets.length - persistedUris.length} photo(s) could not be saved and were skipped.`);
    }
  }, [board]);

  const removeImage = useCallback(async (catId: string, uri: string) => {
    const existing = board[catId] ?? [];
    const updated = { ...board, [catId]: existing.filter((u) => u !== uri) };
    await updateBoard(updated);
    if (Platform.OS !== "web" && uri.startsWith(FileSystem.documentDirectory ?? "")) {
      try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch { /* ignore */ }
    }
  }, [board]);

  const detailCat = detailCatId ? sortedCategories.find((c) => c.id === detailCatId) : null;

  return (
    <ScrollView contentContainerStyle={vStyles.scroll} showsVerticalScrollIndicator={false}>
      <View style={maxWidth ? { maxWidth, alignSelf: 'center', width: '100%' } : undefined}>
        <Text style={[vStyles.pageSubtitle, { color: colors.muted }]}>Tap a goal to add photos and reasons. Swipe photos to browse.</Text>
        {sortedCategories.map((cat) => {
          const images = board[cat.id] ?? [];
          const catMotivations = motivations[cat.id] ?? [];
          let deadlineLabel: string | null = null;
          let deadlineColor = colors.muted;
          if (cat.deadline) {
            const dl = new Date(cat.deadline + "T12:00:00");
            const now = new Date(); now.setHours(0, 0, 0, 0);
            const diffDays = Math.ceil((dl.getTime() - now.getTime()) / 86400000);
            deadlineLabel = diffDays < 0 ? "Overdue" : diffDays === 0 ? "Due today" : `${diffDays}d left`;
            deadlineColor = diffDays < 0 ? "#EF4444" : diffDays <= 7 ? "#F59E0B" : colors.muted;
          }
          return (
            <View key={cat.id} style={[vStyles.catSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Pressable onPress={() => setDetailCatId(cat.id)} style={({ pressed }) => [vStyles.catHeader, { opacity: pressed ? 0.75 : 1 }]}>
                <CategoryIcon categoryId={cat.id} lifeArea={cat.lifeArea} size={20} color={colors.primary} bgColor={colors.primary + '18'} bgSize={40} borderRadius={10} />
                <View style={{ flex: 1 }}>
                  <Text style={[vStyles.catLabel, { color: colors.foreground }]}>{cat.label}</Text>
                  {deadlineLabel && <Text style={[vStyles.visionDeadline, { color: deadlineColor }]}>{deadlineLabel}</Text>}
                </View>
                <View style={vStyles.headerRight}>
                  <Pressable onPress={() => pickImage(cat.id)} style={({ pressed }) => [vStyles.addBtn, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "44", opacity: pressed ? 0.7 : 1 }]}>
                    <IconSymbol name="plus" size={13} color={colors.primary} />
                    <Text style={[vStyles.addBtnText, { color: colors.primary }]}>Photos</Text>
                  </Pressable>
                  <IconSymbol name="chevron.right" size={16} color={colors.muted} />
                </View>
              </Pressable>
              {catMotivations.length > 0 && (
                <Pressable onPress={() => setDetailCatId(cat.id)} style={[vStyles.motivationsPreview, { borderTopColor: colors.border }]}>
                  <Text style={[vStyles.motiveSectionLabel, { color: colors.muted }]}>WHY THIS MATTERS</Text>
                  {catMotivations.slice(0, 3).map((m, i) => (
                    <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 4 }}>
                      <Text style={[vStyles.motiveBullet, { color: colors.primary }]}>•</Text>
                      <Text style={[vStyles.motiveText, { color: colors.foreground }]} numberOfLines={2}>{m}</Text>
                    </View>
                  ))}
                  {catMotivations.length > 3 && <Text style={[vStyles.moreText, { color: colors.primary }]}>+{catMotivations.length - 3} more reasons →</Text>}
                </Pressable>
              )}
              {images.length > 0 && (
                <View style={{ marginTop: 8 }}>
                  <PhotoCarousel uris={images} height={CAROUSEL_H} onPhotoPress={() => setDetailCatId(cat.id)} />
                </View>
              )}
              {images.length === 0 && catMotivations.length === 0 && (
                <Pressable onPress={() => setDetailCatId(cat.id)} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, paddingTop: 6, paddingBottom: 4 })}>
                  <Text style={[vStyles.emptyText, { color: colors.primary }]}>Tap to add photos and reasons →</Text>
                </Pressable>
              )}
            </View>
          );
        })}
        <View style={{ height: 40 }} />
      </View>
      {detailCat && (
        <GoalDetailModal
          visible={detailCatId !== null}
          cat={detailCat}
          images={board[detailCat.id] ?? []}
          motivations={motivations[detailCat.id] ?? []}
          onClose={() => setDetailCatId(null)}
          onAddPhoto={() => pickImage(detailCat.id)}
          onRemovePhoto={(uri) => removeImage(detailCat.id, uri)}
          onAddMotivation={(text) => { const catMot = motivations[detailCat.id] ?? []; updateMotivations({ ...motivations, [detailCat.id]: [...catMot, text] }); }}
          onEditMotivation={(index, text) => { const catMot = [...(motivations[detailCat.id] ?? [])]; catMot[index] = text; updateMotivations({ ...motivations, [detailCat.id]: catMot }); }}
          onDeleteMotivation={(index) => { const catMot = (motivations[detailCat.id] ?? []).filter((_, i) => i !== index); updateMotivations({ ...motivations, [detailCat.id]: catMot }); }}
          colors={colors}
        />
      )}
    </ScrollView>
  );
}

// ─── Rewards Tab ──────────────────────────────────────────────────────────────
type HabitReward = {
  habitId: string; habitName: string; habitEmoji: string;
  rewardName: string; rewardEmoji: string; rewardImageUri?: string;
  rewardDescription?: string; frequencyType: "weekly" | "monthly";
  goal: number; currentCount: number; progress: number;
  isUnlocked: boolean; claimedAt?: string; periodKey: string;
};
type ClaimRecord = { habitId: string; periodKey: string; claimedAt: string };
type Particle = { id: number; x: Animated.Value; y: Animated.Value; rot: Animated.Value; color: string; size: number };

const CLAIMED_KEY = "habit_reward_claims_v1";
const CONFETTI_COLORS = ["#22C55E", "#F59E0B", "#3B82F6", "#EC4899", "#A855F7", "#EF4444", "#FBBF24"];

function getPeriodKey(frequencyType: "weekly" | "monthly"): string {
  const now = new Date();
  if (frequencyType === "monthly") return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function ProgressBar({ progress, color }: { progress: number; color: string }) {
  const pct = Math.min(Math.max(progress, 0), 1);
  return (
    <View style={rStyles.progressTrack}>
      <View style={[rStyles.progressFill, { width: `${pct * 100}%` as any, backgroundColor: color }]} />
    </View>
  );
}

function HabitRewardCard({ item, onClaim, onUnclaim, colors }: {
  item: HabitReward; onClaim: () => void; onUnclaim: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const accent = item.isUnlocked ? "#22C55E" : colors.primary;
  const isClaimed = !!item.claimedAt;
  const remaining = Math.max(0, item.goal - item.currentCount);
  return (
    <View style={[rStyles.card, { backgroundColor: colors.surface, borderColor: isClaimed ? "#22C55E" : item.isUnlocked ? "#22C55E" : colors.border, borderWidth: isClaimed || item.isUnlocked ? 1.5 : 1 }]}>
      <View style={rStyles.cardHeader}>
        <View style={[rStyles.emojiCircle, { backgroundColor: accent + "22", overflow: 'hidden' }]}>
          {item.rewardImageUri ? (
            <Image source={{ uri: item.rewardImageUri }} style={{ width: 44, height: 44, borderRadius: 22 }} />
          ) : (
            <Text style={rStyles.emojiText}>{item.rewardEmoji}</Text>
          )}
        </View>
        <View style={rStyles.cardTitleBlock}>
          <Text style={[rStyles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>{item.rewardName}</Text>
          <Text style={[rStyles.cardHabit, { color: colors.muted }]} numberOfLines={1}>{item.habitName} · {item.frequencyType === "weekly" ? "Weekly" : "Monthly"} goal</Text>
        </View>
        {isClaimed ? (
          <View style={[rStyles.badge, { backgroundColor: "#22C55E22" }]}>
            <Text style={[rStyles.badgeText, { color: "#22C55E" }]}>Claimed ✓</Text>
          </View>
        ) : item.isUnlocked ? (
          <View style={[rStyles.badge, { backgroundColor: "#22C55E22" }]}>
            <Text style={[rStyles.badgeText, { color: "#22C55E" }]}>Unlocked!</Text>
          </View>
        ) : null}
      </View>
      {item.rewardDescription ? <Text style={[rStyles.cardDesc, { color: colors.muted }]}>{item.rewardDescription}</Text> : null}
      {!isClaimed && (
        <View style={rStyles.progressSection}>
          <ProgressBar progress={item.progress} color={accent} />
          <View style={rStyles.progressLabels}>
            <Text style={[rStyles.progressCount, { color: accent }]}>{item.currentCount}/{item.goal} {item.frequencyType === "weekly" ? "days this week" : "days this month"}</Text>
            {!item.isUnlocked && <Text style={[rStyles.progressRemaining, { color: colors.muted }]}>{remaining} to go</Text>}
          </View>
        </View>
      )}
      {isClaimed ? (
        <View style={rStyles.cardActions}>
          <Pressable style={[rStyles.actionBtn, { borderColor: colors.border }]} onPress={onUnclaim}>
            <Text style={[rStyles.actionBtnText, { color: colors.muted }]}>Unclaim</Text>
          </Pressable>
        </View>
      ) : item.isUnlocked ? (
        <View style={rStyles.cardActions}>
          <Pressable style={[rStyles.claimBtn, { backgroundColor: "#22C55E" }]} onPress={onClaim}>
            <Text style={rStyles.claimBtnText}>🎉 Claim Reward</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function RewardsTab() {
  const colors = useColors();
  const { habits, checkIns } = useApp();
  const [claims, setClaims] = React.useState<ClaimRecord[]>([]);
  const [filter, setFilter] = React.useState<"all" | "unlocked" | "claimed">("all");
  const [particles, setParticles] = React.useState<Particle[]>([]);
  const particleIdRef = React.useRef(0);

  React.useEffect(() => {
    AsyncStorage.getItem(CLAIMED_KEY).then((raw) => {
      if (raw) { try { setClaims(JSON.parse(raw)); } catch { /* ignore */ } }
    });
  }, []);

  async function saveClaims(updated: ClaimRecord[]) {
    setClaims(updated);
    await AsyncStorage.setItem(CLAIMED_KEY, JSON.stringify(updated));
  }

  const rewardItems: HabitReward[] = React.useMemo(() => {
    return habits.filter((h) => h.isActive && h.rewardName && (h.weeklyGoal || h.monthlyGoal)).map((h) => {
      const freqType = h.frequencyType ?? "weekly";
      const goal = freqType === "monthly" ? (h.monthlyGoal ?? 0) : (h.weeklyGoal ?? 0);
      const periodKey = getPeriodKey(freqType);
      const now = new Date();
      let currentCount = 0;
      if (freqType === "weekly") {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));
        startOfWeek.setHours(0, 0, 0, 0);
        currentCount = checkIns.filter((c) => { if (c.habitId !== h.id) return false; const d = new Date(c.date); return d >= startOfWeek && c.rating === "green"; }).length;
      } else {
        currentCount = checkIns.filter((c) => { if (c.habitId !== h.id) return false; const d = new Date(c.date); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && c.rating === "green"; }).length;
      }
      const isUnlocked = goal > 0 && currentCount >= goal;
      const claimRecord = claims.find((c) => c.habitId === h.id && c.periodKey === periodKey);
      return {
        habitId: h.id, habitName: h.name, habitEmoji: h.emoji ?? "⭐",
        rewardName: h.rewardName!, rewardEmoji: h.rewardEmoji ?? "🎁",
        rewardImageUri: h.rewardImageUri, rewardDescription: h.rewardDescription,
        frequencyType: freqType, goal, currentCount, progress: goal > 0 ? currentCount / goal : 0,
        isUnlocked, claimedAt: claimRecord?.claimedAt, periodKey,
      };
    });
  }, [habits, checkIns, claims]);

  const filtered = React.useMemo(() => {
    if (filter === "unlocked") return rewardItems.filter((r) => r.isUnlocked && !r.claimedAt);
    if (filter === "claimed") return rewardItems.filter((r) => !!r.claimedAt);
    return rewardItems;
  }, [rewardItems, filter]);

  const unlockedCount = rewardItems.filter((r) => r.isUnlocked && !r.claimedAt).length;
  const claimedCount = rewardItems.filter((r) => !!r.claimedAt).length;

  function launchConfetti() {
    const { width: W, height: H } = Dimensions.get("window");
    const newParticles: Particle[] = Array.from({ length: 40 }, (_, i) => {
      const id = ++particleIdRef.current;
      const x = new Animated.Value(Math.random() * W);
      const y = new Animated.Value(-20);
      const rot = new Animated.Value(0);
      const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
      const size = 8 + Math.random() * 8;
      Animated.parallel([
        Animated.timing(y, { toValue: H + 40, duration: 1500 + Math.random() * 1000, useNativeDriver: true }),
        Animated.timing(rot, { toValue: 720 + Math.random() * 360, duration: 1500 + Math.random() * 1000, useNativeDriver: true }),
      ]).start(() => setParticles((prev) => prev.filter((p) => p.id !== id)));
      return { id, x, y, rot, color, size };
    });
    setParticles((prev) => [...prev, ...newParticles]);
  }

  async function handleClaim(item: HabitReward) {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    launchConfetti();
    const updated = [...claims.filter((c) => !(c.habitId === item.habitId && c.periodKey === item.periodKey)), { habitId: item.habitId, periodKey: item.periodKey, claimedAt: new Date().toISOString() }];
    await saveClaims(updated);
  }

  async function handleUnclaim(item: HabitReward) {
    Alert.alert("Unclaim Reward", "Are you sure you want to unclaim this reward?", [
      { text: "Cancel", style: "cancel" },
      { text: "Unclaim", style: "destructive", onPress: async () => { const updated = claims.filter((c) => !(c.habitId === item.habitId && c.periodKey === item.periodKey)); await saveClaims(updated); } },
    ]);
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Confetti overlay */}
      {particles.map((p) => (
        <Animated.View key={p.id} pointerEvents="none" style={{ position: "absolute", left: p.x, width: p.size, height: p.size, borderRadius: 2, backgroundColor: p.color, zIndex: 9999, transform: [{ translateY: p.y }, { rotate: p.rot.interpolate({ inputRange: [0, 720], outputRange: ["0deg", "720deg"] }) }] }} />
      ))}
      {rewardItems.length > 0 && (
        <View style={[rStyles.filterRow, { borderBottomColor: colors.border }]}>
          {(["all", "unlocked", "claimed"] as const).map((f) => (
            <Pressable key={f} style={[rStyles.filterTab, filter === f && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]} onPress={() => setFilter(f)}>
              <Text style={[rStyles.filterTabText, { color: filter === f ? colors.primary : colors.muted }]}>
                {f === "all" ? `All (${rewardItems.length})` : f === "unlocked" ? `Unlocked (${unlockedCount})` : `Claimed (${claimedCount})`}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      {rewardItems.length === 0 ? (
        <View style={rStyles.emptyState}>
          <Text style={rStyles.emptyEmoji}>🎁</Text>
          <Text style={[rStyles.emptyTitle, { color: colors.foreground }]}>No rewards yet</Text>
          <Text style={[rStyles.emptyDesc, { color: colors.muted }]}>When you create a habit and set a weekly or monthly goal, your reward will appear here automatically.</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={rStyles.emptyState}>
          <Text style={rStyles.emptyEmoji}>{filter === "claimed" ? "🏆" : "⏳"}</Text>
          <Text style={[rStyles.emptyTitle, { color: colors.foreground }]}>{filter === "claimed" ? "No claimed rewards yet" : "No unlocked rewards yet"}</Text>
          <Text style={[rStyles.emptyDesc, { color: colors.muted }]}>{filter === "claimed" ? "Claim a reward once you've hit your goal." : "Keep going — hit your habit goal to unlock your reward."}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => `${item.habitId}-${item.periodKey}`}
          contentContainerStyle={rStyles.list}
          renderItem={({ item }) => <HabitRewardCard item={item} onClaim={() => handleClaim(item)} onUnclaim={() => handleUnclaim(item)} colors={colors} />}
        />
      )}
    </View>
  );
}

// ─── Tasks Tab ───────────────────────────────────────────────────────────────
const TASKS_KEY = '@you_tasks_v1';

interface Task {
  id: string;
  title: string;
  notes: string;
  dueDate: string | null;  // ISO date string or null
  priority: 'high' | 'medium' | 'low';
  completed: boolean;
  createdAt: string;
}

const PRIORITY_COLORS: Record<Task['priority'], string> = {
  high: '#EF4444',
  medium: '#F59E0B',
  low: '#22C55E',
};

const PRIORITY_LABELS: Record<Task['priority'], string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

function generateTaskId() {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function TasksTab() {
  const colors = useColors();
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [showAdd, setShowAdd] = React.useState(false);
  const [editingTask, setEditingTask] = React.useState<Task | null>(null);
  const [filter, setFilter] = React.useState<'all' | 'active' | 'done'>('active');

  // Form state
  const [formTitle, setFormTitle] = React.useState('');
  const [formNotes, setFormNotes] = React.useState('');
  const [formPriority, setFormPriority] = React.useState<Task['priority']>('medium');
  const [formDue, setFormDue] = React.useState('');

  React.useEffect(() => {
    AsyncStorage.getItem(TASKS_KEY).then((raw) => {
      if (raw) { try { setTasks(JSON.parse(raw)); } catch {} }
    });
  }, []);

  async function saveTasks(updated: Task[]) {
    setTasks(updated);
    await AsyncStorage.setItem(TASKS_KEY, JSON.stringify(updated));
  }

  function openAdd() {
    setEditingTask(null);
    setFormTitle('');
    setFormNotes('');
    setFormPriority('medium');
    setFormDue('');
    setShowAdd(true);
  }

  function openEdit(task: Task) {
    setEditingTask(task);
    setFormTitle(task.title);
    setFormNotes(task.notes);
    setFormPriority(task.priority);
    setFormDue(task.dueDate ?? '');
    setShowAdd(true);
  }

  async function handleSave() {
    if (!formTitle.trim()) return;
    if (editingTask) {
      const updated = tasks.map((t) =>
        t.id === editingTask.id
          ? { ...t, title: formTitle.trim(), notes: formNotes.trim(), priority: formPriority, dueDate: formDue.trim() || null }
          : t
      );
      await saveTasks(updated);
    } else {
      const newTask: Task = {
        id: generateTaskId(),
        title: formTitle.trim(),
        notes: formNotes.trim(),
        priority: formPriority,
        dueDate: formDue.trim() || null,
        completed: false,
        createdAt: new Date().toISOString(),
      };
      await saveTasks([newTask, ...tasks]);
    }
    setShowAdd(false);
  }

  async function handleToggle(task: Task) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await saveTasks(tasks.map((t) => t.id === task.id ? { ...t, completed: !t.completed } : t));
  }

  async function handleDelete(task: Task) {
    Alert.alert('Delete Task', `Delete "${task.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await saveTasks(tasks.filter((t) => t.id !== task.id)); } },
    ]);
  }

  const filtered = React.useMemo(() => {
    if (filter === 'active') return tasks.filter((t) => !t.completed);
    if (filter === 'done') return tasks.filter((t) => t.completed);
    return tasks;
  }, [tasks, filter]);

  const activeCount = tasks.filter((t) => !t.completed).length;
  const doneCount = tasks.filter((t) => t.completed).length;

  return (
    <View style={{ flex: 1 }}>
      {/* Filter row */}
      <View style={[tStyles.filterRow, { borderBottomColor: colors.border }]}>
        {(['active', 'all', 'done'] as const).map((f) => (
          <Pressable
            key={f}
            style={[tStyles.filterTab, filter === f && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setFilter(f)}
          >
            <Text style={[tStyles.filterTabText, { color: filter === f ? colors.primary : colors.muted }]}>
              {f === 'active' ? `Active (${activeCount})` : f === 'done' ? `Done (${doneCount})` : `All (${tasks.length})`}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Task list */}
      {filtered.length === 0 ? (
        <View style={tStyles.emptyState}>
          <Text style={tStyles.emptyEmoji}>{filter === 'done' ? '✅' : '📋'}</Text>
          <Text style={[tStyles.emptyTitle, { color: colors.foreground }]}>
            {filter === 'done' ? 'No completed tasks yet' : 'No tasks yet'}
          </Text>
          <Text style={[tStyles.emptyDesc, { color: colors.muted }]}>
            {filter === 'done' ? 'Complete a task to see it here.' : 'Tap + to add your first task.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={tStyles.list}
          renderItem={({ item }) => (
            <Pressable
              style={[tStyles.taskCard, { backgroundColor: colors.surface, borderColor: colors.border, opacity: item.completed ? 0.6 : 1 }]}
              onPress={() => openEdit(item)}
            >
              {/* Checkbox */}
              <Pressable
                style={[tStyles.checkbox, { borderColor: PRIORITY_COLORS[item.priority], backgroundColor: item.completed ? PRIORITY_COLORS[item.priority] : 'transparent' }]}
                onPress={(e) => { e.stopPropagation(); handleToggle(item); }}
              >
                {item.completed && <Text style={tStyles.checkmark}>✓</Text>}
              </Pressable>

              {/* Content */}
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={[tStyles.taskTitle, { color: colors.foreground, textDecorationLine: item.completed ? 'line-through' : 'none' }]}>
                  {item.title}
                </Text>
                {item.notes ? (
                  <Text style={[tStyles.taskNotes, { color: colors.muted }]} numberOfLines={2}>{item.notes}</Text>
                ) : null}
                <View style={tStyles.taskMeta}>
                  <View style={[tStyles.priorityBadge, { backgroundColor: PRIORITY_COLORS[item.priority] + '22' }]}>
                    <Text style={[tStyles.priorityText, { color: PRIORITY_COLORS[item.priority] }]}>
                      {PRIORITY_LABELS[item.priority]}
                    </Text>
                  </View>
                  {item.dueDate ? (
                    <Text style={[tStyles.dueText, { color: colors.muted }]}>Due {item.dueDate}</Text>
                  ) : null}
                </View>
              </View>

              {/* Delete */}
              <Pressable
                style={({ pressed }) => [tStyles.deleteBtn, { opacity: pressed ? 0.5 : 0.4 }]}
                onPress={(e) => { e.stopPropagation(); handleDelete(item); }}
              >
                <Text style={{ fontSize: 16, color: colors.muted }}>✕</Text>
              </Pressable>
            </Pressable>
          )}
        />
      )}

      {/* Floating add button */}
      <Pressable
        style={({ pressed }) => [tStyles.fab, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
        onPress={openAdd}
      >
        <Text style={tStyles.fabText}>+</Text>
      </Pressable>

      {/* Add/Edit Modal */}
      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[tStyles.modalContainer, { backgroundColor: colors.background }]}>
            {/* Modal header */}
            <View style={[tStyles.modalHeader, { borderBottomColor: colors.border }]}>
              <Pressable onPress={() => setShowAdd(false)} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
                <Text style={[tStyles.modalCancel, { color: colors.muted }]}>Cancel</Text>
              </Pressable>
              <Text style={[tStyles.modalTitle, { color: colors.foreground }]}>{editingTask ? 'Edit Task' : 'New Task'}</Text>
              <Pressable onPress={handleSave} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
                <Text style={[tStyles.modalSave, { color: colors.primary }]}>Save</Text>
              </Pressable>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={tStyles.modalBody} keyboardShouldPersistTaps="handled">
              {/* Title */}
              <Text style={[tStyles.fieldLabel, { color: colors.muted }]}>TASK</Text>
              <TextInput
                style={[tStyles.textInput, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
                value={formTitle}
                onChangeText={setFormTitle}
                placeholder="What needs to be done?"
                placeholderTextColor={colors.muted}
                autoFocus
                returnKeyType="next"
              />

              {/* Notes */}
              <Text style={[tStyles.fieldLabel, { color: colors.muted }]}>NOTES</Text>
              <TextInput
                style={[tStyles.textInput, tStyles.textArea, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
                value={formNotes}
                onChangeText={setFormNotes}
                placeholder="Add notes (optional)"
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              {/* Priority */}
              <Text style={[tStyles.fieldLabel, { color: colors.muted }]}>PRIORITY</Text>
              <View style={tStyles.priorityRow}>
                {(['high', 'medium', 'low'] as const).map((p) => (
                  <Pressable
                    key={p}
                    style={[tStyles.priorityChip, { borderColor: PRIORITY_COLORS[p], backgroundColor: formPriority === p ? PRIORITY_COLORS[p] + '33' : 'transparent' }]}
                    onPress={() => setFormPriority(p)}
                  >
                    <Text style={[tStyles.priorityChipText, { color: PRIORITY_COLORS[p] }]}>{PRIORITY_LABELS[p]}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Due date */}
              <Text style={[tStyles.fieldLabel, { color: colors.muted }]}>DUE DATE (optional)</Text>
              <TextInput
                style={[tStyles.textInput, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]}
                value={formDue}
                onChangeText={setFormDue}
                placeholder="e.g. Mar 30, 2026"
                placeholderTextColor={colors.muted}
                returnKeyType="done"
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const tStyles = StyleSheet.create({
  filterRow: { flexDirection: 'row', paddingHorizontal: 20, borderBottomWidth: 1 },
  filterTab: { paddingVertical: 10, paddingHorizontal: 4, marginRight: 20, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  filterTabText: { fontSize: 14, fontWeight: '500' },
  list: { padding: 16, gap: 10 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  emptyEmoji: { fontSize: 48, marginBottom: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  taskCard: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 14, borderWidth: 1, padding: 14, gap: 12 },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkmark: { fontSize: 13, color: '#fff', fontWeight: '700' },
  taskTitle: { fontSize: 15, fontWeight: '600', lineHeight: 21 },
  taskNotes: { fontSize: 13, lineHeight: 18 },
  taskMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  priorityText: { fontSize: 11, fontWeight: '700' },
  dueText: { fontSize: 12 },
  deleteBtn: { padding: 4, alignSelf: 'center' },
  fab: { position: 'absolute', bottom: 24, right: 20, width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 6 },
  fabText: { fontSize: 28, color: '#fff', fontWeight: '300', lineHeight: 32 },
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  modalCancel: { fontSize: 16 },
  modalSave: { fontSize: 16, fontWeight: '700' },
  modalBody: { padding: 20, gap: 6 },
  fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
  textInput: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  textArea: { minHeight: 80, paddingTop: 12 },
  priorityRow: { flexDirection: 'row', gap: 10 },
  priorityChip: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, alignItems: 'center' },
  priorityChipText: { fontSize: 13, fontWeight: '700' },
});

// ─── Main "You" Screen ────────────────────────────────────────────────────────
type YouTab = "analytics" | "vision" | "rewards" | "tasks";

export default function YouScreen() {
  const colors = useColors();
  const isCalm = useIsCalm();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<YouTab>("analytics");

  const bgColor = isCalm ? '#0D1135' : colors.background;
  const headerBorderColor = isCalm ? '#252D6E' : colors.border;
  const tabActiveColor = isCalm ? '#F5A623' : colors.primary;
  const tabInactiveColor = isCalm ? '#8B9CC8' : colors.muted;

  const TABS: { key: YouTab; label: string }[] = [
    { key: "analytics", label: "Analytics" },
    { key: "vision", label: "Vision Board" },
    { key: "rewards", label: "Rewards" },
    { key: "tasks", label: "Tasks" },
  ];

  return (
    <ScreenContainer containerClassName={isCalm ? 'bg-[#0D1135]' : undefined}>
      {/* Header */}
      <View style={[youStyles.header, { borderBottomColor: headerBorderColor, backgroundColor: bgColor }]}>
        <View style={{ width: 40 }} />
        <Text style={[youStyles.headerTitle, { color: isCalm ? '#FFFFFF' : colors.foreground }]}>You</Text>
        <Pressable
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/you-settings' as never);
          }}
          style={({ pressed }) => [youStyles.gearBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <IconSymbol name="gearshape.fill" size={22} color={isCalm ? '#8B9CC8' : colors.muted} />
        </Pressable>
      </View>

      {/* Sub-tab bar */}
      <View style={[youStyles.tabBar, { borderBottomColor: headerBorderColor, backgroundColor: bgColor }]}>
        {TABS.map((tab) => (
          <Pressable
            key={tab.key}
            style={[youStyles.tab, activeTab === tab.key && { borderBottomColor: tabActiveColor, borderBottomWidth: 2 }]}
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab(tab.key);
            }}
          >
            <Text style={[youStyles.tabText, { color: activeTab === tab.key ? tabActiveColor : tabInactiveColor, fontWeight: activeTab === tab.key ? '700' : '500' }]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Content */}
      <View style={{ flex: 1, backgroundColor: bgColor }}>
        {activeTab === "analytics" && <AnalyticsTab />}
        {activeTab === "vision" && <VisionBoardTab />}
        {activeTab === "rewards" && <RewardsTab />}
        {activeTab === "tasks" && <TasksTab />}
      </View>
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const youStyles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  gearBtn: {
    width: 40,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabText: {
    fontSize: 13,
  },
});

const aStyles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 48, gap: 12 },
  goalList: { gap: 12, marginBottom: 16 },
  goalCard: { borderRadius: 16, borderWidth: 0.5, overflow: 'hidden' },
  goalCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  goalCardTitle: { fontSize: 16, fontWeight: '700' },
  goalCardLifeArea: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  goalCardDivider: { height: 1, marginHorizontal: 14 },
  deadlineTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  deadlineText: { fontSize: 11, fontWeight: '600' },
  noHabitsText: { fontSize: 13, padding: 14, fontStyle: 'italic' },
  habitRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 0.5, gap: 10 },
  habitName: { flex: 1, fontSize: 14, fontWeight: '500', lineHeight: 18 },
  habitRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ringTriple: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ringDivider: { width: 1, height: 32, opacity: 0.4 },
  noGoalText: { fontSize: 12, fontStyle: 'italic' },
  emptyState: { borderWidth: 1, borderRadius: 14, borderStyle: 'dashed', padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 14, textAlign: 'center' },
  manageBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 14, borderWidth: 0.5, marginTop: 4 },
  manageBtnText: { fontSize: 15, fontWeight: '600' },
  legendOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  legendModal: { borderRadius: 16, borderWidth: 0.5, padding: 20, width: '100%', gap: 10 },
  legendModalTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 13 },
  legendHint: { fontSize: 11, marginTop: 4, lineHeight: 16 },
  legendInfoBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  legendInfoBtnText: { fontSize: 13, fontWeight: '600' },
});

const vStyles = StyleSheet.create({
  scroll: { padding: PADDING, paddingBottom: 40 },
  pageSubtitle: { fontSize: 14, marginBottom: 20 },
  catSection: { borderRadius: 16, borderWidth: 1, marginBottom: 16, overflow: "hidden", paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12 },
  catHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  catLabel: { fontSize: 16, fontWeight: "700" },
  visionDeadline: { fontSize: 12, marginTop: 1 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  addBtnText: { fontSize: 12, fontWeight: "600" },
  dotRow: { position: "absolute", bottom: 8, left: 0, right: 0, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 4 },
  dot: { height: 6, borderRadius: 3 },
  motivationsPreview: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, gap: 4 },
  motiveSectionLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 2 },
  motiveBullet: { fontSize: 14, lineHeight: 20 },
  motiveText: { fontSize: 14, lineHeight: 20, flex: 1 },
  moreText: { fontSize: 12, fontWeight: "600", marginTop: 4 },
  emptyText: { fontSize: 14, fontWeight: "600" },
});

const dStyles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14, borderBottomWidth: 1 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "700" },
  scroll: { padding: 20, paddingBottom: 60 },
  sectionLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 10, marginTop: 6 },
  emptyMotive: { fontSize: 14, fontStyle: "italic", marginBottom: 12 },
  motiveRow: { flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8, gap: 6 },
  motiveBullet: { fontSize: 16, lineHeight: 22 },
  motiveText: { fontSize: 15, lineHeight: 22, flex: 1 },
  motiveEditInput: { flex: 1, fontSize: 15, lineHeight: 22, borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, minHeight: 36 },
  deleteBtn: { padding: 6, borderRadius: 8 },
  addMotiveRow: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, paddingLeft: 12, paddingRight: 6, paddingVertical: 6, marginBottom: 20, gap: 6 },
  addMotiveInput: { flex: 1, fontSize: 15, minHeight: 36 },
  addMotiveBtn: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  photoHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  addPhotoBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  addPhotoBtnText: { fontSize: 12, fontWeight: "600" },
  thumbStrip: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  thumbWrap: { position: "relative" },
  thumb: { width: 80, height: 80, borderRadius: 10 },
  thumbDelete: { position: "absolute", top: -6, right: -6, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 12 },
});

const rStyles = StyleSheet.create({
  filterRow: { flexDirection: "row", paddingHorizontal: 20, borderBottomWidth: 1, marginBottom: 4 },
  filterTab: { paddingVertical: 10, paddingHorizontal: 4, marginRight: 20, borderBottomWidth: 2, borderBottomColor: "transparent" },
  filterTabText: { fontSize: 14, fontWeight: "500" },
  list: { padding: 16, gap: 12, paddingBottom: 40 },
  card: { borderRadius: 16, padding: 16, borderWidth: 1, gap: 10 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  emojiCircle: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  emojiText: { fontSize: 22 },
  cardTitleBlock: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: "600" },
  cardHabit: { fontSize: 12, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText: { fontSize: 11, fontWeight: "600" },
  cardDesc: { fontSize: 13, lineHeight: 18 },
  progressSection: { gap: 6 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: "#E5E7EB", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },
  progressLabels: { flexDirection: "row", justifyContent: "space-between" },
  progressCount: { fontSize: 12, fontWeight: "600" },
  progressRemaining: { fontSize: 12 },
  cardActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  claimBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  claimBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  actionBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  actionBtnText: { fontSize: 13, fontWeight: "500" },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 12 },
  emptyEmoji: { fontSize: 52 },
  emptyTitle: { fontSize: 20, fontWeight: "700", textAlign: "center" },
  emptyDesc: { fontSize: 14, textAlign: "center", lineHeight: 20 },
});
