import { Router } from 'express';
import { userDoc, storage, buckets } from '@scholarscope/shared';

function iso(value: unknown): string | null {
  return (value as { toDate?: () => Date } | undefined)?.toDate?.().toISOString() ?? null;
}

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

/** The sources behind one scholarship: uploaded guidelines and saved pages, with their last fetch and extraction. */
sourcesRouter.get('/', async (req, res) => {
  const scholarshipId = typeof req.query.scholarshipId === 'string' ? req.query.scholarshipId : '';
  if (!scholarshipId) return res.status(400).json({ error: 'scholarshipId is required' });
  const snap = await userDoc(req.uid!).collection('sources').where('scholarshipIds', 'array-contains', scholarshipId).get();
  const items = await Promise.all(
    snap.docs.map(async (doc) => {
      const versionId = doc.get('currentVersionId') as string | null;
      const version = versionId ? await doc.ref.collection('versions').doc(versionId).get() : null;
      return {
        id: doc.id,
        kind: doc.get('kind') as 'upload' | 'url',
        title: (doc.get('title') as string | undefined) ?? 'Source',
        url: (doc.get('url') as string | null) ?? null,
        currentVersionId: versionId,
        robotsAllowed: doc.get('robots.allowed') ?? null,
        lastFetch: doc.get('lastFetch')
          ? { ok: doc.get('lastFetch.ok') === true, at: iso(doc.get('lastFetch.at')) }
          : null,
        scanStatus: (version?.get('scan.status') as string | undefined) ?? (doc.get('scanStatus') as string | undefined) ?? null,
        extraction: version?.get('extraction')
          ? { status: version.get('extraction.status') as string, itemsFound: (version.get('extraction.itemsFound') as number | undefined) ?? null }
          : null,
        capturedAt: iso(version?.get('capturedAt')),
      };
    }),
  );
  items.sort((a, b) => (b.capturedAt ?? '').localeCompare(a.capturedAt ?? ''));
  res.json({ items });
});

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
