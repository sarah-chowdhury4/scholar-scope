import { Router } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { userDoc, writeAudit } from '@scholarscope/shared';
import { consentSchema } from '../validation';

export const meRouter = Router();

/** Current student's profile. Creates the profile on first call after sign-up. */
meRouter.get('/', async (req, res) => {
  const ref = userDoc(req.uid!);
  const snap = await ref.get();
  if (!snap.exists || !snap.get('createdAt')) {
    await ref.set(
      {
        email: req.email ?? null,
        displayName: null,
        timezone: 'UTC',
        consent: null,
        notificationPrefs: { email: true, inApp: true },
        scholarshipCount: 0,
        deletion: null,
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
  const data = (await ref.get()).data() ?? {};
  res.json({
    uid: req.uid,
    email: data.email ?? null,
    timezone: data.timezone,
    consent: data.consent ?? null,
    scholarshipCount: data.scholarshipCount ?? 0,
    notificationPrefs: data.notificationPrefs,
    deletion: data.deletion ?? null,
  });
});

/** Privacy notice consent (NFR-9.1). */
meRouter.post('/consent', async (req, res) => {
  const { version } = consentSchema.parse(req.body);
  const consent = { version, acceptedAt: new Date() };
  await userDoc(req.uid!).set({ consent }, { merge: true });
  await writeAudit({
    actor: { type: 'student', id: req.uid! },
    subjectUid: req.uid!,
    action: 'user.consent.accepted',
    resource: `users/${req.uid}`,
    after: { consentVersion: version },
  });
  res.json({ consent });
});

meRouter.patch('/', async (req, res) => {
  const timezone = typeof req.body?.timezone === 'string' ? req.body.timezone : undefined;
  if (timezone) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: timezone });
    } catch {
      return res.status(400).json({ error: 'Unknown time zone' });
    }
    await userDoc(req.uid!).set({ timezone }, { merge: true });
  }
  res.json({ ok: true });
});

/**
 * Request permanent deletion of all data (FR-8.4). The deletion itself runs in the separate
 * deleter job, the only component allowed to erase stored files.
 * Locally: `docker compose run --rm deleter` processes pending requests.
 */
meRouter.post('/delete', async (req, res) => {
  await userDoc(req.uid!).set({ deletion: { requestedAt: new Date(), completedAt: null } }, { merge: true });
  await writeAudit({
    actor: { type: 'student', id: req.uid! },
    subjectUid: req.uid!,
    action: 'user.deletion.requested',
    resource: `users/${req.uid}`,
  });
  res.status(202).json({ status: 'deletion_requested' });
});
