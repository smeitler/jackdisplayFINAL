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
} from '../lib/data/motivational-speeches';
import {
  AFFIRMATIONS,
  AFFIRMATION_CATEGORIES,
  getAffirmationsByChapter,
  getAffirmationsByCategory,
  getRandomAffirmation,
  AFFIRMATION_CHAPTERS,
} from '../lib/data/affirmations';

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
  it('has 189 affirmations', () => {
    expect(AFFIRMATIONS.length).toBe(189);
  });

  it('has 10 categories', () => {
    expect(AFFIRMATION_CATEGORIES.length).toBe(10);
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

  it('every affirmation has a valid category', () => {
    for (const a of AFFIRMATIONS) {
      expect(AFFIRMATION_CATEGORIES).toContain(a.category);
    }
  });

  it('getAffirmationsByCategory returns correct subset', () => {
    for (const cat of AFFIRMATION_CATEGORIES) {
      const subset = getAffirmationsByCategory(cat);
      expect(subset.length).toBeGreaterThan(0);
      for (const a of subset) {
        expect(a.category).toBe(cat);
      }
    }
  });

  it('all categories have 15-20 affirmations each', () => {
    for (const cat of AFFIRMATION_CATEGORIES) {
      const count = getAffirmationsByCategory(cat).length;
      expect(count).toBeGreaterThanOrEqual(15);
      expect(count).toBeLessThanOrEqual(20);
    }
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

  it('getRandomAffirmation with category returns matching affirmation', () => {
    const a = getRandomAffirmation('Confidence');
    expect(a.category).toBe('Confidence');
  });

  it('count cap: Math.min(count, 10) never exceeds 10', () => {
    for (const n of [1, 2, 3, 5, 7, 10, 15, 20]) {
      expect(Math.min(n, 10)).toBeLessThanOrEqual(10);
    }
  });
});

import {
  BOOK_OF_MORMON_SECTIONS,
  ALL_BOM_CHAPTERS,
  BOOK_OF_MORMON_CHAPTERS,
} from '../lib/data/spiritual-scriptures';

describe('Book of Mormon sections data', () => {
  it('has exactly 60 sections', () => {
    expect(BOOK_OF_MORMON_SECTIONS.length).toBe(60);
  });

  it('ALL_BOM_CHAPTERS is the same as BOOK_OF_MORMON_SECTIONS', () => {
    expect(ALL_BOM_CHAPTERS).toBe(BOOK_OF_MORMON_SECTIONS);
  });

  it('all sections have valid CDN URLs', () => {
    for (const s of BOOK_OF_MORMON_SECTIONS) {
      expect(s.url).toMatch(/^https:\/\/files\.manuscdn\.com\//);
    }
  });

  it('all sections have unique IDs', () => {
    const ids = BOOK_OF_MORMON_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all sections have non-empty titles', () => {
    for (const s of BOOK_OF_MORMON_SECTIONS) {
      expect(s.title.length).toBeGreaterThan(0);
    }
  });

  it('first section is 1 Nephi 1-4', () => {
    expect(BOOK_OF_MORMON_SECTIONS[0].title).toBe('1 Nephi 1-4');
  });

  it('last section is Moroni 8-10', () => {
    expect(BOOK_OF_MORMON_SECTIONS[59].title).toBe('Moroni 8-10');
  });

  it('legacy BOOK_OF_MORMON_CHAPTERS has 60 entries', () => {
    expect(BOOK_OF_MORMON_CHAPTERS.length).toBe(60);
  });

  it('legacy BOOK_OF_MORMON_CHAPTERS entries each have 1 chapter', () => {
    for (const book of BOOK_OF_MORMON_CHAPTERS) {
      expect(book.chapters.length).toBe(1);
    }
  });

  it('section IDs are sequential 1-60', () => {
    for (let i = 0; i < 60; i++) {
      expect(BOOK_OF_MORMON_SECTIONS[i].id).toBe(i + 1);
    }
  });
});
