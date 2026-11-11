import { describe, expect, it } from 'vitest';
import { documentsAskedFor, normalizeDocumentTitle } from '../src/documents';

describe('documentsAskedFor', () => {
  it('keeps every transcript under one kind', () => {
    expect(
      documentsAskedFor([
        { kind: 'transcript', label: 'High school transcript' },
        { kind: 'transcript', label: 'Undergraduate transcript' },
      ]),
    ).toEqual(['transcript']);
  });

  it('separates IGCSE and A-level certificates from a university degree certificate', () => {
    expect(
      documentsAskedFor([
        { kind: 'other', label: 'IGCSE certificate' },
        { kind: 'other', label: 'A-level certificate' },
        { kind: 'other', label: 'Degree certificate' },
      ]),
    ).toEqual(['school_certificate', 'university_certificate']);
  });

  it('asks for both certificate groups when the requirement only says certificates', () => {
    expect(documentsAskedFor([{ kind: 'other', label: 'Copies of certificates' }])).toEqual([
      'school_certificate',
      'university_certificate',
    ]);
  });

  it('does not treat a birth certificate or a transcript as a school certificate', () => {
    expect(documentsAskedFor([{ kind: 'form', label: 'Birth certificate' }])).toEqual(['birth_certificate']);
    expect(documentsAskedFor([{ kind: 'other', label: 'High school transcript' }])).toEqual(['transcript']);
  });

  it('notices a passport and ignores an essay', () => {
    expect(
      documentsAskedFor([
        { kind: 'essay', label: 'Personal statement' },
        { kind: 'other', label: 'Copy of passport' },
      ]),
    ).toEqual(['passport']);
  });
});

describe('normalizeDocumentTitle', () => {
  it('treats spacing and case as the same name', () => {
    expect(normalizeDocumentTitle('  Undergraduate   Transcript ')).toBe('undergraduate transcript');
  });
});
