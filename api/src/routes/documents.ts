import { Router } from 'express';
import { db, userDoc, writeAudit, storage, buckets } from '@scholarscope/shared';
import { documentLinksSchema } from '../validation';
import { listStudentDocuments } from '../studentDocuments';

export const documentsRouter = Router();

/** The student's application files. One transcript, passport, and birth certificate; other files are extra. */
documentsRouter.get('/', async (req, res) => {
  res.json({ items: await listStudentDocuments(req.uid!) });
});

/** Choose which scholarships an extra document shows up on. */
documentsRouter.patch('/:id', async (req, res) => {
  const body = documentLinksSchema.parse(req.body);
  const user = userDoc(req.uid!);
  const ref = user.collection('materials').doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists || snap.get('type') !== 'other') return res.status(404).json({ error: 'Document not found' });

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

documentsRouter.delete('/:id', async (req, res) => {
  const ref = userDoc(req.uid!).collection('materials').doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: 'Document not found' });
  await db().recursiveDelete(ref);
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
