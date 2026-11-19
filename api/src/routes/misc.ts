import { Router } from 'express';
import { db, userDoc, storage, buckets } from '@scholarscope/shared';

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
        // "linked": read from a link on the student's page; "search": found by the web search.
        origin: ((doc.get('origin') as string | undefined) ?? 'student') as 'student' | 'linked' | 'search',
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

/** In-app alerts (FR-7.1): deadline reminders and requirement changes, newest first. */
export const alertsRouter = Router();

type AlertDto = {
  id: string;
  type: string;
  title: string;
  body: string;
  scholarshipId: string | null;
  changeId: string | null;
  read: boolean;
  createdAt: string | null;
};

function toAlert(doc: FirebaseFirestore.QueryDocumentSnapshot): AlertDto {
  return {
    id: doc.id,
    type: String(doc.get('type') ?? 'info'),
    title: String(doc.get('title') ?? ''),
    body: String(doc.get('body') ?? ''),
    scholarshipId: (doc.get('scholarshipId') as string | null) ?? null,
    changeId: (doc.get('changeId') as string | null) ?? null,
    read: doc.get('inApp.readAt') != null,
    createdAt: iso(doc.get('createdAt')),
  };
}

alertsRouter.get('/', async (req, res) => {
  const snap = await userDoc(req.uid!).collection('alerts').orderBy('createdAt', 'desc').limit(50).get();
  const items = snap.docs.map(toAlert);
  res.json({ items, unread: items.filter((item) => !item.read).length });
});

/** For the badge in the top menu. */
alertsRouter.get('/unread-count', async (req, res) => {
  const snap = await userDoc(req.uid!).collection('alerts').where('inApp.readAt', '==', null).count().get();
  res.json({ unread: snap.data().count });
});

alertsRouter.post('/read-all', async (req, res) => {
  const snap = await userDoc(req.uid!).collection('alerts').where('inApp.readAt', '==', null).limit(400).get();
  const batch = db().batch();
  const now = new Date();
  for (const doc of snap.docs) batch.set(doc.ref, { inApp: { readAt: now } }, { merge: true });
  await batch.commit();
  res.json({ ok: true, marked: snap.size });
});

alertsRouter.post('/:id/read', async (req, res) => {
  const ref = userDoc(req.uid!).collection('alerts').doc(req.params.id);
  if (!(await ref.get()).exists) return res.status(404).json({ error: 'Not found' });
  await ref.set({ inApp: { readAt: new Date() } }, { merge: true });
  res.json({ ok: true });
});
