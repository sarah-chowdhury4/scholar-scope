import { describe, expect, it } from 'vitest';
import { createScholarshipSchema, createUploadSchema, safeFileName } from '../src/validation';

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
