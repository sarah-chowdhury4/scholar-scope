/**
 * AI document checks for the student's own files (transcripts, certificates, passport…).
 *
 * Gemini reads the stored text and reports a few facts, each with a quote copied from the file.
 * A fact only counts when its quote is found in the stored text ("no source, no claim");
 * the rules below then turn the facts into plain-language findings. The rules are plain code,
 * so they are tested and never depend on the model's judgement.
 *
 * Identity numbers (passport number, national ID…) are never asked for or stored.
 */
import { STUDENT_DOCUMENT_TYPES, studentDocumentLabel } from './documents';

export const DOCUMENT_CHECK_PROMPT_VERSION = 'dc-1';

export type DetectedDocumentType = (typeof STUDENT_DOCUMENT_TYPES)[number]['id'] | 'unknown';

/** One fact read from the file. `found` is false when the quote is not in the stored text. */
export type DocumentFact<T> = {
  value: T;
  quote: string;
  page: number | null;
  found: boolean;
};

export type DocumentFacts = {
  detectedType: DetectedDocumentType;
  typeConfidence: number;
  holderName: DocumentFact<string> | null;
  issuer: DocumentFact<string> | null;
  issueDate: DocumentFact<string> | null;
  expiryDate: DocumentFact<string> | null;
  /** Main language of the document, as an English name ("English", "French"). */
  language: string | null;
  gpa: DocumentFact<{ value: number; scale: number | null }> | null;
  /** The file itself says it is unofficial, a copy, or a draft. */
  unofficial: DocumentFact<boolean> | null;
  /** Too little readable text to check (blurry scan, mostly blank). */
  hardToRead: boolean;
};

export type FindingSeverity = 'ok' | 'warning' | 'problem';

export type DocumentFinding = {
  code:
    | 'type_matches'
    | 'type_mismatch'
    | 'type_unclear'
    | 'hard_to_read'
    | 'name_matches'
    | 'name_mismatch'
    | 'expired'
    | 'expires_soon'
    | 'expires_before_deadline'
    | 'valid_through_deadline'
    | 'unofficial'
    | 'gpa_below_minimum'
    | 'gpa_meets_minimum'
    | 'gpa_scale_differs'
    | 'not_in_english'
    | 'unverified_fact';
  severity: FindingSeverity;
  message: string;
  quote: string | null;
  page: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Parse YYYY-MM-DD (or a longer ISO string) as a UTC date. */
export function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) return null;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}

/** Letters only, accents removed, lower case, split into words. */
export function nameTokens(name: string): string[] {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, ' ')
    .split(/[\s'-]+/)
    .filter((part) => part.length > 1);
}

/**
 * Names match when every word of the shorter name appears in the longer one.
 * "Ana Lucia Perez" matches "Ana Perez"; "Ana Perez" does not match "Ana Smith".
 */
export function namesMatch(a: string, b: string): boolean {
  const left = nameTokens(a);
  const right = nameTokens(b);
  if (!left.length || !right.length) return false;
  const [short, long] = left.length <= right.length ? [left, right] : [right, left];
  const pool = new Set(long);
  return short.every((part) => pool.has(part));
}

function fromFact(fact: { quote: string; page: number | null } | null): Pick<DocumentFinding, 'quote' | 'page'> {
  return { quote: fact?.quote ?? null, page: fact?.page ?? null };
}

/** Facts whose quote was not found are not used for any finding; they are listed once so the student can look. */
function usable<T>(fact: DocumentFact<T> | null): DocumentFact<T> | null {
  return fact && fact.found ? fact : null;
}

/**
 * Checks that do not depend on a scholarship: is this the kind of file the student said it is,
 * is it readable, does the name match the profile, has the passport expired.
 */
export function checkDocument(
  facts: DocumentFacts,
  context: { declaredType: string; profileName: string | null; now?: Date },
): DocumentFinding[] {
  const now = context.now ?? new Date();
  const findings: DocumentFinding[] = [];
  const declared = studentDocumentLabel(context.declaredType);

  if (facts.hardToRead) {
    findings.push({
      code: 'hard_to_read',
      severity: 'problem',
      message: 'Most of this file could not be read. Upload a clearer scan or the original PDF.',
      quote: null,
      page: null,
    });
  }

  if (context.declaredType !== 'other') {
    if (facts.detectedType === 'unknown' || facts.typeConfidence < 0.5) {
      findings.push({
        code: 'type_unclear',
        severity: 'warning',
        message: `We could not tell whether this is a ${declared.toLowerCase()}. Open it and make sure it is the right file.`,
        quote: null,
        page: null,
      });
    } else if (facts.detectedType !== context.declaredType) {
      findings.push({
        code: 'type_mismatch',
        severity: 'problem',
        message: `You saved this as a ${declared.toLowerCase()}, but it looks like a ${studentDocumentLabel(facts.detectedType).toLowerCase()}.`,
        quote: null,
        page: null,
      });
    } else {
      findings.push({ code: 'type_matches', severity: 'ok', message: `Looks like a ${declared.toLowerCase()}.`, quote: null, page: null });
    }
  }

  const holder = usable(facts.holderName);
  if (holder && context.profileName) {
    if (namesMatch(holder.value, context.profileName)) {
      findings.push({ code: 'name_matches', severity: 'ok', message: `The name on the file matches your profile.`, ...fromFact(holder) });
    } else {
      findings.push({
        code: 'name_mismatch',
        severity: 'warning',
        message: `The name on the file ("${holder.value}") is different from the name on your profile ("${context.profileName}"). Applications usually need the same name everywhere.`,
        ...fromFact(holder),
      });
    }
  }

  const expiryFact = usable(facts.expiryDate);
  const expiry = parseIsoDate(expiryFact?.value);
  if (expiryFact && expiry) {
    if (expiry.getTime() < now.getTime()) {
      findings.push({ code: 'expired', severity: 'problem', message: `This document expired on ${formatDate(expiry)}.`, ...fromFact(expiryFact) });
    } else if (expiry.getTime() - now.getTime() < 183 * DAY_MS) {
      findings.push({
        code: 'expires_soon',
        severity: 'warning',
        message: `This document expires on ${formatDate(expiry)}. Many programs and visas want at least six months left.`,
        ...fromFact(expiryFact),
      });
    }
  }

  const unofficial = usable(facts.unofficial);
  if (unofficial?.value) {
    findings.push({
      code: 'unofficial',
      severity: 'warning',
      message: 'The file says it is unofficial or a copy. Some scholarships accept only official documents.',
      ...fromFact(unofficial),
    });
  }

  for (const [label, fact] of [
    ['name', facts.holderName],
    ['issue date', facts.issueDate],
    ['expiry date', facts.expiryDate],
    ['GPA', facts.gpa],
  ] as const) {
    if (fact && !fact.found) {
      findings.push({
        code: 'unverified_fact',
        severity: 'warning',
        message: `The ${label} we read could not be matched to the text of the file, so we did not use it. Check it yourself.`,
        quote: fact.quote || null,
        page: fact.page,
      });
    }
  }
  return findings;
}

/** What one scholarship asks that a saved file can be checked against. */
export type ScholarshipCheckContext = {
  deadline: Date | null;
  /** Minimum GPA from the requirements (assumed to be on a 4.0 scale unless the label says otherwise). */
  minGpa: number | null;
  requirementLabels: string[];
};

/** Checks that compare the file with one scholarship: deadline vs expiry, GPA vs minimum, official/English rules. */
export function checkDocumentForScholarship(
  facts: DocumentFacts,
  documentType: string,
  context: ScholarshipCheckContext,
): DocumentFinding[] {
  const findings: DocumentFinding[] = [];
  const labels = context.requirementLabels.map((label) => label.toLowerCase());

  const expiryFact = usable(facts.expiryDate);
  const expiry = parseIsoDate(expiryFact?.value);
  if (expiryFact && expiry && context.deadline) {
    if (expiry.getTime() < context.deadline.getTime()) {
      findings.push({
        code: 'expires_before_deadline',
        severity: 'problem',
        message: `It expires on ${formatDate(expiry)}, before this application is due.`,
        ...fromFact(expiryFact),
      });
    } else {
      findings.push({ code: 'valid_through_deadline', severity: 'ok', message: 'Still valid on the due date.', ...fromFact(expiryFact) });
    }
  }

  const gpaFact = usable(facts.gpa);
  if (gpaFact && context.minGpa != null && documentType === 'transcript') {
    const { value, scale } = gpaFact.value;
    if (scale == null || Math.abs(scale - 4) < 0.001) {
      if (value + 1e-9 < context.minGpa) {
        findings.push({
          code: 'gpa_below_minimum',
          severity: 'problem',
          message: `This transcript shows a GPA of ${value}. The scholarship asks for at least ${context.minGpa}.`,
          ...fromFact(gpaFact),
        });
      } else {
        findings.push({
          code: 'gpa_meets_minimum',
          severity: 'ok',
          message: `GPA ${value} meets the minimum of ${context.minGpa}.`,
          ...fromFact(gpaFact),
        });
      }
    } else {
      findings.push({
        code: 'gpa_scale_differs',
        severity: 'warning',
        message: `This transcript uses a ${scale}-point scale (GPA ${value}). The minimum of ${context.minGpa} is probably on a 4.0 scale; check how the scholarship converts grades.`,
        ...fromFact(gpaFact),
      });
    }
  }

  const asksOfficial = labels.some((label) => /\bofficial\b/.test(label) && !/\bunofficial\b/.test(label));
  const unofficial = usable(facts.unofficial);
  if (asksOfficial && unofficial?.value) {
    findings.push({
      code: 'unofficial',
      severity: 'problem',
      message: 'This scholarship asks for an official document, and this file says it is unofficial or a copy.',
      ...fromFact(unofficial),
    });
  }

  const asksEnglish = labels.some((label) => /\benglish\b/.test(label) || /\btranslat/.test(label));
  if (asksEnglish && facts.language && facts.language.toLowerCase() !== 'english') {
    findings.push({
      code: 'not_in_english',
      severity: 'warning',
      message: `This file looks like it is in ${facts.language}. The scholarship mentions English or translations; you may need a certified translation.`,
      quote: null,
      page: null,
    });
  }
  return findings;
}

/** Worst severity first, then the order the rules produced them. */
export function sortFindings(findings: DocumentFinding[]): DocumentFinding[] {
  const rank: Record<FindingSeverity, number> = { problem: 0, warning: 1, ok: 2 };
  return findings.map((finding, index) => ({ finding, index })).sort((a, b) => rank[a.finding.severity] - rank[b.finding.severity] || a.index - b.index).map((item) => item.finding);
}

export function worstSeverity(findings: DocumentFinding[]): FindingSeverity {
  if (findings.some((finding) => finding.severity === 'problem')) return 'problem';
  if (findings.some((finding) => finding.severity === 'warning')) return 'warning';
  return 'ok';
}

/** The lowest minimum GPA stated by the requirements, if any. */
export function minGpaFromRequirements(requirements: { current?: { value?: Record<string, unknown> } | null }[]): number | null {
  let min: number | null = null;
  for (const requirement of requirements) {
    const value = requirement.current?.value?.minGpa;
    if (typeof value === 'number' && Number.isFinite(value)) min = min == null ? value : Math.min(min, value);
  }
  return min;
}

/** Read facts saved in Firestore defensively; a bad write must not break the page. */
export function readDocumentFacts(data: unknown): DocumentFacts | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const fact = <T>(raw: unknown, isValue: (v: unknown) => v is T): DocumentFact<T> | null => {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (!isValue(r.value)) return null;
    return {
      value: r.value,
      quote: typeof r.quote === 'string' ? r.quote : '',
      page: typeof r.page === 'number' ? r.page : null,
      found: r.found === true,
    };
  };
  const isString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
  const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
  const isGpa = (v: unknown): v is { value: number; scale: number | null } =>
    !!v && typeof v === 'object' && typeof (v as { value?: unknown }).value === 'number';
  const known = new Set<string>([...STUDENT_DOCUMENT_TYPES.map((item) => item.id), 'unknown']);
  const detected = typeof d.detectedType === 'string' && known.has(d.detectedType) ? (d.detectedType as DetectedDocumentType) : 'unknown';
  return {
    detectedType: detected,
    typeConfidence: typeof d.typeConfidence === 'number' ? d.typeConfidence : 0,
    holderName: fact(d.holderName, isString),
    issuer: fact(d.issuer, isString),
    issueDate: fact(d.issueDate, isString),
    expiryDate: fact(d.expiryDate, isString),
    language: typeof d.language === 'string' && d.language.trim() ? d.language.trim() : null,
    gpa: fact(d.gpa, isGpa),
    unofficial: fact(d.unofficial, isBool),
    hardToRead: d.hardToRead === true,
  };
}
