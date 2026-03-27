/**
 * Stack Editor Screen
 * Add, remove, reorder, and configure ritual steps for a stack.
 * Up to 5 steps per stack. No emojis — icons only throughout.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, Platform,
  TextInput, Modal, FlatList,
} from 'react-native';
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

const MAX_STEPS = 5;

// ─── Step type icon map (no emojis) ──────────────────────────────────────────

const STEP_ICON: Record<StepType, string> = {
  timer:        'timer',
  stopwatch:    'stopwatch',
  meditation:   'sparkles',
  breathwork:   'wind',
  journal:      'book.fill',
  affirmations: 'quote.bubble.fill',
  priming:      'flame.fill',
  reminder:     'bell.fill',
  custom:       'pencil',
};

const STEP_TYPES: StepType[] = [
  'timer', 'stopwatch', 'meditation', 'breathwork',
  'journal', 'affirmations', 'priming', 'reminder', 'custom',
];

// ─── Audio library data (from wellness-audio catalog) ────────────────────────

interface LibraryTrack { id: string; title: string; artist: string; duration: string; }

const MEDITATION_TRACKS: LibraryTrack[] = [
  { id: 'med-1', title: 'Meditation',         artist: 'FreeMusicForVideo', duration: '1:27' },
  { id: 'med-2', title: 'Peaceful Zen Garden',artist: 'Ambient Sounds',    duration: '3:00' },
  { id: 'med-3', title: 'Deep Calm',           artist: 'Relaxation Music',  duration: '2:30' },
  { id: 'med-4', title: 'Morning Mindset',     artist: 'Mindful Start',     duration: '5:00' },
  { id: 'med-5', title: 'Anxiety Release',     artist: 'Calm Mind',         duration: '8:00' },
  { id: 'med-6', title: 'Body Scan',           artist: 'Deep Rest',         duration: '15:00' },
  { id: 'med-7', title: 'Confidence Builder',  artist: 'Inner Power',       duration: '6:00' },
  { id: 'med-8', title: 'Anger Cooldown',      artist: 'Emotional Balance', duration: '4:00' },
];

const BREATHWORK_TRACKS: LibraryTrack[] = [
  { id: 'bw-box',     title: 'Box Breathing',      artist: '4-4-4-4 pattern',  duration: '5:00' },
  { id: 'bw-478',     title: '4-7-8 Breathing',    artist: 'Relaxation breath', duration: '4:00' },
  { id: 'bw-wimhof',  title: 'Wim Hof Method',     artist: '3 rounds',          duration: '8:00' },
  { id: 'bw-coherent',title: 'Coherent Breathing',  artist: '5-5 pattern',       duration: '6:00' },
];

const PRIMING_TRACKS: LibraryTrack[] = [
  { id: 'prm-1', title: 'Morning Priming',      artist: 'Tony Robbins style', duration: '10:00' },
  { id: 'prm-2', title: 'Gratitude Priming',    artist: 'Visualization',      duration: '8:00' },
  { id: 'prm-3', title: 'Power Visualization',  artist: 'Goal activation',    duration: '12:00' },
  { id: 'prm-4', title: 'Evening Reflection',   artist: 'Wind-down priming',  duration: '7:00' },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StackEditorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [stack, setStack] = useState<RitualStack | null>(null);
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

  function moveStep(stepId: string, dir: 'up' | 'down') {
    if (!stack) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const idx = stack.steps.findIndex((s) => s.id === stepId);
    if (idx < 0) return;
    const next = [...stack.steps];
    const swap = dir === 'up' ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    persist({ ...stack, steps: next });
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
      {/* Header — inside safe area */}
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

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {stack.steps.length === 0 ? (
          <View style={[styles.emptyBox, { borderColor: colors.border }]}>
            <IconSymbol name="list.bullet" size={32} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              No steps yet. Tap below to build your ritual.
            </Text>
          </View>
        ) : (
          stack.steps.map((step, idx) => (
            <View
              key={step.id}
              style={[styles.stepCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              {/* Step number badge */}
              <View style={[styles.stepNumBadge, { backgroundColor: accentColor }]}>
                <Text style={styles.stepNum}>{idx + 1}</Text>
              </View>

              {/* Step icon */}
              <View style={[styles.stepIconWrap, { backgroundColor: accentColor + '18' }]}>
                <IconSymbol name={STEP_ICON[step.type] as any} size={18} color={accentColor} />
              </View>

              {/* Step info */}
              <View style={{ flex: 1 }}>
                <Text style={[styles.stepTypeLabel, { color: colors.muted }]}>
                  {STEP_TYPE_META[step.type].label}
                </Text>
                <Text style={[styles.stepDetail, { color: colors.foreground }]} numberOfLines={1}>
                  {stepLabel(step)}
                </Text>
                {step.delayAfterSeconds > 0 && (
                  <Text style={[styles.stepDelay, { color: colors.muted }]}>
                    {step.delayAfterSeconds}s delay before
                  </Text>
                )}
              </View>

              {/* Actions */}
              <View style={styles.stepActions}>
                <Pressable onPress={() => setEditingStep(step)} style={({ pressed }) => [styles.actionBtn, { opacity: pressed ? 0.6 : 1 }]}>
                  <IconSymbol name="pencil" size={16} color={colors.muted} />
                </Pressable>
                <Pressable onPress={() => moveStep(step.id, 'up')} disabled={idx === 0}
                  style={({ pressed }) => [styles.actionBtn, { opacity: idx === 0 ? 0.2 : pressed ? 0.6 : 1 }]}>
                  <IconSymbol name="arrow.up" size={16} color={colors.muted} />
                </Pressable>
                <Pressable onPress={() => moveStep(step.id, 'down')} disabled={idx === stack.steps.length - 1}
                  style={({ pressed }) => [styles.actionBtn, { opacity: idx === stack.steps.length - 1 ? 0.2 : pressed ? 0.6 : 1 }]}>
                  <IconSymbol name="arrow.down" size={16} color={colors.muted} />
                </Pressable>
                <Pressable onPress={() => removeStep(step.id)}
                  style={({ pressed }) => [styles.actionBtn, { opacity: pressed ? 0.6 : 1 }]}>
                  <IconSymbol name="trash" size={16} color={colors.error} />
                </Pressable>
              </View>
            </View>
          ))
        )}

        {stack.steps.length < MAX_STEPS ? (
          <Pressable
            onPress={() => setAddingStep(true)}
            style={({ pressed }) => [styles.addBtn, { borderColor: accentColor, opacity: pressed ? 0.7 : 1 }]}
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

      {/* Step type picker sheet */}
      <Modal visible={addingStep} transparent animationType="slide" onRequestClose={() => setAddingStep(false)}>
        <Pressable style={styles.overlay} onPress={() => setAddingStep(false)} />
        <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}>
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
                  <Text style={[styles.typeLabel, { color: colors.foreground }]}>{STEP_TYPE_META[type].label}</Text>
                  <Text style={[styles.typeDesc, { color: colors.muted }]}>{STEP_TYPE_META[type].description}</Text>
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
  const [delay, setDelay] = useState(String(step.delayAfterSeconds));
  const [showLibrary, setShowLibrary] = useState(false);

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

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}>
        {/* Header row */}
        <View style={styles.sheetHeaderRow}>
          <View style={[styles.typeIconWrap, { backgroundColor: accentColor + '20' }]}>
            <IconSymbol name={STEP_ICON[step.type] as any} size={20} color={accentColor} />
          </View>
          <Text style={[styles.sheetTitle, { color: colors.foreground, flex: 1, textAlign: 'left', marginBottom: 0 }]}>
            {STEP_TYPE_META[step.type].label}
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
                value={String(config.durationSeconds ?? 60)}
                onChangeText={(v) => setConfig({ ...config, durationSeconds: parseInt(v, 10) || 60 })}
              />
            </CRow>
          )}

          {/* Meditation — library picker */}
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

          {/* Breathwork — library picker */}
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

          {/* Priming — library picker */}
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

          {/* Reminder — countdown with default 2 min */}
          {step.type === 'reminder' && (
            <>
              <CRow label="Reminder text" colors={colors}>
                <TextInput
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
                  placeholder="e.g. Drink a glass of water"
                  placeholderTextColor={colors.muted}
                  value={config.reminderText ?? ''}
                  onChangeText={(v) => setConfig({ ...config, reminderText: v })}
                />
              </CRow>
              <CRow label="Countdown duration (seconds)" colors={colors}>
                <TextInput
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
                  keyboardType="number-pad"
                  value={String(config.durationSeconds ?? 120)}
                  onChangeText={(v) => setConfig({ ...config, durationSeconds: parseInt(v, 10) || 120 })}
                />
                <Text style={[styles.inputHint, { color: colors.muted }]}>Default: 120s (2 min)</Text>
              </CRow>
            </>
          )}

          {/* Custom */}
          {step.type === 'custom' && (
            <CRow label="Step name" colors={colors}>
              <TextInput
                style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
                placeholder="e.g. Do 20 push-ups"
                placeholderTextColor={colors.muted}
                value={config.customLabel ?? ''}
                onChangeText={(v) => setConfig({ ...config, customLabel: v })}
              />
            </CRow>
          )}

          {/* Delay before step */}
          <CRow label="Countdown delay before this step (seconds)" colors={colors}>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
              keyboardType="number-pad"
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
            <View style={styles.sheetHeaderRow}>
              <Text style={[styles.sheetTitle, { color: colors.foreground, flex: 1, textAlign: 'left', marginBottom: 0 }]}>
                {step.type === 'meditation' ? 'Meditations' : step.type === 'breathwork' ? 'Breathing Exercises' : 'Priming Sessions'}
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
                      { borderBottomColor: colors.border, backgroundColor: isSelected ? accentColor + '15' : 'transparent', opacity: pressed ? 0.7 : 1 },
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

function CRow({ label, children, colors }: { label: string; children: React.ReactNode; colors: ReturnType<typeof useColors> }) {
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
  emptyBox: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, padding: 32, alignItems: 'center', gap: 12, marginBottom: 16 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  stepCard: { borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepNumBadge: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  stepNum: { color: '#fff', fontSize: 11, fontWeight: '800' },
  stepIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  stepTypeLabel: { fontSize: 11, fontWeight: '500', marginBottom: 1 },
  stepDetail: { fontSize: 14, fontWeight: '700' },
  stepDelay: { fontSize: 11, marginTop: 2 },
  stepActions: { flexDirection: 'row', gap: 2 },
  actionBtn: { padding: 6 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 14, paddingVertical: 14, marginBottom: 16 },
  addBtnText: { fontSize: 15, fontWeight: '700' },
  maxNote: { textAlign: 'center', fontSize: 13, marginBottom: 16 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 20, paddingHorizontal: 16, maxHeight: '80%' },
  sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  sheetTitle: { fontSize: 18, fontWeight: '800', marginBottom: 16, textAlign: 'center' },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  typeIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  typeLabel: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  typeDesc: { fontSize: 12 },
  cRow: { marginBottom: 16 },
  cLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  cContent: { gap: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  inputHint: { fontSize: 11 },
  libraryPickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  libraryPickerText: { flex: 1, fontSize: 14 },
  libraryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  libraryTitle: { fontSize: 14, fontWeight: '700' },
  libraryArtist: { fontSize: 12, marginTop: 1 },
  libraryDuration: { fontSize: 12 },
  saveBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
