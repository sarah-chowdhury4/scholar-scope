/**
 * Admin dashboard API. Mounted behind requireAuth + requireAdmin (see app.ts), so every route here runs only
 * for a signed-in account whose token carries the `admin` claim. Every change is written to the audit log.
 *
 * What admins can NOT do here, on purpose: read a student's documents, scholarships or profile, or erase files
 * themselves. Deleting an account only queues it for the separate deleter job, the one component allowed to erase.
 */
import { Router } from 'express';
import type { Timestamp } from 'firebase-admin/firestore';
import {
  applyCatalogVerification,
  auth,
  db,
  getAppConfig,
  loadCatalogForAdmin,
  nextCatalogId,
  saveCatalogEntryByAdmin,
  setCatalogEntryRemoved,
  tagsFor,
  userDoc,
  writeAudit,
  type AppConfig,
  type CatalogEntry,
} from '@scholarscope/shared';
import { HttpError, wrap } from '../http';
import {
  adminCatalogEntrySchema,
  adminDeleteSchema,
  adminRoleSchema,
  adminSettingsSchema,
  auditQuerySchema,
  catalogIdSchema,
  type AdminCatalogEntryInput,
} from '../adminSchemas';

export const adminRouter = Router();

const actor = (uid: string) => ({ type: 'admin' as const, id: uid });
const iso = (t: unknown) => ((t as Timestamp | undefined)?.toDate?.() ?? null)?.toISOString() ?? null;

function toEntry(catalogId: string, input: AdminCatalogEntryInput, previous?: CatalogEntry): CatalogEntry {
  return {
    catalogId,
    name: input.name,
    organization: input.organization,
    deadline: input.deadline,
    minGpa: input.minGpa,
    promptOrMaterials: input.promptOrMaterials,
    sourceUrl: input.sourceUrl,
    datasetVersion: previous?.datasetVersion ?? null,
    // isTeamVerified() reads this status: anything but "Unverified" (with a source) counts as checked by the team.
    datasetStatus: input.verified ? 'Active' : 'Unverified',
    tags: tagsFor(input.promptOrMaterials),
  };
}

/** Every Firebase account, in pages of 1000. Fine for a pilot; a large app would page this in the UI. */
async function allAccounts() {
  const users = [];
  let pageToken: string | undefined;
  do {
    const page = await auth().listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

// ---------- Overview ----------

adminRouter.get(
  '/overview',
  wrap(async (_req, res) => {
    const [accounts, catalog, config, pending] = await Promise.all([
      allAccounts(),
      loadCatalogForAdmin(),
      getAppConfig({ fresh: true }),
      db().collection('users').where('deletion.completedAt', '==', null).get(),
    ]);
    res.json({
      students: accounts.length,
      admins: accounts.filter((u) => u.customClaims?.admin === true).length,
      catalogListed: catalog.filter((e) => !e.removedAt).length,
      catalogRemoved: catalog.filter((e) => e.removedAt).length,
      pendingDeletions: pending.docs.filter((d) => d.get('deletion.requestedAt')).length,
      aiEnabled: config.aiEnabled,
    });
  }),
);

// ---------- Catalog ----------

adminRouter.get(
  '/catalog',
  wrap(async (_req, res) => {
    res.json({ items: await loadCatalogForAdmin() });
  }),
);

adminRouter.post(
  '/catalog',
  wrap(async (req, res) => {
    const input = adminCatalogEntrySchema.parse(req.body);
    const catalogId = await nextCatalogId();
    const entry = toEntry(catalogId, input);
    await saveCatalogEntryByAdmin(entry, req.uid!);
    if (input.verified) await applyCatalogVerification();
    await writeAudit({ actor: actor(req.uid!), subjectUid: req.uid!, action: 'admin.catalog.added', resource: `scholarshipCatalog/${catalogId}`, after: { ...entry } });
    res.status(201).json({ catalogId });
  }),
);

adminRouter.put(
  '/catalog/:catalogId',
  wrap(async (req, res) => {
    const catalogId = catalogIdSchema.parse(req.params.catalogId);
    const input = adminCatalogEntrySchema.parse(req.body);
    const previous = (await loadCatalogForAdmin()).find((e) => e.catalogId === catalogId);
    if (!previous) throw new HttpError(404, 'That scholarship is not in the catalog.');
    const entry = toEntry(catalogId, input, previous);
    await saveCatalogEntryByAdmin(entry, req.uid!);
    // Students who added it keep their own copy; untouched items on those copies become verified when it is checked.
    if (input.verified && !previous.teamVerified) await applyCatalogVerification();
    const before: CatalogEntry = { ...toEntry(catalogId, { ...previous, verified: previous.teamVerified }, previous), datasetStatus: previous.datasetStatus };
    await writeAudit({ actor: actor(req.uid!), subjectUid: req.uid!, action: 'admin.catalog.updated', resource: `scholarshipCatalog/${catalogId}`, before, after: { ...entry } });
    res.json({ catalogId });
  }),
);

for (const change of ['remove', 'restore'] as const) {
  adminRouter.post(
    `/catalog/:catalogId/${change}`,
    wrap(async (req, res) => {
      const catalogId = catalogIdSchema.parse(req.params.catalogId);
      const remove = change === 'remove';
      if (!(await setCatalogEntryRemoved(catalogId, remove, req.uid!))) throw new HttpError(404, 'That scholarship is not in the catalog.');
      await writeAudit({
        actor: actor(req.uid!),
        subjectUid: req.uid!,
        action: remove ? 'admin.catalog.removed' : 'admin.catalog.restored',
        resource: `scholarshipCatalog/${catalogId}`,
      });
      res.json({ catalogId, removed: remove });
    }),
  );
}

// ---------- Settings ----------

const SETTING_KEYS = ['aiEnabled', 'aiPausedReason', 'maxScholarshipsPerStudent', 'dailyDraftLimit', 'dailyPageLimit', 'alertOffsetsDays'] as const;
const pickSettings = (c: AppConfig) => Object.fromEntries(SETTING_KEYS.map((k) => [k, c[k]])) as Pick<AppConfig, (typeof SETTING_KEYS)[number]>;

adminRouter.get(
  '/settings',
  wrap(async (_req, res) => {
    res.json(pickSettings(await getAppConfig({ fresh: true })));
  }),
);

adminRouter.patch(
  '/settings',
  wrap(async (req, res) => {
    const changes = adminSettingsSchema.parse(req.body);
    if (changes.alertOffsetsDays) changes.alertOffsetsDays = [...changes.alertOffsetsDays].sort((a, b) => b - a);
    if (changes.aiEnabled === true) changes.aiPausedReason = null;
    const before = pickSettings(await getAppConfig({ fresh: true }));
    await db()
      .doc('config/app')
      .set({ ...changes, updatedAt: new Date(), updatedBy: actor(req.uid!) }, { merge: true });
    const after = pickSettings(await getAppConfig({ fresh: true }));
    await writeAudit({ actor: actor(req.uid!), subjectUid: req.uid!, action: 'admin.settings.updated', resource: 'config/app', before, after });
    res.json(after);
  }),
);

// ---------- Students (account facts only; never their documents or scholarships) ----------

adminRouter.get(
  '/students',
  wrap(async (_req, res) => {
    const accounts = await allAccounts();
    const docs = accounts.length ? await db().getAll(...accounts.map((u) => userDoc(u.uid))) : [];
    const byUid = new Map(docs.map((d) => [d.id, d]));
    const items = accounts
      .map((u) => {
        const d = byUid.get(u.uid);
        return {
          uid: u.uid,
          email: u.email ?? null,
          createdAt: u.metadata.creationTime ? new Date(u.metadata.creationTime).toISOString() : null,
          lastSignInAt: u.metadata.lastSignInTime ? new Date(u.metadata.lastSignInTime).toISOString() : null,
          scholarships: (d?.get('scholarshipCount') as number | undefined) ?? 0,
          admin: u.customClaims?.admin === true,
          disabled: u.disabled,
          deletionRequestedAt: iso(d?.get('deletion.requestedAt')),
        };
      })
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    res.json({ items });
  }),
);

adminRouter.post(
  '/students/:uid/admin',
  wrap(async (req, res) => {
    const uid = String(req.params.uid);
    const { admin } = adminRoleSchema.parse(req.body);
    if (uid === req.uid && !admin) throw new HttpError(409, 'You cannot remove your own admin role. Ask another admin.');
    const user = await auth()
      .getUser(uid)
      .catch(() => null);
    if (!user) throw new HttpError(404, 'No account with that ID.');
    await auth().setCustomUserClaims(uid, { ...(user.customClaims ?? {}), admin });
    // Removing the role takes effect at once: the old token (which still says admin) stops working.
    if (!admin) await auth().revokeRefreshTokens(uid);
    await writeAudit({
      actor: actor(req.uid!),
      subjectUid: uid,
      action: admin ? 'admin.role.granted' : 'admin.role.removed',
      resource: `users/${uid}`,
      after: { admin },
    });
    res.json({ uid, admin });
  }),
);

adminRouter.post(
  '/students/:uid/delete',
  wrap(async (req, res) => {
    const uid = String(req.params.uid);
    const { confirmEmail } = adminDeleteSchema.parse(req.body);
    if (uid === req.uid) throw new HttpError(409, 'Delete your own account from your Profile page.');
    const user = await auth()
      .getUser(uid)
      .catch(() => null);
    if (!user) throw new HttpError(404, 'No account with that ID.');
    if (!user.email || user.email.toLowerCase() !== confirmEmail.toLowerCase()) {
      throw new HttpError(400, 'The email you typed does not match this account.');
    }
    // Lock the account now; the deleter job erases the data and files and removes the sign-in.
    await auth().updateUser(uid, { disabled: true });
    await auth().revokeRefreshTokens(uid);
    await userDoc(uid).set({ deletion: { requestedAt: new Date(), completedAt: null, requestedBy: 'admin' } }, { merge: true });
    await writeAudit({ actor: actor(req.uid!), subjectUid: uid, action: 'admin.user.deletion_requested', resource: `users/${uid}` });
    res.status(202).json({ uid, deletionRequested: true });
  }),
);

// ---------- Audit log (admin actions only) ----------

adminRouter.get(
  '/audit',
  wrap(async (req, res) => {
    const { limit } = auditQuerySchema.parse(req.query);
    const snap = await db().collection('auditLogs').where('actor.type', '==', 'admin').orderBy('at', 'desc').limit(limit).get();
    const adminIds = [...new Set(snap.docs.map((d) => d.get('actor.id') as string))];
    const emails = new Map<string, string | null>();
    await Promise.all(
      adminIds.map(async (id) => {
        const u = await auth()
          .getUser(id)
          .catch(() => null);
        emails.set(id, u?.email ?? null);
      }),
    );
    res.json({
      items: snap.docs.map((d) => ({
        id: d.id,
        at: iso(d.get('at')),
        action: d.get('action') as string,
        resource: d.get('resource') as string,
        adminEmail: emails.get(d.get('actor.id') as string) ?? null,
        before: d.get('before') ?? null,
        after: d.get('after') ?? null,
      })),
    });
  }),
);
