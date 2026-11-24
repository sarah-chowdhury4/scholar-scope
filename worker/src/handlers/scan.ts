import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { db, storage, buckets, getAppConfig, enqueueJob, updateJob, log, type JobMessage } from '@scholarscope/shared';
import { detectFileType } from '../scan/fileType';
import { scanWithClamAV } from '../scan/clamav';

/**
 * Upload pipeline step 1 (NFR-1.4): size check → real file type → malware scan →
 * copy to the versioned originals bucket → queue extraction.
 * target = users/{uid}/(sources|materials)/{itemId}/versions/{versionId}
 */
export async function handleScan(job: JobMessage): Promise<void> {
  const versionRef = db().doc(job.target);
  const version = await versionRef.get();
  if (!version.exists) throw new Error(`Missing ${job.target}`);
  const q = version.get('quarantine') as { bucket: string; key: string };
  const config = await getAppConfig();
  const store = await storage();

  const itemRef = versionRef.parent.parent!;
  const fail = async (status: string, detail: string) => {
    await versionRef.update({ scan: { status, detail, engine: 'clamav', at: FieldValue.serverTimestamp() } });
    await itemRef.set({ scanStatus: status, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await updateJob(job.uid, job.jobId, { status: 'failed', error: `${status}: ${detail}` });
    log.warn(status === 'infected' ? 'upload_infected' : 'upload_rejected', { target: job.target, status });
  };
  await updateJob(job.uid, job.jobId, { status: 'running', progress: 20 });

  const head = await store.head(q.bucket, q.key);
  if (!head) return fail('rejected_type', 'File was not uploaded');
  if (head.size > config.maxUploadBytes) return fail('too_large', `File is ${head.size} bytes`);

  const data = await store.get(q.bucket, q.key);
  const type = detectFileType(data);
  if (!type) return fail('rejected_type', 'Only PDF, Word (.docx), PNG, JPEG and plain text files are accepted');

  const result = await scanWithClamAV(data);
  if (!result.clean) return fail('infected', result.signature ?? 'malware found');

  const sha256 = createHash('sha256').update(data).digest('hex');
  const storedKey = `${itemRef.path.replace(/^users\//, 'u/')}/${versionRef.id}/original.${type.ext}`;
  const put = await store.put(buckets.originals(), storedKey, data, type.mime);

  // Re-upload of the identical file? Don't pay for another model call (budget guardrail).
  const isDuplicate = (await itemRef.get()).get('lastSha256') === sha256;

  await versionRef.update({
    scan: { status: 'clean', engine: 'clamav', at: FieldValue.serverTimestamp() },
    sha256,
    mimeType: type.mime,
    sizeBytes: data.length,
    stored: { bucket: buckets.originals(), key: storedKey, versionId: put.versionId ?? null },
  });
  await itemRef.set(
    { currentVersionId: versionRef.id, lastSha256: sha256, scanStatus: 'clean', updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );

  // Guidelines are extracted; a student's own file gets an AI document check.
  const followUp = itemRef.parent.id === 'sources' ? 'extract' : 'check_document';
  const nextJobId = isDuplicate ? undefined : await enqueueJob(job.uid, followUp, versionRef.path);
  if (nextJobId && followUp === 'check_document') {
    await itemRef.set({ check: { status: 'queued', versionId: versionRef.id, jobId: nextJobId, updatedAt: FieldValue.serverTimestamp() } }, { merge: true });
  }
  await updateJob(job.uid, job.jobId, { status: 'done', progress: 100, nextJobId });
  log.info('upload_scanned', { target: job.target, mime: type.mime, duplicate: isDuplicate });
}
