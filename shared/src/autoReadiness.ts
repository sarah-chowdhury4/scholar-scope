import { FieldValue, type Timestamp } from 'firebase-admin/firestore';
import { userDoc } from './firebase';
import { STUDENT_DOCUMENT_TYPES } from './documents';
import { readDocumentFacts, type DocumentFinding } from './documentChecks';
import { readProfileRecord } from './profile';
import { recomputeCounts } from './requirements';
import { assessRequirement, readinessFor, type Assessment, type CheckedDocument } from './assessments';

const KNOWN = new Set<string>(STUDENT_DOCUMENT_TYPES.map((t) => t.id));
const STATUSES = new Set(['queued', 'running', 'done', 'paused', 'failed']);

/** The student's saved files with their AI check results, ready for assessRequirement. */
export async function loadCheckedDocuments(uid: string): Promise<CheckedDocument[]> {
  const snap = await userDoc(uid).collection('materials').get();
  return snap.docs
    .filter((d) => KNOWN.has(String(d.get('type'))))
    .map((d) => {
      const check = (d.get('check') ?? {}) as Record<string, unknown>;
      const status = typeof check.status === 'string' && STATUSES.has(check.status) ? (check.status as CheckedDocument['checkStatus']) : null;
      return {
        id: d.id,
        type: String(d.get('type')),
        title: typeof d.get('title') === 'string' && d.get('title').trim() ? String(d.get('title')) : 'Document',
        checkStatus: status,
        facts: status === 'done' ? readDocumentFacts(check.facts) : null,
        findings: Array.isArray(check.findings) ? (check.findings as DocumentFinding[]).filter((f) => f && typeof f.message === 'string') : [],
      };
    });
}

/**
 * Judge every requirement the platform can check from documents, keep its checklist state in step
 * ("ready" when met, "missing" otherwise), and refresh the scholarship's counts when anything moved.
 * Requirements flagged as changed in the source wait until the student has reviewed the change.
 * Returns the judgements by requirement id (for the scholarship page).
 */
export async function syncAutoReadiness(uid: string, scholarshipIds?: string[]): Promise<Map<string, Assessment>> {
  const user = userDoc(uid);
  const [profileSnap, documents] = await Promise.all([user.get(), loadCheckedDocuments(uid)]);
  const profile = readProfileRecord(profileSnap.data());
  const profileGpa =
    profile.education.gpa != null && profile.education.gpaScale ? { value: profile.education.gpa, scale: profile.education.gpaScale } : null;

  const scholarships = scholarshipIds
    ? (await Promise.all(scholarshipIds.map((id) => user.collection('scholarships').doc(id).get()))).filter((s) => s.exists)
    : (await user.collection('scholarships').get()).docs;

  const results = new Map<string, Assessment>();
  for (const sch of scholarships) {
    if (sch.get('status') === 'archived') continue;
    const deadline = (sch.get('deadline.utc') as Timestamp | undefined)?.toDate() ?? null;
    const reqs = await sch.ref.collection('requirements').where('removedAt', '==', null).get();
    let moved = false;
    for (const r of reqs.docs) {
      const assessment = assessRequirement(r.data(), { documents, deadline, profileGpa });
      if (!assessment) continue;
      results.set(r.id, assessment);
      if (r.get('changeFlag.active') === true) continue;
      const target = readinessFor(assessment);
      if (r.get('readiness') !== target || r.get('autoAssessed') !== true) {
        await r.ref.update({ readiness: target, autoAssessed: true, updatedAt: FieldValue.serverTimestamp() });
        moved = true;
      }
    }
    if (moved) await recomputeCounts(sch.ref);
  }
  return results;
}
