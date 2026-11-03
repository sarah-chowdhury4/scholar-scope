import { Router } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { userDoc, getAppConfig, storage, buckets, enqueueJob, writeAudit } from '@scholarscope/shared';
import { addUrlSourceSchema, createUploadSchema, safeFileName } from '../validation';

export const uploadsRouter = Router();

/**
 * Step 1 of an upload (FR-2.1, FR-5.1): create the Firestore records and return a short-lived
 * URL the browser PUTs the file to. Files land in the quarantine bucket; nothing is read until
 * the worker has checked size, type and malware (NFR-1.4).
 */
uploadsRouter.post('/', async (req, res) => {
  const body = createUploadSchema.parse(req.body);
  const config = await getAppConfig();
  if (body.size > config.maxUploadBytes) {
    return res.status(413).json({ error: `Files can be up to ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB` });
  }

  const user = userDoc(req.uid!);
  if (body.purpose === 'source') {
    if (!body.scholarshipId) return res.status(400).json({ error: 'scholarshipId is required for scholarship documents' });
    const sch = await user.collection('scholarships').doc(body.scholarshipId).get();
    if (!sch.exists) return res.status(404).json({ error: 'Scholarship not found' });
  }

  const collection = body.purpose === 'source' ? 'sources' : 'materials';
  const itemRef = user.collection(collection).doc();
  const versionRef = itemRef.collection('versions').doc();
  const quarantineKey = `u/${req.uid}/incoming/${versionRef.id}/${safeFileName(body.fileName)}`;

  await itemRef.set({
    ...(body.purpose === 'source'
      ? { kind: 'upload', url: null, scholarshipIds: [body.scholarshipId], robots: null, lastFetch: null }
      : { type: 'other', typeSuggested: null, typeConfirmed: false, usedIn: [], synthetic: true, facts: {} }),
    title: body.fileName,
    currentVersionId: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await versionRef.set({
    quarantine: { bucket: buckets.uploads(), key: quarantineKey },
    declaredContentType: body.contentType,
    declaredSize: body.size,
    fileName: body.fileName,
    scan: { status: 'pending' },
    extraction: null,
    uploadedBy: { type: 'student', id: req.uid },
    capturedAt: FieldValue.serverTimestamp(),
  });

  const uploadUrl = await (await storage()).uploadUrl(quarantineKey, body.contentType);
  res.status(201).json({ uploadId: versionRef.id, itemId: itemRef.id, purpose: body.purpose, uploadUrl, method: 'PUT', headers: { 'Content-Type': body.contentType } });
});

/** Step 2: the browser finished the PUT. Queue the scan; the worker takes it from there. */
uploadsRouter.post('/:purpose/:itemId/:uploadId/complete', async (req, res) => {
  const { purpose, itemId, uploadId } = req.params;
  if (purpose !== 'source' && purpose !== 'material') return res.status(404).json({ error: 'Not found' });
  const collection = purpose === 'source' ? 'sources' : 'materials';
  const versionRef = userDoc(req.uid!).collection(collection).doc(itemId).collection('versions').doc(uploadId);
  const snap = await versionRef.get();
  if (!snap.exists) return res.status(404).json({ error: 'Upload not found' });
  if (snap.get('scan.status') !== 'pending') return res.status(409).json({ error: 'Upload already processed' });

  const jobId = await enqueueJob(req.uid!, 'scan', versionRef.path);
  await writeAudit({
    actor: { type: 'student', id: req.uid! },
    subjectUid: req.uid!,
    action: `${purpose}.uploaded`,
    resource: versionRef.path,
  });
  res.status(202).json({ jobId });
});

/** Add a scholarship web page as a source (FR-2.1); the worker fetches it (honouring robots.txt). */
uploadsRouter.post('/url', async (req, res) => {
  const body = addUrlSourceSchema.parse(req.body);
  const user = userDoc(req.uid!);
  const sch = await user.collection('scholarships').doc(body.scholarshipId).get();
  if (!sch.exists) return res.status(404).json({ error: 'Scholarship not found' });

  const sourceRef = user.collection('sources').doc(randomUUID());
  await sourceRef.set({
    kind: 'url',
    url: body.url,
    title: body.url,
    scholarshipIds: [body.scholarshipId],
    currentVersionId: null,
    robots: null,
    lastFetch: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const jobId = await enqueueJob(req.uid!, 'fetch_url', sourceRef.path);
  res.status(202).json({ sourceId: sourceRef.id, jobId });
});
