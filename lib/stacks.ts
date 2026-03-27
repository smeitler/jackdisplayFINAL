/**
 * stacks.ts
 * Data models and AsyncStorage persistence for Wake Up / Sleep ritual stacks.
 *
 * A RitualStack is an ordered sequence of up to 5 RitualSteps.
 * When the player runs a stack, each step auto-advances to the next after
 * an optional countdown delay.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Step Types ───────────────────────────────────────────────────────────────

export type StepType =
  | 'timer'          // countdown for a fixed duration
  | 'stopwatch'      // count up, user taps done
  | 'meditation'     // plays a meditation audio track
  | 'breathwork'     // guided breathing exercise
  | 'journal'        // opens a text/voice journal entry
  | 'affirmations'   // TTS reads affirmations aloud
  | 'priming'        // guided priming/visualization session
  | 'reminder'       // shows a message, user taps "Done" to continue
  | 'custom';        // user-defined label + optional note

export interface StepTypeMeta {
  type: StepType;
  label: string;
  emoji: string;
  description: string;
  color: string;
}

export const STEP_TYPE_META: Record<StepType, StepTypeMeta> = {
  timer:        { type: 'timer',        label: 'Timer',         emoji: '⏱️', description: 'Countdown for a set duration',       color: '#3B82F6' },
  stopwatch:    { type: 'stopwatch',    label: 'Stopwatch',     emoji: '⏲️', description: 'Count up — tap Done when finished',   color: '#10B981' },
  meditation:   { type: 'meditation',   label: 'Meditation',    emoji: '🧘', description: 'Guided meditation audio',             color: '#8B5CF6' },
  breathwork:   { type: 'breathwork',   label: 'Breathwork',    emoji: '💨', description: 'Guided breathing exercise',           color: '#06B6D4' },
  journal:      { type: 'journal',      label: 'Journal',       emoji: '📓', description: 'Write or voice-record a journal entry', color: '#F59E0B' },
  affirmations: { type: 'affirmations', label: 'Affirmations',  emoji: '🗣️', description: 'Voice reads your affirmations aloud', color: '#EC4899' },
  priming:      { type: 'priming',      label: 'Priming',       emoji: '🔥', description: 'Guided visualization & priming',      color: '#F97316' },
  reminder:     { type: 'reminder',     label: 'Reminder',      emoji: '💧', description: 'A prompt — tap Done to continue',     color: '#14B8A6' },
  custom:       { type: 'custom',       label: 'Custom',        emoji: '✏️', description: 'Your own custom step',               color: '#6B7280' },
};

// ─── Step Config ─────────────────────────────────────────────────────────────

/** Config fields vary by step type. All optional — only relevant fields are set. */
export interface RitualStepConfig {
  // timer / stopwatch
  durationSeconds?: number;   // default 300 (5 min)

  // meditation
  meditationTrackId?: string; // track ID from wellness-audio catalog
  meditationStyle?: string;   // e.g. 'morning-mindset'

  // breathwork
  breathworkStyle?: 'box' | '4_7_8' | 'wim_hof';
  breathworkRounds?: number;

  // affirmations
  affirmationLines?: string[]; // list of affirmation strings to read aloud

  // reminder / custom
  reminderText?: string;      // e.g. "Drink a glass of water"
  customLabel?: string;       // override display label for custom steps
  customNote?: string;        // optional sub-label

  // journal
  journalPrompt?: string;     // optional prompt shown in the journal entry
}

// ─── Step ─────────────────────────────────────────────────────────────────────

export interface RitualStep {
  id: string;
  type: StepType;
  config: RitualStepConfig;
  /** Seconds to wait (with countdown) before auto-advancing to the next step. 0 = no delay. */
  delayAfterSeconds: number;
}

// ─── Stack ────────────────────────────────────────────────────────────────────

export type StackKind = 'wakeup' | 'sleep';

export interface RitualStack {
  id: string;         // 'wakeup' | 'sleep' (fixed) or custom UUID
  kind: StackKind;
  name: string;
  emoji: string;
  steps: RitualStep[]; // max 5
  isEnabled: boolean;
  updatedAt: string;   // ISO date
}

// ─── Storage Keys ─────────────────────────────────────────────────────────────

const STACKS_KEY = '@ritual_stacks_v1';

// ─── Default Stacks ───────────────────────────────────────────────────────────

function makeDefaultStacks(): RitualStack[] {
  return [
    {
      id: 'wakeup',
      kind: 'wakeup',
      name: 'Wake Up Stack',
      emoji: '☀️',
      isEnabled: true,
      updatedAt: new Date().toISOString(),
      steps: [
        {
          id: 'wu1',
          type: 'reminder',
          config: { reminderText: 'Drink a glass of water 💧' },
          delayAfterSeconds: 0,
        },
        {
          id: 'wu2',
          type: 'breathwork',
          config: { breathworkStyle: 'box', breathworkRounds: 4 },
          delayAfterSeconds: 5,
        },
        {
          id: 'wu3',
          type: 'journal',
          config: { journalPrompt: 'What are you grateful for today?' },
          delayAfterSeconds: 0,
        },
      ],
    },
    {
      id: 'sleep',
      kind: 'sleep',
      name: 'Sleep Stack',
      emoji: '🌙',
      isEnabled: true,
      updatedAt: new Date().toISOString(),
      steps: [
        {
          id: 'sl1',
          type: 'reminder',
          config: { reminderText: 'Put your phone face-down 📵' },
          delayAfterSeconds: 0,
        },
        {
          id: 'sl2',
          type: 'breathwork',
          config: { breathworkStyle: '4_7_8', breathworkRounds: 4 },
          delayAfterSeconds: 5,
        },
        {
          id: 'sl3',
          type: 'meditation',
          config: { meditationStyle: 'sleep' },
          delayAfterSeconds: 0,
        },
      ],
    },
  ];
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function loadStacks(): Promise<RitualStack[]> {
  try {
    const raw = await AsyncStorage.getItem(STACKS_KEY);
    if (!raw) return makeDefaultStacks();
    const parsed = JSON.parse(raw) as RitualStack[];
    // Ensure both wakeup and sleep stacks always exist
    const hasWakeup = parsed.some((s) => s.id === 'wakeup');
    const hasSleep = parsed.some((s) => s.id === 'sleep');
    const defaults = makeDefaultStacks();
    const merged = [...parsed];
    if (!hasWakeup) merged.unshift(defaults[0]);
    if (!hasSleep) merged.push(defaults[1]);
    return merged;
  } catch {
    return makeDefaultStacks();
  }
}

export async function saveStacks(stacks: RitualStack[]): Promise<void> {
  await AsyncStorage.setItem(STACKS_KEY, JSON.stringify(stacks));
}

export async function updateStack(stack: RitualStack): Promise<void> {
  const stacks = await loadStacks();
  const idx = stacks.findIndex((s) => s.id === stack.id);
  const updated = { ...stack, updatedAt: new Date().toISOString() };
  if (idx >= 0) {
    stacks[idx] = updated;
  } else {
    stacks.push(updated);
  }
  await saveStacks(stacks);
}

export async function getStack(id: string): Promise<RitualStack | null> {
  const stacks = await loadStacks();
  return stacks.find((s) => s.id === id) ?? null;
}

// ─── Step Helpers ─────────────────────────────────────────────────────────────

/** Human-readable label for a step (used in editor list + player header). */
export function stepLabel(step: RitualStep): string {
  const meta = STEP_TYPE_META[step.type];
  if (step.type === 'reminder') return step.config.reminderText ?? meta.label;
  if (step.type === 'custom') return step.config.customLabel ?? meta.label;
  if (step.type === 'timer') {
    const s = step.config.durationSeconds ?? 300;
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${meta.label} · ${m > 0 ? `${m}m` : ''}${sec > 0 ? ` ${sec}s` : ''}`.trim();
  }
  if (step.type === 'breathwork') {
    const styles: Record<string, string> = { box: 'Box', '4_7_8': '4-7-8', wim_hof: 'Wim Hof' };
    return `${meta.label} · ${styles[step.config.breathworkStyle ?? 'box'] ?? ''}`;
  }
  return meta.label;
}

/** Default duration in seconds for a step (used for progress bar). */
export function stepDefaultDuration(step: RitualStep): number {
  switch (step.type) {
    case 'timer':       return step.config.durationSeconds ?? 300;
    case 'stopwatch':   return 0; // open-ended
    case 'meditation':  return 600;
    case 'breathwork':  return (step.config.breathworkRounds ?? 4) * 32;
    case 'journal':     return 0; // open-ended
    case 'affirmations':return 120;
    case 'priming':     return 600;
    case 'reminder':    return 0; // tap to continue
    case 'custom':      return 0;
    default:            return 0;
  }
}

/** Returns true if the step auto-completes (timer, breathwork, affirmations, priming). */
export function stepIsAutoComplete(step: RitualStep): boolean {
  return ['timer', 'breathwork', 'affirmations', 'priming', 'meditation'].includes(step.type);
}

/** Generate a unique step ID. */
export function newStepId(): string {
  return `step_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
