import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { profileOptions, userDoc, writeAudit } from '@scholarscope/shared';
import { wrap } from '../http';
import {
  beginAddEmail,
  beginChangeEmail,
  cancelPendingEmail,
  changePassword,
  getProfile,
  removeEmailAddress,
  requestAccountDeletion,
  resendPendingEmail,
  setPrimaryEmail,
  updateProfile,
  verifyPendingEmail,
} from '../userProfile';
import {
  changeEmailSchema,
  consentSchema,
  deleteAccountSchema,
  emailAddressSchema,
  passwordChangeSchema,
  primaryEmailSchema,
  profilePatchSchema,
  verifyEmailSchema,
} from '../validation';

export const meRouter = Router();

const sensitive = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Wait a few minutes and try again.' },
  keyGenerator: (req) => req.uid ?? 'unknown',
});

/** Current student's profile. Creates the profile on first call after sign-up. */
meRouter.get('/', wrap(async (req, res) => {
  res.json(await getProfile(req.uid!));
}));

meRouter.get('/options', wrap(async (_req, res) => {
  res.json(profileOptions());
}));

meRouter.patch('/', wrap(async (req, res) => {
  const patch = profilePatchSchema.parse(req.body);
  res.json(await updateProfile(req.uid!, patch));
}));

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

meRouter.post('/emails', sensitive, wrap(async (req, res) => {
  const { address } = emailAddressSchema.parse(req.body);
  res.json(await beginAddEmail(req.uid!, address));
}));

meRouter.post('/emails/change', sensitive, wrap(async (req, res) => {
  const body = changeEmailSchema.parse(req.body);
  res.json(await beginChangeEmail(req.uid!, body.currentAddress, body.newAddress, body.currentPassword));
}));

meRouter.post('/emails/verify', sensitive, wrap(async (req, res) => {
  const { code } = verifyEmailSchema.parse(req.body);
  res.json(await verifyPendingEmail(req.uid!, code));
}));

meRouter.post('/emails/resend', sensitive, wrap(async (req, res) => {
  res.json(await resendPendingEmail(req.uid!));
}));

meRouter.post('/emails/cancel', wrap(async (req, res) => {
  res.json(await cancelPendingEmail(req.uid!));
}));

meRouter.post('/emails/remove', wrap(async (req, res) => {
  const { address } = emailAddressSchema.parse(req.body);
  res.json(await removeEmailAddress(req.uid!, address));
}));

meRouter.post('/emails/primary', sensitive, wrap(async (req, res) => {
  const body = primaryEmailSchema.parse(req.body);
  res.json(await setPrimaryEmail(req.uid!, body.address, body.currentPassword));
}));

meRouter.post('/password', sensitive, wrap(async (req, res) => {
  const body = passwordChangeSchema.parse(req.body);
  res.json(await changePassword(req.uid!, body.currentPassword, body.newPassword));
}));

/**
 * Request permanent deletion of all data (FR-8.4). The deletion itself runs in the separate
 * deleter job, the only component allowed to erase stored files.
 * Locally: `docker compose run --rm deleter` processes pending requests.
 */
meRouter.post('/delete', sensitive, wrap(async (req, res) => {
  const { currentPassword } = deleteAccountSchema.parse(req.body);
  res.status(202).json(await requestAccountDeletion(req.uid!, currentPassword));
}));
