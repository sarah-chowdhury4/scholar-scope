import { FieldValue } from 'firebase-admin/firestore';
import { db, userDoc } from '@scholarscope/shared';

const today = () => new Date().toISOString().slice(0, 10);

/** Daily page budget per student (shared by extraction and document checks). */
export async function consumePages(uid: string, pages: number, limit: number): Promise<boolean> {
  const ref = userDoc(uid).collection('usage').doc(today());
  return db().runTransaction(async (tx) => {
    const used = ((await tx.get(ref)).get('extractedPages') as number | undefined) ?? 0;
    if (used + pages > limit) return false;
    tx.set(ref, { extractedPages: FieldValue.increment(pages) }, { merge: true });
    return true;
  });
}

/** Daily count of a limited action (e.g. drafts). Returns false once the limit is reached. */
export async function consumeDaily(uid: string, field: string, limit: number): Promise<boolean> {
  const ref = userDoc(uid).collection('usage').doc(today());
  return db().runTransaction(async (tx) => {
    const used = ((await tx.get(ref)).get(field) as number | undefined) ?? 0;
    if (used + 1 > limit) return false;
    tx.set(ref, { [field]: FieldValue.increment(1) }, { merge: true });
    return true;
  });
}

export async function recordTokens(uid: string, input?: number, output?: number): Promise<void> {
  const ref = userDoc(uid).collection('usage').doc(today());
  await ref.set(
    { geminiInputTokens: FieldValue.increment(input ?? 0), geminiOutputTokens: FieldValue.increment(output ?? 0) },
    { merge: true },
  );
}
