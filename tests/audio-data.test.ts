/**
 * Tests for the motivational speeches and affirmations data files,
 * and the custom audio helper library.
 */
import { describe, it, expect } from 'vitest';
import {
  MOTIVATIONAL_SPEECHES,
  SPEECH_CATEGORIES,
  getSpeechesByCategory,
  getRandomSpeech,
} from '../app/data/motivational-speeches';
import {
  AFFIRMATIONS,
  getAffirmationsByChapter,
  getRandomAffirmation,
  AFFIRMATION_CHAPTERS,
} from '../app/data/affirmations';

describe('Motivational Speeches data', () => {
  it('has 51 speeches', () => {
    expect(MOTIVATIONAL_SPEECHES.length).toBe(51);
  });

  it('has 15 categories', () => {
    expect(SPEECH_CATEGORIES.length).toBe(15);
  });

  it('all speeches have valid CDN URLs', () => {
    for (const s of MOTIVATIONAL_SPEECHES) {
      expect(s.url).toMatch(/^https:\/\/files\.manuscdn\.com\//);
    }
  });

  it('all speeches have unique IDs', () => {
    const ids = MOTIVATIONAL_SPEECHES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('getSpeechesByCategory returns only matching category', () => {
    const pool = getSpeechesByCategory('Discipline');
    expect(pool.length).toBeGreaterThan(0);
    for (const s of pool) {
      expect(s.category).toBe('Discipline');
    }
  });

  it('getRandomSpeech returns a speech from the pool', () => {
    const s = getRandomSpeech('Mindset');
    expect(s.category).toBe('Mindset');
    expect(s.url).toBeTruthy();
  });

  it('getRandomSpeech without category returns any speech', () => {
    const s = getRandomSpeech();
    expect(MOTIVATIONAL_SPEECHES.some((m) => m.id === s.id)).toBe(true);
  });
});

describe('Affirmations data', () => {
  it('has at least 180 affirmations', () => {
    expect(AFFIRMATIONS.length).toBeGreaterThanOrEqual(180);
  });

  it('all affirmations have valid CDN URLs', () => {
    for (const a of AFFIRMATIONS) {
      expect(a.url).toMatch(/^https:\/\/files\.manuscdn\.com\//);
    }
  });

  it('all affirmations have unique IDs', () => {
    const ids = AFFIRMATIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('AFFIRMATION_CHAPTERS contains chapter 1', () => {
    expect(AFFIRMATION_CHAPTERS).toContain(1);
  });

  it('getAffirmationsByChapter(1) returns all affirmations', () => {
    const ch1 = getAffirmationsByChapter(1);
    expect(ch1.length).toBe(AFFIRMATIONS.length);
  });

  it('getRandomAffirmation returns an affirmation', () => {
    const a = getRandomAffirmation();
    expect(a.url).toBeTruthy();
    expect(AFFIRMATIONS.some((x) => x.id === a.id)).toBe(true);
  });
});
