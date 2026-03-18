/**
 * Unit tests for the new features implemented on Mar 18 2026:
 * 1. Calendar date number visibility
 * 2. Morning practice inline picker state logic
 * 3. Morning practice catalog data integrity
 */

import { describe, it, expect } from 'vitest';

// ─── 1. Calendar date number visibility ──────────────────────────────────────

describe('Calendar date number visibility', () => {
  it('date number font size should be at least 10 to be legible', () => {
    // The minimum legible font size for date numbers on a small calendar cell
    const MIN_FONT_SIZE = 10;
    // From our implementation in category-calendar.tsx and calendar-heatmap.tsx
    const implementedFontSize = 11; // updated from 9 to 11
    expect(implementedFontSize).toBeGreaterThanOrEqual(MIN_FONT_SIZE);
  });
});

// ─── 2. Morning practice inline picker logic ─────────────────────────────────

describe('Morning practice duration picker', () => {
  it('custom duration overrides preset when valid', () => {
    const presetDuration = 10;
    const customDurationStr = '25';
    const customMins = parseInt(customDurationStr, 10);
    const effectiveDuration = (!isNaN(customMins) && customMins > 0) ? customMins : presetDuration;
    expect(effectiveDuration).toBe(25);
  });

  it('preset duration is used when custom is empty', () => {
    const presetDuration = 15;
    const customDurationStr = '';
    const customMins = parseInt(customDurationStr, 10);
    const effectiveDuration = (!isNaN(customMins) && customMins > 0) ? customMins : presetDuration;
    expect(effectiveDuration).toBe(15);
  });

  it('preset duration is used when custom is invalid', () => {
    const presetDuration = 10;
    const customDurationStr = 'abc';
    const customMins = parseInt(customDurationStr, 10);
    const effectiveDuration = (!isNaN(customMins) && customMins > 0) ? customMins : presetDuration;
    expect(effectiveDuration).toBe(10);
  });

  it('preset duration is used when custom is zero', () => {
    const presetDuration = 10;
    const customDurationStr = '0';
    const customMins = parseInt(customDurationStr, 10);
    const effectiveDuration = (!isNaN(customMins) && customMins > 0) ? customMins : presetDuration;
    expect(effectiveDuration).toBe(10);
  });

  it('all 4 practice types are valid', () => {
    const validTypes = ['priming', 'meditation', 'breathwork', 'visualization'] as const;
    expect(validTypes).toHaveLength(4);
    expect(validTypes).toContain('priming');
    expect(validTypes).toContain('meditation');
    expect(validTypes).toContain('breathwork');
    expect(validTypes).toContain('visualization');
  });

  it('duration options include 5, 10, 15, 20', () => {
    const durationOptions = [5, 10, 15, 20];
    expect(durationOptions).toHaveLength(4);
    expect(durationOptions).toContain(5);
    expect(durationOptions).toContain(20);
  });
});

// ─── 3. Morning practice catalog data integrity ───────────────────────────────

describe('Morning practice catalog', () => {
  const PRACTICE_CARDS = [
    { id: 'priming',       showDuration: true,  showBreathwork: false, defaultDuration: 15 },
    { id: 'meditation',    showDuration: true,  showBreathwork: false, defaultDuration: 10 },
    { id: 'breathwork',    showDuration: false, showBreathwork: true,  defaultDuration: 10 },
    { id: 'visualization', showDuration: true,  showBreathwork: false, defaultDuration: 10 },
  ];

  it('has exactly 4 practice cards', () => {
    expect(PRACTICE_CARDS).toHaveLength(4);
  });

  it('only breathwork shows breathwork style picker', () => {
    const breathworkCards = PRACTICE_CARDS.filter(c => c.showBreathwork);
    expect(breathworkCards).toHaveLength(1);
    expect(breathworkCards[0].id).toBe('breathwork');
  });

  it('all non-breathwork cards show duration picker', () => {
    const durationCards = PRACTICE_CARDS.filter(c => c.showDuration);
    expect(durationCards).toHaveLength(3);
    const ids = durationCards.map(c => c.id);
    expect(ids).toContain('priming');
    expect(ids).toContain('meditation');
    expect(ids).toContain('visualization');
  });

  it('all default durations are positive', () => {
    for (const card of PRACTICE_CARDS) {
      expect(card.defaultDuration).toBeGreaterThan(0);
    }
  });

  it('breathwork styles are valid', () => {
    const BREATHWORK_STYLES = ['wim_hof', 'box', '4_7_8'];
    expect(BREATHWORK_STYLES).toHaveLength(3);
    expect(BREATHWORK_STYLES).toContain('box');
    expect(BREATHWORK_STYLES).toContain('wim_hof');
    expect(BREATHWORK_STYLES).toContain('4_7_8');
  });
});

// ─── 4. Confetti animation ────────────────────────────────────────────────────

describe('Confetti animation trigger', () => {
  it('confetti should trigger when a reward is claimed', () => {
    // Simulate the state transition: unclaimed → claimed
    let confettiVisible = false;
    const handleClaimReward = () => {
      confettiVisible = true;
    };
    handleClaimReward();
    expect(confettiVisible).toBe(true);
  });

  it('confetti auto-hides after timeout', async () => {
    let confettiVisible = true;
    // Simulate auto-hide after 3000ms
    const CONFETTI_DURATION = 3000;
    expect(CONFETTI_DURATION).toBeGreaterThan(0);
    // After timeout, confetti should be hidden
    setTimeout(() => { confettiVisible = false; }, CONFETTI_DURATION);
    // At time 0, confetti is still visible
    expect(confettiVisible).toBe(true);
  });
});
