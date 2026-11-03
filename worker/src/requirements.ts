import { FieldValue, Timestamp, type DocumentReference } from 'firebase-admin/firestore';
import { db, type Citation, type Verification, type Actor } from '@scholarscope/shared';

export function matchKeyFor(kind: string, label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 6)
    .join('-');
  return `${kind}:${slug}`;
}

export type NewRequirementVersion = {
  kind: string;
  label: string;
  value: Record<string, unknown>;
  citation: Citation | null;
  verification: Verification;
  origin: 'extraction' | 'refetch';
  extraction: { model: string; promptVersion: string; confidence: number; jobId: string; ocrDerived: boolean };
  createdBy: Actor;
};

/**
 * Append a version to a requirement, never overwrite (FR-3.1).
 * - new requirement           → version 1
 * - same matchKey, same quote → no new version (unchanged)
 * - same matchKey, new quote  → version n+1, flagged "changed" until the student acknowledges (FR-3.4)
 */
export async function upsertRequirement(
  scholarshipRef: DocumentReference,
  item: NewRequirementVersion,
): Promise<'created' | 'unchanged' | 'changed'> {
  const matchKey = matchKeyFor(item.kind, item.label);
  const existing = await scholarshipRef.collection('requirements').where('matchKey', '==', matchKey).limit(1).get();

  return db().runTransaction(async (tx) => {
    const reqRef = existing.docs[0]?.ref ?? scholarshipRef.collection('requirements').doc();
    const current = existing.docs[0] ? await tx.get(reqRef) : null;
    const prevHash = (current?.get('current.citation.quoteHash') as string | undefined) ?? null;
    const newHash = item.citation?.quoteHash ?? null;

    if (current && prevHash && prevHash === newHash) return 'unchanged';

    const versionNo = ((current?.get('currentVersionNo') as number | undefined) ?? 0) + 1;
    const verRef = reqRef.collection('versions').doc();
    tx.create(verRef, {
      versionNo,
      value: item.value,
      citation: item.citation,
      origin: item.origin,
      extraction: item.extraction,
      review: null,
      correctsVersionId: null,
      previousVersionId: current?.get('currentVersionId') ?? null,
      createdBy: item.createdBy,
      createdAt: FieldValue.serverTimestamp(),
    });

    const head = {
      kind: item.kind,
      label: item.label,
      matchKey,
      currentVersionId: verRef.id,
      currentVersionNo: versionNo,
      current: { value: item.value, citation: item.citation },
      verification: item.verification,
      removedAt: null,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (!current) {
      tx.set(reqRef, { ...head, readiness: 'missing', changeFlag: null, needsRecheck: false, createdAt: FieldValue.serverTimestamp() });
      return 'created';
    }

    const changeRef = scholarshipRef.collection('changes').doc();
    tx.create(changeRef, {
      requirementId: reqRef.id,
      changeType: 'modified',
      field: item.kind,
      fromVersionId: current.get('currentVersionId') ?? null,
      toVersionId: verRef.id,
      fromSourceVersionId: current.get('current.citation.sourceVersionId') ?? null,
      toSourceVersionId: item.citation?.sourceVersionId ?? null,
      summary: `"${item.label}" changed in the source.`,
      detectedBy: item.createdBy,
      confidence: item.extraction.confidence,
      status: 'open',
      acknowledgedAt: null,
      affected: { draftIds: [], matchIds: [] },
      alertId: null,
      detectedAt: FieldValue.serverTimestamp(),
    });
    tx.update(reqRef, {
      ...head,
      readiness: 'changed',
      changeFlag: { active: true, changeId: changeRef.id, since: Timestamp.now() },
      needsRecheck: true,
    });
    return 'changed';
  });
}

/** Recompute the dashboard counts on the scholarship head (FR-1.4). */
export async function recomputeCounts(scholarshipRef: DocumentReference): Promise<void> {
  const reqs = await scholarshipRef.collection('requirements').where('removedAt', '==', null).get();
  const counts = { open: 0, changed: 0, unverified: 0, needsReview: 0, ready: 0, total: reqs.size };
  for (const r of reqs.docs) {
    const readiness = r.get('readiness');
    const verification = r.get('verification');
    if (readiness === 'ready') counts.ready++;
    else counts.open++;
    if (readiness === 'changed' || r.get('changeFlag.active')) counts.changed++;
    if (verification === 'unverified') counts.unverified++;
    if (verification === 'needs_review') counts.needsReview++;
  }
  await scholarshipRef.update({
    counts,
    readinessPct: counts.total ? Math.round((counts.ready / counts.total) * 100) : 0,
    updatedAt: FieldValue.serverTimestamp(),
  });
}
