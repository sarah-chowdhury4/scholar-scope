import { Router } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { userDoc, getAppConfig, storage, buckets, enqueueJob, writeAudit, isOnceDocument, studentDocumentLabel } from '@scholarscope/shared';
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
  if (body.purpose === 'material' && !body.documentType) {
    return res.status(400).json({ error: 'Choose what kind of document this is.' });
  }
  if (body.purpose === 'material' && body.documentType === 'other' && !body.title?.trim()) {
    return res.status(400).json({ error: 'Name this document so you can tell it apart.' });
  }

  const collection = body.purpose === 'source' ? 'sources' : 'materials';
  let itemRef = user.collection(collection).doc();
  let replacing = false;
  if (body.purpose === 'material' && body.documentType && isOnceDocument(body.documentType)) {
    const existing = await user.collection('materials').where('type', '==', body.documentType).limit(1).get();
    const found = existing.docs[0];
    if (found) {
      itemRef = found.ref;
      replacing = true;
    }
  }
  if (body.purpose === 'material' && body.documentType === 'other' && !replacing) {
    const others = await user.collection('materials').where('type', '==', 'other').get();
    if (others.size >= 20) return res.status(400).json({ error: 'You can save up to 20 other documents.' });
  }
  const versionRef = itemRef.collection('versions').doc();
  const quarantineKey = `u/${req.uid}/incoming/${versionRef.id}/${safeFileName(body.fileName)}`;
  const materialTitle =
    body.documentType === 'other' ? body.title!.trim() : body.documentType ? studentDocumentLabel(body.documentType) : body.fileName;

  if (body.purpose === 'source' || !replacing) {
    await itemRef.set({
      ...(body.purpose === 'source'
        ? { kind: 'upload', url: null, scholarshipIds: [body.scholarshipId], robots: null, lastFetch: null }
        : {
            type: body.documentType,
            typeSuggested: null,
            typeConfirmed: true,
            usedIn: [],
            synthetic: true,
            facts: {},
          }),
      title: body.purpose === 'source' ? body.fileName : materialTitle,
      fileName: body.fileName,
      scanStatus: 'pending',
      currentVersionId: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } else {
    await itemRef.set(
      { fileName: body.fileName, scanStatus: 'pending', updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  }
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
