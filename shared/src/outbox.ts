import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { userDoc } from './firebase';
import { enqueueJob } from './jobs';
import type { Mail } from './platform/mail/index';

/**
 * Emails the API wants sent (confirmation codes, password resets). The API never holds a mail key:
 * it writes the email to users/{uid}/outbox/{id} and queues a job; the worker sends it with whatever
 * MAIL_BACKEND it runs (Mailpit locally, Brevo for real inboxes) and deletes the entry, code and all.
 *
 * `statusField` (e.g. "pendingEmail.delivery") is set on the user document to "sent" or "failed",
 * so the page can say whether the email went out. On Google Cloud, a Firestore TTL policy on
 * `expireAt` removes anything left behind.
 */
export type OutgoingMail = Mail & { kind: string; statusField?: string | null };

const OUTBOX_TTL_MS = 24 * 60 * 60 * 1000;

export async function queueMail(uid: string, mail: OutgoingMail): Promise<void> {
  const ref = userDoc(uid).collection('outbox').doc();
  await ref.set({
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    kind: mail.kind,
    statusField: mail.statusField ?? null,
    createdAt: FieldValue.serverTimestamp(),
    expireAt: Timestamp.fromMillis(Date.now() + OUTBOX_TTL_MS),
  });
  try {
    await enqueueJob(uid, 'send_email', ref.path);
  } catch (err) {
    await ref.delete();
    throw err;
  }
}

/**
 * Set a delivery status on the user document, but only while the thing it describes still exists:
 * a cancelled email change must not come back as `{ delivery: "sent" }`.
 */
export async function setDeliveryStatus(uid: string, statusField: string | null | undefined, status: 'sent' | 'failed'): Promise<void> {
  if (!statusField) return;
  const parent = statusField.split('.').slice(0, -1).join('.');
  const ref = userDoc(uid);
  const snap = await ref.get();
  if (parent && (snap.get(parent) == null || typeof snap.get(parent) !== 'object')) return;
  await ref.update({ [statusField]: status });
}
