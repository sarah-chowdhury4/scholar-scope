import { db, sendMail, setDeliveryStatus, updateJob, log, type JobMessage } from '@scholarscope/shared';

/**
 * Send one queued email (confirmation code, password reset) and delete it from the outbox.
 * target = users/{uid}/outbox/{id}
 * A failure throws so the queue retries (3 attempts); after the last one the entry is deleted and the
 * delivery status is set to "failed" (see markGivenUp).
 */
export async function handleSendEmail(job: JobMessage): Promise<void> {
  const ref = db().doc(job.target);
  const snap = await ref.get();
  if (!snap.exists) {
    await updateJob(job.uid, job.jobId, { status: 'done', progress: 100 });
    return; // already sent, or cancelled
  }
  await updateJob(job.uid, job.jobId, { status: 'running', progress: 30 });
  const { messageId } = await sendMail({ to: snap.get('to'), subject: snap.get('subject'), text: snap.get('text') });
  await setDeliveryStatus(job.uid, snap.get('statusField'), 'sent');
  await ref.delete(); // the email held a one-time code: keep no copy
  await updateJob(job.uid, job.jobId, { status: 'done', progress: 100 });
  log.info('mail_sent', { kind: snap.get('kind'), backend: process.env.MAIL_BACKEND ?? 'smtp', messageId });
}
