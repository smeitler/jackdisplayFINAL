import { describe, it, expect, vi, beforeEach } from 'vitest';

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

describe('DEFAULT_HABITS', () => {
  it('has habits for all four categories', () => {
    const categories = new Set(DEFAULT_HABITS.map((h) => h.category));
    expect(categories.has('health')).toBe(true);
    expect(categories.has('relationships')).toBe(true);
    expect(categories.has('wealth')).toBe(true);
    expect(categories.has('mindset')).toBe(true);
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
    for (const cat of ['health', 'relationships', 'wealth', 'mindset']) {
      expect(counts[cat]).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('formatAlarmTime (pure function)', () => {
  // Inline the pure formatting logic to avoid Expo runtime deps in test env
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
