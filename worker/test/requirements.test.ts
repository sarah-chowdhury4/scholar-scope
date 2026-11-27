import { describe, expect, it } from 'vitest';
import { matchKeyFor, sameWording } from '../src/requirements';

describe('matchKeyFor', () => {
  it('is stable across punctuation and case', () => {
    expect(matchKeyFor('essay', 'Personal Essay (500 words)')).toBe(matchKeyFor('essay', 'personal essay: 500 words'));
  });
  it('separates kinds', () => {
    expect(matchKeyFor('deadline', 'Application deadline')).not.toBe(matchKeyFor('form', 'Application deadline'));
  });
});

describe('sameWording', () => {
  it('ignores a list bullet, spacing and the final full stop', () => {
    expect(sameWording('* Online application form.', 'Online application form')).toBe(true);
    expect(sameWording('- Two letters of recommendation,  at least one from a teacher.', 'Two letters of recommendation, at least one from a teacher.')).toBe(true);
    expect(sameWording('1. Official high school transcript.', 'official high school transcript')).toBe(true);
  });
  it('still sees a real change', () => {
    expect(sameWording('January 15, 2027 at 11:59 PM', 'December 20, 2026 at 11:59 PM')).toBe(false);
    expect(sameWording('no more than 650 words', 'no more than 500 words')).toBe(false);
    expect(sameWording('', '')).toBe(false);
  });
});
