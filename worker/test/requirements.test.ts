import { describe, expect, it } from 'vitest';
import { matchKeyFor } from '../src/requirements';

describe('matchKeyFor', () => {
  it('is stable across punctuation and case', () => {
    expect(matchKeyFor('essay', 'Personal Essay (500 words)')).toBe(matchKeyFor('essay', 'personal essay: 500 words'));
  });
  it('separates kinds', () => {
    expect(matchKeyFor('deadline', 'Application deadline')).not.toBe(matchKeyFor('form', 'Application deadline'));
  });
});
