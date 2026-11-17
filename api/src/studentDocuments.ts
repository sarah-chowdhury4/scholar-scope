import {
  checkDocumentForScholarship,
  documentsAskedFor,
  readDocumentFacts,
  sortFindings,
  studentDocumentHeading,
  worstSeverity,
  STUDENT_DOCUMENT_TYPES,
  userDoc,
  type DocumentFacts,
  type DocumentFinding,
  type FindingSeverity,
  type ScholarshipCheckContext,
  type StudentDocumentType,
} from '@scholarscope/shared';

export type DocumentCheckDto = {
  status: 'queued' | 'running' | 'done' | 'paused' | 'failed';
  reason: string | null;
  severity: FindingSeverity | null;
  findings: DocumentFinding[];
  checkedAt: string | null;
};

export type StudentDocumentDto = {
  id: string;
  type: StudentDocumentType | string;
  title: string;
  fileName: string;
  scanStatus: string;
  /** The saved file can be opened. A replacement that is still being checked does not clear this. */
  ready: boolean;
  usedIn: string[];
  /** The AI document check of the current file, or null if it has never run. */
  check: DocumentCheckDto | null;
};

/** A document as shown on one scholarship, with the findings that compare it to that scholarship. */
export type ScholarshipDocumentDto = StudentDocumentDto & { scholarshipFindings: DocumentFinding[] };

const KNOWN = new Set<string>(STUDENT_DOCUMENT_TYPES.map((item) => item.id));
const CHECK_STATUSES = new Set(['queued', 'running', 'done', 'paused', 'failed']);

/** A check still "queued" or "running" after this long was lost (worker restarted, AI service down). */
export const STALE_CHECK_MS = 15 * 60 * 1000;

export function isStaleCheck(check: { status?: unknown; updatedAt?: unknown } | null | undefined, now = Date.now()): boolean {
  if (!check || (check.status !== 'queued' && check.status !== 'running')) return false;
  const at = (check.updatedAt as { toMillis?: () => number } | undefined)?.toMillis?.();
  return at === undefined || now - at > STALE_CHECK_MS;
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function readFindings(value: unknown): DocumentFinding[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is DocumentFinding =>
      !!item && typeof item === 'object' && typeof item.message === 'string' && ['ok', 'warning', 'problem'].includes(item.severity),
  );
}

function readCheck(raw: unknown): { dto: DocumentCheckDto | null; facts: DocumentFacts | null } {
  if (!raw || typeof raw !== 'object') return { dto: null, facts: null };
  const check = raw as Record<string, unknown>;
  if (isStaleCheck(check)) {
    return {
      dto: { status: 'failed', reason: 'The check did not finish (the AI service may have been busy). Press Check again.', severity: null, findings: [], checkedAt: null },
      facts: null,
    };
  }
  const status = typeof check.status === 'string' && CHECK_STATUSES.has(check.status) ? (check.status as DocumentCheckDto['status']) : 'failed';
  const findings = readFindings(check.findings);
  const checkedAt = (check.checkedAt as { toDate?: () => Date } | undefined)?.toDate?.().toISOString() ?? null;
  return {
    dto: {
      status,
      reason: typeof check.reason === 'string' ? check.reason : null,
      severity: status === 'done' ? worstSeverity(findings) : null,
      findings,
      checkedAt,
    },
    facts: status === 'done' ? readDocumentFacts(check.facts) : null,
  };
}

type Loaded = { dto: StudentDocumentDto; facts: DocumentFacts | null };

async function load(snap: FirebaseFirestore.QueryDocumentSnapshot): Promise<Loaded> {
  const data = snap.data();
  const versionId = typeof data.currentVersionId === 'string' ? data.currentVersionId : null;
  let ready = false;
  if (versionId) {
    const version = await snap.ref.collection('versions').doc(versionId).get();
    ready = version.get('scan')?.status === 'clean';
  }
  const { dto: check, facts } = readCheck(data.check);
  return {
    dto: {
      id: snap.id,
      type: typeof data.type === 'string' ? data.type : 'other',
      title: typeof data.title === 'string' && data.title.trim() ? data.title : 'Document',
      fileName: typeof data.fileName === 'string' && data.fileName.trim() ? data.fileName : 'Uploaded file',
      scanStatus: typeof data.scanStatus === 'string' ? data.scanStatus : 'pending',
      ready,
      usedIn: asStrings(data.usedIn),
      check,
    },
    facts,
  };
}

async function loadAll(uid: string): Promise<Loaded[]> {
  const snap = await userDoc(uid).collection('materials').get();
  const items = await Promise.all(snap.docs.filter((doc) => KNOWN.has(String(doc.get('type')))).map((doc) => load(doc)));
  return items.sort((a, b) => a.dto.title.localeCompare(b.dto.title));
}

export async function listStudentDocuments(uid: string): Promise<StudentDocumentDto[]> {
  return (await loadAll(uid)).map((item) => item.dto);
}

export function documentsForScholarship(
  docs: Loaded[],
  requirements: { kind?: string | null; label?: string | null }[],
  scholarshipId: string,
  context: ScholarshipCheckContext,
) {
  const withFindings = (item: Loaded): ScholarshipDocumentDto => ({
    ...item.dto,
    scholarshipFindings: item.facts ? sortFindings(checkDocumentForScholarship(item.facts, item.dto.type, context)) : [],
  });
  const needed = documentsAskedFor(requirements).map((type) => ({
    type,
    label: studentDocumentHeading(type),
    documents: docs.filter((doc) => doc.dto.type === type).map(withFindings),
  }));
  const shown = new Set(needed.flatMap((group) => group.documents.map((doc) => doc.id)));
  const extras = docs.filter((doc) => doc.dto.usedIn.includes(scholarshipId) && !shown.has(doc.dto.id)).map(withFindings);
  return { needed, extras };
}

/** Documents for one scholarship page, with findings against its deadline and requirements. */
export async function scholarshipDocuments(
  uid: string,
  scholarshipId: string,
  requirements: { kind?: string | null; label?: string | null }[],
  context: ScholarshipCheckContext,
) {
  return documentsForScholarship(await loadAll(uid), requirements, scholarshipId, context);
}
