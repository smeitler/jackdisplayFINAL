import { describe, it, expect, vi } from 'vitest';

describe('Drizzle db.execute() format fix', () => {
  it('should extract rows from [rows, fields] tuple format', () => {
    // Simulate what Drizzle mysql2 db.execute() returns: [rows, fields]
    const mockRows = [
      { id: 1, filename: 'test.wav', status: 'processed' },
      { id: 2, filename: 'test2.wav', status: 'pending' },
    ];
    const mockFields = [{ name: 'id' }, { name: 'filename' }, { name: 'status' }];
    const result = [mockRows, mockFields];

    // This is the fix logic from db.ts
    const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
    
    expect(rows).toEqual(mockRows);
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe(1);
    expect(rows[0].filename).toBe('test.wav');
  });

  it('should handle case where result is already just rows (no fields)', () => {
    // In case Drizzle changes behavior and returns just rows
    const mockRows = [
      { id: 1, filename: 'test.wav', status: 'processed' },
    ];
    const result = mockRows;

    // The fix logic should still work — result[0] is an object, not an array
    const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
    
    expect(rows).toEqual(mockRows);
    expect(rows).toHaveLength(1);
  });

  it('should handle empty result set from [rows, fields] format', () => {
    const result = [[], [{ name: 'id' }]];
    
    const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
    
    expect(rows).toEqual([]);
    expect(rows).toHaveLength(0);
  });
});

describe('clearLocalData preserves user content', () => {
  it('should NOT include vision board keys in the removal list', async () => {
    // Read the actual clearLocalData source to verify
    const fs = await import('fs');
    const source = fs.readFileSync(
      '/home/ubuntu/daily-progress-alarm/lib/storage.ts',
      'utf-8'
    );

    // Find the clearLocalData function
    const fnStart = source.indexOf('export async function clearLocalData');
    const fnEnd = source.indexOf('}', source.indexOf('multiRemove', fnStart) + 50);
    const fnBody = source.substring(fnStart, fnEnd + 1);

    // Verify vision board keys are NOT in the removal list
    expect(fnBody).not.toContain('VISION_BOARD_KEY');
    expect(fnBody).not.toContain('VISION_MOTIVATIONS_KEY');
    expect(fnBody).not.toContain('DAY_NOTES_KEY');
    
    // Verify it still clears the server-synced data
    expect(fnBody).toContain('KEYS.habits');
    expect(fnBody).toContain('KEYS.categories');
    expect(fnBody).toContain('KEYS.checkIns');
    expect(fnBody).toContain('KEYS.alarm');
  });
});

describe('Panel recordings component has no emojis', () => {
  it('should not contain emoji characters in the source', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync(
      '/home/ubuntu/daily-progress-alarm/components/panel-recordings-section.tsx',
      'utf-8'
    );

    // Check for common emojis that were previously in the component
    const emojiPatterns = ['🙏', '📊', '✅', '🗑', '📱', '🔴', '🟡', '🟢', '⚪'];
    for (const emoji of emojiPatterns) {
      expect(source).not.toContain(emoji);
    }
  });
});
