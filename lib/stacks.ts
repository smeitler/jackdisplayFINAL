/**
 * lib/stacks.ts
 * Data models, step-type registry, and AsyncStorage helpers for
 * Wake Up Stack and Sleep Stack ritual sequences.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Step types ───────────────────────────────────────────────────────────────

export type StepType =
  | 'timer'
  | 'stopwatch'
  | 'meditation'
  | 'breathwork'
  | 'journal'
  | 'affirmations'
  | 'priming'
  | 'reminder'
  | 'melatonin'
  | 'motivational'
  | 'spiritual'
  | 'jokes'
  | 'custom';

export interface StepTypeMeta {
  label: string;
  emoji: string;
  description: string;
  autoComplete: boolean;
}

export const STEP_TYPE_META: Record<StepType, StepTypeMeta> = {
  timer:        { label: 'Timer',          emoji: '⏱️',  description: 'Count down a set duration',               autoComplete: true  },
  stopwatch:    { label: 'Stopwatch',      emoji: '⏲️',  description: 'Open-ended timer you stop manually',      autoComplete: false },
  meditation:   { label: 'Meditation',     emoji: '🧘',  description: 'Guided or silent meditation session',     autoComplete: true  },
  breathwork:   { label: 'Breathwork',     emoji: '💨',  description: 'Guided breathing exercise',               autoComplete: true  },
  journal:      { label: 'Journal Entry',  emoji: '📓',  description: 'Write a quick journal entry',             autoComplete: false },
  affirmations: { label: 'Affirmations',   emoji: '🗣️',  description: 'Voice affirmations read aloud to you',   autoComplete: true  },
  priming:      { label: 'Priming',        emoji: '🔥',  description: 'Tony Robbins-style priming session',      autoComplete: true  },
  reminder:     { label: 'Reminder',       emoji: '💧',  description: 'A prompt to do something (drink water…)', autoComplete: false },
  melatonin:    { label: 'Melatonin',      emoji: '🌙',  description: 'Reminder to take melatonin before sleep',  autoComplete: false },
  motivational: { label: 'Motivational',   emoji: '💪',  description: 'A motivational quote read aloud to you',   autoComplete: true  },
  spiritual:    { label: 'Spiritual',      emoji: '🙏',  description: 'A spiritual reflection or message',        autoComplete: true  },
  custom:       { label: 'Custom',         emoji: '✏️',  description: 'Your own custom step',                    autoComplete: false },
  jokes:         { label: 'Jokes & Puns',   emoji: '😂',  description: 'A funny joke or pun to start your day',     autoComplete: true  },
};

// ─── Step config ──────────────────────────────────────────────────────────────

export interface StepConfig {
  durationSeconds?: number;
  breathworkStyle?: 'box' | '4-7-8' | 'wim-hof' | 'coherent';
  breathworkRounds?: number;
  meditationDurationSeconds?: number;
  // Library track selections
  meditationTrackId?: string;
  meditationTrackTitle?: string;
  breathworkTrackId?: string;
  breathworkTrackTitle?: string;
  primingTrackId?: string;
  primingTrackTitle?: string;
  voiceId?: string;
  reminderText?: string;
  customLabel?: string;
  journalPrompt?: string;
  motivationalGenre?: string;
  spiritualCategory?: string;
  // Motivational speech library
  motivationalSpeechId?: string;       // specific speech ID from library
  motivationalSpeechCategory?: string; // category filter (plays random from category)
  motivationalSpeechMode?: 'random' | 'sequential'; // how to pick next speech
  // Affirmations library
  affirmationsChapter?: number;        // chapter to pull from (default 1)
  affirmationsCategory?: string;       // category filter (undefined = all categories)
  affirmationsMode?: 'random' | 'sequential'; // how to pick next affirmation
  affirmationsCount?: number;          // how many to play in sequence (1-10, default 1)
  // Custom audio upload
  customAudioFiles?: string[];         // local file URIs
  customAudioMode?: 'random' | 'sequential'; // rotation mode
  // Jokes library
  jokesCategory?: string;              // category filter (undefined = any)
  jokesCount?: number;                 // how many jokes to play (1-5, default 1)
  jokesMode?: 'random' | 'sequential'; // how to pick next joke
  // Spiritual / Scripture library
  spiritualSource?: 'book-of-mormon' | 'bible'; // which scripture source
  spiritualBookId?: string;            // specific book within the source (e.g. '1-nephi')
  spiritualChapterStart?: number;      // starting chapter index (0-based within the selected book)
  spiritualChaptersCount?: number;     // how many chapters to play (1-5, default 1)
  spiritualMode?: 'sequential' | 'random'; // playback order
  // Linked habit for custom audio step
  linkedHabitId?: string;              // habit ID to rate after audio finishes
  linkedHabitName?: string;            // display name of linked habit
}

// ─── Step ─────────────────────────────────────────────────────────────────────

export interface RitualStep {
  id: string;
  type: StepType;
  config: StepConfig;
  delayAfterSeconds: number;
}

// ─── Stack ────────────────────────────────────────────────────────────────────

export type StackKind = 'wakeup' | 'sleep';

export interface RitualStack {
  id: StackKind;
  name: string;
  emoji: string;
  steps: RitualStep[];
  isEnabled: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function newStepId(): string {
  return `step_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function stepLabel(step: RitualStep): string {
  switch (step.type) {
    case 'reminder':     return step.config.reminderText || STEP_TYPE_META.reminder.label;
    case 'custom':       return step.config.customLabel   || STEP_TYPE_META.custom.label;
    case 'motivational': {
      if (step.config.motivationalSpeechCategory) return `Motivational — ${step.config.motivationalSpeechCategory}`;
      if (step.config.motivationalGenre) return `Motivational — ${step.config.motivationalGenre}`;
      return 'Motivational';
    }
    case 'spiritual': {
      const src = step.config.spiritualSource === 'bible' ? 'Bible' : 'Book of Mormon';
      if (step.config.spiritualBookId) {
        const bookName = step.config.spiritualBookId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        return `Spiritual — ${bookName}`;
      }
      return `Spiritual — ${src}`;
    }
    case 'jokes': {
      if (step.config.jokesCategory) return `Jokes — ${step.config.jokesCategory}`;
      return 'Jokes & Puns';
    }
    case 'timer': {
      const secs = step.config.durationSeconds ?? 0;
      const mins = Math.floor(secs / 60);
      const s    = secs % 60;
      const dur  = mins > 0 ? `${mins}m${s > 0 ? ` ${s}s` : ''}` : `${s}s`;
      return `Timer — ${dur}`;
    }
    case 'breathwork': {
      const styleMap: Record<string, string> = {
        'box': 'Box Breathing', '4-7-8': '4-7-8', 'wim-hof': 'Wim Hof', 'coherent': 'Coherent',
      };
      return styleMap[step.config.breathworkStyle ?? ''] ?? 'Breathwork';
    }
    default: return STEP_TYPE_META[step.type].label;
  }
}

export function stepDefaultDuration(step: RitualStep): number {
  switch (step.type) {
    case 'timer':        return step.config.durationSeconds ?? 60;
    case 'meditation':   return step.config.meditationDurationSeconds ?? 600;
    case 'breathwork':   return (step.config.breathworkRounds ?? 4) * 32;
    case 'affirmations': return (step.config.affirmationsCount ?? 1) * 90;
    case 'jokes':        return (step.config.jokesCount ?? 1) * 30;
    case 'spiritual':    return (step.config.spiritualChaptersCount ?? 1) * 300;
    case 'priming':      return 600;
    default:             return 0;
  }
}

export function stepIsAutoComplete(step: RitualStep): boolean {
  return STEP_TYPE_META[step.type].autoComplete;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

const STACKS_KEY = '@daycheck:stacks:v1';

const DEFAULT_STACKS: RitualStack[] = [
  { id: 'wakeup', name: 'Wake Up Stack', emoji: '☀️', isEnabled: true, steps: [] },
  { id: 'sleep',  name: 'Sleep Stack',   emoji: '🌙', isEnabled: true, steps: [] },
];

export async function loadStacks(): Promise<RitualStack[]> {
  try {
    const raw = await AsyncStorage.getItem(STACKS_KEY);
    if (!raw) return DEFAULT_STACKS;
    const parsed: RitualStack[] = JSON.parse(raw);
    const ids = parsed.map((s) => s.id);
    const merged = [...parsed];
    for (const def of DEFAULT_STACKS) {
      if (!ids.includes(def.id)) merged.push(def);
    }
    return merged;
  } catch {
    return DEFAULT_STACKS;
  }
}

export async function saveStacks(stacks: RitualStack[]): Promise<void> {
  await AsyncStorage.setItem(STACKS_KEY, JSON.stringify(stacks));
}

export async function updateStack(updated: RitualStack): Promise<void> {
  const all = await loadStacks();
  const next = all.map((s) => (s.id === updated.id ? updated : s));
  await saveStacks(next);
}
