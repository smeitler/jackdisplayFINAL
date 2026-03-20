import { describe, it, expect } from 'vitest';

// Test the body/gratitude splitting logic used in the journal day-view
function splitBodyGrat(bodyText: string): { mainBody: string; gratSection: string } {
  const gratIdx = bodyText.indexOf('\n\n🙏 Grateful for:');
  const mainBody = gratIdx >= 0 ? bodyText.slice(0, gratIdx).trim() : bodyText.trim();
  const gratSection = gratIdx >= 0 ? bodyText.slice(gratIdx + 2).trim() : '';
  return { mainBody, gratSection };
}

function rebuildBody(mainBody: string, gratSection: string): string {
  return gratSection.length > 0 ? mainBody + '\n\n' + gratSection : mainBody;
}

describe('Journal day-view inline editing', () => {
  it('splits body and gratitude correctly', () => {
    const body = 'Went for a run today.\n\n🙏 Grateful for:\nGood health\nFamily';
    const { mainBody, gratSection } = splitBodyGrat(body);
    expect(mainBody).toBe('Went for a run today.');
    expect(gratSection).toBe('🙏 Grateful for:\nGood health\nFamily');
  });

  it('handles body with no gratitude section', () => {
    const body = 'Just a plain journal entry.';
    const { mainBody, gratSection } = splitBodyGrat(body);
    expect(mainBody).toBe('Just a plain journal entry.');
    expect(gratSection).toBe('');
  });

  it('rebuilds body correctly after editing main text', () => {
    const original = 'Old text.\n\n🙏 Grateful for:\nSunshine';
    const { gratSection } = splitBodyGrat(original);
    const newBody = rebuildBody('New text.', gratSection);
    expect(newBody).toBe('New text.\n\n🙏 Grateful for:\nSunshine');
  });

  it('rebuilds body correctly after editing gratitude', () => {
    const original = 'Main text.\n\n🙏 Grateful for:\nOld grat';
    const { mainBody } = splitBodyGrat(original);
    const newGrat = '🙏 Grateful for:\nNew grat';
    const newBody = rebuildBody(mainBody, newGrat);
    expect(newBody).toBe('Main text.\n\n🙏 Grateful for:\nNew grat');
  });

  it('handles empty body gracefully', () => {
    const { mainBody, gratSection } = splitBodyGrat('');
    expect(mainBody).toBe('');
    expect(gratSection).toBe('');
    const rebuilt = rebuildBody(mainBody, gratSection);
    expect(rebuilt).toBe('');
  });

  // Test rating map sync logic
  it('builds rating map from check-ins correctly', () => {
    const checkIns = [
      { habitId: 'h1', rating: 'green', date: '2026-03-20' },
      { habitId: 'h2', rating: 'none', date: '2026-03-20' },
      { habitId: 'h3', rating: 'red', date: '2026-03-20' },
    ];
    const map: Record<string, string> = {};
    checkIns.forEach((ci) => { if (ci.rating !== 'none') map[ci.habitId] = ci.rating; });
    expect(map).toEqual({ h1: 'green', h3: 'red' });
    expect(map['h2']).toBeUndefined();
  });

  it('updates rating map correctly when a rating changes', () => {
    const dvRatings: Record<string, string> = { h1: 'green', h3: 'red' };
    const newMap = { ...dvRatings, h1: 'yellow' };
    expect(newMap).toEqual({ h1: 'yellow', h3: 'red' });
  });
});
