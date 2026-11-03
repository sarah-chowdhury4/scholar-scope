/**
 * Permanently delete a student's data (FR-8.4, NFR-9.1). Runs with the DELETER credentials only —
 * the one component allowed to erase stored files.
 *
 *   docker compose run --rm deleter            # process every pending deletion request
 *   docker compose run --rm deleter <uid>      # delete one student now
 *
 * Removes: users/{uid} and everything under it, all stored files and versions under u/{uid}/,
 * the sign-in account. Audit log entries are kept (1-year TTL) but their subjectUid is replaced
 * by a salted hash so they no longer identify the student.
 */
import { createHash, randomBytes } from 'node:crypto';
import { assertSafeEnvironment, log } from '@scholarscope/shared';

assertSafeEnvironment();
const { db, auth, userDoc, storage, buckets, writeAudit } = await import('@scholarscope/shared');

async function deleteUser(uid: string) {
  const store = await storage();
  let files = 0;
  for (const bucket of [buckets.uploads(), buckets.originals(), buckets.exports()]) {
    files += await store.deletePrefix(bucket, `u/${uid}/`);
  }

  await db().recursiveDelete(userDoc(uid));

  try {
    await auth().deleteUser(uid);
  } catch (err) {
    if ((err as { code?: string }).code !== 'auth/user-not-found') throw err;
  }

  const pseudonym = createHash('sha256').update(uid + randomBytes(16).toString('hex')).digest('hex');
  let page = await db().collection('auditLogs').where('subjectUid', '==', uid).limit(400).get();
  while (!page.empty) {
    const batch = db().batch();
    page.docs.forEach((d) => batch.update(d.ref, { subjectUid: pseudonym, before: null, after: null }));
    await batch.commit();
    page = await db().collection('auditLogs').where('subjectUid', '==', uid).limit(400).get();
  }

  await writeAudit({
    actor: { type: 'system', id: 'deleter' },
    subjectUid: pseudonym,
    action: 'user.deleted',
    resource: 'users/[deleted]',
    after: { filesDeleted: files },
  });
  log.info('user_deleted', { files });
}

const target = process.argv[2];
if (target) {
  await deleteUser(target);
} else {
  const pending = await db().collection('users').where('deletion.completedAt', '==', null).get();
  const requested = pending.docs.filter((d) => d.get('deletion.requestedAt'));
  for (const doc of requested) await deleteUser(doc.id);
  console.log(`Processed ${requested.length} deletion request(s).`);
}
process.exit(0);
