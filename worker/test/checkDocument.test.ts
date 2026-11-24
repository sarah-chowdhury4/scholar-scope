import { describe, expect, it } from 'vitest';
import { verifyFacts } from '../src/handlers/checkDocument';

const pages = [
  { page: 1, text: 'Springfield High School\nOfficial Transcript\nStudent: Ana Lucia Perez\nCumulative GPA: 3.72 / 4.00' },
  { page: 2, text: 'Issued on 2026-06-30' },
];

describe('verifyFacts', () => {
  it('keeps facts whose quote is in the file and records the page', () => {
    const facts = verifyFacts(
      {
        detectedType: 'transcript',
        typeConfidence: 0.9,
        holderName: { value: 'Ana Lucia Perez', quote: 'Student: Ana Lucia Perez' },
        issueDate: { value: '2026-06-30', quote: 'Issued on 2026-06-30' },
        gpa: { value: 3.72, scale: 4, quote: 'Cumulative GPA: 3.72 / 4.00' },
        hardToRead: false,
      },
      pages,
    );
    expect(facts.holderName).toMatchObject({ value: 'Ana Lucia Perez', found: true, page: 1 });
    expect(facts.issueDate).toMatchObject({ found: true, page: 2 });
    expect(facts.gpa).toMatchObject({ value: { value: 3.72, scale: 4 }, found: true });
  });

  it('marks invented quotes as not found and drops an unquoted "unofficial" claim', () => {
    const facts = verifyFacts(
      {
        detectedType: 'transcript',
        typeConfidence: 2,
        holderName: { value: 'Someone Else', quote: 'Student: Someone Else' },
        unofficial: { value: true, quote: 'UNOFFICIAL COPY' },
        hardToRead: false,
      },
      pages,
    );
    expect(facts.holderName?.found).toBe(false);
    expect(facts.unofficial).toBeNull();
    expect(facts.typeConfidence).toBe(1);
  });
});

describe('verifyFacts evidence', () => {
  it('marks evidence found only when its quote is in the file, and keeps the description', () => {
    const facts = verifyFacts(
      {
        detectedType: 'transcript',
        typeConfidence: 0.9,
        description: 'a high school transcript',
        evidence: [
          { signal: 'document_title', quote: 'Official Transcript' },
          { signal: 'course_grade_rows', quote: 'Chemistry A' },
          { signal: 'made_up', quote: 'x' },
        ],
        hardToRead: false,
      },
      pages,
    );
    expect(facts.description).toBe('a high school transcript');
    expect(facts.typeEvidence).toEqual([
      { signal: 'document_title', quote: 'Official Transcript', page: 1, found: true },
      { signal: 'course_grade_rows', quote: 'Chemistry A', page: null, found: false },
    ]);
  });

  it('maps an unknown kind to "unknown"', () => {
    expect(verifyFacts({ detectedType: 'spreadsheet', typeConfidence: 1, hardToRead: false }, pages).detectedType).toBe('unknown');
  });
});
