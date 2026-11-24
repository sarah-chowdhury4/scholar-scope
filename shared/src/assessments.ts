/**
 * Requirements the platform can judge from the student's own checked documents ("no source, no claim"):
 *   - a minimum GPA, against the GPA read from a transcript (its quote found in the file)
 *   - a transcript, certificate, passport or birth certificate, against the saved file and its AI check
 * Everything else (essays, letters, forms, videos...) stays a manual tick.
 * A GPA typed on the profile never counts as meeting a requirement; it is only mentioned as a hint.
 */
import { documentsAskedFor, studentDocumentLabel, type AskedDocumentType } from './documents';
import { checkDocumentForScholarship, type DocumentFacts, type DocumentFinding } from './documentChecks';
import { EDUCATION_LEVEL_LABEL, gpaRequirementLevel, transcriptsForGpa, type GpaLevel } from './gpaLevel';

export type AssessmentStatus = 'met' | 'not_met' | 'check' | 'missing';

export type Assessment = {
  status: AssessmentStatus;
  message: string;
  /** The text in the student's document this is based on, when there is one. */
  quote: string | null;
  page: number | null;
  /** Title of the document it is based on ("Undergraduate transcript"). */
  documentTitle: string | null;
};

export type CheckedDocument = {
  id: string;
  type: string;
  title: string;
  checkStatus: 'queued' | 'running' | 'done' | 'paused' | 'failed' | null;
  facts: DocumentFacts | null;
  findings: DocumentFinding[];
};

export type AssessmentContext = {
  documents: CheckedDocument[];
  deadline: Date | null;
  /** From the profile: shown as a hint only, never as proof. */
  profileGpa: { value: number; scale: string } | null;
};

type RequirementLike = {
  kind?: string | null;
  label?: string | null;
  current?: { value?: Record<string, unknown>; citation?: { quote?: unknown } | null } | null;
};

function minGpaOf(r: RequirementLike): number | null {
  const value = r.current?.value?.minGpa;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

const fmt = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(Math.round(n * 100) / 100));

function assessGpa(min: number, level: GpaLevel | null, ctx: AssessmentContext): Assessment {
  const all = ctx.documents.filter((d) => d.type === 'transcript');
  const profileHint = ctx.profileGpa ? ` Your profile says ${fmt(ctx.profileGpa.value)} out of ${ctx.profileGpa.scale}, but that is not confirmed by a document.` : '';
  const which = level ? `${EDUCATION_LEVEL_LABEL[level]} transcript` : 'transcript';
  if (!all.length) {
    return { status: 'missing', message: `Upload your ${which} in Documents to check this.${profileHint}`, quote: null, page: null, documentTitle: null };
  }
  // Only transcripts of the level the requirement names (high school, undergraduate, graduate) count.
  const choice = transcriptsForGpa(level, all);
  if (choice.kind === 'missing_level') {
    const label = EDUCATION_LEVEL_LABEL[choice.level];
    return {
      status: 'missing',
      message: `This asks for your ${label} GPA. Upload your ${label} transcript in Documents to check it; your other transcripts do not count here.${profileHint}`,
      quote: null,
      page: null,
      documentTitle: null,
    };
  }
  const transcripts = choice.transcripts;
  const read = transcripts.filter((d) => d.facts?.gpa?.found);
  if (!read.length) {
    const pending = transcripts.some((d) => d.checkStatus === 'queued' || d.checkStatus === 'running');
    return {
      status: pending ? 'check' : 'missing',
      message: pending
        ? 'Your transcript is still being checked.'
        : `We could not find an overall GPA on your transcript, so this cannot be checked automatically.${profileHint}`,
      quote: null,
      page: null,
      documentTitle: null,
    };
  }
  const fourPoint = read.filter((d) => d.facts!.gpa!.value.scale == null || Math.abs(d.facts!.gpa!.value.scale - 4) < 0.001);
  if (fourPoint.length) {
    const best = fourPoint.reduce((a, b) => (b.facts!.gpa!.value.value > a.facts!.gpa!.value.value ? b : a));
    const gpa = best.facts!.gpa!;
    const met = gpa.value.value + 1e-9 >= min;
    const note = choice.assumed ? ` ${choice.assumed}` : '';
    // An unsure level is never shown as met: the student confirms which transcript it is first.
    const unsureLevel = choice.assumed !== null && level !== null;
    return {
      status: unsureLevel ? 'check' : met ? 'met' : 'not_met',
      message: met
        ? `${unsureLevel ? 'Probably met' : 'You meet this'}: your ${best.title.toLowerCase()} shows a GPA of ${fmt(gpa.value.value)}.${note}`
        : `Your ${best.title.toLowerCase()} shows a GPA of ${fmt(gpa.value.value)}; the minimum is ${fmt(min)}.${note}`,
      quote: gpa.quote || null,
      page: gpa.page,
      documentTitle: best.title,
    };
  }
  const other = read[0]!;
  const gpa = other.facts!.gpa!;
  return {
    status: 'check',
    message: `Your ${other.title.toLowerCase()} uses a ${fmt(gpa.value.scale ?? 0)}-point scale (${fmt(gpa.value.value)}). The minimum of ${fmt(min)} is probably on a 4.0 scale; check how this scholarship converts grades.`,
    quote: gpa.quote || null,
    page: gpa.page,
    documentTitle: other.title,
  };
}

function assessDocument(type: AskedDocumentType, ctx: AssessmentContext): Assessment {
  const label = studentDocumentLabel(type).toLowerCase();
  const docs = ctx.documents.filter((d) => d.type === type);
  if (!docs.length) return { status: 'missing', message: `Upload your ${label} in Documents.`, quote: null, page: null, documentTitle: null };

  const judged = docs.map((d) => {
    const scholarship = d.facts ? checkDocumentForScholarship(d.facts, d.type, { deadline: ctx.deadline, minGpa: null, requirementLabels: [] }) : [];
    const problems = [...d.findings, ...scholarship].filter((f) => f.severity === 'problem');
    const confirmed = d.findings.some((f) => f.code === 'type_matches');
    return { d, problems, confirmed };
  });
  const ready = judged.find((j) => j.d.checkStatus === 'done' && j.confirmed && !j.problems.length);
  if (ready) {
    const names = judged.filter((j) => j.d.checkStatus === 'done' && j.confirmed && !j.problems.length).map((j) => j.d.title);
    return { status: 'met', message: `Ready: ${names.join(', ')}.`, quote: null, page: null, documentTitle: ready.d.title };
  }
  const broken = judged.find((j) => j.d.checkStatus === 'done' && j.problems.length);
  if (broken) {
    return { status: 'not_met', message: `Your ${broken.d.title.toLowerCase()} has a problem: ${broken.problems[0]!.message}`, quote: broken.problems[0]!.quote, page: broken.problems[0]!.page, documentTitle: broken.d.title };
  }
  if (judged.some((j) => j.d.checkStatus === 'queued' || j.d.checkStatus === 'running')) {
    return { status: 'check', message: `Your ${label} is still being checked.`, quote: null, page: null, documentTitle: null };
  }
  if (judged.some((j) => j.d.checkStatus === 'done')) {
    return { status: 'check', message: `We could not confirm your file is ${/^[aeiou]/.test(label) ? 'an' : 'a'} ${label}. Open Documents to see why.`, quote: null, page: null, documentTitle: null };
  }
  return { status: 'check', message: `The AI check of your ${label} did not finish. Open Documents and press Check again.`, quote: null, page: null, documentTitle: null };
}

/** The automatic judgement for one requirement, or null when the student ticks it themselves. */
export function assessRequirement(requirement: RequirementLike, ctx: AssessmentContext): Assessment | null {
  const min = minGpaOf(requirement);
  if (min != null) return assessGpa(min, gpaRequirementLevel(requirement), ctx);
  const asked = documentsAskedFor([requirement]);
  if (asked.length === 1) return assessDocument(asked[0]!, ctx);
  return null;
}

/** Readiness the checklist should show for an automatically judged requirement. */
export function readinessFor(assessment: Assessment): 'ready' | 'missing' {
  return assessment.status === 'met' ? 'ready' : 'missing';
}

/** True for requirements the platform judges itself; the student cannot tick these by hand. */
export function isAutoAssessed(requirement: RequirementLike): boolean {
  return minGpaOf(requirement) != null || documentsAskedFor([requirement]).length === 1;
}
