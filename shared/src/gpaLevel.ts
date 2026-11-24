/**
 * Which GPA a requirement means (high school, undergraduate or graduate) and which level each transcript is,
 * so a "3.5 college GPA" requirement is checked against the college transcript, not a better high school one.
 * Both are read from plain words: the requirement's label and source quote, and the transcript's title, issuer
 * and the AI's description of it. When the words do not say, the level is null and the caller falls back.
 */
import type { DocumentFacts } from './documentChecks';

export type GpaLevel = 'high_school' | 'undergraduate' | 'graduate';

export const EDUCATION_LEVEL_LABEL: Record<GpaLevel, string> = {
  high_school: 'high school',
  undergraduate: 'undergraduate',
  graduate: 'graduate',
};

/** Higher is later in a student's education. */
const ORDER: Record<GpaLevel, number> = { high_school: 0, undergraduate: 1, graduate: 2 };

const HIGH_SCHOOL = /\b(high[- ]school|secondary[- ]school|senior[- ]high|hs gpa|(?:grade|year) 1[12]|1[12]th grade|a[- ]levels?|gcse|ib diploma|higher secondary|hsc|ssc)\b/i;
const UNDERGRADUATE = /\b(undergrad(?:uate)?|college|university|bachelor'?s?|post-?secondary|b\.?sc?\b|b\.?a\b)/i;
const GRADUATE = /(?<!under)\b(graduate (?:school|program|programs|gpa|studies|students?|transcript|degree)|grad school|master'?s|mba|ph\.?d|doctoral|postgraduate)\b/i;

function levelsIn(text: string): GpaLevel[] {
  const found: GpaLevel[] = [];
  if (HIGH_SCHOOL.test(text)) found.push('high_school');
  if (GRADUATE.test(text)) found.push('graduate');
  // "College" inside a graduate or high school phrase ("college prep high school") is not an undergraduate GPA.
  if (UNDERGRADUATE.test(text) && !found.length) found.push('undergraduate');
  return found;
}

type RequirementText = {
  label?: string | null;
  current?: { value?: Record<string, unknown>; citation?: { quote?: unknown } | null } | null;
};

/** The GPA level a requirement names, or null when it does not say (or names more than one). */
export function gpaRequirementLevel(requirement: RequirementText): GpaLevel | null {
  const value = requirement.current?.value ?? {};
  const parts = [requirement.label, value['text'], value['details'], requirement.current?.citation?.quote];
  const text = parts.filter((p): p is string => typeof p === 'string').join(' \n ');
  const levels = levelsIn(text);
  return levels.length === 1 ? levels[0]! : null;
}

type TranscriptLike = { title: string; facts: DocumentFacts | null };

/**
 * A transcript's level. The student's own title wins ("High school transcript"), then the issuing school's name,
 * then the AI's description of the file. Null when none of them says.
 */
export function transcriptLevel(doc: TranscriptLike): GpaLevel | null {
  const sources = [doc.title, doc.facts?.issuer?.found ? doc.facts.issuer.value : null, doc.facts?.description ?? null];
  for (const text of sources) {
    if (!text) continue;
    const levels = levelsIn(text);
    if (levels.length === 1) return levels[0]!;
  }
  return null;
}

export type GpaTranscriptChoice<T> =
  /** Compare against these transcripts. `assumed` explains a guess the student should know about. */
  | { kind: 'use'; transcripts: T[]; level: GpaLevel | null; assumed: string | null }
  /** The requirement names a level and no transcript of that level (or of unknown level) is saved. */
  | { kind: 'missing_level'; level: GpaLevel };

/**
 * Which transcripts a GPA requirement should be checked against.
 *   - The requirement names a level: transcripts of that level; failing that, ones whose level is unknown
 *     (with a note); failing that, the student is asked for that transcript.
 *   - It does not: one level among the transcripts is used as is. With several, the most recent level is used
 *     (a scholarship usually means the current GPA), and the message says so.
 */
export function transcriptsForGpa<T extends TranscriptLike>(requirementLevel: GpaLevel | null, transcripts: T[]): GpaTranscriptChoice<T> {
  const withLevel = transcripts.map((t) => ({ t, level: transcriptLevel(t) }));
  if (requirementLevel) {
    const same = withLevel.filter((x) => x.level === requirementLevel).map((x) => x.t);
    if (same.length) return { kind: 'use', transcripts: same, level: requirementLevel, assumed: null };
    const unknown = withLevel.filter((x) => x.level === null).map((x) => x.t);
    if (unknown.length) {
      return {
        kind: 'use',
        transcripts: unknown,
        level: requirementLevel,
        assumed: `This asks for your ${EDUCATION_LEVEL_LABEL[requirementLevel]} GPA, and we could not tell whether your transcript is ${EDUCATION_LEVEL_LABEL[requirementLevel]}. Name it, for example "${capitalize(EDUCATION_LEVEL_LABEL[requirementLevel])} transcript", in Documents.`,
      };
    }
    return { kind: 'missing_level', level: requirementLevel };
  }
  const known = [...new Set(withLevel.map((x) => x.level).filter((l): l is GpaLevel => l !== null))];
  if (known.length <= 1) return { kind: 'use', transcripts, level: known[0] ?? null, assumed: null };
  const latest = known.reduce((a, b) => (ORDER[b] > ORDER[a] ? b : a));
  return {
    kind: 'use',
    transcripts: withLevel.filter((x) => x.level === latest).map((x) => x.t),
    level: latest,
    assumed: `The scholarship does not say which GPA, so your most recent one (${EDUCATION_LEVEL_LABEL[latest]}) is used.`,
  };
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
