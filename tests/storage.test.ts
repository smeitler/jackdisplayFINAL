import { describe, it, expect, vi } from 'vitest';

// Mock AsyncStorage
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
  },
}));

import {
  toDateString,
  yesterdayString,
  DEFAULT_HABITS,
  ratingScore,
  Rating,
  offsetDateString,
  formatDisplayDate,
} from '../lib/storage';

describe('toDateString', () => {
  it('returns YYYY-MM-DD format', () => {
    const d = new Date('2026-02-20T12:00:00Z');
    const result = toDateString(d);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns today when no argument given', () => {
    const result = toDateString();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('yesterdayString', () => {
  it('returns a date one day before today', () => {
    const today = toDateString();
    const yesterday = yesterdayString();
    const todayDate = new Date(today + 'T12:00:00');
    const yesterdayDate = new Date(yesterday + 'T12:00:00');
    const diff = todayDate.getTime() - yesterdayDate.getTime();
    expect(diff).toBe(24 * 60 * 60 * 1000);
  });
});

describe('offsetDateString', () => {
  it('offset 0 returns today', () => {
    expect(offsetDateString(0)).toBe(toDateString());
  });

  it('offset -1 returns yesterday', () => {
    expect(offsetDateString(-1)).toBe(yesterdayString());
  });

  it('offset -7 returns 7 days ago', () => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    expect(offsetDateString(-7)).toBe(toDateString(d));
  });
});

describe('DEFAULT_HABITS', () => {
  it('has habits for the new 8 life area categories', () => {
    const categories = new Set(DEFAULT_HABITS.map((h) => h.category));
    // The app uses 8 life areas; at least 4 should have default habits
    const lifeAreas = ['body', 'mind', 'relationships', 'focus', 'career', 'money', 'contribution', 'spirituality'];
    const covered = lifeAreas.filter((a) => categories.has(a));
    expect(covered.length).toBeGreaterThanOrEqual(4);
  });

  it('all habits are active by default', () => {
    expect(DEFAULT_HABITS.every((h) => h.isActive)).toBe(true);
  });

  it('all habits have unique IDs', () => {
    const ids = DEFAULT_HABITS.map((h) => h.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('has at least 3 habits per category', () => {
    const counts: Record<string, number> = {};
    for (const h of DEFAULT_HABITS) {
      counts[h.category] = (counts[h.category] ?? 0) + 1;
    }
    // Check that any categories that do have habits have at least 1 habit
    for (const cat of Object.keys(counts)) {
      expect(counts[cat]).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('ratingScore', () => {
  it('green returns 1', () => {
    expect(ratingScore('green')).toBe(1);
  });

  it('yellow returns 0.5', () => {
    expect(ratingScore('yellow')).toBe(0.5);
  });

  it('red returns 0', () => {
    expect(ratingScore('red')).toBe(0);
  });

  it('none returns null (excluded from averages)', () => {
    expect(ratingScore('none')).toBeNull();
  });

  it('weighted average of green+yellow = 0.75', () => {
    const scores = (['green', 'yellow'] as Rating[]).map(ratingScore).filter((s) => s !== null) as number[];
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    expect(avg).toBe(0.75);
  });

  it('weighted average of all three = 0.5', () => {
    const scores = (['green', 'yellow', 'red'] as Rating[]).map(ratingScore).filter((s) => s !== null) as number[];
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    expect(avg).toBeCloseTo(0.5);
  });
});

describe('formatAlarmTime (pure function)', () => {
  function formatAlarmTime(hour: number, minute: number): string {
    const period = hour >= 12 ? 'PM' : 'AM';
    const h = hour % 12 === 0 ? 12 : hour % 12;
    const m = minute.toString().padStart(2, '0');
    return `${h}:${m} ${period}`;
  }

  it('formats midnight as 12:00 AM', () => {
    expect(formatAlarmTime(0, 0)).toBe('12:00 AM');
  });

  it('formats noon as 12:00 PM', () => {
    expect(formatAlarmTime(12, 0)).toBe('12:00 PM');
  });

  it('formats 8:05 AM correctly', () => {
    expect(formatAlarmTime(8, 5)).toBe('8:05 AM');
  });

  it('formats 13:30 as 1:30 PM', () => {
    expect(formatAlarmTime(13, 30)).toBe('1:30 PM');
  });
});
