/**
 * Stack Editor Screen
 * Lets the user configure a Wake Up or Sleep ritual stack.
 * - View / add / remove steps (up to 5)
 * - Long-press a step to drag-reorder
 * - Tap a step to configure it (type, duration, delay, etc.)
 * - Toggle the stack on/off
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColors } from '@/hooks/use-colors';
import {
  type RitualStack,
  type RitualStep,
  type StepType,
  STEP_TYPE_META,
  loadStacks,
  updateStack,
  newStepId,
  stepLabel,
} from '@/lib/stacks';

// ─── Step Config Modal ────────────────────────────────────────────────────────

interface StepConfigModalProps {
  step: RitualStep | null;
  onSave: (step: RitualStep) => void;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
}

function StepConfigModal({ step, onSave, onClose, colors }: StepConfigModalProps) {
  const [local, setLocal] = useState<RitualStep | null>(step);

  useEffect(() => { setLocal(step); }, [step]);

  if (!local) return null;

  const meta = STEP_TYPE_META[local.type];

  function update(patch: Partial<RitualStep>) {
    setLocal((prev) => prev ? { ...prev, ...patch } : prev);
  }
  function updateConfig(patch: Partial<RitualStep['config']>) {
    setLocal((prev) => prev ? { ...prev, config: { ...prev.config, ...patch } } : prev);
  }

  const delayOptions = [0, 3, 5, 10, 15, 30, 60];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {meta.emoji} {meta.label}
            </Text>
            <Pressable onPress={onClose} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <IconSymbol name="xmark" size={20} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>

            {/* Timer duration */}
            {local.type === 'timer' && (
              <View style={styles.configRow}>
                <Text style={[styles.configLabel, { color: colors.muted }]}>Duration (minutes)</Text>
                <View style={styles.durationRow}>
                  {[1, 2, 5, 10, 15, 20, 30].map((m) => {
                    const s = m * 60;
                    const sel = (local.config.durationSeconds ?? 300) === s;
                    return (
                      <Pressable
                        key={m}
                        onPress={() => updateConfig({ durationSeconds: s })}
                        style={[styles.durationChip, { backgroundColor: sel ? colors.primary : colors.border }]}
                      >
                        <Text style={[styles.durationChipText, { color: sel ? '#fff' : colors.foreground }]}>{m}m</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Breathwork style */}
            {local.type === 'breathwork' && (
              <>
                <View style={styles.configRow}>
                  <Text style={[styles.configLabel, { color: colors.muted }]}>Style</Text>
                  <View style={styles.durationRow}>
                    {(['box', '4_7_8', 'wim_hof'] as const).map((style) => {
                      const labels = { box: 'Box', '4_7_8': '4-7-8', wim_hof: 'Wim Hof' };
                      const sel = (local.config.breathworkStyle ?? 'box') === style;
                      return (
                        <Pressable
                          key={style}
                          onPress={() => updateConfig({ breathworkStyle: style })}
                          style={[styles.durationChip, { backgroundColor: sel ? colors.primary : colors.border }]}
                        >
                          <Text style={[styles.durationChipText, { color: sel ? '#fff' : colors.foreground }]}>{labels[style]}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                <View style={styles.configRow}>
                  <Text style={[styles.configLabel, { color: colors.muted }]}>Rounds</Text>
                  <View style={styles.durationRow}>
                    {[2, 3, 4, 5, 6, 8].map((r) => {
                      const sel = (local.config.breathworkRounds ?? 4) === r;
                      return (
                        <Pressable
                          key={r}
                          onPress={() => updateConfig({ breathworkRounds: r })}
                          style={[styles.durationChip, { backgroundColor: sel ? colors.primary : colors.border }]}
                        >
                          <Text style={[styles.durationChipText, { color: sel ? '#fff' : colors.foreground }]}>{r}x</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </>
            )}

            {/* Reminder text */}
            {(local.type === 'reminder') && (
              <View style={styles.configRow}>
                <Text style={[styles.configLabel, { color: colors.muted }]}>Reminder text</Text>
                <TextInput
                  style={[styles.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                  value={local.config.reminderText ?? ''}
                  onChangeText={(t) => updateConfig({ reminderText: t })}
                  placeholder="e.g. Drink a glass of water 💧"
                  placeholderTextColor={colors.muted}
                  returnKeyType="done"
                  maxLength={120}
                />
              </View>
            )}

            {/* Custom label + note */}
            {local.type === 'custom' && (
              <>
                <View style={styles.configRow}>
                  <Text style={[styles.configLabel, { color: colors.muted }]}>Step name</Text>
                  <TextInput
                    style={[styles.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                    value={local.config.customLabel ?? ''}
                    onChangeText={(t) => updateConfig({ customLabel: t })}
                    placeholder="e.g. Do 20 push-ups"
                    placeholderTextColor={colors.muted}
                    returnKeyType="done"
                    maxLength={60}
                  />
                </View>
                <View style={styles.configRow}>
                  <Text style={[styles.configLabel, { color: colors.muted }]}>Note (optional)</Text>
                  <TextInput
                    style={[styles.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                    value={local.config.customNote ?? ''}
                    onChangeText={(t) => updateConfig({ customNote: t })}
                    placeholder="Additional instructions…"
                    placeholderTextColor={colors.muted}
                    returnKeyType="done"
                    maxLength={120}
                  />
                </View>
              </>
            )}

            {/* Journal prompt */}
            {local.type === 'journal' && (
              <View style={styles.configRow}>
                <Text style={[styles.configLabel, { color: colors.muted }]}>Prompt (optional)</Text>
                <TextInput
                  style={[styles.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                  value={local.config.journalPrompt ?? ''}
                  onChangeText={(t) => updateConfig({ journalPrompt: t })}
                  placeholder="e.g. What are you grateful for?"
                  placeholderTextColor={colors.muted}
                  returnKeyType="done"
                  maxLength={120}
                />
              </View>
            )}

            {/* Affirmations */}
            {local.type === 'affirmations' && (
              <View style={styles.configRow}>
                <Text style={[styles.configLabel, { color: colors.muted }]}>Affirmations (one per line)</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                  value={(local.config.affirmationLines ?? []).join('\n')}
                  onChangeText={(t) => updateConfig({ affirmationLines: t.split('\n').filter(Boolean) })}
                  placeholder={"I am confident\nI am healthy\nI am grateful"}
                  placeholderTextColor={colors.muted}
                  multiline
                  numberOfLines={5}
                  maxLength={600}
                />
              </View>
            )}

            {/* Delay after */}
            <View style={styles.configRow}>
              <Text style={[styles.configLabel, { color: colors.muted }]}>Countdown before next step</Text>
              <View style={styles.durationRow}>
                {delayOptions.map((d) => {
                  const sel = local.delayAfterSeconds === d;
                  const label = d === 0 ? 'None' : d < 60 ? `${d}s` : `${d / 60}m`;
                  return (
                    <Pressable
                      key={d}
                      onPress={() => update({ delayAfterSeconds: d })}
                      style={[styles.durationChip, { backgroundColor: sel ? colors.primary : colors.border }]}
                    >
                      <Text style={[styles.durationChipText, { color: sel ? '#fff' : colors.foreground }]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

          </ScrollView>

          <TouchableOpacity
            onPress={() => { if (local) onSave(local); }}
            style={[styles.saveBtn, { backgroundColor: colors.primary }]}
            activeOpacity={0.85}
          >
            <Text style={styles.saveBtnText}>Save Step</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Step Type Picker Modal ───────────────────────────────────────────────────

interface StepTypePickerProps {
  onSelect: (type: StepType) => void;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
}

function StepTypePicker({ onSelect, onClose, colors }: StepTypePickerProps) {
  const types = Object.values(STEP_TYPE_META);
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Add a Step</Text>
            <Pressable onPress={onClose} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <IconSymbol name="xmark" size={20} color={colors.muted} />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
            {types.map((meta) => (
              <Pressable
                key={meta.type}
                onPress={() => onSelect(meta.type)}
                style={({ pressed }) => [
                  styles.typeRow,
                  { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <View style={[styles.typeIconWrap, { backgroundColor: meta.color + '22' }]}>
                  <Text style={{ fontSize: 20 }}>{meta.emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.typeName, { color: colors.foreground }]}>{meta.label}</Text>
                  <Text style={[styles.typeDesc, { color: colors.muted }]}>{meta.description}</Text>
                </View>
                <IconSymbol name="chevron.right" size={16} color={colors.muted} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function StackEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();

  const [stack, setStack] = useState<RitualStack | null>(null);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [editingStep, setEditingStep] = useState<RitualStep | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Load stack on mount
  useEffect(() => {
    loadStacks().then((stacks) => {
      const found = stacks.find((s) => s.id === id);
      if (found) setStack(found);
    });
  }, [id]);

  const canAddStep = (stack?.steps.length ?? 0) < 5;

  // ── Step management ──────────────────────────────────────────────────────

  function handleAddStepType(type: StepType) {
    setShowTypePicker(false);
    const newStep: RitualStep = {
      id: newStepId(),
      type,
      config: {},
      delayAfterSeconds: 0,
    };
    // Open config modal immediately
    setEditingStep(newStep);
  }

  function handleSaveStep(step: RitualStep) {
    setEditingStep(null);
    setStack((prev) => {
      if (!prev) return prev;
      const existing = prev.steps.findIndex((s) => s.id === step.id);
      if (existing >= 0) {
        const steps = [...prev.steps];
        steps[existing] = step;
        return { ...prev, steps };
      }
      // New step — append (up to 5)
      if (prev.steps.length >= 5) return prev;
      return { ...prev, steps: [...prev.steps, step] };
    });
  }

  function handleDeleteStep(stepId: string) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStack((prev) => prev ? { ...prev, steps: prev.steps.filter((s) => s.id !== stepId) } : prev);
  }

  function moveStep(index: number, direction: 'up' | 'down') {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStack((prev) => {
      if (!prev) return prev;
      const steps = [...prev.steps];
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= steps.length) return prev;
      [steps[index], steps[target]] = [steps[target], steps[index]];
      return { ...prev, steps };
    });
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!stack) return;
    setSaving(true);
    try {
      await updateStack(stack);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      Alert.alert('Error', 'Could not save stack. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!stack) {
    return (
      <View style={[styles.loadingWrap, { backgroundColor: colors.background }]}>
        <Text style={[styles.loadingText, { color: colors.muted }]}>Loading…</Text>
      </View>
    );
  }

  const meta = stack.kind === 'wakeup'
    ? { color: '#F97316', bg: '#FFF7ED' }
    : { color: '#8B5CF6', bg: '#F5F3FF' };

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <IconSymbol name="chevron.left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          {stack.emoji} {stack.name}
        </Text>
        <Pressable
          onPress={handleSave}
          style={({ pressed }) => [styles.saveHeaderBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
        >
          <Text style={styles.saveHeaderBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>

        {/* Enable toggle */}
        <View style={[styles.toggleRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.toggleLabel, { color: colors.foreground }]}>Stack Active</Text>
            <Text style={[styles.toggleSub, { color: colors.muted }]}>Show this stack widget on the home screen</Text>
          </View>
          <Pressable
            onPress={() => setStack((p) => p ? { ...p, isEnabled: !p.isEnabled } : p)}
            style={[
              styles.toggle,
              { backgroundColor: stack.isEnabled ? colors.primary : colors.border },
            ]}
          >
            <View style={[styles.toggleKnob, { left: stack.isEnabled ? 22 : 2 }]} />
          </Pressable>
        </View>

        {/* Steps list */}
        <Text style={[styles.sectionLabel, { color: colors.muted }]}>
          STEPS ({stack.steps.length}/5)
        </Text>

        {stack.steps.length === 0 && (
          <View style={[styles.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>✨</Text>
            <Text style={[styles.emptyText, { color: colors.muted }]}>No steps yet. Add your first step below.</Text>
          </View>
        )}

        {stack.steps.map((step, index) => {
          const stepMeta = STEP_TYPE_META[step.type];
          return (
            <View key={step.id} style={[styles.stepCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {/* Step number badge */}
              <View style={[styles.stepNumBadge, { backgroundColor: stepMeta.color }]}>
                <Text style={styles.stepNumText}>{index + 1}</Text>
              </View>

              {/* Step info */}
              <Pressable
                onPress={() => setEditingStep(step)}
                style={({ pressed }) => [styles.stepInfo, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={{ fontSize: 20 }}>{stepMeta.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.stepName, { color: colors.foreground }]}>{stepLabel(step)}</Text>
                  {step.delayAfterSeconds > 0 && (
                    <Text style={[styles.stepDelay, { color: colors.muted }]}>
                      {step.delayAfterSeconds}s countdown before next
                    </Text>
                  )}
                </View>
                <IconSymbol name="pencil" size={14} color={colors.muted} />
              </Pressable>

              {/* Reorder + delete */}
              <View style={[styles.stepActions, { borderTopColor: colors.border }]}>
                <Pressable
                  onPress={() => moveStep(index, 'up')}
                  style={({ pressed }) => [styles.stepActionBtn, { opacity: index === 0 ? 0.3 : pressed ? 0.6 : 1 }]}
                  disabled={index === 0}
                >
                  <IconSymbol name="arrow.up" size={16} color={colors.muted} />
                </Pressable>
                <Pressable
                  onPress={() => moveStep(index, 'down')}
                  style={({ pressed }) => [styles.stepActionBtn, { opacity: index === stack.steps.length - 1 ? 0.3 : pressed ? 0.6 : 1 }]}
                  disabled={index === stack.steps.length - 1}
                >
                  <IconSymbol name="chevron.down" size={16} color={colors.muted} />
                </Pressable>
                <View style={{ flex: 1 }} />
                <Pressable
                  onPress={() => handleDeleteStep(step.id)}
                  style={({ pressed }) => [styles.stepActionBtn, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <IconSymbol name="trash" size={16} color={colors.error} />
                </Pressable>
              </View>
            </View>
          );
        })}

        {/* Add step button */}
        {canAddStep && (
          <Pressable
            onPress={() => {
              if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowTypePicker(true);
            }}
            style={({ pressed }) => [
              styles.addStepBtn,
              { borderColor: colors.primary, backgroundColor: colors.primary + '11', opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <IconSymbol name="plus" size={18} color={colors.primary} />
            <Text style={[styles.addStepText, { color: colors.primary }]}>Add Step</Text>
          </Pressable>
        )}

        {!canAddStep && (
          <Text style={[styles.maxNote, { color: colors.muted }]}>Maximum 5 steps per stack</Text>
        )}

        {/* How it works info box */}
        <View style={[styles.infoBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.infoTitle, { color: colors.foreground }]}>💡 How stacks work</Text>
          <Text style={[styles.infoBody, { color: colors.muted }]}>
            When you start a stack, each step plays in order. If you set a countdown delay, a timer will count down before the next step begins automatically. You can always skip or adjust any step during playback.
          </Text>
        </View>

      </ScrollView>

      {/* Step type picker modal */}
      {showTypePicker && (
        <StepTypePicker
          onSelect={handleAddStepType}
          onClose={() => setShowTypePicker(false)}
          colors={colors}
        />
      )}

      {/* Step config modal */}
      {editingStep && (
        <StepConfigModal
          step={editingStep}
          onSave={handleSaveStep}
          onClose={() => setEditingStep(null)}
          colors={colors}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 16 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700' },
  saveHeaderBtn: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20,
  },
  saveHeaderBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, borderRadius: 14, borderWidth: 1,
    marginBottom: 20, gap: 12,
  },
  toggleLabel: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  toggleSub: { fontSize: 12 },
  toggle: {
    width: 46, height: 26, borderRadius: 13,
    position: 'relative',
  },
  toggleKnob: {
    position: 'absolute', top: 3,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#fff',
  },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.8,
    marginBottom: 10, marginLeft: 2,
  },

  emptyBox: {
    padding: 32, borderRadius: 14, borderWidth: 1,
    alignItems: 'center', marginBottom: 12,
  },
  emptyText: { fontSize: 14, textAlign: 'center' },

  stepCard: {
    borderRadius: 14, borderWidth: 1,
    marginBottom: 10, overflow: 'hidden',
  },
  stepNumBadge: {
    position: 'absolute', top: 12, left: 12,
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 1,
  },
  stepNumText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  stepInfo: {
    flexDirection: 'row', alignItems: 'center',
    paddingLeft: 44, paddingRight: 14, paddingVertical: 14,
    gap: 10,
  },
  stepName: { fontSize: 15, fontWeight: '600' },
  stepDelay: { fontSize: 12, marginTop: 2 },
  stepActions: {
    flexDirection: 'row', alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8, paddingVertical: 6,
  },
  stepActionBtn: { padding: 8 },

  addStepBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: 14, borderRadius: 14, borderWidth: 1.5,
    borderStyle: 'dashed', marginBottom: 12,
  },
  addStepText: { fontSize: 15, fontWeight: '700' },
  maxNote: { textAlign: 'center', fontSize: 12, marginBottom: 12 },

  infoBox: {
    padding: 16, borderRadius: 14, borderWidth: 1, marginTop: 8,
  },
  infoTitle: { fontSize: 14, fontWeight: '700', marginBottom: 6 },
  infoBody: { fontSize: 13, lineHeight: 20 },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, padding: 20, paddingBottom: 32,
    gap: 16,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  modalTitle: { fontSize: 18, fontWeight: '700' },

  configRow: { marginBottom: 16 },
  configLabel: { fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  durationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  durationChip: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20,
  },
  durationChipText: { fontSize: 13, fontWeight: '600' },
  textInput: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14,
  },
  textArea: { height: 100, textAlignVertical: 'top' },

  saveBtn: {
    paddingVertical: 14, borderRadius: 14,
    alignItems: 'center', marginTop: 4,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  typeRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  typeIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  typeName: { fontSize: 15, fontWeight: '600' },
  typeDesc: { fontSize: 12, marginTop: 2 },
});
