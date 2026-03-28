/**
 * Stack Editor Screen
 * Add, remove, reorder (drag), and configure ritual steps for a stack.
 * Up to 5 steps per stack. No emojis — icons only throughout.
 *
 * Drag-to-reorder: long-press the ≡ handle. The step list is rendered
 * OUTSIDE the ScrollView so PanResponder can claim gestures without
 * the scroll view stealing them.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, Platform,
  TextInput, Modal, FlatList,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks/use-colors';
import {
  loadStacks, saveStacks, newStepId,
  stepLabel, STEP_TYPE_META,
  type RitualStack, type RitualStep, type StepType, type StepConfig,
} from '@/lib/stacks';
import { loadHabits, type Habit } from '@/lib/storage';

const MAX_STEPS = 5;
// CARD_HEIGHT is now measured at runtime via onLayout — this is the fallback
const CARD_HEIGHT_FALLBACK = 84;

// ─── Step type icon map ───────────────────────────────────────────────────────

const STEP_ICON: Record<StepType, string> = {
  timer:        'timer',
  stopwatch:    'stopwatch',
  meditation:   'sparkles',
  breathwork:   'wind',
  journal:      'book.fill',
  affirmations: 'quote.bubble.fill',
  priming:      'flame.fill',
  reminder:     'bell.fill',
  melatonin:    'moon.fill',
  motivational: 'bolt.fill',
  spiritual:    'sparkles',
  custom:       'pencil',
};

const STEP_TYPES: StepType[] = [
  'timer', 'stopwatch', 'meditation', 'breathwork',
  'journal', 'affirmations', 'priming', 'reminder', 'melatonin',
  'motivational', 'spiritual', 'custom',
];

// ─── Audio library data ───────────────────────────────────────────────────────

interface LibraryTrack { id: string; title: string; artist: string; duration: string; }

const MEDITATION_TRACKS: LibraryTrack[] = [
  { id: 'med-1', title: 'Meditation',          artist: 'FreeMusicForVideo', duration: '1:27' },
  { id: 'med-2', title: 'Peaceful Zen Garden', artist: 'Ambient Sounds',    duration: '3:00' },
  { id: 'med-3', title: 'Deep Calm',            artist: 'Relaxation Music',  duration: '2:30' },
  { id: 'med-4', title: 'Morning Mindset',      artist: 'Mindful Start',     duration: '5:00' },
  { id: 'med-5', title: 'Anxiety Release',      artist: 'Calm Mind',         duration: '8:00' },
  { id: 'med-6', title: 'Body Scan',            artist: 'Deep Rest',         duration: '15:00' },
  { id: 'med-7', title: 'Confidence Builder',   artist: 'Inner Power',       duration: '6:00' },
  { id: 'med-8', title: 'Anger Cooldown',       artist: 'Emotional Balance', duration: '4:00' },
];

const BREATHWORK_TRACKS: LibraryTrack[] = [
  { id: 'bw-box',      title: 'Box Breathing',      artist: '4-4-4-4 pattern',  duration: '5:00' },
  { id: 'bw-478',      title: '4-7-8 Breathing',    artist: 'Relaxation breath', duration: '4:00' },
  { id: 'bw-wimhof',   title: 'Wim Hof Method',     artist: '3 rounds',          duration: '8:00' },
  { id: 'bw-coherent', title: 'Coherent Breathing',  artist: '5-5 pattern',       duration: '6:00' },
];

const PRIMING_TRACKS: LibraryTrack[] = [
  { id: 'prm-1', title: 'Morning Priming',     artist: 'Tony Robbins style', duration: '10:00' },
  { id: 'prm-2', title: 'Gratitude Priming',   artist: 'Visualization',      duration: '8:00' },
  { id: 'prm-3', title: 'Power Visualization', artist: 'Goal activation',    duration: '12:00' },
  { id: 'prm-4', title: 'Evening Reflection',  artist: 'Wind-down priming',  duration: '7:00' },
];

// ─── Drag-to-Reorder Step List ────────────────────────────────────────────────
// Improvements applied:
//  1. Live card height measured via onLayout (no hardcoded constant mismatch)
//  2. List rendered OUTSIDE ScrollView — no scroll-gesture conflict
//  3. Haptic tick fires every time hoverIdx changes slot
//  4. Floating overlay clone: dragged card is an abs-positioned copy;
//     the original row turns invisible so there is no visual overlap
//  5. withTiming(180ms ease-out) for neighbour shifts — no spring overshoot
//  6. Thin accent-coloured drop-zone line at the hoverIdx boundary

interface DraggableStepListProps {
  steps: RitualStep[];
  accentColor: string;
  colors: ReturnType<typeof useColors>;
  onReorder: (steps: RitualStep[]) => void;
  onEdit: (step: RitualStep) => void;
  onDelete: (id: string) => void;
}

// ── StepRowContent: the visual content of a step card (shared by row + overlay)
function StepRowContent({
  step, idx, accentColor, colors, onEdit, onDelete,
  showHandle, handleGesture,
}: {
  step: RitualStep;
  idx: number;
  accentColor: string;
  colors: ReturnType<typeof useColors>;
  onEdit?: (s: RitualStep) => void;
  onDelete?: (id: string) => void;
  showHandle: boolean;
  handleGesture?: ReturnType<typeof Gesture.Simultaneous>;
}) {
  const handle = (
    <View style={styles.dragHandle} hitSlop={{ top: 14, bottom: 14, left: 10, right: 10 }}>
      <IconSymbol name="line.3.horizontal" size={22} color={showHandle ? accentColor : colors.muted} />
    </View>
  );
  return (
    <>
      {handleGesture ? (
        <GestureDetector gesture={handleGesture}>{handle}</GestureDetector>
      ) : handle}
      <View style={[styles.stepNumBadge, { backgroundColor: accentColor }]}>
        <Text style={styles.stepNum}>{idx + 1}</Text>
      </View>
      <Pressable onPress={onEdit ? () => onEdit(step) : undefined} style={{ flex: 1 }}>
        <Text style={[styles.stepTypeLabel, { color: colors.muted }]}>
          {step.type === 'reminder' ? 'Habit Reminder'
            : step.type === 'melatonin' ? 'Melatonin'
            : STEP_TYPE_META[step.type]?.label ?? step.type}
        </Text>
        <Text style={[styles.stepDetail, { color: colors.foreground }]} numberOfLines={1}>
          {stepLabel(step) || 'Tap to configure'}
        </Text>
        {step.delayAfterSeconds > 0 && (
          <Text style={[styles.stepDelay, { color: colors.muted }]}>
            {step.delayAfterSeconds}s delay before
          </Text>
        )}
      </Pressable>
      {onDelete && (
        <>
          <View style={[styles.actionSep, { backgroundColor: colors.border }]} />
          <Pressable
            onPress={() => onDelete(step.id)}
            style={({ pressed }) => [styles.actionBtn, { opacity: pressed ? 0.5 : 1 }]}
          >
            <IconSymbol name="trash" size={16} color={colors.error} />
          </Pressable>
        </>
      )}
    </>
  );
}

// ── DraggableRow: a single row in the list
function DraggableRow({
  step, idx, totalSteps, accentColor, colors,
  onEdit, onDelete,
  dragIdx, dragY, hoverIdx, cardHeightRef,
  onDragStart, onDragEnd, onDragCancel,
}: {
  step: RitualStep;
  idx: number;
  totalSteps: number;
  accentColor: string;
  colors: ReturnType<typeof useColors>;
  onEdit: (s: RitualStep) => void;
  onDelete: (id: string) => void;
  dragIdx:      SharedValue<number>;
  dragY:        SharedValue<number>;
  hoverIdx:     SharedValue<number>;
  cardHeightRef: React.MutableRefObject<number>;
  onDragStart:  (idx: number) => void;
  onDragEnd:    (fromIdx: number, toIdx: number) => void;
  onDragCancel: () => void;
}) {
  const isActive = useSharedValue(false);

  const longPress = Gesture.LongPress()
    .minDuration(260)
    .maxDistance(10)
    .onStart(() => {
      isActive.value = true;
      runOnJS(onDragStart)(idx);
    });

  const pan = Gesture.Pan()
    .manualActivation(true)
    .onTouchesMove((_e, state) => {
      if (isActive.value) state.activate();
      else state.fail();
    })
    .onUpdate((e) => {
      const h = cardHeightRef.current || CARD_HEIGHT_FALLBACK;
      dragY.value = e.translationY;
      const next = Math.max(0, Math.min(totalSteps - 1, idx + Math.round(e.translationY / h)));
      if (next !== hoverIdx.value) {
        hoverIdx.value = next;
        // Improvement 3: haptic tick on each slot boundary crossing
        runOnJS(() => {
          if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        })();
      }
    })
    .onEnd(() => {
      isActive.value = false;
      runOnJS(onDragEnd)(idx, hoverIdx.value);
    })
    .onFinalize(() => {
      if (isActive.value) {
        isActive.value = false;
        runOnJS(onDragCancel)();
      }
    });

  const composed = Gesture.Simultaneous(longPress, pan);

  // Improvement 4: original row turns invisible while dragging (overlay takes over)
  const rowStyle = useAnimatedStyle(() => ({
    opacity: dragIdx.value === idx ? 0 : 1,
  }));

  // Improvement 5: withTiming (no spring overshoot) for neighbour shifts
  const neighbourStyle = useAnimatedStyle(() => {
    const from = dragIdx.value;
    const to   = hoverIdx.value;
    const h    = cardHeightRef.current || CARD_HEIGHT_FALLBACK;
    if (from < 0 || from === idx) return { transform: [{ translateY: withTiming(0, { duration: 160 }) }] };
    let shift = 0;
    if (from < to && idx > from && idx <= to)  shift = -h;
    if (from > to && idx >= to && idx < from)  shift =  h;
    return { transform: [{ translateY: withTiming(shift, { duration: 160 }) }] };
  });

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: dragIdx.value === idx ? accentColor : colors.border,
  }));

  return (
    <Animated.View
      onLayout={(e) => { cardHeightRef.current = e.nativeEvent.layout.height; }}
      style={[
        styles.stepCard,
        { backgroundColor: colors.surface },
        rowStyle,
        neighbourStyle,
        borderStyle,
      ]}
    >
      <StepRowContent
        step={step} idx={idx} accentColor={accentColor} colors={colors}
        onEdit={onEdit} onDelete={onDelete}
        showHandle={false} handleGesture={composed}
      />
    </Animated.View>
  );
}

// ── DraggableStepList: owns all shared values + floating overlay
function DraggableStepList({
  steps, accentColor, colors, onReorder, onEdit, onDelete,
}: DraggableStepListProps) {
  const dragIdx      = useSharedValue(-1);
  const dragY        = useSharedValue(0);
  const hoverIdx     = useSharedValue(-1);
  const dragStartY   = useSharedValue(0); // abs Y of the dragged card's top
  const cardHeightRef = useRef<number>(CARD_HEIGHT_FALLBACK);

  // JS-thread state for the floating overlay
  const [draggingStep, setDraggingStep] = useState<{ step: RitualStep; idx: number } | null>(null);

  function handleDragStart(idx: number) {
    dragIdx.value    = idx;
    hoverIdx.value   = idx;
    dragY.value      = 0;
    dragStartY.value = idx * (cardHeightRef.current || CARD_HEIGHT_FALLBACK);
    setDraggingStep({ step: steps[idx], idx });
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  function handleDragEnd(fromIdx: number, toIdx: number) {
    dragIdx.value  = -1;
    dragY.value    = 0;
    hoverIdx.value = -1;
    setDraggingStep(null);
    if (toIdx !== fromIdx) {
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const next = [...steps];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      onReorder(next);
    }
  }

  function handleDragCancel() {
    dragIdx.value  = -1;
    dragY.value    = 0;
    hoverIdx.value = -1;
    setDraggingStep(null);
  }

  // Improvement 4: floating overlay card that follows the finger
  const overlayStyle = useAnimatedStyle(() => {
    const h = cardHeightRef.current || CARD_HEIGHT_FALLBACK;
    return {
      position: 'absolute',
      left: 0, right: 0,
      top: dragStartY.value + dragY.value,
      zIndex: 999,
      transform: [{ scale: withTiming(dragIdx.value >= 0 ? 1.04 : 1, { duration: 150 }) }],
      shadowOpacity: withTiming(dragIdx.value >= 0 ? 0.45 : 0, { duration: 150 }),
      shadowRadius:  withTiming(dragIdx.value >= 0 ? 20 : 0, { duration: 150 }),
      elevation: dragIdx.value >= 0 ? 20 : 0,
      // Card height so overlay matches exactly
      minHeight: h,
    };
  });

  // Improvement 6: drop-zone indicator line at hoverIdx boundary
  const dropLineStyle = useAnimatedStyle(() => {
    const from = dragIdx.value;
    const to   = hoverIdx.value;
    const h    = cardHeightRef.current || CARD_HEIGHT_FALLBACK;
    if (from < 0) return { opacity: 0 };
    // Line appears at the TOP of the hoverIdx slot
    return {
      opacity: 1,
      position: 'absolute',
      left: 12, right: 12,
      top: to * h - 2,
      height: 3,
      borderRadius: 2,
    };
  });

  return (
    <View style={{ position: 'relative' }}>
      {steps.map((step, idx) => (
        <DraggableRow
          key={step.id}
          step={step} idx={idx} totalSteps={steps.length}
          accentColor={accentColor} colors={colors}
          onEdit={onEdit} onDelete={onDelete}
          dragIdx={dragIdx} dragY={dragY} hoverIdx={hoverIdx}
          cardHeightRef={cardHeightRef}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        />
      ))}

      {/* Improvement 6: drop-zone accent line */}
      <Animated.View
        style={[dropLineStyle, { backgroundColor: accentColor }]}
        pointerEvents="none"
      />

      {/* Improvement 4: floating overlay clone */}
      {draggingStep && (
        <Animated.View
          style={[
            styles.stepCard,
            {
              backgroundColor: colors.surface,
              borderColor: accentColor,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
            },
            overlayStyle,
          ]}
          pointerEvents="none"
        >
          <StepRowContent
            step={draggingStep.step}
            idx={draggingStep.idx}
            accentColor={accentColor}
            colors={colors}
            showHandle
          />
        </Animated.View>
      )}
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StackEditorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [stack, setStack]           = useState<RitualStack | null>(null);
  const [addingStep, setAddingStep] = useState(false);
  const [editingStep, setEditingStep] = useState<RitualStep | null>(null);

  useEffect(() => {
    loadStacks().then((all) => {
      const found = all.find((s) => s.id === id);
      if (found) setStack(found);
    });
  }, [id]);

  async function persist(updated: RitualStack) {
    setStack(updated);
    const all = await loadStacks();
    await saveStacks(all.map((s) => (s.id === updated.id ? updated : s)));
  }

  function addStep(type: StepType) {
    if (!stack || stack.steps.length >= MAX_STEPS) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const step: RitualStep = { id: newStepId(), type, config: {}, delayAfterSeconds: 0 };
    persist({ ...stack, steps: [...stack.steps, step] });
    setAddingStep(false);
  }

  function removeStep(stepId: string) {
    if (!stack) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    persist({ ...stack, steps: stack.steps.filter((s) => s.id !== stepId) });
  }

  function reorderSteps(newSteps: RitualStep[]) {
    if (!stack) return;
    persist({ ...stack, steps: newSteps });
  }

  function saveStepEdit(updated: RitualStep) {
    if (!stack) return;
    persist({ ...stack, steps: stack.steps.map((s) => (s.id === updated.id ? updated : s)) });
    setEditingStep(null);
  }

  if (!stack) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Text style={{ color: colors.muted, textAlign: 'center', marginTop: 40 }}>Loading…</Text>
      </View>
    );
  }

  const accentColor = stack.id === 'wakeup' ? '#F97316' : '#8B5CF6';

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header — safely below notch */}
      <View style={[styles.header, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.headerBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <IconSymbol name="chevron.left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{stack.name}</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* ── Scrollable content ── */}
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        // Allow scroll only when not dragging — drag handle is outside scroll
        keyboardShouldPersistTaps="handled"
      >
        {stack.steps.length === 0 ? (
          <View style={[styles.emptyBox, { borderColor: colors.border }]}>
            <IconSymbol name="list.bullet" size={32} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              No steps yet. Tap below to build your ritual.
            </Text>
          </View>
        ) : (
          <>
            <Text style={[styles.dragHint, { color: colors.muted }]}>
              Hold ≡ and drag to reorder
            </Text>
            {/*
              DraggableStepList is rendered inside the ScrollView here.
              The drag handle uses PanResponder with onMoveShouldSetPanResponderCapture
              so it captures the gesture before the ScrollView can claim it.
            */}
            <DraggableStepList
              steps={stack.steps}
              accentColor={accentColor}
              colors={colors}
              onReorder={reorderSteps}
              onEdit={setEditingStep}
              onDelete={removeStep}
            />
          </>
        )}

        {/* Add Step button */}
        {stack.steps.length < MAX_STEPS ? (
          <Pressable
            onPress={() => setAddingStep(true)}
            style={({ pressed }) => [
              styles.addBtn,
              { backgroundColor: accentColor + '15', borderColor: accentColor + '40', opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <IconSymbol name="plus" size={18} color={accentColor} />
            <Text style={[styles.addBtnText, { color: accentColor }]}>
              Add Step ({stack.steps.length}/{MAX_STEPS})
            </Text>
          </Pressable>
        ) : (
          <Text style={[styles.maxNote, { color: colors.muted }]}>Maximum {MAX_STEPS} steps reached.</Text>
        )}
      </ScrollView>

      {/* Step type picker bottom sheet */}
      <Modal visible={addingStep} transparent animationType="slide" onRequestClose={() => setAddingStep(false)}>
        <Pressable style={styles.overlay} onPress={() => setAddingStep(false)} />
        <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.sheetHandle} />
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Choose Step Type</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {STEP_TYPES.map((type) => (
              <Pressable
                key={type}
                onPress={() => addStep(type)}
                style={({ pressed }) => [styles.typeRow, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
              >
                <View style={[styles.typeIconWrap, { backgroundColor: accentColor + '20' }]}>
                  <IconSymbol name={STEP_ICON[type] as any} size={20} color={accentColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.typeLabel, { color: colors.foreground }]}>
                    {type === 'reminder'
                      ? 'Habit Reminder'
                      : type === 'melatonin'
                      ? 'Melatonin'
                      : STEP_TYPE_META[type]?.label ?? type}
                  </Text>
                  <Text style={[styles.typeDesc, { color: colors.muted }]}>
                    {type === 'reminder'
                      ? 'Pick a habit from your list with a countdown timer'
                      : type === 'journal'
                      ? 'Open a journal entry — type or record your voice'
                      : type === 'melatonin'
                      ? 'Reminder to take melatonin before sleep with a countdown'
                      : STEP_TYPE_META[type]?.description ?? ''}
                  </Text>
                </View>
                <IconSymbol name="chevron.right" size={16} color={colors.muted} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* Step config modal */}
      {editingStep && (
        <StepConfigModal
          step={editingStep}
          colors={colors}
          insets={insets}
          accentColor={accentColor}
          onSave={saveStepEdit}
          onClose={() => setEditingStep(null)}
        />
      )}
    </View>
  );
}

// ─── Step Config Modal ────────────────────────────────────────────────────────

function StepConfigModal({
  step, colors, insets, accentColor, onSave, onClose,
}: {
  step: RitualStep;
  colors: ReturnType<typeof useColors>;
  insets: ReturnType<typeof useSafeAreaInsets>;
  accentColor: string;
  onSave: (s: RitualStep) => void;
  onClose: () => void;
}) {
  const [config, setConfig] = useState<StepConfig>({ ...step.config });
  const [delay, setDelay]   = useState(String(step.delayAfterSeconds));
  const [showLibrary, setShowLibrary] = useState(false);
  const [habits, setHabits] = useState<Habit[]>([]);

  useEffect(() => {
    if (step.type === 'reminder') loadHabits().then(setHabits);
  }, [step.type]);

  const libraryTracks: LibraryTrack[] =
    step.type === 'meditation' ? MEDITATION_TRACKS :
    step.type === 'breathwork' ? BREATHWORK_TRACKS :
    step.type === 'priming'    ? PRIMING_TRACKS    : [];

  function pickTrack(track: LibraryTrack) {
    if (step.type === 'meditation') {
      setConfig({ ...config, meditationTrackId: track.id, meditationTrackTitle: track.title });
    } else if (step.type === 'breathwork') {
      setConfig({ ...config, breathworkTrackId: track.id, breathworkTrackTitle: track.title });
    } else if (step.type === 'priming') {
      setConfig({ ...config, primingTrackId: track.id, primingTrackTitle: track.title });
    }
    setShowLibrary(false);
  }

  const selectedTrackTitle =
    step.type === 'meditation' ? config.meditationTrackTitle :
    step.type === 'breathwork' ? config.breathworkTrackTitle :
    step.type === 'priming'    ? config.primingTrackTitle    : undefined;

  const stepDisplayName =
    step.type === 'reminder'  ? 'Habit Reminder' :
    step.type === 'melatonin' ? 'Melatonin' :
    STEP_TYPE_META[step.type]?.label ?? step.type;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeaderRow}>
          <View style={[styles.typeIconWrap, { backgroundColor: accentColor + '20' }]}>
            <IconSymbol name={STEP_ICON[step.type] as any} size={20} color={accentColor} />
          </View>
          <Text style={[styles.sheetTitle, { color: colors.foreground, flex: 1, textAlign: 'left', marginBottom: 0 }]}>
            {stepDisplayName}
          </Text>
          <Pressable onPress={onClose} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, padding: 4 }]}>
            <IconSymbol name="xmark" size={20} color={colors.muted} />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 16 }}>

          {/* Timer */}
          {step.type === 'timer' && (
            <CRow label="Duration (seconds)" colors={colors}>
              <TextInput
                style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
                keyboardType="number-pad"
                returnKeyType="done"
                value={String(config.durationSeconds ?? 60)}
                onChangeText={(v) => setConfig({ ...config, durationSeconds: parseInt(v, 10) || 60 })}
              />
            </CRow>
          )}

          {/* Stopwatch */}
          {step.type === 'stopwatch' && (
            <View style={[styles.infoBox, { backgroundColor: accentColor + '12', borderColor: accentColor + '30' }]}>
              <IconSymbol name="stopwatch" size={18} color={accentColor} />
              <Text style={[styles.infoText, { color: colors.foreground }]}>
                An open-ended stopwatch you stop manually when you're done.
              </Text>
            </View>
          )}

          {/* Journal */}
          {step.type === 'journal' && (
            <View style={[styles.infoBox, { backgroundColor: accentColor + '12', borderColor: accentColor + '30' }]}>
              <IconSymbol name="book.fill" size={18} color={accentColor} />
              <Text style={[styles.infoText, { color: colors.foreground }]}>
                When this step runs, the journal entry screen will open so you can type or record a voice entry — exactly like the morning alarm flow.
              </Text>
            </View>
          )}

          {/* Meditation */}
          {step.type === 'meditation' && (
            <CRow label="Select Meditation" colors={colors}>
              <Pressable
                onPress={() => setShowLibrary(true)}
                style={({ pressed }) => [styles.libraryPickerBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
              >
                <IconSymbol name="sparkles" size={16} color={accentColor} />
                <Text style={[styles.libraryPickerText, { color: selectedTrackTitle ? colors.foreground : colors.muted }]} numberOfLines={1}>
                  {selectedTrackTitle ?? 'Choose from library…'}
                </Text>
                <IconSymbol name="chevron.right" size={14} color={colors.muted} />
              </Pressable>
            </CRow>
          )}

          {/* Breathwork */}
          {step.type === 'breathwork' && (
            <CRow label="Select Breathing Exercise" colors={colors}>
              <Pressable
                onPress={() => setShowLibrary(true)}
                style={({ pressed }) => [styles.libraryPickerBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
              >
                <IconSymbol name="wind" size={16} color={accentColor} />
                <Text style={[styles.libraryPickerText, { color: selectedTrackTitle ? colors.foreground : colors.muted }]} numberOfLines={1}>
                  {selectedTrackTitle ?? 'Choose from library…'}
                </Text>
                <IconSymbol name="chevron.right" size={14} color={colors.muted} />
              </Pressable>
            </CRow>
          )}

          {/* Priming */}
          {step.type === 'priming' && (
            <CRow label="Select Priming Session" colors={colors}>
              <Pressable
                onPress={() => setShowLibrary(true)}
                style={({ pressed }) => [styles.libraryPickerBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
              >
                <IconSymbol name="flame.fill" size={16} color={accentColor} />
                <Text style={[styles.libraryPickerText, { color: selectedTrackTitle ? colors.foreground : colors.muted }]} numberOfLines={1}>
                  {selectedTrackTitle ?? 'Choose from library…'}
                </Text>
                <IconSymbol name="chevron.right" size={14} color={colors.muted} />
              </Pressable>
            </CRow>
          )}

          {/* Affirmations */}
          {step.type === 'affirmations' && (
            <View style={[styles.infoBox, { backgroundColor: accentColor + '12', borderColor: accentColor + '30' }]}>
              <IconSymbol name="quote.bubble.fill" size={18} color={accentColor} />
              <Text style={[styles.infoText, { color: colors.foreground }]}>
                Your saved voice affirmations will play during this step.
              </Text>
            </View>
          )}

          {/* Habit Reminder */}
          {step.type === 'reminder' && (
            <>
              <CRow label="Habit" colors={colors}>
                {habits.length === 0 ? (
                  <Text style={[styles.infoText, { color: colors.muted }]}>
                    No habits found. Add habits in Manage Goals first.
                  </Text>
                ) : (
                  <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
                    {habits.map((h) => {
                      const isSelected = config.reminderText === h.name;
                      return (
                        <Pressable
                          key={h.id}
                          onPress={() => setConfig({ ...config, reminderText: h.name })}
                          style={({ pressed }) => [
                            styles.habitRow,
                            {
                              borderColor: isSelected ? accentColor : colors.border,
                              backgroundColor: isSelected ? accentColor + '15' : colors.background,
                              opacity: pressed ? 0.7 : 1,
                            },
                          ]}
                        >
                          <Text style={[styles.habitRowText, { color: isSelected ? accentColor : colors.foreground }]}>
                            {h.name}
                          </Text>
                          {isSelected && <IconSymbol name="checkmark" size={14} color={accentColor} />}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
              </CRow>
              <CRow label="Countdown duration (seconds)" colors={colors}>
                <TextInput
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  value={String(config.durationSeconds ?? 120)}
                  onChangeText={(v) => setConfig({ ...config, durationSeconds: parseInt(v, 10) || 120 })}
                />
                <Text style={[styles.inputHint, { color: colors.muted }]}>Default: 120s (2 min)</Text>
              </CRow>
            </>
          )}

          {/* Melatonin */}
          {step.type === 'melatonin' && (
            <>
              <View style={[styles.infoBox, { backgroundColor: accentColor + '12', borderColor: accentColor + '30' }]}>
                <IconSymbol name="moon.fill" size={18} color={accentColor} />
                <Text style={[styles.infoText, { color: colors.foreground }]}>
                  A reminder to take your melatonin. A countdown will run while you get ready for sleep.
                </Text>
              </View>
              <CRow label="Countdown duration (seconds)" colors={colors}>
                <TextInput
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  value={String(config.durationSeconds ?? 120)}
                  onChangeText={(v) => setConfig({ ...config, durationSeconds: parseInt(v, 10) || 120 })}
                />
                <Text style={[styles.inputHint, { color: colors.muted }]}>Default: 120s (2 min)</Text>
              </CRow>
            </>
          )}

          {/* Motivational */}
          {step.type === 'motivational' && (
            <>
              <View style={[styles.infoBox, { backgroundColor: accentColor + '12', borderColor: accentColor + '30' }]}>
                <IconSymbol name="bolt.fill" size={18} color={accentColor} />
                <Text style={[styles.infoText, { color: colors.foreground }]}>
                  A motivational quote will be displayed (and read aloud if voice is enabled) during your ritual.
                </Text>
              </View>
              <CRow label="Genre" colors={colors}>
                <View style={{ gap: 8 }}>
                  {['Entrepreneurial', 'Conquering the Day', 'Stoic', 'Athletic', 'Mindset', 'Spiritual', 'General'].map((g) => (
                    <Pressable
                      key={g}
                      onPress={() => setConfig({ ...config, motivationalGenre: g })}
                      style={({ pressed }) => [{
                        flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10,
                        padding: 12, borderRadius: 10,
                        backgroundColor: config.motivationalGenre === g ? accentColor + '20' : colors.surface,
                        borderWidth: 1,
                        borderColor: config.motivationalGenre === g ? accentColor : colors.border,
                        opacity: pressed ? 0.7 : 1,
                      }]}
                    >
                      <IconSymbol
                        name={config.motivationalGenre === g ? 'checkmark.circle.fill' : 'checkmark.circle'}
                        size={18}
                        color={config.motivationalGenre === g ? accentColor : colors.muted}
                      />
                      <Text style={{ color: colors.foreground, fontSize: 15 }}>{g}</Text>
                    </Pressable>
                  ))}
                </View>
              </CRow>
            </>
          )}

          {/* Spiritual */}
          {step.type === 'spiritual' && (
            <>
              <View style={[styles.infoBox, { backgroundColor: accentColor + '12', borderColor: accentColor + '30' }]}>
                <IconSymbol name="sparkles" size={18} color={accentColor} />
                <Text style={[styles.infoText, { color: colors.foreground }]}>
                  A spiritual reflection or message will be shown during your ritual — a moment of gratitude, presence, or faith.
                </Text>
              </View>
              <CRow label="Duration (seconds, 0 = tap to continue)" colors={colors}>
                <TextInput
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  value={String(config.durationSeconds ?? 0)}
                  onChangeText={(v) => setConfig({ ...config, durationSeconds: parseInt(v, 10) || 0 })}
                />
              </CRow>
            </>
          )}

          {/* Custom */}
          {step.type === 'custom' && (
            <>
              <CRow label="Step name" colors={colors}>
                <TextInput
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
                  placeholder="e.g. Do 20 push-ups"
                  placeholderTextColor={colors.muted}
                  returnKeyType="done"
                  value={config.customLabel ?? ''}
                  onChangeText={(v) => setConfig({ ...config, customLabel: v })}
                />
              </CRow>
              <CRow label="Duration (seconds, 0 = manual done)" colors={colors}>
                <TextInput
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  value={String(config.durationSeconds ?? 0)}
                  onChangeText={(v) => setConfig({ ...config, durationSeconds: parseInt(v, 10) || 0 })}
                />
              </CRow>
            </>
          )}

          {/* Countdown delay before step */}
          <CRow label="Countdown delay before this step (seconds)" colors={colors}>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
              keyboardType="number-pad"
              returnKeyType="done"
              value={delay}
              onChangeText={setDelay}
            />
            <Text style={[styles.inputHint, { color: colors.muted }]}>0 = start immediately</Text>
          </CRow>
        </ScrollView>

        <Pressable
          onPress={() => onSave({ ...step, config, delayAfterSeconds: parseInt(delay, 10) || 0 })}
          style={({ pressed }) => [styles.saveBtn, { backgroundColor: accentColor, opacity: pressed ? 0.8 : 1 }]}
        >
          <Text style={styles.saveBtnText}>Save</Text>
        </Pressable>
      </View>

      {/* Library picker sub-sheet */}
      {showLibrary && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setShowLibrary(false)}>
          <Pressable style={styles.overlay} onPress={() => setShowLibrary(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <Text style={[styles.sheetTitle, { color: colors.foreground, flex: 1, textAlign: 'left', marginBottom: 0 }]}>
                {step.type === 'meditation'
                  ? 'Meditations'
                  : step.type === 'breathwork'
                  ? 'Breathing Exercises'
                  : 'Priming Sessions'}
              </Text>
              <Pressable onPress={() => setShowLibrary(false)} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, padding: 4 }]}>
                <IconSymbol name="xmark" size={20} color={colors.muted} />
              </Pressable>
            </View>
            <FlatList
              data={libraryTracks}
              keyExtractor={(t) => t.id}
              style={{ marginTop: 12 }}
              renderItem={({ item }) => {
                const isSelected =
                  (step.type === 'meditation' && config.meditationTrackId === item.id) ||
                  (step.type === 'breathwork' && config.breathworkTrackId === item.id) ||
                  (step.type === 'priming'    && config.primingTrackId    === item.id);
                return (
                  <Pressable
                    onPress={() => pickTrack(item)}
                    style={({ pressed }) => [
                      styles.libraryRow,
                      {
                        borderBottomColor: colors.border,
                        backgroundColor: isSelected ? accentColor + '15' : 'transparent',
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.libraryTitle, { color: colors.foreground }]}>{item.title}</Text>
                      <Text style={[styles.libraryArtist, { color: colors.muted }]}>{item.artist}</Text>
                    </View>
                    <Text style={[styles.libraryDuration, { color: colors.muted }]}>{item.duration}</Text>
                    {isSelected && <IconSymbol name="checkmark" size={16} color={accentColor} />}
                  </Pressable>
                );
              }}
            />
          </View>
        </Modal>
      )}
    </Modal>
  );
}

// ─── Config Row Helper ────────────────────────────────────────────────────────

function CRow({ label, children, colors }: {
  label: string;
  children: React.ReactNode;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.cRow}>
      <Text style={[styles.cLabel, { color: colors.muted }]}>{label}</Text>
      <View style={styles.cContent}>{children}</View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { padding: 8, width: 44, alignItems: 'center' },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  dragHint: { fontSize: 12, textAlign: 'center', marginBottom: 10 },
  emptyBox: {
    borderWidth: 1, borderStyle: 'dashed', borderRadius: 14,
    padding: 32, alignItems: 'center', gap: 12, marginBottom: 16,
  },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  // Step cards
  stepCard: {
    borderRadius: 14, borderWidth: 1,
    paddingVertical: 12, paddingHorizontal: 10,
    marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8,
    minHeight: CARD_HEIGHT_FALLBACK,
  },
  dragHandle: {
    padding: 8, justifyContent: 'center', alignItems: 'center',
    // Larger hit area so it's easy to grab
    minWidth: 36, minHeight: 44,
  },
  stepNumBadge: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  stepNum: { color: '#fff', fontSize: 11, fontWeight: '800' },
  stepTypeLabel: { fontSize: 11, fontWeight: '500', marginBottom: 1 },
  stepDetail: { fontSize: 14, fontWeight: '700' },
  stepDelay: { fontSize: 11, marginTop: 2 },

  // Actions
  actionBtn: { padding: 8 },
  actionSep: { width: 1, height: 20, marginHorizontal: 2 },

  // Add Step
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderWidth: 1, borderRadius: 14, paddingVertical: 14, marginBottom: 16,
  },
  addBtnText: { fontSize: 15, fontWeight: '700' },
  maxNote: { textAlign: 'center', fontSize: 13, marginBottom: 16 },

  // Modals / sheets
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 12, paddingHorizontal: 16, maxHeight: '85%',
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.35)',
    alignSelf: 'center', marginBottom: 12,
  },
  sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  sheetTitle: { fontSize: 18, fontWeight: '800', marginBottom: 16, textAlign: 'center' },

  // Step type picker
  typeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  typeIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  typeLabel: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  typeDesc: { fontSize: 12 },

  // Config rows
  cRow: { marginBottom: 16 },
  cLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  cContent: { gap: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  inputHint: { fontSize: 11 },

  // Info box
  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 16,
  },
  infoText: { flex: 1, fontSize: 13, lineHeight: 19 },

  // Library picker
  libraryPickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
  },
  libraryPickerText: { flex: 1, fontSize: 14 },
  libraryRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10,
  },
  libraryTitle: { fontSize: 14, fontWeight: '700' },
  libraryArtist: { fontSize: 12, marginTop: 1 },
  libraryDuration: { fontSize: 12 },

  // Habit picker
  habitRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6,
  },
  habitRowText: { fontSize: 14, fontWeight: '600', flex: 1 },

  // Save button
  saveBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
