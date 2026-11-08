import { db } from './firebase';

/**
 * emailIndex/{address} -> { uid }
 * One address can belong to only one student. The address is the document id (already lower-case).
 * This collection sits outside users/{uid}, so account deletion must delete these documents too.
 */
export async function claimEmail(address: string, uid: string): Promise<'ok' | 'taken'> {
  const ref = db().collection('emailIndex').doc(address);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const owner = snap.exists ? (snap.get('uid') as string | undefined) : undefined;
    if (owner && owner !== uid) return 'taken';
    tx.set(ref, { uid });
    return 'ok';
  });
}

export async function releaseEmail(address: string, uid: string): Promise<void> {
  const ref = db().collection('emailIndex').doc(address);
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.get('uid') === uid) tx.delete(ref);
  });
}

export async function releaseAllEmails(uid: string): Promise<void> {
  const snap = await db().collection('emailIndex').where('uid', '==', uid).get();
  if (snap.empty) return;
  const batch = db().batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}
