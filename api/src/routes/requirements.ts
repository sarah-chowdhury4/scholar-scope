import { Router } from 'express';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db, userDoc, writeAudit, recomputeCounts, deadlineFromParts, deadlineRecord, isTimeZone, verificationAfterReview, isAutoAssessed, syncAutoReadiness } from '@scholarscope/shared';
import { readinessSchema, reviewSchema } from '../validation';
import { HttpError } from '../http';

/**
 * The student's review of extracted requirements (FR-2.5): confirm, correct, reject (and undo a reject),
 * plus the checklist tick. Corrections append a version; nothing is overwritten (FR-3.1).
 * Mounted at /api/scholarships/:id/requirements.
 */
export const requirementsRouter = Router({ mergeParams: true });

function iso(value: unknown): string | null {
  return (value as { toDate?: () => Date } | undefined)?.toDate?.().toISOString() ?? null;
}

function scholarshipRef(uid: string, id: string) {
  return userDoc(uid).collection('scholarships').doc(id);
}

/** Items the student rejected, so they can be restored. */
requirementsRouter.get('/removed', async (req, res) => {
  const ref = scholarshipRef(req.uid!, (req.params as { id: string }).id);
  if (!(await ref.get()).exists) return res.status(404).json({ error: 'Not found' });
  const snap = await ref.collection('requirements').where('removedAt', '!=', null).get();
  res.json({
    items: snap.docs.map((doc) => ({
      id: doc.id,
      kind: doc.get('kind'),
      label: doc.get('label'),
      removedAt: iso(doc.get('removedAt')),
      review: doc.get('review') ?? null,
    })),
  });
});

/** Every version of one requirement, newest first (who changed it, and the quote each time). */
requirementsRouter.get('/:rid/versions', async (req, res) => {
  const { id, rid } = req.params as { id: string; rid: string };
  const reqRef = scholarshipRef(req.uid!, id).collection('requirements').doc(rid);
  if (!(await reqRef.get()).exists) return res.status(404).json({ error: 'Not found' });
  const snap = await reqRef.collection('versions').orderBy('versionNo', 'desc').get();
  res.json({
    items: snap.docs.map((doc) => ({
      id: doc.id,
      versionNo: doc.get('versionNo'),
      value: doc.get('value') ?? {},
      citation: doc.get('citation') ?? null,
      origin: doc.get('origin'),
      createdBy: doc.get('createdBy') ?? null,
      correctsVersionId: doc.get('correctsVersionId') ?? null,
      createdAt: iso(doc.get('createdAt')),
    })),
  });
});

requirementsRouter.post('/:rid/review', async (req, res) => {
  const { id, rid } = req.params as { id: string; rid: string };
  const body = reviewSchema.parse(req.body);
  const uid = req.uid!;
  const schRef = scholarshipRef(uid, id);
  const reqRef = schRef.collection('requirements').doc(rid);
  const actor = { type: 'student' as const, id: uid };

  const outcome = await db().runTransaction(async (tx) => {
    const snap = await tx.get(reqRef);
    if (!snap.exists) throw new HttpError(404, 'Requirement not found');
    const removed = snap.get('removedAt') != null;
    const citation = snap.get('current.citation') ?? null;
    const verification = String(snap.get('verification') ?? 'unverified');
    const now = Timestamp.now();

    if (body.action === 'restore') {
      if (!removed) throw new HttpError(409, 'This requirement is already on your list.');
      tx.update(reqRef, { removedAt: null, review: { status: 'restored', at: now, by: actor }, updatedAt: FieldValue.serverTimestamp() });
      return { before: { removed: true }, after: { removed: false } };
    }
    if (removed) throw new HttpError(409, 'Restore this requirement before changing it.');

    if (body.action === 'reject') {
      tx.update(reqRef, {
        removedAt: now,
        review: { status: 'rejected', reason: body.reason ?? null, at: now, by: actor },
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { before: { removed: false }, after: { removed: true, reason: body.reason ?? null } };
    }

    if (body.action === 'confirm') {
      const next = verificationAfterReview('confirm', Boolean(citation), verification);
      tx.update(reqRef, {
        verification: next,
        review: { status: 'confirmed', at: now, by: actor },
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { before: { verification }, after: { verification: next } };
    }

    // correct: append a version that corrects the current one; the citation (the source text) stays.
    const currentValue = (snap.get('current.value') as Record<string, unknown> | undefined) ?? {};
    const value: Record<string, unknown> = { ...currentValue, text: body.label };
    if (body.details !== undefined) value.details = body.details || null;
    if (body.wordLimit !== undefined) value.wordLimit = body.wordLimit == null ? null : { max: body.wordLimit, unit: 'words' };
    if (body.minGpa !== undefined) value.minGpa = body.minGpa;
    let deadline: ReturnType<typeof deadlineRecord> | null | undefined;
    if (body.deadline !== undefined) {
      if (body.deadline === null) {
        deadline = null;
      } else {
        if (body.deadline.timezone && !isTimeZone(body.deadline.timezone)) throw new HttpError(400, 'Unknown time zone. Use a name like America/New_York.');
        const parts = deadlineFromParts(body.deadline.date, body.deadline.time ?? null, body.deadline.timezone ?? null);
        if (!parts) throw new HttpError(400, 'That date is not valid.');
        deadline = deadlineRecord(parts, (citation?.quote as string | undefined) ?? body.deadline.date);
      }
      value.deadline = deadline;
    }

    const versionNo = ((snap.get('currentVersionNo') as number | undefined) ?? 0) + 1;
    const verRef = reqRef.collection('versions').doc();
    const currentVersionId = (snap.get('currentVersionId') as string | undefined) ?? null;
    const next = verificationAfterReview('correct', Boolean(citation), verification);
    tx.create(verRef, {
      versionNo,
      value,
      citation,
      origin: 'student_correction',
      extraction: null,
      review: { status: 'corrected', at: now, by: actor },
      correctsVersionId: currentVersionId,
      previousVersionId: currentVersionId,
      createdBy: actor,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.update(reqRef, {
      label: body.label,
      currentVersionId: verRef.id,
      currentVersionNo: versionNo,
      current: { value, citation },
      verification: next,
      review: { status: 'corrected', at: now, by: actor },
      updatedAt: FieldValue.serverTimestamp(),
    });
    // A corrected deadline also moves the scholarship's due date, keeping the same source badge.
    if (deadline && snap.get('kind') === 'deadline') {
      tx.update(schRef, { deadline: { ...deadline, requirementId: rid, verification: next }, updatedAt: FieldValue.serverTimestamp() });
    }
    return { before: { versionId: currentVersionId }, after: { versionId: verRef.id, label: body.label } };
  });

  await recomputeCounts(schRef);
  await syncAutoReadiness(uid, [schRef.id]);
  await writeAudit({ actor, subjectUid: uid, action: `requirement.${body.action}`, resource: reqRef.path, before: outcome.before, after: outcome.after });
  res.json({ ok: true });
});

/** Tick a requirement off the checklist, or un-tick it. A changed requirement must be reviewed first. */
requirementsRouter.patch('/:rid', async (req, res) => {
  const { id, rid } = req.params as { id: string; rid: string };
  const body = readinessSchema.parse(req.body);
  const schRef = scholarshipRef(req.uid!, id);
  const reqRef = schRef.collection('requirements').doc(rid);
  const snap = await reqRef.get();
  if (!snap.exists || snap.get('removedAt') != null) return res.status(404).json({ error: 'Requirement not found' });
  if (snap.get('changeFlag.active') === true) {
    return res.status(409).json({ error: 'This requirement changed in the source. Review the change first.' });
  }
  if (isAutoAssessed(snap.data() ?? {})) {
    return res.status(409).json({ error: 'This is checked automatically from your documents.' });
  }
  await reqRef.update({ readiness: body.readiness, updatedAt: FieldValue.serverTimestamp() });
  await recomputeCounts(schRef);
  await writeAudit({
    actor: { type: 'student', id: req.uid! },
    subjectUid: req.uid!,
    action: 'requirement.readiness',
    resource: reqRef.path,
    before: { readiness: snap.get('readiness') ?? null },
    after: { readiness: body.readiness },
  });
  res.json({ ok: true });
});
