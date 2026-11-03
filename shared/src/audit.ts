import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from './firebase';
import type { Actor } from './types';

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/** Append-only audit trail (NFR-2.3). A TTL policy on expireAt removes entries after a year. */
export async function writeAudit(entry: {
  actor: Actor;
  subjectUid: string;
  action: string;
  resource: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  requestId?: string;
}): Promise<void> {
  await db().collection('auditLogs').add({
    ...entry,
    before: entry.before ?? null,
    after: entry.after ?? null,
    at: FieldValue.serverTimestamp(),
    expireAt: Timestamp.fromMillis(Date.now() + ONE_YEAR_MS),
  });
}
