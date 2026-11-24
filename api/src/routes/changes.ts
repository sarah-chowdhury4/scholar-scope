import { Router } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { db, userDoc, writeAudit, recomputeCounts, sideBySide } from '@scholarscope/shared';
import { HttpError } from '../http';

/**
 * Requirement changes found when a source changed (FR-3.3, FR-3.4).
 * Mounted at /api/scholarships/:id/changes.
 */
export const changesRouter = Router({ mergeParams: true });

function iso(value: unknown): string | null {
  return (value as { toDate?: () => Date } | undefined)?.toDate?.().toISOString() ?? null;
}

function source(sourceId: unknown, sourceVersionId: unknown): { sourceId: string; sourceVersionId: string } | null {
  return typeof sourceId === 'string' && typeof sourceVersionId === 'string' ? { sourceId, sourceVersionId } : null;
}

/** Open changes (or all, with ?status=all), newest first, with a word-level side-by-side diff of the quotes. */
changesRouter.get('/', async (req, res) => {
  const { id } = req.params as { id: string };
  const schRef = userDoc(req.uid!).collection('scholarships').doc(id);
  if (!(await schRef.get()).exists) return res.status(404).json({ error: 'Not found' });
  let query: FirebaseFirestore.Query = schRef.collection('changes');
  if (req.query.status !== 'all') query = query.where('status', '==', 'open');
  const snap = await query.get();
  const items = snap.docs
    .map((doc) => {
      const fromQuote = (doc.get('fromQuote') as string | null) ?? '';
      const toQuote = (doc.get('toQuote') as string | null) ?? '';
      const ai = doc.get('aiSummary') as { summary?: string; whatToDo?: string; importance?: string; model?: string } | null;
      return {
        id: doc.id,
        requirementId: doc.get('requirementId') as string,
        label: (doc.get('label') as string | undefined) ?? (doc.get('summary') as string),
        status: doc.get('status') as 'open' | 'acknowledged',
        detectedAt: iso(doc.get('detectedAt')),
        acknowledgedAt: iso(doc.get('acknowledgedAt')),
        from: source(doc.get('fromSourceId'), doc.get('fromSourceVersionId')),
        to: source(doc.get('toSourceId'), doc.get('toSourceVersionId')),
        fromQuote,
        toQuote,
        diff: sideBySide(fromQuote, toQuote),
        aiSummary: ai?.summary ? { summary: ai.summary, whatToDo: ai.whatToDo ?? '', importance: ai.importance ?? 'minor', model: ai.model ?? null } : null,
      };
    })
    .sort((a, b) => (b.detectedAt ?? '').localeCompare(a.detectedAt ?? ''));
  res.json({ items });
});

/**
 * "I've seen this change": closes the change, clears the flag on the requirement, and puts it back
 * on the checklist as not done (the student re-ticks it once their application matches the new wording).
 */
changesRouter.post('/:cid/acknowledge', async (req, res) => {
  const { id, cid } = req.params as { id: string; cid: string };
  const uid = req.uid!;
  const schRef = userDoc(uid).collection('scholarships').doc(id);
  const changeRef = schRef.collection('changes').doc(cid);

  const alertId = await db().runTransaction(async (tx) => {
    const change = await tx.get(changeRef);
    if (!change.exists) throw new HttpError(404, 'Change not found');
    if (change.get('status') !== 'open') throw new HttpError(409, 'You already confirmed this change.');
    const reqRef = schRef.collection('requirements').doc(change.get('requirementId') as string);
    const requirement = await tx.get(reqRef);
    tx.update(changeRef, { status: 'acknowledged', acknowledgedAt: FieldValue.serverTimestamp(), acknowledgedBy: { type: 'student', id: uid } });
    // Only clear the flag if it still points at this change (a newer change keeps its own flag).
    if (requirement.exists && requirement.get('changeFlag.changeId') === cid) {
      tx.update(reqRef, { changeFlag: null, readiness: 'missing', needsRecheck: false, updatedAt: FieldValue.serverTimestamp() });
    }
    return (change.get('alertId') as string | null) ?? null;
  });

  if (alertId) await userDoc(uid).collection('alerts').doc(alertId).set({ inApp: { readAt: new Date() } }, { merge: true });
  await recomputeCounts(schRef);
  await writeAudit({ actor: { type: 'student', id: uid }, subjectUid: uid, action: 'change.acknowledged', resource: changeRef.path });
  res.json({ ok: true });
});
