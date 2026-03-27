/**
 * Unit tests for lib/stacks.ts
 * Tests data model helpers without needing AsyncStorage (pure logic).
 */
import { describe, it, expect } from 'vitest';
import {
  STEP_TYPE_META,
  stepLabel,
  stepDefaultDuration,
  stepIsAutoComplete,
  newStepId,
  type RitualStep,
  type StepType,
} from '../lib/stacks';

// ─── STEP_TYPE_META ───────────────────────────────────────────────────────────

describe('STEP_TYPE_META', () => {
  it('has entries for all 9 step types', () => {
    const types: StepType[] = ['timer', 'stopwatch', 'meditation', 'breathwork', 'journal', 'affirmations', 'priming', 'reminder', 'custom'];
    for (const t of types) {
      expect(STEP_TYPE_META[t]).toBeDefined();
      expect(STEP_TYPE_META[t].label).toBeTruthy();
      expect(STEP_TYPE_META[t].emoji).toBeTruthy();
    }
  });
});

// ─── stepLabel ────────────────────────────────────────────────────────────────

describe('stepLabel', () => {
  it('returns reminder text for reminder steps', () => {
    const step: RitualStep = { id: '1', type: 'reminder', config: { reminderText: 'Drink water 💧' }, delayAfterSeconds: 0 };
    expect(stepLabel(step)).toBe('Drink water 💧');
  });

  it('falls back to meta label when reminder text is empty', () => {
    const step: RitualStep = { id: '1', type: 'reminder', config: {}, delayAfterSeconds: 0 };
    expect(stepLabel(step)).toBe(STEP_TYPE_META.reminder.label);
  });

  it('returns customLabel for custom steps', () => {
    const step: RitualStep = { id: '1', type: 'custom', config: { customLabel: 'Do push-ups' }, delayAfterSeconds: 0 };
    expect(stepLabel(step)).toBe('Do push-ups');
  });

  it('includes duration in timer label', () => {
    const step: RitualStep = { id: '1', type: 'timer', config: { durationSeconds: 300 }, delayAfterSeconds: 0 };
    const label = stepLabel(step);
    expect(label).toContain('Timer');
    expect(label).toContain('5m');
  });

  it('includes breathwork style in label', () => {
    const step: RitualStep = { id: '1', type: 'breathwork', config: { breathworkStyle: 'box' }, delayAfterSeconds: 0 };
    const label = stepLabel(step);
    expect(label).toContain('Box');
  });

  it('returns meta label for meditation', () => {
    const step: RitualStep = { id: '1', type: 'meditation', config: {}, delayAfterSeconds: 0 };
    expect(stepLabel(step)).toBe(STEP_TYPE_META.meditation.label);
  });
});

// ─── stepDefaultDuration ─────────────────────────────────────────────────────

describe('stepDefaultDuration', () => {
  it('returns configured duration for timer steps', () => {
    const step: RitualStep = { id: '1', type: 'timer', config: { durationSeconds: 120 }, delayAfterSeconds: 0 };
    expect(stepDefaultDuration(step)).toBe(120);
  });

  it('returns 0 for open-ended steps (stopwatch, journal, reminder, custom)', () => {
    const openEnded: StepType[] = ['stopwatch', 'journal', 'reminder', 'custom'];
    for (const type of openEnded) {
      const step: RitualStep = { id: '1', type, config: {}, delayAfterSeconds: 0 };
      expect(stepDefaultDuration(step)).toBe(0);
    }
  });

  it('calculates breathwork duration from rounds', () => {
    const step: RitualStep = { id: '1', type: 'breathwork', config: { breathworkRounds: 4 }, delayAfterSeconds: 0 };
    expect(stepDefaultDuration(step)).toBe(4 * 32);
  });

  it('returns 600 for meditation', () => {
    const step: RitualStep = { id: '1', type: 'meditation', config: {}, delayAfterSeconds: 0 };
    expect(stepDefaultDuration(step)).toBe(600);
  });
});

// ─── stepIsAutoComplete ───────────────────────────────────────────────────────

describe('stepIsAutoComplete', () => {
  it('returns true for timer, breathwork, affirmations, priming, meditation', () => {
    const autoTypes: StepType[] = ['timer', 'breathwork', 'affirmations', 'priming', 'meditation'];
    for (const type of autoTypes) {
      const step: RitualStep = { id: '1', type, config: {}, delayAfterSeconds: 0 };
      expect(stepIsAutoComplete(step)).toBe(true);
    }
  });

  it('returns false for manual steps (stopwatch, journal, reminder, custom)', () => {
    const manualTypes: StepType[] = ['stopwatch', 'journal', 'reminder', 'custom'];
    for (const type of manualTypes) {
      const step: RitualStep = { id: '1', type, config: {}, delayAfterSeconds: 0 };
      expect(stepIsAutoComplete(step)).toBe(false);
    }
  });
});

// ─── newStepId ────────────────────────────────────────────────────────────────

describe('newStepId', () => {
  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newStepId()));
    expect(ids.size).toBe(50);
  });

  it('starts with "step_"', () => {
    expect(newStepId().startsWith('step_')).toBe(true);
  });
});
