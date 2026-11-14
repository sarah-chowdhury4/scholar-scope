import { Router } from 'express';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import {
  userDoc,
  getAppConfig,
  storage,
  buckets,
  enqueueJob,
  writeAudit,
  isOnceDocument,
  normalizeDocumentTitle,
  studentDocumentLabel,
} from '@scholarscope/shared';
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
  if (body.purpose === 'material' && body.documentType && !isOnceDocument(body.documentType) && !body.title?.trim()) {
    return res.status(400).json({ error: 'Name this document so you can tell it apart.' });
  }

  const collection = body.purpose === 'source' ? 'sources' : 'materials';
  let itemRef = user.collection(collection).doc();
  let replacing = false;
  const materialTitle =
    body.purpose === 'material' && body.documentType && !isOnceDocument(body.documentType)
      ? body.title!.trim()
      : body.documentType
        ? studentDocumentLabel(body.documentType)
        : body.fileName;
  if (body.purpose === 'material' && body.documentType) {
    const existing = await user.collection('materials').where('type', '==', body.documentType).get();
    const titleKey = normalizeDocumentTitle(materialTitle);
    const found = isOnceDocument(body.documentType)
      ? existing.docs[0]
      : existing.docs.find((doc) => normalizeDocumentTitle(String(doc.get('title') ?? '')) === titleKey);
    if (found) {
      itemRef = found.ref;
      replacing = true;
    } else if (!isOnceDocument(body.documentType)) {
      const all = await user.collection('materials').get();
      const named = all.docs.filter((doc) => !isOnceDocument(String(doc.get('type') ?? ''))).length;
      if (named >= 30) {
        return res.status(400).json({ error: 'You can save up to 30 transcripts, certificates, and other files.' });
      }
    }
  }
  const versionRef = itemRef.collection('versions').doc();
  const quarantineKey = `u/${req.uid}/incoming/${versionRef.id}/${safeFileName(body.fileName)}`;

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

/**
 * Add a scholarship web page as a source (FR-2.1); the worker fetches it (honouring robots.txt).
 * One source per page per student: pasting the same URL again re-checks it now.
 * If the scholarship has no page yet, this one becomes its page and joins the daily re-check (FR-3.5).
 */
uploadsRouter.post('/url', async (req, res) => {
  const body = addUrlSourceSchema.parse(req.body);
  const user = userDoc(req.uid!);
  const schRef = user.collection('scholarships').doc(body.scholarshipId);
  const sch = await schRef.get();
  if (!sch.exists) return res.status(404).json({ error: 'Scholarship not found' });
  if (sch.get('status') === 'archived') return res.status(409).json({ error: 'This scholarship is archived.' });

  const url = new URL(body.url).toString();
  const existing = await user.collection('sources').where('kind', '==', 'url').where('url', '==', url).limit(1).get();
  let sourceRef = existing.docs[0]?.ref;
  if (sourceRef) {
    await sourceRef.update({ scholarshipIds: FieldValue.arrayUnion(body.scholarshipId), updatedAt: FieldValue.serverTimestamp() });
  } else {
    sourceRef = user.collection('sources').doc(randomUUID());
    await sourceRef.set({
      kind: 'url',
      url,
      title: url,
      scholarshipIds: [body.scholarshipId],
      currentVersionId: null,
      robots: null,
      lastFetch: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  if (!sch.get('url')) {
    await schRef.update({
      url,
      'recheck.enabled': true,
      'recheck.nextCheckAt': Timestamp.fromMillis(Date.now() + 23 * 60 * 60 * 1000),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  const jobId = await enqueueJob(req.uid!, 'fetch_url', sourceRef.path);
  await writeAudit({
    actor: { type: 'student', id: req.uid! },
    subjectUid: req.uid!,
    action: 'source.url_added',
    resource: sourceRef.path,
    after: { scholarshipId: body.scholarshipId },
  });
  res.status(202).json({ sourceId: sourceRef.id, jobId });
});
