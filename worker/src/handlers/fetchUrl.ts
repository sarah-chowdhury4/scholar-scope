import { createHash } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { convert } from 'html-to-text';
import robotsParser from 'robots-parser';
import { safeFetch } from '../net/safeFetch';
import { db, userDoc, storage, buckets, enqueueJob, updateJob, normalizeQuote, log, type JobMessage } from '@scholarscope/shared';

const USER_AGENT = 'ScholarScopeBot/0.1 (student scholarship tracker; checks pages the student saved)';
const MAX_BYTES = 5 * 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Fetch a saved scholarship page (FR-2.1, FR-3.5), honouring robots.txt (NFR-9.2).
 * Unchanged text (same hash) costs nothing; changed text becomes a new immutable source version
 * and is re-extracted, which versions and flags any changed requirement.
 * A failed fetch is shown, never hidden (NFR-4.4).
 * target = users/{uid}/sources/{sourceId}
 */
export async function handleFetchUrl(job: JobMessage): Promise<void> {
  const sourceRef = db().doc(job.target);
  const source = await sourceRef.get();
  const url = source.get('url') as string | undefined;
  if (!source.exists || !url) throw new Error(`Missing URL source ${job.target}`);
  const scholarshipIds = (source.get('scholarshipIds') as string[] | undefined) ?? [];
  await updateJob(job.uid, job.jobId, { status: 'running', progress: 10 });

  const markScholarships = async (fields: Record<string, unknown>) => {
    for (const sid of scholarshipIds) {
      await userDoc(job.uid).collection('scholarships').doc(sid).set({ recheck: fields }, { merge: true });
    }
  };

  // robots.txt
  const robotsUrl = new URL('/robots.txt', url).toString();
  let allowed = true;
  try {
    const r = await safeFetch(robotsUrl, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(10_000) });
    if (r.ok) allowed = robotsParser(robotsUrl, await r.text()).isAllowed(url, USER_AGENT) ?? true;
  } catch {
    // no robots.txt reachable → allowed
  }
  await sourceRef.update({ robots: { allowed, checkedAt: FieldValue.serverTimestamp() } });
  if (!allowed) {
    await markScholarships({ status: 'robots_blocked', lastCheckedAt: Timestamp.now(), enabled: false });
    await updateJob(job.uid, job.jobId, { status: 'failed', error: 'robots_blocked' });
    log.warn('recheck_failed', { target: job.target, reason: 'robots_blocked' });
    return;
  }

  // Fetch
  let html: string;
  let httpStatus = 0;
  try {
    const res = await safeFetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(20_000) });
    httpStatus = res.status;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length > MAX_BYTES) throw new Error('Page too large');
    html = body.toString('utf8');
  } catch (err) {
    const failures = ((source.get('lastFetch.consecutiveFailures') as number | undefined) ?? 0) + 1;
    await sourceRef.update({ lastFetch: { at: FieldValue.serverTimestamp(), httpStatus, ok: false, error: String(err), consecutiveFailures: failures } });
    await markScholarships({ status: 'unreachable', lastCheckedAt: Timestamp.now(), consecutiveFailures: failures, nextCheckAt: Timestamp.fromMillis(Date.now() + DAY_MS) });
    await updateJob(job.uid, job.jobId, { status: 'failed', error: 'unreachable' });
    log.warn('recheck_failed', { target: job.target, httpStatus });
    return;
  }

  const text = convert(html, { wordwrap: false, selectors: [{ selector: 'a', options: { ignoreHref: true } }, { selector: 'img', format: 'skip' }] });
  const textHash = createHash('sha256').update(normalizeQuote(text)).digest('hex');
  const now = Timestamp.now();
  await sourceRef.update({ lastFetch: { at: now, httpStatus, ok: true, error: null, consecutiveFailures: 0 } });
  await markScholarships({ status: 'ok', lastCheckedAt: now, lastVerifiedAt: now, consecutiveFailures: 0, nextCheckAt: Timestamp.fromMillis(Date.now() + DAY_MS) });

  if (source.get('lastTextHash') === textHash) {
    await updateJob(job.uid, job.jobId, { status: 'done', progress: 100 });
    log.info('recheck_unchanged', { target: job.target });
    return;
  }

  // Changed (or first fetch): store a new immutable version and re-extract
  const versionRef = sourceRef.collection('versions').doc();
  const base = `${sourceRef.path.replace(/^users\//, 'u/')}/${versionRef.id}`;
  const store = await storage();
  const put = await store.put(buckets.originals(), `${base}/original.txt`, Buffer.from(text, 'utf8'), 'text/plain');
  await store.put(buckets.originals(), `${base}/page.html`, Buffer.from(html, 'utf8'), 'text/html');
  await versionRef.set({
    fetchedUrl: url,
    httpStatus,
    textHash,
    mimeType: 'text/plain',
    sizeBytes: Buffer.byteLength(text),
    scan: { status: 'clean', engine: 'n/a (fetched page text)' },
    stored: { bucket: buckets.originals(), key: `${base}/original.txt`, versionId: put.versionId ?? null },
    capturedAt: FieldValue.serverTimestamp(),
    uploadedBy: { type: 'system', id: 'recheck' },
  });
  await sourceRef.update({ currentVersionId: versionRef.id, lastTextHash: textHash, updatedAt: FieldValue.serverTimestamp() });
  await enqueueJob(job.uid, 'extract', versionRef.path);
  await updateJob(job.uid, job.jobId, { status: 'done', progress: 100 });
  log.info('recheck_changed', { target: job.target });
}
