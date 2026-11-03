import { Router } from 'express';
import { userDoc, storage, buckets } from '@scholarscope/shared';

/** Job progress for the UI (NFR-5.2). */
export const jobsRouter = Router();

jobsRouter.get('/:id', async (req, res) => {
  const snap = await userDoc(req.uid!).collection('jobs').doc(req.params.id).get();
  if (!snap.exists) return res.status(404).json({ error: 'Not found' });
  const d = snap.data()!;
  res.json({ id: snap.id, type: d.type, status: d.status, progress: d.progress, error: d.error ?? null, nextJobId: d.nextJobId ?? null });
});

/** One-click source (FR-4.1): a short-lived link to the exact stored version of a document. */
export const sourcesRouter = Router();

sourcesRouter.get('/:sourceId/versions/:versionId/view', async (req, res) => {
  const ref = userDoc(req.uid!).collection('sources').doc(req.params.sourceId).collection('versions').doc(req.params.versionId);
  const snap = await ref.get();
  const stored = snap.get('stored') as { key: string; versionId?: string } | undefined;
  if (!snap.exists || !stored) return res.status(404).json({ error: 'Not found' });
  const url = await (await storage()).viewUrl(buckets.originals(), stored.key, stored.versionId);
  res.json({ url, page: req.query.page ?? null });
});

/** In-app alerts (FR-7.1). */
export const alertsRouter = Router();

alertsRouter.get('/', async (req, res) => {
  const snap = await userDoc(req.uid!).collection('alerts').orderBy('createdAt', 'desc').limit(50).get();
  res.json({ items: snap.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: d.get('createdAt')?.toDate?.().toISOString() })) });
});

alertsRouter.post('/:id/read', async (req, res) => {
  const ref = userDoc(req.uid!).collection('alerts').doc(req.params.id);
  if (!(await ref.get()).exists) return res.status(404).json({ error: 'Not found' });
  await ref.set({ inApp: { readAt: new Date() } }, { merge: true });
  res.json({ ok: true });
});
