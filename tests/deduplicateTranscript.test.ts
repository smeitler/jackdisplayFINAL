/**
 * Unit tests for the deduplicateTranscript sliding window deduplication function.
 *
 * This function is used in the voice check-in pipeline to extract new words
 * from Whisper's full-window transcript, avoiding repetition in the accumulated transcript.
 */

import { describe, it, expect } from 'vitest';

// Inline the function under test (mirrors checkin.tsx implementation exactly)
function deduplicateTranscript(accumulated: string, windowText: string): string {
  if (!accumulated.trim()) return windowText;

  const accWords = accumulated.trim().split(/\s+/);
  const winWords = windowText.trim().split(/\s+/);

  const maxOverlap = Math.min(accWords.length, winWords.length);
  for (let overlap = maxOverlap; overlap >= 1; overlap--) {
    const accSuffix = accWords.slice(accWords.length - overlap).join(' ').toLowerCase();
    const winPrefix = winWords.slice(0, overlap).join(' ').toLowerCase();
    if (accSuffix === winPrefix) {
      const newWords = winWords.slice(overlap);
      return newWords.join(' ');
    }
  }

  return windowText;
}

describe('deduplicateTranscript', () => {
  it('returns full windowText when accumulated is empty', () => {
    expect(deduplicateTranscript('', 'I went to the gym today')).toBe('I went to the gym today');
  });

  it('returns full windowText when accumulated is whitespace only', () => {
    expect(deduplicateTranscript('   ', 'hello world')).toBe('hello world');
  });

  it('extracts new words when window overlaps with end of accumulated', () => {
    // accumulated: "I went to the gym"
    // window: "to the gym and did fifty pushups"
    // overlap: "to the gym" (3 words)
    // new: "and did fifty pushups"
    const result = deduplicateTranscript(
      'I went to the gym',
      'to the gym and did fifty pushups',
    );
    expect(result).toBe('and did fifty pushups');
  });

  it('handles single-word overlap', () => {
    const result = deduplicateTranscript('I crushed my workout', 'workout and drank eight glasses of water');
    expect(result).toBe('and drank eight glasses of water');
  });

  it('returns full windowText when there is no overlap (fresh audio)', () => {
    // No overlap — Whisper transcribed completely different content
    const result = deduplicateTranscript(
      'I went to the gym',
      'called my mom and had a great conversation',
    );
    expect(result).toBe('called my mom and had a great conversation');
  });

  it('returns empty string when window is fully contained in accumulated', () => {
    // Window is a subset of the end of accumulated — nothing new
    const result = deduplicateTranscript(
      'I went to the gym and did pushups',
      'and did pushups',
    );
    expect(result).toBe('');
  });

  it('is case-insensitive for overlap detection', () => {
    // Whisper may capitalize differently across chunks
    const result = deduplicateTranscript(
      'I went to the Gym',
      'the gym and did pushups',
    );
    expect(result).toBe('and did pushups');
  });

  it('handles multi-word overlap at the boundary correctly', () => {
    const accumulated = 'today I crushed my workout hit the gym for two hours';
    const window = 'hit the gym for two hours and also drank plenty of water';
    const result = deduplicateTranscript(accumulated, window);
    expect(result).toBe('and also drank plenty of water');
  });

  it('returns full window when accumulated has no words in common with window start', () => {
    const result = deduplicateTranscript('hello world', 'completely different text here');
    expect(result).toBe('completely different text here');
  });

  it('handles the first window correctly (no accumulated yet)', () => {
    const result = deduplicateTranscript('', 'I hit the gym today and felt great');
    expect(result).toBe('I hit the gym today and felt great');
  });
});
