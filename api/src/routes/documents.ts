import { Router } from 'express';
import { db, userDoc, writeAudit, storage, buckets, isStudentDocumentType, enqueueJob, syncAutoReadiness } from '@scholarscope/shared';
import { documentLinksSchema } from '../validation';
import { isStaleCheck, listStudentDocuments } from '../studentDocuments';
import { FieldValue } from 'firebase-admin/firestore';

export const documentsRouter = Router();

/** The student's application files. Transcripts and certificates are named and can repeat. A passport and a birth certificate stay one file each. */
documentsRouter.get('/', async (req, res) => {
  res.json({ items: await listStudentDocuments(req.uid!) });
});

/** Choose which scholarships a saved file shows up on, including when the requirement text does not name it. */
documentsRouter.patch('/:id', async (req, res) => {
  const body = documentLinksSchema.parse(req.body);
  const user = userDoc(req.uid!);
  const ref = user.collection('materials').doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists || !isStudentDocumentType(String(snap.get('type') ?? ''))) {
    return res.status(404).json({ error: 'Document not found' });
  }

  const unique = [...new Set(body.scholarshipIds)];
  for (const id of unique) {
    const scholarship = await user.collection('scholarships').doc(id).get();
    if (!scholarship.exists || scholarship.get('status') === 'archived') {
      return res.status(400).json({ error: 'Choose a scholarship you are still tracking.' });
    }
  }
  await ref.set({ usedIn: unique }, { merge: true });
  await writeAudit({
    actor: { type: 'student', id: req.uid! },
    subjectUid: req.uid!,
    action: 'document.linked',
    resource: ref.path,
    after: { scholarshipIds: unique },
  });
  const items = await listStudentDocuments(req.uid!);
  res.json({ items });
});

/** Run the AI document check again on the current file (after a profile name change, or a failed or paused check). */
documentsRouter.post('/:id/check', async (req, res) => {
  const ref = userDoc(req.uid!).collection('materials').doc(req.params.id);
  const snap = await ref.get();
  const versionId = snap.get('currentVersionId') as string | undefined;
  if (!snap.exists || !versionId || !isStudentDocumentType(String(snap.get('type') ?? ''))) {
    return res.status(404).json({ error: 'Document not found' });
  }
  const status = snap.get('check.status') as string | undefined;
  if ((status === 'queued' || status === 'running') && !isStaleCheck(snap.get('check'))) {
    return res.status(409).json({ error: 'This file is already being checked.' });
  }
  const versionRef = ref.collection('versions').doc(versionId);
  if ((await versionRef.get()).get('scan.status') !== 'clean') {
    return res.status(409).json({ error: 'This file is not ready to check yet.' });
  }
  const jobId = await enqueueJob(req.uid!, 'check_document', versionRef.path);
  await ref.set({ check: { status: 'queued', versionId, jobId, updatedAt: FieldValue.serverTimestamp() } }, { merge: true });
  await writeAudit({
    actor: { type: 'student', id: req.uid! },
    subjectUid: req.uid!,
    action: 'document.check_requested',
    resource: ref.path,
  });
  res.status(202).json({ jobId, items: await listStudentDocuments(req.uid!) });
});

documentsRouter.delete('/:id', async (req, res) => {
  const ref = userDoc(req.uid!).collection('materials').doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: 'Document not found' });
  await db().recursiveDelete(ref);
  await syncAutoReadiness(req.uid!); // requirements that relied on this file are judged again
  await writeAudit({
    actor: { type: 'student', id: req.uid! },
    subjectUid: req.uid!,
    action: 'document.removed',
    resource: ref.path,
  });
  res.json({ items: await listStudentDocuments(req.uid!) });
});

/** Short-lived link to the saved file. A file that failed the virus check cannot be opened. */
documentsRouter.get('/:id/view', async (req, res) => {
  const ref = userDoc(req.uid!).collection('materials').doc(req.params.id);
  const snap = await ref.get();
  const versionId = snap.get('currentVersionId') as string | undefined;
  if (!snap.exists || !versionId) return res.status(404).json({ error: 'Document not found' });
  const version = await ref.collection('versions').doc(versionId).get();
  const stored = version.get('stored') as { key: string; versionId?: string } | undefined;
  if (version.get('scan')?.status !== 'clean' || !stored) {
    return res.status(409).json({ error: 'This file is not ready to open yet.' });
  }
  const url = await (await storage()).viewUrl(buckets.originals(), stored.key, stored.versionId);
  res.json({ url });
});
