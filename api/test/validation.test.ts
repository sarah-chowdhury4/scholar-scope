import { describe, expect, it } from 'vitest';
import { createScholarshipSchema, createUploadSchema, passwordChangeSchema, profilePatchSchema, safeFileName } from '../src/validation';

describe('createScholarshipSchema', () => {
  it('accepts a minimal record', () => {
    expect(createScholarshipSchema.parse({ name: 'Dell Scholars', provider: 'Dell Foundation' }).name).toBe('Dell Scholars');
  });
  it('requires YYYY-MM-DD deadlines', () => {
    expect(() => createScholarshipSchema.parse({ name: 'x', provider: 'y', deadline: { date: '12/01/2026' } })).toThrow();
  });
  it('rejects non-http links', () => {
    expect(() => createScholarshipSchema.parse({ name: 'x', provider: 'y', url: 'javascript:alert(1)' })).toThrow();
  });
});

describe('createUploadSchema', () => {
  it('only allows the supported file types', () => {
    expect(() =>
      createUploadSchema.parse({ fileName: 'a.exe', contentType: 'application/x-msdownload', size: 10, purpose: 'source' }),
    ).toThrow();
  });
});

describe('profile schemas', () => {
  it('accepts a partial profile update and rejects unknown fields', () => {
    expect(profilePatchSchema.parse({ displayName: 'Aisha Rahman', countriesOfInterest: ['Canada'] }).displayName).toBe('Aisha Rahman');
    expect(() => profilePatchSchema.parse({ password: 'nope' })).toThrow();
  });
  it('keeps the sign-up password length', () => {
    expect(() => passwordChangeSchema.parse({ currentPassword: 'x', newPassword: 'short' })).toThrow();
    expect(passwordChangeSchema.parse({ currentPassword: 'x', newPassword: 'a-long-password' }).newPassword).toBe('a-long-password');
  });
});

describe('safeFileName', () => {
  it('removes path tricks and odd characters', () => {
    expect(safeFileName('../../etc/passwd')).not.toContain('/');
    expect(safeFileName('My Essay (final).pdf')).toBe('My_Essay_final_.pdf');
  });
});

import { catalogQuerySchema } from '../src/routes/catalog';

describe('catalogQuerySchema', () => {
  it('reads comma-separated tags and defaults', () => {
    const q = catalogQuerySchema.parse({ requires: 'essay,video', gpa: '3.2' });
    expect(q).toMatchObject({ requires: ['essay', 'video'], excludes: [], gpa: 3.2, deadline: 'upcoming', sort: 'deadline' });
  });
  it('rejects unknown tags and silly GPAs', () => {
    expect(() => catalogQuerySchema.parse({ requires: 'bribe' })).toThrow();
    expect(() => catalogQuerySchema.parse({ gpa: '12' })).toThrow();
  });
});

describe('reviewSchema', () => {
  it('accepts each review action', async () => {
    const { reviewSchema } = await import('../src/validation');
    expect(reviewSchema.parse({ action: 'confirm' })).toEqual({ action: 'confirm' });
    expect(reviewSchema.parse({ action: 'reject', reason: 'Not for this year' }).action).toBe('reject');
    const corrected = reviewSchema.parse({ action: 'correct', label: 'Essay, 650 words', wordLimit: 650, deadline: { date: '2027-01-15' } });
    expect(corrected).toMatchObject({ action: 'correct', wordLimit: 650, deadline: { date: '2027-01-15', timezone: 'UTC' } });
  });

  it('rejects an empty correction and unknown fields', async () => {
    const { reviewSchema } = await import('../src/validation');
    expect(() => reviewSchema.parse({ action: 'correct', label: '  ' })).toThrow();
    expect(() => reviewSchema.parse({ action: 'confirm', verification: 'verified' })).toThrow();
    expect(() => reviewSchema.parse({ action: 'approve' })).toThrow();
  });
});
