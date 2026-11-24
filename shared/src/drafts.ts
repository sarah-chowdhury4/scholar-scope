/**
 * Essay drafts (FR-6). The draft may only use facts the student gave us: their own notes and
 * their profile. Each fact gets an id; the model must say which facts every sentence is based on.
 * Sentences that cite no known fact are flagged so the student checks them; nothing is sent
 * anywhere until the student approves the draft.
 */
import { EDUCATION_LEVELS, ENROLLMENTS, type ProfileRecord } from './profile';

export const DRAFT_PROMPT_VERSION = 'dr-1';
export const MAX_NOTES_LENGTH = 4000;

export type DraftFact = { id: string; text: string; from: 'notes' | 'profile' };

/** Split the student's notes into short facts (one per line or sentence). */
export function notesToFacts(notes: string): DraftFact[] {
  const parts = notes
    .slice(0, MAX_NOTES_LENGTH)
    .split(/\n+|(?<=[.!?])\s+/)
    .map((part) => part.replace(/^[\s*•\-–\d.)]+/, '').trim())
    .filter((part) => part.length >= 3);
  return parts.slice(0, 60).map((text, index) => ({ id: `N${index + 1}`, text, from: 'notes' as const }));
}

/** Profile facts the draft may mention. GPA is left out unless the student opts in. */
export function profileToFacts(profile: ProfileRecord, options: { includeGpa: boolean }): DraftFact[] {
  const out: string[] = [];
  const level = EDUCATION_LEVELS.find((item) => item.id === profile.education.highestLevel)?.label;
  const enrollment = ENROLLMENTS.find((item) => item.id === profile.education.enrollment)?.label;
  if (profile.displayName) out.push(`My name is ${profile.displayName}.`);
  if (enrollment) out.push(`Current status: ${enrollment}.`);
  if (level) out.push(`Highest level of education completed: ${level}.`);
  if (profile.education.fieldOfStudy) out.push(`Field of study: ${profile.education.fieldOfStudy}.`);
  if (profile.education.expectedGraduation) out.push(`Expected graduation: ${profile.education.expectedGraduation}.`);
  if (profile.currentLocation) out.push(`I live in ${profile.currentLocation}.`);
  if (profile.citizenships.length) out.push(`Citizenship: ${profile.citizenships.join(', ')}.`);
  if (profile.studyLanguages) out.push(`Languages: ${profile.studyLanguages}.`);
  if (options.includeGpa && profile.education.gpa != null && profile.education.gpaScale) {
    out.push(`GPA: ${profile.education.gpa} out of ${profile.education.gpaScale}.`);
  }
  return out.map((text, index) => ({ id: `P${index + 1}`, text, from: 'profile' as const }));
}

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export type DraftSentence = { text: string; basedOn: string[] };
export type CheckedSentence = DraftSentence & { supported: boolean };

/**
 * Keep only fact ids that exist. A sentence with no valid fact is "unsupported" unless it is short
 * connective text (a greeting, a transition) — those carry no claim about the student.
 */
export function checkDraftSentences(sentences: DraftSentence[], facts: DraftFact[]): CheckedSentence[] {
  const known = new Set(facts.map((fact) => fact.id));
  return sentences
    .filter((sentence) => typeof sentence.text === 'string' && sentence.text.trim())
    .map((sentence) => {
      const basedOn = [...new Set((sentence.basedOn ?? []).filter((id) => known.has(id)))];
      const connective = wordCount(sentence.text) <= 6;
      return { text: sentence.text.trim(), basedOn, supported: basedOn.length > 0 || connective };
    });
}

/** Paragraphs → one text, keeping paragraph breaks. */
export function joinParagraphs(paragraphs: CheckedSentence[][]): string {
  return paragraphs
    .map((paragraph) => paragraph.map((sentence) => sentence.text).join(' '))
    .filter(Boolean)
    .join('\n\n');
}

/** Requirements that ask for written work a draft can help with. */
export function isDraftable(requirement: { kind?: string | null; label?: string | null }): boolean {
  if (requirement.kind === 'essay') return true;
  return /\b(essay|personal statement|statement of purpose|short answer|cover letter|motivation letter)\b/i.test(requirement.label ?? '');
}
