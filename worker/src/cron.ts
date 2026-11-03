import { createHash } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  db,
  enqueueJob,
  getAppConfig,
  sendMail,
  dueDeadlineAlert,
  deadlineDedupeKey,
  log,
  errorMessage,
} from '@scholarscope/shared';

/**
 * Daily re-check (FR-3.5): every active scholarship with a URL whose next check is due gets a
 * fetch job. On Google Cloud, Cloud Scheduler calls this; locally node-cron does.
 */
export async function runRecheck(): Promise<{ queued: number }> {
  const due = await db()
    .collectionGroup('scholarships')
    .where('recheck.enabled', '==', true)
    .where('recheck.nextCheckAt', '<=', Timestamp.now())
    .get();

  let queued = 0;
  for (const sch of due.docs) {
    const userRef = sch.ref.parent.parent!;
    const uid = userRef.id;
    const url = sch.get('url') as string | null;
    if (!url || sch.get('status') === 'archived') continue;

    // One URL source per scholarship page
    const existing = await userRef
      .collection('sources')
      .where('kind', '==', 'url')
      .where('url', '==', url)
      .limit(1)
      .get();
    const sourceRef = existing.docs[0]?.ref ?? userRef.collection('sources').doc();
    if (existing.empty) {
      await sourceRef.set({
        kind: 'url',
        url,
        title: url,
        scholarshipIds: [sch.id],
        currentVersionId: null,
        robots: null,
        lastFetch: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else if (!(existing.docs[0]!.get('scholarshipIds') as string[]).includes(sch.id)) {
      await sourceRef.update({ scholarshipIds: FieldValue.arrayUnion(sch.id) });
    }

    // Push the next check out now so a slow run never queues the same page twice.
    await sch.ref.update({ 'recheck.nextCheckAt': Timestamp.fromMillis(Date.now() + 23 * 60 * 60 * 1000) });
    await enqueueJob(uid, 'fetch_url', sourceRef.path);
    queued++;
  }
  await db().collection('recheckRuns').add({ startedAt: FieldValue.serverTimestamp(), sourcesQueued: queued });
  log.info('recheck_run', { queued });
  return { queued };
}

/**
 * Deadline alerts at 14/7/3/1 days (FR-7.1). Each alert's document id is a hash of its dedupe key,
 * so a retry or a second run the same day never sends it twice (NFR-4.3).
 */
export async function runDeadlineAlerts(now = new Date()): Promise<{ sent: number }> {
  const { alertOffsetsDays } = await getAppConfig();
  const horizon = Timestamp.fromMillis(now.getTime() + (Math.max(...alertOffsetsDays) + 1) * 24 * 60 * 60 * 1000);
  const upcoming = await db()
    .collectionGroup('scholarships')
    .where('deadline.utc', '>=', Timestamp.fromDate(now))
    .where('deadline.utc', '<=', horizon)
    .get();

  let sent = 0;
  for (const sch of upcoming.docs) {
    if (sch.get('status') === 'archived' || sch.get('status') === 'submitted') continue;
    const userRef = sch.ref.parent.parent!;
    const user = await userRef.get();
    const timeZone = (user.get('timezone') as string | undefined) || 'UTC';
    const deadline = (sch.get('deadline.utc') as Timestamp).toDate();
    const offset = dueDeadlineAlert(deadline, now, timeZone, alertOffsetsDays);
    if (offset === null) continue;

    const dedupeKey = deadlineDedupeKey(sch.id, offset, deadline);
    const alertRef = userRef.collection('alerts').doc(createHash('sha256').update(dedupeKey).digest('hex').slice(0, 32));
    const verification = sch.get('deadline.verification') as string;
    const name = sch.get('name') as string;
    const when = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeZone }).format(deadline);
    const caution = verification === 'verified' ? '' : '\n\nThis deadline has not been confirmed from a source document yet. Check the official page.';
    const title = `${name} is due in ${offset} day${offset === 1 ? '' : 's'}`;
    const body = `${name} (${sch.get('provider')}) is due on ${when}.${caution}`;

    try {
      await alertRef.create({
        type: `deadline_${offset}`,
        dedupeKey,
        scholarshipId: sch.id,
        changeId: null,
        title,
        body,
        links: { source: null, draftIds: [], matchIds: [] },
        inApp: { readAt: null },
        email: { status: 'pending', attempts: 0 },
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch {
      continue; // already created by an earlier run
    }

    const email = user.get('email') as string | undefined;
    if (!email || user.get('notificationPrefs.email') === false) {
      await alertRef.update({ 'email.status': 'skipped' });
      continue;
    }
    try {
      const { messageId } = await sendMail({ to: email, subject: title, text: body });
      await alertRef.update({ email: { status: 'sent', attempts: 1, providerMessageId: messageId, sentAt: FieldValue.serverTimestamp() } });
      sent++;
    } catch (err) {
      await alertRef.update({ email: { status: 'failed', attempts: 1, error: errorMessage(err) } });
      log.error('alert_email_failed', { alert: alertRef.path, error: errorMessage(err) });
    }
  }
  log.info('deadline_alerts_run', { sent });
  return { sent };
}
