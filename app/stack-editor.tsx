/**
 * Stack Editor Screen
 * Add, remove, reorder, and configure ritual steps for a stack.
 * Up to 5 steps per stack.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, Platform,
  TextInput, Modal,
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

const STEP_TYPES: StepType[] = [
  'timer', 'stopwatch', 'meditation', 'breathwork',
  'journal', 'affirmations', 'priming', 'reminder', 'custom',
];

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
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <IconSymbol name="chevron.left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{stack.name}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {stack.steps.length === 0 ? (
          <View style={[styles.emptyBox, { borderColor: colors.border }]}>
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
              <View style={styles.stepLeft}>
                <View style={[styles.stepNumBadge, { backgroundColor: accentColor }]}>
                  <Text style={styles.stepNum}>{idx + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.stepType, { color: colors.muted }]}>
                    {STEP_TYPE_META[step.type].emoji} {STEP_TYPE_META[step.type].label}
                  </Text>
                  <Text style={[styles.stepLabel, { color: colors.foreground }]} numberOfLines={1}>
                    {stepLabel(step)}
                  </Text>
                  {step.delayAfterSeconds > 0 && (
                    <Text style={[styles.stepDelay, { color: colors.muted }]}>
                      {step.delayAfterSeconds}s delay
                    </Text>
                  )}
                </View>
              </View>
              <View style={styles.stepActions}>
                <Pressable onPress={() => setEditingStep(step)} style={({ pressed }) => [styles.stepActionBtn, { opacity: pressed ? 0.6 : 1 }]}>
                  <IconSymbol name="pencil" size={16} color={colors.muted} />
                </Pressable>
                <Pressable onPress={() => moveStep(step.id, 'up')} disabled={idx === 0} style={({ pressed }) => [styles.stepActionBtn, { opacity: idx === 0 ? 0.25 : pressed ? 0.6 : 1 }]}>
                  <IconSymbol name="arrow.up" size={16} color={colors.muted} />
                </Pressable>
                <Pressable onPress={() => moveStep(step.id, 'down')} disabled={idx === stack.steps.length - 1} style={({ pressed }) => [styles.stepActionBtn, { opacity: idx === stack.steps.length - 1 ? 0.25 : pressed ? 0.6 : 1 }]}>
                  <IconSymbol name="arrow.down" size={16} color={colors.muted} />
                </Pressable>
                <Pressable onPress={() => removeStep(step.id)} style={({ pressed }) => [styles.stepActionBtn, { opacity: pressed ? 0.6 : 1 }]}>
                  <IconSymbol name="trash" size={16} color={colors.error} />
                </Pressable>
              </View>
            </View>
          ))
        )}

        {stack.steps.length < MAX_STEPS && (
          <Pressable
            onPress={() => setAddingStep(true)}
            style={({ pressed }) => [styles.addStepBtn, { borderColor: accentColor, opacity: pressed ? 0.7 : 1 }]}
          >
            <IconSymbol name="plus" size={18} color={accentColor} />
            <Text style={[styles.addStepText, { color: accentColor }]}>
              Add Step ({stack.steps.length}/{MAX_STEPS})
            </Text>
          </Pressable>
        )}
        {stack.steps.length >= MAX_STEPS && (
          <Text style={[styles.maxNote, { color: colors.muted }]}>Maximum {MAX_STEPS} steps reached.</Text>
        )}
      </ScrollView>

      {/* Step type picker */}
      <Modal visible={addingStep} transparent animationType="slide" onRequestClose={() => setAddingStep(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setAddingStep(false)} />
        <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}>
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Choose Step Type</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {STEP_TYPES.map((type) => (
              <Pressable key={type} onPress={() => addStep(type)} style={({ pressed }) => [styles.typeRow, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
                <Text style={{ fontSize: 24 }}>{STEP_TYPE_META[type].emoji}</Text>
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

      {/* Step config */}
      {editingStep && (
        <StepConfigModal step={editingStep} colors={colors} insets={insets} onSave={saveStepEdit} onClose={() => setEditingStep(null)} />
      )}
    </View>
  );
}

function StepConfigModal({ step, colors, insets, onSave, onClose }: {
  step: RitualStep; colors: ReturnType<typeof useColors>;
  insets: ReturnType<typeof useSafeAreaInsets>;
  onSave: (s: RitualStep) => void; onClose: () => void;
}) {
  const [config, setConfig] = useState<StepConfig>({ ...step.config });
  const [delay, setDelay] = useState(String(step.delayAfterSeconds));

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 16 }]}>
        <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
          {STEP_TYPE_META[step.type].emoji} {STEP_TYPE_META[step.type].label}
        </Text>
        <ScrollView showsVerticalScrollIndicator={false}>
          {step.type === 'timer' && (
            <CRow label="Duration (seconds)" colors={colors}>
              <TextInput style={[styles.configInput, { color: colors.foreground, borderColor: colors.border }]} keyboardType="number-pad"
                value={String(config.durationSeconds ?? 60)} onChangeText={(v) => setConfig({ ...config, durationSeconds: parseInt(v, 10) || 60 })} />
            </CRow>
          )}
          {step.type === 'breathwork' && (
            <>
              <CRow label="Style" colors={colors}>
                {(['box', '4-7-8', 'wim-hof', 'coherent'] as const).map((s) => (
                  <Pressable key={s} onPress={() => setConfig({ ...config, breathworkStyle: s })}
                    style={[styles.chipBtn, { backgroundColor: config.breathworkStyle === s ? colors.primary : colors.border }]}>
                    <Text style={{ color: config.breathworkStyle === s ? '#fff' : colors.foreground, fontSize: 12 }}>{s}</Text>
                  </Pressable>
                ))}
              </CRow>
              <CRow label="Rounds" colors={colors}>
                <TextInput style={[styles.configInput, { color: colors.foreground, borderColor: colors.border }]} keyboardType="number-pad"
                  value={String(config.breathworkRounds ?? 4)} onChangeText={(v) => setConfig({ ...config, breathworkRounds: parseInt(v, 10) || 4 })} />
              </CRow>
            </>
          )}
          {step.type === 'meditation' && (
            <CRow label="Duration (minutes)" colors={colors}>
              <TextInput style={[styles.configInput, { color: colors.foreground, borderColor: colors.border }]} keyboardType="number-pad"
                value={String(Math.round((config.meditationDurationSeconds ?? 600) / 60))}
                onChangeText={(v) => setConfig({ ...config, meditationDurationSeconds: (parseInt(v, 10) || 10) * 60 })} />
            </CRow>
          )}
          {step.type === 'reminder' && (
            <CRow label="Reminder text" colors={colors}>
              <TextInput style={[styles.configInput, { color: colors.foreground, borderColor: colors.border }]}
                placeholder="e.g. Drink a glass of water" placeholderTextColor={colors.muted}
                value={config.reminderText ?? ''} onChangeText={(v) => setConfig({ ...config, reminderText: v })} />
            </CRow>
          )}
          {step.type === 'custom' && (
            <CRow label="Step name" colors={colors}>
              <TextInput style={[styles.configInput, { color: colors.foreground, borderColor: colors.border }]}
                placeholder="e.g. Do 20 push-ups" placeholderTextColor={colors.muted}
                value={config.customLabel ?? ''} onChangeText={(v) => setConfig({ ...config, customLabel: v })} />
            </CRow>
          )}
          <CRow label="Countdown delay before this step (seconds)" colors={colors}>
            <TextInput style={[styles.configInput, { color: colors.foreground, borderColor: colors.border }]}
              keyboardType="number-pad" value={delay} onChangeText={setDelay} />
          </CRow>
        </ScrollView>
        <Pressable onPress={() => onSave({ ...step, config, delayAfterSeconds: parseInt(delay, 10) || 0 })}
          style={({ pressed }) => [styles.saveBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}>
          <Text style={styles.saveBtnText}>Save</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function CRow({ label, children, colors }: { label: string; children: React.ReactNode; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.configRow}>
      <Text style={[styles.configLabel, { color: colors.muted }]}>{label}</Text>
      <View style={styles.configRowContent}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { padding: 4, width: 40 },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  emptyBox: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, padding: 24, alignItems: 'center', marginBottom: 16 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  stepCard: { borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepNumBadge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stepNum: { color: '#fff', fontSize: 12, fontWeight: '800' },
  stepType: { fontSize: 11, fontWeight: '500', marginBottom: 2 },
  stepLabel: { fontSize: 14, fontWeight: '700' },
  stepDelay: { fontSize: 11, marginTop: 2 },
  stepActions: { flexDirection: 'row', gap: 4 },
  stepActionBtn: { padding: 6 },
  addStepBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 14, paddingVertical: 14, marginBottom: 16 },
  addStepText: { fontSize: 15, fontWeight: '700' },
  maxNote: { textAlign: 'center', fontSize: 13, marginBottom: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 20, paddingHorizontal: 16, maxHeight: '75%' },
  sheetTitle: { fontSize: 18, fontWeight: '800', marginBottom: 16, textAlign: 'center' },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  typeLabel: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  typeDesc: { fontSize: 12 },
  configRow: { marginBottom: 16 },
  configLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  configRowContent: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  configInput: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  chipBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  saveBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
