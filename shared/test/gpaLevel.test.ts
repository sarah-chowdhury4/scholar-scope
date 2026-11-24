import { describe, expect, it } from 'vitest';
import { gpaRequirementLevel, transcriptLevel } from '../src/gpaLevel';

const rule = (label: string, quote?: string) => ({ label, current: { value: { minGpa: 3 }, citation: quote ? { quote } : null } });
const doc = (title: string, issuer?: string) => ({
  title,
  facts: issuer ? ({ issuer: { value: issuer, quote: issuer, page: 1, found: true }, description: null } as never) : null,
});

describe('GPA requirement level', () => {
  it.each([
    ['Minimum high school GPA 3.0', 'high_school'],
    ['3.0 cumulative college GPA', 'undergraduate'],
    ['Undergraduate GPA of at least 3.2', 'undergraduate'],
    ["Minimum GPA 3.3 in your master's program", 'graduate'],
    ['Graduate GPA of 3.5', 'graduate'],
    ['Minimum GPA 3.00', null],
  ])('%s → %s', (label, level) => {
    expect(gpaRequirementLevel(rule(label))).toBe(level);
  });

  it('does not read "undergraduate" as graduate', () => {
    expect(gpaRequirementLevel(rule('Undergraduate students with a 3.0 GPA'))).toBe('undergraduate');
  });

  it('gives no level when the text names two', () => {
    expect(gpaRequirementLevel(rule('3.0 GPA', 'Current high school seniors or graduate students'))).toBeNull();
  });
});

describe('transcript level', () => {
  it('uses the title first, then the school name', () => {
    expect(transcriptLevel(doc('High school transcript', 'State University'))).toBe('high_school');
    expect(transcriptLevel(doc('Transcript', 'State University'))).toBe('undergraduate');
    expect(transcriptLevel(doc('Transcript', 'Lincoln High School'))).toBe('high_school');
    expect(transcriptLevel(doc('Transcript'))).toBeNull();
  });
});
