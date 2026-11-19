import { createHash } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { convert } from 'html-to-text';
import robotsParser from 'robots-parser';
import { assertPublicUrl, safeFetch } from '../net/safeFetch';
import { markdownToText, readerEnabled, readWithJina } from '../net/jinaReader';
import { extractText } from '../text/extractText';
import {
  db,
  userDoc,
  storage,
  buckets,
  enqueueJob,
  updateJob,
  normalizeQuote,
  getAppConfig,
  log,
  linksFromHtml,
  linksFromMarkdown,
  type JobMessage,
  type PageLink,
} from '@scholarscope/shared';
import { maybeSearch, syncRelatedPages } from '../discovery';

const BOT_NAME = 'ScholarScopeBot';
const USER_AGENT = `${BOT_NAME}/0.1 (student scholarship tracker; checks pages the student saved)`;
const MAX_BYTES = 5 * 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Fetch a saved scholarship page (FR-2.1, FR-3.5), honouring robots.txt (NFR-9.2).
 * The page is read with Jina Reader when it is on (JavaScript-built pages and PDF links come out as clean text),
 * and fetched directly otherwise or when Jina fails. Our robots.txt and private-address checks always run first.
 * Unchanged text (same hash) costs nothing; changed text becomes a new immutable source version
 * and is re-extracted, which versions and flags any changed requirement.
 * A failed fetch is shown, never hidden (NFR-4.4).
 * A page the student saved also has its rule pages on the same site read (eligibility, FAQ, guidelines PDF);
 * those "discovered" pages are not followed further and never change the scholarship's re-check status.
 * target = users/{uid}/sources/{sourceId}
 */
export async function handleFetchUrl(job: JobMessage): Promise<void> {
  const sourceRef = db().doc(job.target);
  const source = await sourceRef.get();
  const url = source.get('url') as string | undefined;
  if (!source.exists || !url) throw new Error(`Missing URL source ${job.target}`);
  const scholarshipIds = (source.get('scholarshipIds') as string[] | undefined) ?? [];
  // Pages found for the student (linked or by search) never speak for the scholarship's own page.
  const discovered = Boolean(source.get('origin')) && source.get('origin') !== 'student';
  await updateJob(job.uid, job.jobId, { status: 'running', progress: 10 });

  const markScholarships = async (fields: Record<string, unknown>) => {
    if (discovered) return;
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
    await maybeSearch(job.uid, scholarshipIds);
    return;
  }

  // Fetch: Jina Reader first, our own fetch as the fallback.
  let text = '';
  let raw: { name: string; body: Buffer; mime: string } | null = null;
  let reader: 'jina' | 'direct' = 'direct';
  let pageTitle: string | null = null;
  let httpStatus = 0;
  let links: PageLink[] = [];
  try {
    await assertPublicUrl(url); // never hand an internal address to anyone, Jina included
    const page = readerEnabled() ? await readWithJina(url) : null;
    if (page) {
      reader = 'jina';
      httpStatus = 200;
      pageTitle = page.title;
      text = markdownToText(page.markdown);
      raw = { name: 'page.md', body: Buffer.from(page.markdown, 'utf8'), mime: 'text/markdown' };
      links = linksFromMarkdown(page.markdown, url);
    } else {
      const res = await safeFetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(20_000) });
      httpStatus = res.status;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = Buffer.from(await res.arrayBuffer());
      if (body.length > MAX_BYTES) throw new Error('Page too large');
      const isPdf = (res.headers.get('content-type') ?? '').includes('application/pdf') || body.subarray(0, 5).toString('latin1') === '%PDF-';
      if (isPdf) {
        // A link to the guidelines PDF: read it page by page like an upload, instead of as garbled HTML.
        const pdf = await extractText(body, 'application/pdf', (await getAppConfig()).maxUploadPages);
        text = pdf.pages.map((p) => p.text).join('\n\n');
        raw = { name: 'page.pdf', body, mime: 'application/pdf' };
      } else {
        const html = body.toString('utf8');
        links = linksFromHtml(html, res.url || url);
        text = convert(html, { wordwrap: false, selectors: [{ selector: 'a', options: { ignoreHref: true } }, { selector: 'img', format: 'skip' }] });
        raw = { name: 'page.html', body, mime: 'text/html' };
      }
    }
    if (!text.trim()) throw new Error('The page had no readable text');
  } catch (err) {
    const failures = ((source.get('lastFetch.consecutiveFailures') as number | undefined) ?? 0) + 1;
    await sourceRef.update({ lastFetch: { at: FieldValue.serverTimestamp(), httpStatus, ok: false, error: String(err), consecutiveFailures: failures } });
    await markScholarships({ status: 'unreachable', lastCheckedAt: Timestamp.now(), consecutiveFailures: failures, nextCheckAt: Timestamp.fromMillis(Date.now() + DAY_MS) });
    await updateJob(job.uid, job.jobId, { status: 'failed', error: 'unreachable' });
    log.warn('recheck_failed', { target: job.target, httpStatus });
    await maybeSearch(job.uid, scholarshipIds);
    return;
  }

  const textHash = createHash('sha256').update(normalizeQuote(text)).digest('hex');
  const now = Timestamp.now();
  await sourceRef.update({
    lastFetch: { at: now, httpStatus, ok: true, error: null, consecutiveFailures: 0, reader },
    // Show the page's real title instead of its address once we know it.
    ...(pageTitle && source.get('title') === url ? { title: pageTitle.slice(0, 200) } : {}),
  });
  await markScholarships({ status: 'ok', lastCheckedAt: now, lastVerifiedAt: now, consecutiveFailures: 0, nextCheckAt: Timestamp.fromMillis(Date.now() + DAY_MS) });
  // One level deep: only the student's own pages have their links followed.
  if (!discovered) await syncRelatedPages(job.uid, source, links, scholarshipIds);

  if (source.get('lastTextHash') === textHash) {
    await updateJob(job.uid, job.jobId, { status: 'done', progress: 100 });
    log.info('recheck_unchanged', { target: job.target });
    await maybeSearch(job.uid, scholarshipIds);
    return;
  }

  // Changed (or first fetch): store a new immutable version and re-extract
  const versionRef = sourceRef.collection('versions').doc();
  const base = `${sourceRef.path.replace(/^users\//, 'u/')}/${versionRef.id}`;
  const store = await storage();
  const put = await store.put(buckets.originals(), `${base}/original.txt`, Buffer.from(text, 'utf8'), 'text/plain');
  if (raw) await store.put(buckets.originals(), `${base}/${raw.name}`, raw.body, raw.mime);
  await versionRef.set({
    fetchedUrl: url,
    httpStatus,
    reader,
    textHash,
    mimeType: 'text/plain',
    sizeBytes: Buffer.byteLength(text),
    scan: { status: 'clean', engine: 'n/a (fetched page text)' },
    stored: { bucket: buckets.originals(), key: `${base}/original.txt`, versionId: put.versionId ?? null },
    capturedAt: FieldValue.serverTimestamp(),
    uploadedBy: { type: 'system', id: 'recheck' },
  });
  await sourceRef.update({ currentVersionId: versionRef.id, lastTextHash: textHash, updatedAt: FieldValue.serverTimestamp() });
  const nextJobId = await enqueueJob(job.uid, 'extract', versionRef.path);
  await updateJob(job.uid, job.jobId, { status: 'done', progress: 100, nextJobId });
  log.info('recheck_changed', { target: job.target, reader });
}
