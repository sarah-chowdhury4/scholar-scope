import { describe, expect, it } from 'vitest';
import { assessRequirement, readinessFor, type CheckedDocument } from '../src/assessments';
import type { DocumentFacts } from '../src/documentChecks';

const facts = (gpa: { value: number; scale: number | null } | null, extra: Partial<DocumentFacts> = {}): DocumentFacts => ({
  detectedType: 'transcript',
  typeConfidence: 0.95,
  description: 'a transcript',
  typeEvidence: [],
  holderName: null,
  issuer: null,
  issueDate: null,
  expiryDate: null,
  language: 'English',
  gpa: gpa ? { value: gpa, quote: `Cumulative GPA: ${gpa.value}`, page: 1, found: true } : null,
  unofficial: null,
  hardToRead: false,
  ...extra,
});

const transcript = (title: string, gpa: { value: number; scale: number | null } | null, overrides: Partial<CheckedDocument> = {}): CheckedDocument => ({
  id: title,
  type: 'transcript',
  title,
  checkStatus: 'done',
  facts: facts(gpa),
  findings: [{ code: 'type_matches', severity: 'ok', message: 'Looks like a transcript.', quote: null, page: null }],
  ...overrides,
});

const gpaRule = { kind: 'eligibility', label: 'Minimum GPA 3.20', current: { value: { minGpa: 3.2 } } };
const ctx = (documents: CheckedDocument[], profileGpa: { value: number; scale: string } | null = null) => ({ documents, deadline: null, profileGpa });

describe('minimum GPA', () => {
  it('is met from the transcript, quoting it', () => {
    const a = assessRequirement(gpaRule, ctx([transcript('High school transcript', { value: 3.62, scale: 4 })]))!;
    expect(a).toMatchObject({ status: 'met', quote: 'Cumulative GPA: 3.62', documentTitle: 'High school transcript' });
    expect(a.message).toBe('You meet this: your high school transcript shows a GPA of 3.62.');
    expect(readinessFor(a)).toBe('ready');
  });

  it('is not met when the best transcript is below the minimum', () => {
    const a = assessRequirement(gpaRule, ctx([transcript('High school transcript', { value: 2.4, scale: 4 })]))!;
    expect(a.status).toBe('not_met');
    expect(a.message).toContain('the minimum is 3.2');
  });

  it('uses the best 4.0-scale transcript when there are several of the same level', () => {
    const a = assessRequirement(gpaRule, ctx([transcript('Undergraduate transcript (fall)', { value: 3.0, scale: 4 }), transcript('Undergraduate transcript', { value: 3.48, scale: null })]))!;
    expect(a).toMatchObject({ status: 'met', documentTitle: 'Undergraduate transcript' });
  });

  it('asks the student to check a different grading scale', () => {
    expect(assessRequirement(gpaRule, ctx([transcript('Statement of marks', { value: 85.4, scale: 100 })]))!.status).toBe('check');
  });

  it('never counts a GPA typed on the profile', () => {
    const a = assessRequirement(gpaRule, ctx([], { value: 3.9, scale: '4' }))!;
    expect(a.status).toBe('missing');
    expect(a.message).toContain('Your profile says 3.9 out of 4, but that is not confirmed by a document.');
  });

  it('ignores a GPA whose quote was not found in the file', () => {
    const doc = transcript('High school transcript', null);
    doc.facts = { ...doc.facts!, gpa: { value: { value: 3.9, scale: 4 }, quote: 'invented', page: null, found: false } };
    expect(assessRequirement(gpaRule, ctx([doc]))!.status).toBe('missing');
  });
});

describe('GPA level (high school, undergraduate, graduate)', () => {
  const hs = transcript('High school transcript', { value: 3.9, scale: 4 });
  const college = transcript('Undergraduate transcript', { value: 3.1, scale: 4 });
  const collegeRule = { kind: 'eligibility', label: 'Minimum cumulative college GPA of 3.5', current: { value: { minGpa: 3.5 } } };
  const hsRule = {
    kind: 'eligibility',
    label: 'Minimum GPA 3.50',
    current: { value: { minGpa: 3.5 }, citation: { quote: 'Applicants must have an unweighted high school GPA of 3.5 or higher.' } },
  };

  it('checks a college GPA rule against the college transcript, not a better high school one', () => {
    const a = assessRequirement(collegeRule, ctx([hs, college]))!;
    expect(a).toMatchObject({ status: 'not_met', documentTitle: 'Undergraduate transcript' });
  });

  it('reads the level from the source quote when the label does not say', () => {
    expect(assessRequirement(hsRule, ctx([hs, college]))).toMatchObject({ status: 'met', documentTitle: 'High school transcript' });
  });

  it('asks for the right transcript when only the other level is saved', () => {
    const a = assessRequirement(collegeRule, ctx([hs]))!;
    expect(a.status).toBe('missing');
    expect(a.message).toContain('Upload your undergraduate transcript');
  });

  it('tells the level from the school name when the title does not say', () => {
    const doc = transcript('My transcript', { value: 3.7, scale: 4 });
    doc.facts = { ...doc.facts!, issuer: { value: 'Lincoln High School', quote: 'Lincoln High School', page: 1, found: true } };
    expect(assessRequirement(collegeRule, ctx([doc, college]))).toMatchObject({ documentTitle: 'Undergraduate transcript' });
  });

  it('does not mark it met when the transcript level is unknown, and says why', () => {
    const a = assessRequirement(collegeRule, ctx([transcript('Transcript', { value: 3.8, scale: 4 })]))!;
    expect(a.status).toBe('check');
    expect(a.message).toContain('could not tell whether your transcript is undergraduate');
  });

  it('uses the most recent level when the rule does not say, and says so', () => {
    const a = assessRequirement(gpaRule, ctx([hs, college]))!;
    expect(a).toMatchObject({ status: 'not_met', documentTitle: 'Undergraduate transcript' });
    expect(a.message).toContain('most recent one (undergraduate)');
  });
});

describe('documents a scholarship asks for', () => {
  const rule = { kind: 'transcript', label: 'Official transcript' };

  it('is met by a transcript whose check passed', () => {
    expect(assessRequirement(rule, ctx([transcript('Undergraduate transcript', { value: 3.48, scale: 4 })]))).toMatchObject({ status: 'met', message: 'Ready: Undergraduate transcript.' });
  });

  it('is not met when the only file is not a transcript', () => {
    const wrong = transcript('High school transcript', null, {
      findings: [{ code: 'not_personal', severity: 'problem', message: 'This is not a transcript.', quote: null, page: null }],
    });
    const a = assessRequirement(rule, ctx([wrong]))!;
    expect(a.status).toBe('not_met');
    expect(a.message).toContain('This is not a transcript.');
  });

  it('says what is missing or still running', () => {
    expect(assessRequirement(rule, ctx([]))!.message).toBe('Upload your transcript in Documents.');
    expect(assessRequirement(rule, ctx([transcript('T', null, { checkStatus: 'running', findings: [] })]))!.status).toBe('check');
  });

  it('fails a passport that expires before the deadline', () => {
    const passport: CheckedDocument = {
      id: 'p',
      type: 'passport',
      title: 'Passport',
      checkStatus: 'done',
      facts: facts(null, { detectedType: 'passport', expiryDate: { value: '2027-01-10', quote: '10 JAN 2027', page: 1, found: true } }),
      findings: [{ code: 'type_matches', severity: 'ok', message: 'Looks like a passport.', quote: null, page: null }],
    };
    const a = assessRequirement({ kind: 'other', label: 'Copy of your passport' }, { documents: [passport], deadline: new Date('2027-03-01T00:00:00Z'), profileGpa: null })!;
    expect(a.status).toBe('not_met');
  });
});

describe('everything else', () => {
  it('stays a manual tick', () => {
    expect(assessRequirement({ kind: 'recommendation', label: 'One recommendation letter' }, ctx([]))).toBeNull();
    expect(assessRequirement({ kind: 'essay', label: '500-word essay' }, ctx([]))).toBeNull();
  });
});
