import { describe, expect, it } from 'vitest';
import { countRequirements, verificationAfterReview } from '../src/requirements';

describe('countRequirements', () => {
  it('counts ready, open, changed, unverified and needs-review items', () => {
    const { counts, readinessPct } = countRequirements([
      { readiness: 'ready', verification: 'verified' },
      { readiness: 'missing', verification: 'needs_review' },
      { readiness: 'changed', verification: 'verified', changeFlag: { active: true } },
      { readiness: 'missing', verification: 'unverified' },
    ]);
    expect(counts).toEqual({ open: 3, changed: 1, unverified: 1, needsReview: 1, ready: 1, total: 4 });
    expect(readinessPct).toBe(25);
  });

  it('is zero percent with no requirements', () => {
    expect(countRequirements([]).readinessPct).toBe(0);
  });
});

describe('verificationAfterReview', () => {
  it('turns a cited item into "verified" when the student confirms or corrects it', () => {
    expect(verificationAfterReview('confirm', true, 'needs_review')).toBe('verified');
    expect(verificationAfterReview('correct', true, 'needs_review')).toBe('verified');
  });

  it('never shows an item without a source as verified', () => {
    expect(verificationAfterReview('confirm', false, 'unverified')).toBe('unverified');
    expect(verificationAfterReview('correct', false, 'unverified')).toBe('unverified');
  });

  it('leaves the badge alone on reject and restore', () => {
    expect(verificationAfterReview('reject', true, 'needs_review')).toBe('needs_review');
    expect(verificationAfterReview('restore', true, 'verified')).toBe('verified');
  });
});
