import { describe, expect, it } from 'vitest';
import {
  checkDocument,
  checkDocumentForScholarship,
  minGpaFromRequirements,
  namesMatch,
  readDocumentFacts,
  sortFindings,
  worstSeverity,
  type DocumentFacts,
} from '../src/documentChecks';

const base: DocumentFacts = {
  detectedType: 'transcript',
  typeConfidence: 0.95,
  description: 'a high school transcript',
  typeEvidence: [
    { signal: 'document_title', quote: 'Official Transcript', page: 1, found: true },
    { signal: 'student_name', quote: 'Student: Ana Perez', page: 1, found: true },
    { signal: 'course_grade_rows', quote: 'Algebra II A 1.0', page: 1, found: true },
  ],
  holderName: null,
  issuer: null,
  issueDate: null,
  expiryDate: null,
  language: 'English',
  gpa: null,
  unofficial: null,
  hardToRead: false,
};

const fact = <T>(value: T, found = true) => ({ value, quote: String(value), page: 1, found });
const codes = (findings: { code: string }[]) => findings.map((f) => f.code);

describe('namesMatch', () => {
  it('accepts a middle name missing on one side and ignores accents and case', () => {
    expect(namesMatch('Ana Lucía Pérez', 'ana perez')).toBe(true);
  });
  it('rejects a different surname', () => {
    expect(namesMatch('Ana Perez', 'Ana Smith')).toBe(false);
  });
});

describe('checkDocument', () => {
  const now = new Date('2026-11-14T00:00:00Z');

  it('flags a file saved under the wrong kind', () => {
    const findings = checkDocument({ ...base, detectedType: 'passport' }, { declaredType: 'transcript', profileName: null, now });
    expect(codes(findings)).toContain('type_mismatch');
    expect(worstSeverity(findings)).toBe('problem');
  });

  it('says the type is unclear when the model is unsure', () => {
    const findings = checkDocument({ ...base, typeConfidence: 0.3 }, { declaredType: 'transcript', profileName: null, now });
    expect(codes(findings)).toEqual(['type_unclear']);
  });

  it('compares the holder name with the profile name', () => {
    const ok = checkDocument({ ...base, holderName: fact('Ana Lucia Perez') }, { declaredType: 'transcript', profileName: 'Ana Perez', now });
    expect(codes(ok)).toContain('name_matches');
    const bad = checkDocument({ ...base, holderName: fact('Maria Lopez') }, { declaredType: 'transcript', profileName: 'Ana Perez', now });
    expect(codes(bad)).toContain('name_mismatch');
  });

  it('flags an expired passport and one expiring within six months', () => {
    const passport = { ...base, detectedType: 'passport' as const };
    expect(codes(checkDocument({ ...passport, expiryDate: fact('2026-01-01') }, { declaredType: 'passport', profileName: null, now }))).toContain('expired');
    expect(codes(checkDocument({ ...passport, expiryDate: fact('2027-02-01') }, { declaredType: 'passport', profileName: null, now }))).toContain('expires_soon');
    expect(codes(checkDocument({ ...passport, expiryDate: fact('2030-02-01') }, { declaredType: 'passport', profileName: null, now }))).not.toContain('expires_soon');
  });

  it('never uses a fact whose quote was not found in the file', () => {
    const findings = checkDocument(
      { ...base, detectedType: 'passport', expiryDate: fact('2020-01-01', false) },
      { declaredType: 'passport', profileName: null, now },
    );
    expect(codes(findings)).not.toContain('expired');
    expect(codes(findings)).toContain('unverified_fact');
  });

  it('reports an unreadable file', () => {
    expect(codes(checkDocument({ ...base, hardToRead: true }, { declaredType: 'transcript', profileName: null, now }))).toContain('hard_to_read');
  });
});

describe('checkDocumentForScholarship', () => {
  it('flags a passport that expires before the deadline', () => {
    const findings = checkDocumentForScholarship({ ...base, detectedType: 'passport', expiryDate: fact('2027-01-10') }, 'passport', {
      deadline: new Date('2027-03-01T00:00:00Z'),
      minGpa: null,
      requirementLabels: [],
    });
    expect(codes(findings)).toEqual(['expires_before_deadline']);
  });

  it('compares a 4.0-scale GPA with the minimum', () => {
    const context = { deadline: null, minGpa: 3.0, requirementLabels: [] };
    expect(codes(checkDocumentForScholarship({ ...base, gpa: fact({ value: 2.8, scale: 4 }) }, 'transcript', context))).toEqual(['gpa_below_minimum']);
    expect(codes(checkDocumentForScholarship({ ...base, gpa: fact({ value: 3.0, scale: null }) }, 'transcript', context))).toEqual(['gpa_meets_minimum']);
    expect(codes(checkDocumentForScholarship({ ...base, gpa: fact({ value: 85, scale: 100 }) }, 'transcript', context))).toEqual(['gpa_scale_differs']);
  });

  it('flags an unofficial transcript when the scholarship asks for an official one', () => {
    const findings = checkDocumentForScholarship({ ...base, unofficial: fact(true) }, 'transcript', {
      deadline: null,
      minGpa: null,
      requirementLabels: ['Official transcript from your school'],
    });
    expect(codes(findings)).toEqual(['unofficial']);
    expect(findings[0]!.severity).toBe('problem');
  });

  it('warns about a non-English file when the scholarship mentions translations', () => {
    const findings = checkDocumentForScholarship({ ...base, language: 'French' }, 'transcript', {
      deadline: null,
      minGpa: null,
      requirementLabels: ['Documents not in English need a certified translation'],
    });
    expect(codes(findings)).toEqual(['not_in_english']);
  });
});

describe('helpers', () => {
  it('sorts problems first', () => {
    const sorted = sortFindings([
      { code: 'type_matches', severity: 'ok', message: '', quote: null, page: null },
      { code: 'expired', severity: 'problem', message: '', quote: null, page: null },
      { code: 'expires_soon', severity: 'warning', message: '', quote: null, page: null },
    ]);
    expect(codes(sorted)).toEqual(['expired', 'expires_soon', 'type_matches']);
  });

  it('takes the lowest minimum GPA from the requirements', () => {
    expect(minGpaFromRequirements([{ current: { value: { minGpa: 3.2 } } }, { current: { value: { minGpa: 3.0 } } }, { current: null }])).toBe(3.0);
    expect(minGpaFromRequirements([])).toBeNull();
  });

  it('reads stored facts defensively', () => {
    expect(readDocumentFacts(null)).toBeNull();
    const facts = readDocumentFacts({ detectedType: 'nonsense', holderName: { value: 42 }, hardToRead: true });
    expect(facts?.detectedType).toBe('unknown');
    expect(facts?.holderName).toBeNull();
    expect(facts?.hardToRead).toBe(true);
  });
});

describe('document kind needs evidence from the file', () => {
  const now = new Date('2026-11-14T00:00:00Z');

  it('says a table of model results is not a transcript', () => {
    const findings = checkDocument(
      { ...base, detectedType: 'not_a_personal_document', description: 'a table comparing machine-learning model results', typeEvidence: [] },
      { declaredType: 'transcript', profileName: null, now },
    );
    expect(codes(findings)).toEqual(['not_personal']);
    expect(findings[0]!.severity).toBe('problem');
    expect(findings[0]!.message).toContain('This is not a transcript. It looks like a table comparing machine-learning model results.');
  });

  it('does not confirm a transcript without course and grade rows', () => {
    const findings = checkDocument(
      { ...base, typeEvidence: base.typeEvidence.filter((e) => e.signal !== 'course_grade_rows') },
      { declaredType: 'transcript', profileName: null, now },
    );
    expect(codes(findings)).toEqual(['type_unclear']);
    expect(findings[0]!.message).toContain('courses or subjects with grades');
  });

  it('ignores evidence whose quote is not in the file', () => {
    const invented = base.typeEvidence.map((e) => ({ ...e, found: false }));
    const findings = checkDocument({ ...base, typeEvidence: invented }, { declaredType: 'transcript', profileName: null, now });
    expect(codes(findings)).toEqual(['type_unclear']);
  });

  it('confirms a transcript that shows a name, grade rows and a title', () => {
    expect(codes(checkDocument(base, { declaredType: 'transcript', profileName: null, now }))).toEqual(['type_matches']);
  });

  it('reads stored evidence back', () => {
    const facts = readDocumentFacts({ detectedType: 'not_a_personal_document', description: ' a price list ', typeEvidence: [{ signal: 'document_title', quote: 'Prices', found: true }, { signal: 'nonsense', quote: 'x' }], hardToRead: false });
    expect(facts?.detectedType).toBe('not_a_personal_document');
    expect(facts?.description).toBe('a price list');
    expect(facts?.typeEvidence).toEqual([{ signal: 'document_title', quote: 'Prices', page: null, found: true }]);
  });
});

describe('mismatch wording', () => {
  it('describes an "other" document in plain words instead of "an other"', () => {
    const findings = checkDocument(
      { ...base, detectedType: 'other', description: 'a student class timetable' },
      { declaredType: 'transcript', profileName: null, now: new Date('2026-11-14T00:00:00Z') },
    );
    expect(findings[0]!.message).toBe('You saved this as a transcript, but it looks like a student class timetable.');
  });
});
