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
