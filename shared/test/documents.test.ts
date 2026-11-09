import { describe, expect, it } from 'vitest';
import { documentsAskedFor } from '../src/documents';

describe('documentsAskedFor', () => {
  it('asks for a transcript from the requirement kind or the label', () => {
    expect(documentsAskedFor([{ kind: 'transcript', label: 'Official transcript' }])).toEqual(['transcript']);
    expect(documentsAskedFor([{ kind: 'other', label: 'High school transcript' }])).toEqual(['transcript']);
  });

  it('notices a passport and a birth certificate written in the requirement', () => {
    expect(
      documentsAskedFor([
        { kind: 'other', label: 'Copy of passport' },
        { kind: 'form', label: 'Birth certificate' },
      ]),
    ).toEqual(['passport', 'birth_certificate']);
  });

  it('keeps a stable order and ignores essays', () => {
    expect(
      documentsAskedFor([
        { kind: 'essay', label: 'Personal statement' },
        { kind: 'other', label: 'Birth certificate' },
        { kind: 'transcript', label: 'Transcript' },
        { kind: 'transcript', label: 'Transcript again' },
      ]),
    ).toEqual(['transcript', 'birth_certificate']);
  });
});
