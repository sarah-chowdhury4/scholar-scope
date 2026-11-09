import { Router } from 'express';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db, userDoc, getAppConfig, writeAudit } from '@scholarscope/shared';
import { createScholarshipSchema, updateScholarshipSchema } from '../validation';
import { documentsForScholarship, listStudentDocuments } from '../studentDocuments';

export const scholarshipsRouter = Router();

const ZERO_COUNTS = { open: 0, changed: 0, unverified: 0, needsReview: 0, ready: 0, total: 0 };

function toDeadline(input: { date: string; timezone: string } | null | undefined) {
  if (!input) return null;
  // Date-only values (e.g. from the dataset) are stored as end of day UTC and flagged allDay.
  return {
    utc: Timestamp.fromDate(new Date(`${input.date}T23:59:59Z`)),
    sourceTimezone: input.timezone,
    sourceText: input.date,
    allDay: true,
    requirementId: null,
    verification: 'unverified', // typed by the student, not yet backed by a source (FR-4.2)
  };
}

function serialize(id: string, data: FirebaseFirestore.DocumentData) {
  return {
    id,
    ...data,
    deadline: data.deadline ? { ...data.deadline, utc: data.deadline.utc?.toDate?.().toISOString() } : null,
    createdAt: data.createdAt?.toDate?.().toISOString(),
    updatedAt: data.updatedAt?.toDate?.().toISOString(),
  };
}

/** Dashboard: active records sorted by nearest deadline (FR-1.4). */
scholarshipsRouter.get('/', async (req, res) => {
  const snap = await userDoc(req.uid!).collection('scholarships').where('status', '!=', 'archived').get();
  const items = snap.docs
    .map((d) => serialize(d.id, d.data()))
    .sort((a, b) => (a.deadline?.utc ?? '9999').localeCompare(b.deadline?.utc ?? '9999'));
  res.json({ items });
});

/** Create a record; refuses past the per-student cap (15, from config/app). */
scholarshipsRouter.post('/', async (req, res) => {
  const body = createScholarshipSchema.parse(req.body);
  const { maxScholarshipsPerStudent } = await getAppConfig();
  const user = userDoc(req.uid!);
  const ref = user.collection('scholarships').doc();

  const created = await db().runTransaction(async (tx) => {
    const u = await tx.get(user);
    const count = (u.get('scholarshipCount') as number | undefined) ?? 0;
    if (count >= maxScholarshipsPerStudent) return false;
    tx.set(
      user,
      { scholarshipCount: FieldValue.increment(1) },
      { merge: true },
    );
    tx.set(ref, {
      name: body.name,
      provider: body.provider,
      url: body.url ?? null,
      catalogId: body.catalogId ?? null,
      awardAmount: body.awardAmount ? { ...body.awardAmount, citation: null } : null,
      deadline: toDeadline(body.deadline),
      status: 'researching',
      counts: ZERO_COUNTS,
      readinessPct: 0,
      recheck: {
        enabled: Boolean(body.url),
        lastCheckedAt: null,
        lastVerifiedAt: null,
        status: 'ok',
        consecutiveFailures: 0,
        nextCheckAt: body.url ? Timestamp.now() : null,
      },
      archivedAt: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });

  if (!created) {
    return res.status(409).json({ error: `You can track up to ${maxScholarshipsPerStudent} scholarships. Archive one to add another.` });
  }
  await writeAudit({
    actor: { type: 'student', id: req.uid! },
    subjectUid: req.uid!,
    action: 'scholarship.created',
    resource: ref.path,
    after: { name: body.name, provider: body.provider },
  });
  res.status(201).json(serialize(ref.id, (await ref.get()).data() ?? {}));
});

/** One record with its requirement checklist (FR-1.2, FR-1.3). */
scholarshipsRouter.get('/:id', async (req, res) => {
  const ref = userDoc(req.uid!).collection('scholarships').doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: 'Not found' });
  const reqs = await ref.collection('requirements').where('removedAt', '==', null).get();
  const requirements = reqs.docs.map((d) => ({ id: d.id, ...d.data() }));
  const documents = documentsForScholarship(
    await listStudentDocuments(req.uid!),
    requirements.map((item) => ({ kind: item.kind as string | undefined, label: item.label as string | undefined })),
    snap.id,
  );
  res.json({
    ...serialize(snap.id, snap.data()!),
    requirements,
    documents,
  });
});

scholarshipsRouter.patch('/:id', async (req, res) => {
  const body = updateScholarshipSchema.parse(req.body);
  const ref = userDoc(req.uid!).collection('scholarships').doc(req.params.id);
  const before = await ref.get();
  if (!before.exists) return res.status(404).json({ error: 'Not found' });

  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  for (const key of ['name', 'provider', 'status', 'catalogId'] as const) {
    if (body[key] !== undefined) update[key] = body[key];
  }
  if (body.url !== undefined) {
    update.url = body.url;
    update['recheck.enabled'] = Boolean(body.url);
    update['recheck.nextCheckAt'] = body.url ? Timestamp.now() : null;
  }
  if (body.awardAmount !== undefined) update.awardAmount = body.awardAmount ? { ...body.awardAmount, citation: null } : null;
  if (body.deadline !== undefined) update.deadline = toDeadline(body.deadline);

  await ref.update(update);
  await writeAudit({
    actor: { type: 'student', id: req.uid! },
    subjectUid: req.uid!,
    action: 'scholarship.updated',
    resource: ref.path,
    after: { fields: Object.keys(body) },
  });
  res.json(serialize(ref.id, (await ref.get()).data() ?? {}));
});

/** Archive (FR-1.1). Frees a slot under the cap; history is kept. */
scholarshipsRouter.post('/:id/archive', async (req, res) => {
  const user = userDoc(req.uid!);
  const ref = user.collection('scholarships').doc(req.params.id);
  const done = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return 'missing';
    if (snap.get('status') === 'archived') return 'already';
    tx.update(ref, { status: 'archived', archivedAt: FieldValue.serverTimestamp(), 'recheck.enabled': false });
    tx.set(user, { scholarshipCount: FieldValue.increment(-1) }, { merge: true });
    return 'ok';
  });
  if (done === 'missing') return res.status(404).json({ error: 'Not found' });
  await writeAudit({
    actor: { type: 'student', id: req.uid! },
    subjectUid: req.uid!,
    action: 'scholarship.archived',
    resource: ref.path,
  });
  res.json({ status: 'archived' });
});
