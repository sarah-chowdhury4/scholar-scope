import { describe, expect, it } from 'vitest';
import { checkDraftSentences, isDraftable, joinParagraphs, notesToFacts, profileToFacts, wordCount } from '../src/drafts';
import { emptyProfileRecord } from '../src/profile';

describe('notesToFacts', () => {
  it('splits bullet points and sentences into numbered facts', () => {
    const facts = notesToFacts('- Led the robotics club for two years\n- Tutored younger students. Raised $500 for new kits!');
    expect(facts.map((f) => f.id)).toEqual(['N1', 'N2', 'N3']);
    expect(facts[0]!.text).toBe('Led the robotics club for two years');
    expect(facts[2]!.text).toBe('Raised $500 for new kits!');
  });
});

describe('profileToFacts', () => {
  it('leaves GPA out unless the student opts in', () => {
    const profile = emptyProfileRecord();
    profile.education = { ...profile.education, fieldOfStudy: 'Biology', gpa: 3.8, gpaScale: '4' };
    expect(profileToFacts(profile, { includeGpa: false }).map((f) => f.text)).toEqual(['Field of study: Biology.']);
    expect(profileToFacts(profile, { includeGpa: true }).map((f) => f.text)).toContain('GPA: 3.8 out of 4.');
  });
});

describe('checkDraftSentences', () => {
  const facts = [{ id: 'N1', text: 'Led the robotics club', from: 'notes' as const }];

  it('drops unknown fact ids and flags claims with no basis', () => {
    const checked = checkDraftSentences(
      [
        { text: 'I led my school robotics club and learned to plan under pressure.', basedOn: ['N1', 'N9'] },
        { text: 'I also won a national science prize last spring with my team.', basedOn: [] },
        { text: 'Thank you for reading.', basedOn: [] },
      ],
      facts,
    );
    expect(checked[0]).toMatchObject({ basedOn: ['N1'], supported: true });
    expect(checked[1]!.supported).toBe(false);
    expect(checked[2]!.supported).toBe(true);
  });

  it('joins paragraphs with blank lines and counts words', () => {
    const text = joinParagraphs([
      [{ text: 'One two.', basedOn: [], supported: true }],
      [{ text: 'Three four five.', basedOn: [], supported: true }],
    ]);
    expect(text).toBe('One two.\n\nThree four five.');
    expect(wordCount(text)).toBe(5);
  });
});

describe('isDraftable', () => {
  it('recognises essays and statements', () => {
    expect(isDraftable({ kind: 'essay', label: 'Essay' })).toBe(true);
    expect(isDraftable({ kind: 'other', label: 'Personal statement (1 page)' })).toBe(true);
    expect(isDraftable({ kind: 'transcript', label: 'Official transcript' })).toBe(false);
  });
});
