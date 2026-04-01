/**
 * Tests for scripture-position.ts — persistent reading position storage
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock AsyncStorage
const store: Record<string, string> = {};
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => store[key] ?? null),
    setItem: vi.fn(async (key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn(async (key: string) => { delete store[key]; }),
  },
}));

import { saveScripturePosition, getScripturePosition, clearScripturePosition } from '../lib/scripture-position';

describe('Scripture Position Persistence', () => {
  beforeEach(() => {
    // Clear the mock store before each test
    Object.keys(store).forEach((k) => delete store[k]);
  });

  it('returns null when no position is saved', async () => {
    const pos = await getScripturePosition('book-of-mormon');
    expect(pos).toBeNull();
  });

  it('saves and retrieves a BOM position', async () => {
    await saveScripturePosition('book-of-mormon', 5, 120.5);
    const pos = await getScripturePosition('book-of-mormon');
    expect(pos).not.toBeNull();
    expect(pos!.sectionIndex).toBe(5);
    expect(pos!.seekSeconds).toBeCloseTo(120.5);
  });

  it('saves and retrieves a Bible position', async () => {
    await saveScripturePosition('bible', 42, 300);
    const pos = await getScripturePosition('bible');
    expect(pos).not.toBeNull();
    expect(pos!.sectionIndex).toBe(42);
    expect(pos!.seekSeconds).toBe(300);
  });

  it('BOM and Bible positions are stored independently', async () => {
    await saveScripturePosition('book-of-mormon', 10, 60);
    await saveScripturePosition('bible', 20, 90);

    const bomPos = await getScripturePosition('book-of-mormon');
    const biblePos = await getScripturePosition('bible');

    expect(bomPos!.sectionIndex).toBe(10);
    expect(biblePos!.sectionIndex).toBe(20);
  });

  it('overwrites previous position with new save', async () => {
    await saveScripturePosition('book-of-mormon', 3, 45);
    await saveScripturePosition('book-of-mormon', 7, 200);
    const pos = await getScripturePosition('book-of-mormon');
    expect(pos!.sectionIndex).toBe(7);
    expect(pos!.seekSeconds).toBe(200);
  });

  it('clearScripturePosition removes the saved position', async () => {
    await saveScripturePosition('book-of-mormon', 5, 120);
    await clearScripturePosition('book-of-mormon');
    const pos = await getScripturePosition('book-of-mormon');
    expect(pos).toBeNull();
  });

  it('saves position at section index 0 (beginning)', async () => {
    await saveScripturePosition('book-of-mormon', 0, 0);
    const pos = await getScripturePosition('book-of-mormon');
    expect(pos!.sectionIndex).toBe(0);
    expect(pos!.seekSeconds).toBe(0);
  });

  it('saves position at the last section (59 for BOM)', async () => {
    await saveScripturePosition('book-of-mormon', 59, 1200);
    const pos = await getScripturePosition('book-of-mormon');
    expect(pos!.sectionIndex).toBe(59);
    expect(pos!.seekSeconds).toBe(1200);
  });
});
