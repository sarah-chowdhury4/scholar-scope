import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db, userDoc } from './firebase';
import { requirementsFromCatalog, tagsFor, type CatalogEntry } from './catalog';

const CACHE_MS = 60_000;
let cache: { at: number; entries: CatalogEntry[] } | undefined;

/** All catalog entries (cached for a minute; the catalog changes rarely). */
export async function loadCatalog(options: { fresh?: boolean } = {}): Promise<CatalogEntry[]> {
  if (!options.fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.entries;
  const snap = await db().collection('scholarshipCatalog').get();
  const entries = snap.docs.map((d) => {
    const x = d.data();
    const promptOrMaterials = (x.promptOrMaterials as string | undefined) ?? '';
    return {
      catalogId: d.id,
      organization: x.organization ?? '',
      name: x.name ?? d.id,
      deadline: x.deadline ?? null,
      minGpa: typeof x.minGpa === 'number' ? x.minGpa : null,
      promptOrMaterials,
      sourceUrl: x.sourceUrl ?? null,
      datasetVersion: x.datasetVersion ?? null,
      datasetStatus: x.datasetStatus ?? null,
      tags: Array.isArray(x.tags) ? x.tags : tagsFor(promptOrMaterials),
    } satisfies CatalogEntry;
  });
  cache = { at: Date.now(), entries };
  return entries;
}

export async function saveCatalog(entries: CatalogEntry[]): Promise<void> {
  for (let i = 0; i < entries.length; i += 400) {
    const batch = db().batch();
    for (const e of entries.slice(i, i + 400)) {
      const { catalogId, ...rest } = e;
      batch.set(db().collection('scholarshipCatalog').doc(catalogId), { ...rest, importedAt: FieldValue.serverTimestamp() });
    }
    await batch.commit();
  }
  cache = undefined;
}

export type AddFromCatalogResult =
  | { status: 'added'; scholarshipId: string }
  | { status: 'already_added'; scholarshipId: string }
  | { status: 'limit_reached'; limit: number }
  | { status: 'not_found' };

/**
 * Copy a catalog scholarship into the student's records. Nothing copied has a citation:
 * the record and every requirement start as "unverified" until the student uploads the
 * official guidelines ("no source, no claim").
 */
export async function addFromCatalog(uid: string, catalogId: string, limit: number): Promise<AddFromCatalogResult> {
  const entry = (await loadCatalog()).find((e) => e.catalogId === catalogId);
  if (!entry) return { status: 'not_found' };

  const user = userDoc(uid);
  // One active record per catalog scholarship; the id is fixed so a double click can't create two.
  const schRef = user.collection('scholarships').doc(`catalog-${catalogId.toLowerCase()}`);
  const requirements = requirementsFromCatalog(entry);

  return db().runTransaction(async (tx) => {
    const [u, existing] = await Promise.all([tx.get(user), tx.get(schRef)]);
    if (existing.exists && existing.get('status') !== 'archived') return { status: 'already_added', scholarshipId: schRef.id } as const;
    const count = (u.get('scholarshipCount') as number | undefined) ?? 0;
    if (count >= limit) return { status: 'limit_reached', limit } as const;

    tx.set(user, { scholarshipCount: FieldValue.increment(1) }, { merge: true });
    if (existing.exists) {
      // Added before and archived: bring it back with its history instead of duplicating it.
      tx.update(schRef, {
        status: 'researching',
        archivedAt: null,
        'recheck.enabled': Boolean(existing.get('url')),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { status: 'added', scholarshipId: schRef.id } as const;
    }
    tx.set(schRef, {
      name: entry.name,
      provider: entry.organization,
      url: entry.sourceUrl,
      catalogId,
      awardAmount: null,
      deadline: entry.deadline
        ? {
            utc: Timestamp.fromDate(new Date(`${entry.deadline}T23:59:59Z`)),
            sourceTimezone: 'UTC',
            sourceText: entry.deadline,
            allDay: true,
            requirementId: null,
            verification: 'unverified',
          }
        : null,
      status: 'researching',
      counts: { open: requirements.length, changed: 0, unverified: requirements.length, needsReview: 0, ready: 0, total: requirements.length },
      readinessPct: 0,
      recheck: {
        enabled: Boolean(entry.sourceUrl),
        lastCheckedAt: null,
        lastVerifiedAt: null,
        status: 'ok',
        consecutiveFailures: 0,
        nextCheckAt: entry.sourceUrl ? Timestamp.now() : null,
      },
      archivedAt: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    for (const req of requirements) {
      const reqRef = schRef.collection('requirements').doc();
      const verRef = reqRef.collection('versions').doc();
      tx.set(verRef, {
        versionNo: 1,
        value: req.value,
        citation: null,
        origin: 'seed',
        extraction: null,
        review: null,
        correctsVersionId: null,
        previousVersionId: null,
        createdBy: { type: 'system', id: 'catalog' },
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(reqRef, {
        kind: req.kind,
        label: req.label,
        currentVersionId: verRef.id,
        currentVersionNo: 1,
        current: { value: req.value, citation: null },
        verification: 'unverified',
        readiness: 'missing',
        changeFlag: null,
        needsRecheck: false,
        removedAt: null,
        matchKey: `${req.kind}:${req.label.toLowerCase().slice(0, 40)}`,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    return { status: 'added', scholarshipId: schRef.id } as const;
  });
}
