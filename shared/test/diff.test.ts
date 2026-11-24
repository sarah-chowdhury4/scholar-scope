import { describe, expect, it } from 'vitest';
import { diffWords, sideBySide } from '../src/diff';

describe('diffWords', () => {
  it('marks only the changed words', () => {
    const segments = diffWords('Essay of 500 words or fewer.', 'Essay of 650 words or fewer.');
    expect(segments).toEqual([
      { type: 'same', text: 'Essay of ' },
      { type: 'removed', text: '500' },
      { type: 'added', text: '650' },
      { type: 'same', text: ' words or fewer.' },
    ]);
  });

  it('handles empty sides', () => {
    expect(diffWords('', 'New rule')).toEqual([{ type: 'added', text: 'New rule' }]);
    expect(diffWords('Old rule', '')).toEqual([{ type: 'removed', text: 'Old rule' }]);
  });

  it('rebuilds both texts exactly', () => {
    const before = 'Applications close on December 1, 2026 at 11:59 PM.';
    const after = 'Applications now close on January 15, 2027 at 5:00 PM Eastern.';
    const { before: left, after: right } = sideBySide(before, after);
    expect(left.map((s) => s.text).join('')).toBe(before);
    expect(right.map((s) => s.text).join('')).toBe(after);
  });
});
