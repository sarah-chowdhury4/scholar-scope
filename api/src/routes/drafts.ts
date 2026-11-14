import { Router } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { db, userDoc, getAppConfig, enqueueJob, writeAudit, isDraftable, recomputeCounts, wordCount } from '@scholarscope/shared';
import { approveDraftSchema, createDraftSchema, editDraftSchema } from '../validation';
import { HttpError } from '../http';

/**
 * Essay drafts (FR-6). Gemini writes from the student's own notes and profile; each sentence lists
 * the facts it used. The student edits and approves; nothing is ever submitted for them.
 */
export const draftsRouter = Router();

function iso(value: unknown): string | null {
  return (value as { toDate?: () => Date } | undefined)?.toDate?.().toISOString() ?? null;
}

function toDto(doc: FirebaseFirestore.DocumentSnapshot) {
  const d = doc.data() ?? {};
  const prompt = (d.prompt ?? {}) as { label?: string; quote?: string | null; wordLimit?: number | null };
  return {
    id: doc.id,
    scholarshipId: d.scholarshipId as string,
    requirementId: d.requirementId as string,
    status: d.status as string,
    error: (d.error as string | null) ?? null,
    prompt: { label: prompt.label ?? '', quote: prompt.quote ?? null, wordLimit: prompt.wordLimit ?? null },
    notes: (d.notes as string | undefined) ?? '',
    sentences: Array.isArray(d.sentences) ? d.sentences : [],
    facts: Array.isArray(d.facts) ? d.facts : [],
    text: (d.editedText as string | undefined) ?? (d.text as string | undefined) ?? '',
    edited: typeof d.editedText === 'string',
    wordCount: wordCount((d.editedText as string | undefined) ?? (d.text as string | undefined) ?? ''),
    unsupportedCount: (d.unsupportedCount as number | undefined) ?? 0,
    suggestion: (d.suggestion as string | null) ?? null,
    createdAt: iso(d.createdAt),
    approvedAt: iso(d.approvedAt),
  };
}

/** One student per day can ask for this many drafts (config/app.dailyDraftLimit). */
async function takeDraftSlot(uid: string, limit: number): Promise<boolean> {
  const ref = userDoc(uid).collection('usage').doc(new Date().toISOString().slice(0, 10));
  return db().runTransaction(async (tx) => {
    const used = ((await tx.get(ref)).get('drafts') as number | undefined) ?? 0;
    if (used >= limit) return false;
    tx.set(ref, { drafts: FieldValue.increment(1) }, { merge: true });
    return true;
  });
}

draftsRouter.get('/', async (req, res) => {
  const scholarshipId = typeof req.query.scholarshipId === 'string' ? req.query.scholarshipId : null;
  let query: FirebaseFirestore.Query = userDoc(req.uid!).collection('drafts');
  if (scholarshipId) query = query.where('scholarshipId', '==', scholarshipId);
  const snap = await query.get();
  const items = snap.docs
    .map(toDto)
    .filter((item) => item.status !== 'discarded')
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  res.json({ items });
});

draftsRouter.get('/:id', async (req, res) => {
  const snap = await userDoc(req.uid!).collection('drafts').doc(req.params.id).get();
  if (!snap.exists) return res.status(404).json({ error: 'Draft not found' });
  res.json(toDto(snap));
});

draftsRouter.post('/', async (req, res) => {
  const body = createDraftSchema.parse(req.body);
  const uid = req.uid!;
  const user = userDoc(uid);
  const schRef = user.collection('scholarships').doc(body.scholarshipId);
  const [sch, requirement] = await Promise.all([schRef.get(), schRef.collection('requirements').doc(body.requirementId).get()]);
  if (!sch.exists || !requirement.exists || requirement.get('removedAt') != null) {
    return res.status(404).json({ error: 'Requirement not found' });
  }
  if (!isDraftable({ kind: requirement.get('kind'), label: requirement.get('label') })) {
    return res.status(400).json({ error: 'Drafts are for essays and personal statements.' });
  }
  const config = await getAppConfig();
  if (!config.aiEnabled) return res.status(503).json({ error: 'AI drafting is paused right now. Try again later.' });
  if (!(await takeDraftSlot(uid, config.dailyDraftLimit))) {
    return res.status(429).json({ error: `You can ask for ${config.dailyDraftLimit} drafts a day. Try again tomorrow.` });
  }

  const wordLimit = requirement.get('current.value.wordLimit.max');
  const draftRef = user.collection('drafts').doc();
  await draftRef.set({
    scholarshipId: body.scholarshipId,
    requirementId: body.requirementId,
    requirementVersionId: requirement.get('currentVersionId') ?? null,
    prompt: {
      label: requirement.get('label') ?? '',
      quote: requirement.get('current.citation.quote') ?? null,
      wordLimit: typeof wordLimit === 'number' ? wordLimit : null,
    },
    notes: body.notes,
    includeGpa: body.includeGpa ?? false,
    status: 'queued',
    error: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const jobId = await enqueueJob(uid, 'draft', draftRef.path);
  await writeAudit({ actor: { type: 'student', id: uid }, subjectUid: uid, action: 'draft.requested', resource: draftRef.path });
  res.status(202).json({ draftId: draftRef.id, jobId });
});

/** Save the student's own edits. The AI text is kept alongside for the record. */
draftsRouter.patch('/:id', async (req, res) => {
  const body = editDraftSchema.parse(req.body);
  const ref = userDoc(req.uid!).collection('drafts').doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: 'Draft not found' });
  if (!['ready', 'approved'].includes(String(snap.get('status')))) return res.status(409).json({ error: 'This draft cannot be edited now.' });
  await ref.update({ editedText: body.text, status: 'ready', approvedAt: null, updatedAt: FieldValue.serverTimestamp() });
  res.json(toDto(await ref.get()));
});

/** The student approves the (possibly edited) draft; the essay requirement moves to "in draft". */
draftsRouter.post('/:id/approve', async (req, res) => {
  const body = approveDraftSchema.parse(req.body ?? {});
  const uid = req.uid!;
  const ref = userDoc(uid).collection('drafts').doc(req.params.id);
  const result = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpError(404, 'Draft not found');
    if (snap.get('status') !== 'ready') throw new HttpError(409, 'Only a finished draft can be approved.');
    const reqRef = userDoc(uid)
      .collection('scholarships')
      .doc(snap.get('scholarshipId') as string)
      .collection('requirements')
      .doc(snap.get('requirementId') as string);
    const requirement = await tx.get(reqRef);
    tx.update(ref, {
      ...(body.text !== undefined ? { editedText: body.text } : {}),
      status: 'approved',
      approvedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (requirement.exists && requirement.get('readiness') === 'missing') {
      tx.update(reqRef, { readiness: 'in_draft', updatedAt: FieldValue.serverTimestamp() });
    }
    return { scholarshipId: snap.get('scholarshipId') as string };
  });
  await recomputeCounts(userDoc(uid).collection('scholarships').doc(result.scholarshipId));
  await writeAudit({ actor: { type: 'student', id: uid }, subjectUid: uid, action: 'draft.approved', resource: ref.path });
  res.json(toDto(await ref.get()));
});

draftsRouter.post('/:id/discard', async (req, res) => {
  const ref = userDoc(req.uid!).collection('drafts').doc(req.params.id);
  if (!(await ref.get()).exists) return res.status(404).json({ error: 'Draft not found' });
  await ref.update({ status: 'discarded', updatedAt: FieldValue.serverTimestamp() });
  await writeAudit({ actor: { type: 'student', id: req.uid! }, subjectUid: req.uid!, action: 'draft.discarded', resource: ref.path });
  res.json({ ok: true });
});
