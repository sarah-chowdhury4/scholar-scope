import { FieldValue, type DocumentReference, type DocumentSnapshot, type Timestamp } from 'firebase-admin/firestore';
import {
  db,
  userDoc,
  enqueueJob,
  log,
  canonicalUrl,
  pickRelatedLinks,
  SPARSE_REQUIREMENTS,
  type PageLink,
  type SourceOrigin,
} from '@scholarscope/shared';

/** Most linked pages kept per saved page, counting ones found on earlier visits. */
const MAX_RELATED_PER_PAGE = 6;

/**
 * Save a page found for the student (linked from their page, or found by search) as a source of its own and
 * queue it for fetching. It then goes through the same robots.txt check, versioning, extraction and daily
 * re-check as a page the student pasted. Returns null when the student already has that page.
 */
export async function addDiscoveredSource(
  uid: string,
  page: { url: string; title: string | null },
  scholarshipIds: string[],
  origin: Exclude<SourceOrigin, 'student'>,
  discoveredFrom: string | null,
): Promise<DocumentReference | null> {
  const url = canonicalUrl(page.url);
  if (!url) return null;
  const sources = userDoc(uid).collection('sources');
  const existing = await sources.where('kind', '==', 'url').where('url', '==', url).limit(1).get();
  if (!existing.empty) {
    await existing.docs[0]!.ref.update({ scholarshipIds: FieldValue.arrayUnion(...scholarshipIds) });
    return null;
  }
  const ref = sources.doc();
  await ref.set({
    kind: 'url',
    url,
    title: (page.title || url).slice(0, 200),
    origin,
    discoveredFrom,
    scholarshipIds,
    currentVersionId: null,
    robots: null,
    lastFetch: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return ref;
}

/**
 * After a student's page is read: save the pages it links to that look like its rules (eligibility, FAQ,
 * guidelines PDF…), then fetch every page linked from it. Pages found on earlier visits are fetched again too,
 * which is their daily re-check (an unchanged page costs nothing).
 */
export async function syncRelatedPages(uid: string, root: DocumentSnapshot, links: PageLink[], scholarshipIds: string[]): Promise<number> {
  const known = await userDoc(uid).collection('sources').where('discoveredFrom', '==', root.id).get();
  const refs = known.docs.map((d) => d.ref);
  const room = Math.max(0, MAX_RELATED_PER_PAGE - refs.length);
  const knownUrls = new Set(known.docs.map((d) => d.get('url') as string));
  const picked = pickRelatedLinks(links, root.get('url') as string).filter((l) => !knownUrls.has(l.url)).slice(0, room);
  for (const link of picked) {
    const ref = await addDiscoveredSource(uid, { url: link.url, title: link.text }, scholarshipIds, 'linked', root.id);
    if (ref) refs.push(ref);
  }
  for (const ref of refs) await enqueueJob(uid, 'fetch_url', ref.path);
  if (picked.length) log.info('related_pages_found', { source: root.ref.path, added: picked.length });
  return picked.length;
}

const RETRY_SEARCH_MS = 12 * 60 * 60 * 1000;

/**
 * A scholarship is searched once. A search that was paused (daily AI limit) or failed may run again
 * 12 hours later, at the next page read or daily re-check.
 */
function searchAllowed(search: { status?: string; at?: Timestamp } | null | undefined): boolean {
  if (!search) return true;
  if (search.status !== 'paused' && search.status !== 'failed') return false;
  const at = search.at?.toMillis?.() ?? 0;
  return Date.now() - at >= RETRY_SEARCH_MS;
}

/** A source still being fetched, scanned or read, so its requirements are not all in yet. */
async function isPending(src: DocumentSnapshot): Promise<boolean> {
  if (src.get('robots.allowed') === false) return false;
  if (src.get('kind') === 'url') {
    if (!src.get('lastFetch')) return true;
    if (src.get('lastFetch.ok') === false) return false;
  }
  const versionId = src.get('currentVersionId') as string | null;
  if (!versionId) return src.get('kind') === 'upload';
  const version = await src.ref.collection('versions').doc(versionId).get();
  const scan = version.get('scan.status') as string | undefined;
  if (scan && scan !== 'clean' && scan !== 'pending') return false;
  const status = version.get('extraction.status') as string | undefined;
  return !status || status === 'running';
}

/**
 * Once every page of a scholarship has been read: if it still has few requirements, search the web once for
 * its official pages. Runs at most once per scholarship (scholarship.search records it).
 */
export async function maybeSearch(uid: string, scholarshipIds: string[]): Promise<void> {
  for (const sid of scholarshipIds) {
    const schRef = userDoc(uid).collection('scholarships').doc(sid);
    const sch = await schRef.get();
    if (!sch.exists || sch.get('status') === 'archived' || !searchAllowed(sch.get('search'))) continue;

    const sources = await userDoc(uid).collection('sources').where('scholarshipIds', 'array-contains', sid).get();
    let pending = false;
    for (const src of sources.docs) {
      if (await isPending(src)) {
        pending = true;
        break;
      }
    }
    if (pending) continue;

    const active = await schRef.collection('requirements').where('removedAt', '==', null).count().get();
    if (active.data().count >= SPARSE_REQUIREMENTS) continue;

    const claimed = await db().runTransaction(async (tx) => {
      const fresh = await tx.get(schRef);
      if (!searchAllowed(fresh.get('search'))) return false;
      tx.update(schRef, { search: { status: 'queued', queuedAt: FieldValue.serverTimestamp() } });
      return true;
    });
    if (claimed) {
      await enqueueJob(uid, 'search_sources', schRef.path);
      log.info('search_queued', { scholarship: schRef.path, requirements: active.data().count });
    }
  }
}
