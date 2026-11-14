import { createHash } from 'node:crypto';
import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { userDoc, sendMail, log, errorMessage } from '@scholarscope/shared';

/**
 * A requirement changed in the source (FR-3.4, FR-7.2): one in-app alert per change, and an email
 * unless the student turned emails off. The alert id is derived from the change id, so a retried
 * extraction never alerts twice (NFR-4.3).
 */
export async function createChangeAlert(uid: string, scholarshipRef: DocumentReference, changeId: string, label: string): Promise<void> {
  const userRef = userDoc(uid);
  const dedupeKey = `change:${scholarshipRef.id}:${changeId}`;
  const alertRef = userRef.collection('alerts').doc(createHash('sha256').update(dedupeKey).digest('hex').slice(0, 32));
  const scholarship = await scholarshipRef.get();
  const name = (scholarship.get('name') as string | undefined) ?? 'A scholarship';
  const title = `${name}: a requirement changed`;
  const body = `"${label}" changed in the official guidelines. Open the scholarship to see the old and new wording side by side, then confirm you have seen it.`;

  try {
    await alertRef.create({
      type: 'change',
      dedupeKey,
      scholarshipId: scholarshipRef.id,
      changeId,
      title,
      body,
      links: { source: null, draftIds: [], matchIds: [] },
      inApp: { readAt: null },
      email: { status: 'pending', attempts: 0 },
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch {
    return; // already alerted for this change
  }
  await scholarshipRef.collection('changes').doc(changeId).set({ alertId: alertRef.id }, { merge: true });

  const user = await userRef.get();
  const email = user.get('email') as string | undefined;
  if (!email || user.get('notificationPrefs.email') === false) {
    await alertRef.update({ 'email.status': 'skipped' });
    return;
  }
  try {
    const { messageId } = await sendMail({ to: email, subject: title, text: body });
    await alertRef.update({ email: { status: 'sent', attempts: 1, providerMessageId: messageId, sentAt: FieldValue.serverTimestamp() } });
  } catch (err) {
    await alertRef.update({ email: { status: 'failed', attempts: 1, error: errorMessage(err) } });
    log.error('alert_email_failed', { alert: alertRef.path, error: errorMessage(err) });
  }
}
