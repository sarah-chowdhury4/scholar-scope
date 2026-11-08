import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { wrap } from '../http';
import { confirmPasswordReset, requestPasswordReset } from '../userProfile';
import { passwordResetConfirmSchema, passwordResetRequestSchema } from '../validation';

export const passwordResetRouter = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Wait a few minutes and try again.' },
});

/** Same response whether or not the address has an account, so the form does not reveal who signed up. */
passwordResetRouter.post('/password-reset', limiter, wrap(async (req, res) => {
  const { email } = passwordResetRequestSchema.parse(req.body);
  await requestPasswordReset(email);
  res.json({ ok: true });
}));

passwordResetRouter.post('/password-reset/confirm', limiter, wrap(async (req, res) => {
  const body = passwordResetConfirmSchema.parse(req.body);
  const email = await confirmPasswordReset(body.email, body.code, body.newPassword);
  res.json({ email });
}));
