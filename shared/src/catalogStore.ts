import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { deadlineFromParts } from './deadlines';
import { deadlineRecord } from './deadlineRecord';
import { db, userDoc } from './firebase';
import { catalogCitation, isTeamVerified, requirementsFromCatalog, tagsFor, type CatalogEntry } from './catalog';
import { recomputeCounts } from './requirements';

const CACHE_MS = 60_000;
let cache: { at: number; entries: CatalogEntry[] } | undefined;

/** All catalog entries (cached for a minute; the catalog changes rarely). */
export async function loadCatalog(options: { fresh?: boolean } = {}): Promise<CatalogEntry[]> {
  if (!options.fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.entries;
  const snap = await db().collection('scholarshipCatalog').get();
  // Entries an admin removed stay in Firestore (so the CSV import can't bring them back) but are not listed.
  const entries = snap.docs.filter((d) => !d.get('removedAt')).map((d) => {
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

/**
 * Make the catalog match the dataset file: each entry is written by its Scholarship ID, and entries no longer in
 * the file are removed from Discover (scholarships students already added keep their own copy).
 * Entries an admin added, edited or removed in the admin dashboard are left exactly as they are: once an admin
 * manages an entry, the dashboard owns it, so restarting the site never undoes their work.
 */
export async function saveCatalog(entries: CatalogEntry[]): Promise<{ removed: string[]; adminManaged: string[] }> {
  if (entries.length === 0) throw new Error('The dataset has no scholarships; the catalog was left as it is.');
  const keep = new Set(entries.map((e) => e.catalogId));
  const existing = await db().collection('scholarshipCatalog').get();
  const adminManaged = new Set(existing.docs.filter((d) => d.get('managedBy') === 'admin').map((d) => d.id));
  const removed = existing.docs.filter((d) => !keep.has(d.id) && !adminManaged.has(d.id)).map((d) => d.ref);
  entries = entries.filter((e) => !adminManaged.has(e.catalogId));
  for (let i = 0; i < removed.length; i += 400) {
    const batch = db().batch();
    for (const ref of removed.slice(i, i + 400)) batch.delete(ref);
    await batch.commit();
  }
  for (let i = 0; i < entries.length; i += 400) {
    const batch = db().batch();
    for (const e of entries.slice(i, i + 400)) {
      const { catalogId, ...rest } = e;
      batch.set(db().collection('scholarshipCatalog').doc(catalogId), { ...rest, importedAt: FieldValue.serverTimestamp() });
    }
    await batch.commit();
  }
  cache = undefined;
  return { removed: removed.map((r) => r.id), adminManaged: [...adminManaged].sort() };
}

// ---------- Admin dashboard ----------

export type AdminCatalogEntry = CatalogEntry & {
  teamVerified: boolean;
  managedBy: 'admin' | 'dataset';
  removedAt: string | null;
  updatedAt: string | null;
};

const iso = (v: unknown) => (v instanceof Timestamp ? v.toDate().toISOString() : null);

/** Every catalog entry, removed ones included, for the admin dashboard. */
export async function loadCatalogForAdmin(): Promise<AdminCatalogEntry[]> {
  const snap = await db().collection('scholarshipCatalog').get();
  return snap.docs
    .map((d) => {
      const x = d.data();
      const promptOrMaterials = (x.promptOrMaterials as string | undefined) ?? '';
      const entry: CatalogEntry = {
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
      };
      return {
        ...entry,
        teamVerified: isTeamVerified(entry),
        managedBy: x.managedBy === 'admin' ? ('admin' as const) : ('dataset' as const),
        removedAt: iso(x.removedAt),
        updatedAt: iso(x.updatedAt ?? x.importedAt),
      };
    })
    .sort((a, b) => a.catalogId.localeCompare(b.catalogId));
}

/** The next free Scholarship ID (SCH-001 … SCH-999), counting removed entries so an ID is never reused. */
export async function nextCatalogId(): Promise<string> {
  const snap = await db().collection('scholarshipCatalog').select().get();
  const used = snap.docs.map((d) => Number(/^SCH-(\d{3})$/.exec(d.id)?.[1] ?? 0));
  const next = Math.max(0, ...used) + 1;
  if (next > 999) throw new Error('The catalog has reached SCH-999.');
  return `SCH-${String(next).padStart(3, '0')}`;
}

/** Add or replace one entry from the admin dashboard. From then on the dataset import leaves it alone. */
export async function saveCatalogEntryByAdmin(entry: CatalogEntry, adminUid: string): Promise<void> {
  const { catalogId, ...rest } = entry;
  await db()
    .collection('scholarshipCatalog')
    .doc(catalogId)
    .set({ ...rest, managedBy: 'admin', removedAt: null, updatedAt: FieldValue.serverTimestamp(), updatedBy: adminUid });
  cache = undefined;
}

/** Hide an entry from Discover (or show it again). Scholarships students already added keep their own copy. */
export async function setCatalogEntryRemoved(catalogId: string, removed: boolean, adminUid: string): Promise<boolean> {
  const ref = db().collection('scholarshipCatalog').doc(catalogId);
  if (!(await ref.get()).exists) return false;
  await ref.update({
    managedBy: 'admin',
    removedAt: removed ? FieldValue.serverTimestamp() : null,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: adminUid,
  });
  cache = undefined;
  return true;
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
    const catalogDeadline = entry.deadline ? deadlineFromParts(entry.deadline, null, null) : null;
    // Team-checked entries are a verified source; the others start unverified until guidelines are uploaded.
    const verified = isTeamVerified(entry);
    const verification = verified ? 'verified' : 'unverified';
    tx.set(schRef, {
      name: entry.name,
      provider: entry.organization,
      url: entry.sourceUrl,
      catalogId,
      awardAmount: null,
      // The dataset gives a date but no time zone: keep the zone unknown rather than guess UTC.
      deadline: catalogDeadline
        ? { ...deadlineRecord(catalogDeadline, entry.deadline!), requirementId: null, verification, verifiedBy: verified ? 'ScholarScope team' : null }
        : null,
      status: 'researching',
      counts: { open: requirements.length, changed: 0, unverified: verified ? 0 : requirements.length, needsReview: 0, ready: 0, total: requirements.length },
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
      const citation = catalogCitation(entry, req.quote);
      tx.set(verRef, {
        versionNo: 1,
        value: req.value,
        citation,
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
        current: { value: req.value, citation },
        verification,
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

/**
 * Bring scholarships students already added in line with the catalog's check status: requirements copied from a
 * team-checked entry that still have no source become verified, citing the dataset row and the official page.
 * Only untouched catalog copies change (no citation yet and never reviewed or corrected by the student).
 * Returns how many requirements were updated.
 */
export async function applyCatalogVerification(): Promise<number> {
  const catalog = new Map((await loadCatalog({ fresh: true })).map((e) => [e.catalogId, e]));
  const added = await db().collectionGroup('scholarships').where('catalogId', '!=', null).get();
  let updated = 0;
  for (const sch of added.docs) {
    const entry = catalog.get(sch.get('catalogId') as string);
    if (!entry || !isTeamVerified(entry)) continue;
    const items = new Map(requirementsFromCatalog(entry).map((r) => [r.label, r]));
    const reqs = await sch.ref.collection('requirements').where('removedAt', '==', null).get();
    let changed = false;
    for (const r of reqs.docs) {
      const item = items.get(r.get('label') as string);
      if (!item || r.get('current.citation') || r.get('review') || r.get('verification') !== 'unverified') continue;
      const citation = catalogCitation(entry, item.quote);
      await r.ref.update({ verification: 'verified', 'current.citation': citation, updatedAt: FieldValue.serverTimestamp() });
      const versionId = r.get('currentVersionId') as string | undefined;
      if (versionId) await r.ref.collection('versions').doc(versionId).update({ citation });
      updated++;
      changed = true;
    }
    if (sch.get('deadline') && sch.get('deadline.verification') === 'unverified' && !sch.get('deadline.requirementId')) {
      await sch.ref.update({ 'deadline.verification': 'verified', 'deadline.verifiedBy': 'ScholarScope team' });
      changed = true;
    }
    if (changed) await recomputeCounts(sch.ref);
  }
  return updated;
}
