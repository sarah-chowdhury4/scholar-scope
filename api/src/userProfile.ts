import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import {
  LIMITS,
  applyProfilePatch,
  auth,
  claimEmail,
  db,
  domesticCountries,
  errorMessage,
  log,
  missingForRecommendations,
  normalizeEmail,
  primaryBlock,
  profileHints,
  readinessPercent,
  readProfileRecord,
  releaseEmail,
  removalBlock,
  schoolNote,
  sendMail,
  userDoc,
  writeAudit,
  type ProfilePatch,
  type ProfileRecord,
  type SavedEmail,
} from '@scholarscope/shared';
import { HttpError } from './http';

type PendingEmail = {
  address: string;
  replaces: string | null;
  codeHash: string;
  expiresAtMs: number;
  attempts: number;
  sentAtMs: number;
};

type PasswordReset = {
  codeHash: string;
  expiresAtMs: number;
  attempts: number;
  sentAtMs: number;
};

function authCode(err: unknown): string {
  if (typeof err === 'object' && err && 'code' in err) return String((err as { code: unknown }).code);
  return '';
}

function newCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function hashCode(uid: string, purpose: string, code: string): string {
  return createHash('sha256').update(`${uid}\0${purpose}\0${code}`).digest('hex');
}

function hashesEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function requireEmail(value: string): string {
  const email = normalizeEmail(value);
  if (!email) throw new HttpError(400, 'Enter a valid email address.');
  return email;
}

function checkPasswordLength(password: string) {
  if (password.length < LIMITS.minPasswordLength || password.length > LIMITS.maxPasswordLength) {
    throw new HttpError(400, `Use a password with at least ${LIMITS.minPasswordLength} characters.`);
  }
}

function readEmails(value: unknown): SavedEmail[] {
  if (!Array.isArray(value)) return [];
  const out: SavedEmail[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const address = normalizeEmail(String((item as { address?: unknown }).address ?? ''));
    if (!address || out.some((email) => email.address === address)) continue;
    out.push({
      address,
      verified: (item as { verified?: unknown }).verified === true,
      primary: (item as { primary?: unknown }).primary === true,
    });
  }
  return out;
}

/** The Auth email is always the primary. It stays confirmed because it is the sign-in address. */
function reconcile(emails: SavedEmail[], login: string): SavedEmail[] {
  const rest = emails.filter((email) => email.address !== login).map((email) => ({ ...email, primary: false }));
  return [{ address: login, verified: true, primary: true }, ...rest];
}

function sameEmails(a: SavedEmail[], b: SavedEmail[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((email) => {
    const other = b.find((item) => item.address === email.address);
    return !!other && other.verified === email.verified && other.primary === email.primary;
  });
}

function readPending(value: unknown): PendingEmail | null {
  if (!value || typeof value !== 'object') return null;
  const pending = value as Partial<PendingEmail>;
  const address = typeof pending.address === 'string' ? normalizeEmail(pending.address) : null;
  if (!address || typeof pending.codeHash !== 'string') return null;
  return {
    address,
    replaces: typeof pending.replaces === 'string' ? normalizeEmail(pending.replaces) : null,
    codeHash: pending.codeHash,
    expiresAtMs: typeof pending.expiresAtMs === 'number' ? pending.expiresAtMs : 0,
    attempts: typeof pending.attempts === 'number' ? pending.attempts : 0,
    sentAtMs: typeof pending.sentAtMs === 'number' ? pending.sentAtMs : 0,
  };
}

function readReset(value: unknown): PasswordReset | null {
  if (!value || typeof value !== 'object') return null;
  const reset = value as Partial<PasswordReset>;
  if (typeof reset.codeHash !== 'string') return null;
  return {
    codeHash: reset.codeHash,
    expiresAtMs: typeof reset.expiresAtMs === 'number' ? reset.expiresAtMs : 0,
    attempts: typeof reset.attempts === 'number' ? reset.attempts : 0,
    sentAtMs: typeof reset.sentAtMs === 'number' ? reset.sentAtMs : 0,
  };
}

function serializeWhen(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const stamped = value as { toDate?: () => Date };
  return stamped.toDate?.()?.toISOString() ?? null;
}

function toDto(uid: string, data: Record<string, unknown>) {
  const record = readProfileRecord(data);
  const emails = readEmails(data.emails).map(({ address, verified, primary }) => ({ address, verified, primary }));
  const pending = readPending(data.pendingEmail);
  const consentRaw = data.consent;
  let consent: { version: string; acceptedAt: string | null } | null = null;
  if (consentRaw && typeof consentRaw === 'object' && typeof (consentRaw as { version?: unknown }).version === 'string') {
    consent = {
      version: (consentRaw as { version: string }).version,
      acceptedAt: serializeWhen((consentRaw as { acceptedAt?: unknown }).acceptedAt),
    };
  }
  const deletion = data.deletion as { requestedAt?: unknown; completedAt?: unknown } | null;
  const requestedAt = serializeWhen(deletion?.requestedAt);
  return {
    uid,
    email: emails.find((item) => item.primary)?.address ?? (typeof data.email === 'string' ? data.email : null),
    displayName: record.displayName,
    timezone: record.timezone,
    timezoneChosen: record.timezoneChosen,
    consent,
    scholarshipCount: typeof data.scholarshipCount === 'number' ? data.scholarshipCount : 0,
    notificationPrefs: record.notificationPrefs,
    deletion: requestedAt ? { requestedAt, completedAt: serializeWhen(deletion?.completedAt) } : null,
    emails,
    pendingEmail: pending ? { address: pending.address, replaces: pending.replaces } : null,
    countriesOfInterest: record.countriesOfInterest,
    citizenships: record.citizenships,
    currentLocation: record.currentLocation,
    residencyStatus: record.residencyStatus,
    schoolCountry: record.schoolCountry,
    birthYear: record.birthYear,
    studyLanguages: record.studyLanguages,
    education: record.education,
    domesticCountries: domesticCountries(record),
    schoolNote: schoolNote(record),
    hints: profileHints(record),
    missingForRecommendations: missingForRecommendations(record),
    readinessPercent: readinessPercent(record),
  };
}

export type ProfileDto = ReturnType<typeof toDto>;

async function claimOrRepair(address: string, uid: string): Promise<'ok' | 'taken'> {
  if ((await claimEmail(address, uid)) === 'ok') return 'ok';
  const owner = (await db().collection('emailIndex').doc(address).get()).get('uid') as string | undefined;
  if (!owner || owner === uid) {
    await db().collection('emailIndex').doc(address).set({ uid });
    return 'ok';
  }
  try {
    await auth().getUser(owner);
    return 'taken';
  } catch (err) {
    if (authCode(err) !== 'auth/user-not-found') throw err;
  }
  await db().collection('emailIndex').doc(address).set({ uid });
  return 'ok';
}

function initialProfile(data: Record<string, unknown>): Record<string, unknown> {
  const record = readProfileRecord(data);
  return {
    ...record,
    scholarshipCount: typeof data.scholarshipCount === 'number' ? data.scholarshipCount : 0,
    consent: data.consent ?? null,
    deletion: data.deletion ?? null,
    pendingEmail: data.pendingEmail ?? null,
    passwordReset: data.passwordReset ?? null,
    createdAt: FieldValue.serverTimestamp(),
  };
}

/** Creates the profile on first use and keeps the sign-in email as the primary address. */
async function ensureUser(uid: string): Promise<Record<string, unknown>> {
  const authUser = await auth().getUser(uid);
  const login = normalizeEmail(authUser.email ?? '');
  if (!login) throw new HttpError(400, 'Your account has no email address.');

  const ref = userDoc(uid);
  const snap = await ref.get();
  const data = snap.data() ?? {};
  const creating = !snap.exists || !data.createdAt;

  const kept: SavedEmail[] = [];
  for (const email of reconcile(readEmails(data.emails), login)) {
    if ((await claimOrRepair(email.address, uid)) === 'taken') {
      if (email.primary) throw new HttpError(409, 'That email is already in use.');
      continue;
    }
    kept.push(email);
  }
  const emails = reconcile(kept, login);
  const pending = readPending(data.pendingEmail);
  // A confirmation that already landed on the account should not keep asking for a code.
  const stalePending = !!pending && emails.some((email) => email.address === pending.address);
  const stored = typeof data.email === 'string' ? normalizeEmail(data.email) : null;
  if (creating || stored !== login || !sameEmails(readEmails(data.emails), emails) || stalePending) {
    const patch: Record<string, unknown> = {};
    if (creating) Object.assign(patch, initialProfile(data));
    patch.email = login;
    patch.emails = emails;
    // Applied after initialProfile so a first-time create cannot copy a stale code back in.
    if (stalePending) patch.pendingEmail = null;
    await ref.set(patch, { merge: true });
  }
  return (await ref.get()).data() ?? {};
}

async function audit(uid: string, action: string, after?: Record<string, unknown> | null, before?: Record<string, unknown> | null) {
  await writeAudit({
    actor: { type: 'student', id: uid },
    subjectUid: uid,
    action,
    resource: `users/${uid}`,
    before: before ?? null,
    after: after ?? null,
  });
}

export async function getProfile(uid: string): Promise<ProfileDto> {
  return toDto(uid, await ensureUser(uid));
}

export async function updateProfile(uid: string, patch: ProfilePatch): Promise<ProfileDto> {
  const data = await ensureUser(uid);
  const current = readProfileRecord(data);
  const result = applyProfilePatch(current, patch);
  if (!result.ok) throw new HttpError(400, result.error);
  if (result.changed.length) {
    await userDoc(uid).set(result.value, { merge: true });
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const key of result.changed) {
      before[key] = current[key as keyof ProfileRecord];
      after[key] = result.value[key as keyof ProfileRecord];
    }
    await audit(uid, 'user.profile.updated', after, before);
  }
  return getProfile(uid);
}

async function passwordMatches(email: string, password: string): Promise<boolean> {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const apiKey = process.env.FIREBASE_WEB_API_KEY;
  if (!host && !apiKey) throw new HttpError(500, 'Password check is not configured.');
  const url = host
    ? `http://${host}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`
    : `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
  } catch {
    throw new HttpError(503, 'Could not check your password. Try again.');
  }
  await response.text().catch(() => undefined);
  if (response.ok) return true;
  if (response.status === 400 || response.status === 401) return false;
  throw new HttpError(503, 'Could not check your password. Try again.');
}

async function requireCurrentPassword(uid: string, password: string) {
  if (!password) throw new HttpError(400, 'Enter your current password.');
  const user = await auth().getUser(uid);
  if (!user.email) throw new HttpError(400, 'Your account has no sign-in email.');
  const ok = await passwordMatches(user.email, password);
  if (!ok) throw new HttpError(403, 'Current password is incorrect.');
}

async function assertEmailAvailable(address: string, uid: string) {
  const indexed = await db().collection('emailIndex').doc(address).get();
  if (indexed.exists && indexed.get('uid') !== uid) throw new HttpError(409, 'That email is already in use.');
  try {
    const other = await auth().getUserByEmail(address);
    if (other.uid !== uid) throw new HttpError(409, 'That email is already in use.');
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (authCode(err) !== 'auth/user-not-found') throw err;
  }
}

async function sendPending(uid: string, pending: { address: string; replaces: string | null }) {
  const code = newCode();
  const stored: PendingEmail = {
    address: pending.address,
    replaces: pending.replaces,
    codeHash: hashCode(uid, 'email', code),
    expiresAtMs: Date.now() + LIMITS.codeTtlMs,
    attempts: 0,
    sentAtMs: Date.now(),
  };
  await userDoc(uid).set({ pendingEmail: stored }, { merge: true });
  try {
    await sendMail({
      to: pending.address,
      subject: 'Confirm your ScholarScope email',
      text: [
        `Use this code to confirm ${pending.address} on ScholarScope:`,
        '',
        code,
        '',
        'The code expires in 15 minutes. If you did not ask for this, you can ignore this email.',
      ].join('\n'),
    });
  } catch (err) {
    await userDoc(uid).set({ pendingEmail: null }, { merge: true });
    log.error('profile_email_failed', { error: errorMessage(err) });
    throw new HttpError(503, 'Could not send the email. Try again.');
  }
}

function assertNoPending(data: Record<string, unknown>) {
  if (readPending(data.pendingEmail)) {
    throw new HttpError(409, 'Confirm or cancel the email code we already sent.');
  }
}

export async function beginAddEmail(uid: string, rawAddress: string): Promise<ProfileDto> {
  const address = requireEmail(rawAddress);
  const data = await ensureUser(uid);
  const emails = readEmails(data.emails);
  if (emails.some((email) => email.address === address)) throw new HttpError(400, 'That email is already on your profile.');
  if (emails.length >= LIMITS.maxEmails) {
    throw new HttpError(400, `You can save up to ${LIMITS.maxEmails} email addresses.`);
  }
  assertNoPending(data);
  await assertEmailAvailable(address, uid);
  await sendPending(uid, { address, replaces: null });
  return getProfile(uid);
}

export async function beginChangeEmail(
  uid: string,
  rawCurrent: string,
  rawNext: string,
  currentPassword?: string,
): Promise<ProfileDto> {
  const currentAddress = requireEmail(rawCurrent);
  const nextAddress = requireEmail(rawNext);
  if (currentAddress === nextAddress) throw new HttpError(400, "That's already your email.");
  const data = await ensureUser(uid);
  const emails = readEmails(data.emails);
  const current = emails.find((email) => email.address === currentAddress);
  if (!current) throw new HttpError(400, 'That email is not on your profile.');
  if (emails.some((email) => email.address === nextAddress)) throw new HttpError(400, 'That email is already on your profile.');
  assertNoPending(data);
  if (current.primary) await requireCurrentPassword(uid, currentPassword ?? '');
  await assertEmailAvailable(nextAddress, uid);
  await sendPending(uid, { address: nextAddress, replaces: currentAddress });
  return getProfile(uid);
}

export async function verifyPendingEmail(uid: string, code: string): Promise<ProfileDto> {
  if (!/^\d{6}$/.test(code)) throw new HttpError(400, 'Enter the 6-digit code from the email.');
  const data = await ensureUser(uid);
  const ref = userDoc(uid);
  const pending = readPending(data.pendingEmail);
  if (!pending) throw new HttpError(400, 'There is no email waiting to be confirmed.');
  if (Date.now() > pending.expiresAtMs || pending.attempts >= LIMITS.maxCodeAttempts) {
    await ref.set({ pendingEmail: null }, { merge: true });
    throw new HttpError(400, 'That code is no longer valid. Send a new one.');
  }
  if (!hashesEqual(hashCode(uid, 'email', code), pending.codeHash)) {
    await ref.set({ pendingEmail: { ...pending, attempts: pending.attempts + 1 } }, { merge: true });
    throw new HttpError(400, 'That code is not valid.');
  }

  const emails = readEmails(data.emails);
  if (!pending.replaces && emails.length >= LIMITS.maxEmails) {
    await ref.set({ pendingEmail: null }, { merge: true });
    throw new HttpError(400, `You can save up to ${LIMITS.maxEmails} email addresses.`);
  }
  try {
    await assertEmailAvailable(pending.address, uid);
  } catch (err) {
    await ref.set({ pendingEmail: null }, { merge: true });
    throw err;
  }
  if ((await claimEmail(pending.address, uid)) === 'taken') {
    await ref.set({ pendingEmail: null }, { merge: true });
    throw new HttpError(409, 'That email is already in use.');
  }

  let next = emails;
  let action = 'user.email.added';
  if (pending.replaces) {
    const old = emails.find((email) => email.address === pending.replaces);
    if (!old) {
      await ref.set({ pendingEmail: null }, { merge: true });
      await releaseEmail(pending.address, uid);
      throw new HttpError(400, 'That email is no longer on your profile.');
    }
    if (old.primary) {
      try {
        await auth().updateUser(uid, { email: pending.address, emailVerified: true });
      } catch (err) {
        await releaseEmail(pending.address, uid);
        if (authCode(err) === 'auth/email-already-exists') throw new HttpError(409, 'That email is already in use.');
        throw err;
      }
    }
    next = emails.map((email) =>
      email.address === old.address ? { address: pending.address, verified: true, primary: old.primary } : email,
    );
    if (old.address !== pending.address) await releaseEmail(old.address, uid);
    action = old.primary ? 'user.email.primary_changed' : 'user.email.changed';
  } else {
    next = [...emails, { address: pending.address, verified: true, primary: false }];
  }

  const login = next.find((email) => email.primary)?.address ?? pending.address;
  await ref.set({ emails: next, email: login, pendingEmail: null }, { merge: true });
  await audit(uid, action, { email: pending.address });
  return getProfile(uid);
}

export async function resendPendingEmail(uid: string): Promise<ProfileDto> {
  const data = await ensureUser(uid);
  const pending = readPending(data.pendingEmail);
  if (!pending) throw new HttpError(400, 'There is no email waiting to be confirmed.');
  if (Date.now() - pending.sentAtMs < LIMITS.resendCooldownMs) {
    throw new HttpError(429, 'Wait a minute before sending another code.');
  }
  await assertEmailAvailable(pending.address, uid);
  await sendPending(uid, { address: pending.address, replaces: pending.replaces });
  return getProfile(uid);
}

export async function cancelPendingEmail(uid: string): Promise<ProfileDto> {
  await ensureUser(uid);
  await userDoc(uid).set({ pendingEmail: null }, { merge: true });
  return getProfile(uid);
}

export async function removeEmailAddress(uid: string, rawAddress: string): Promise<ProfileDto> {
  const address = requireEmail(rawAddress);
  const data = await ensureUser(uid);
  const emails = readEmails(data.emails);
  const block = removalBlock(emails, address);
  if (block) throw new HttpError(400, block);
  await releaseEmail(address, uid);
  const pending = readPending(data.pendingEmail);
  const clearPending = pending && (pending.address === address || pending.replaces === address);
  await userDoc(uid).set(
    { emails: emails.filter((email) => email.address !== address), ...(clearPending ? { pendingEmail: null } : {}) },
    { merge: true },
  );
  await audit(uid, 'user.email.removed', { email: address });
  return getProfile(uid);
}

export async function setPrimaryEmail(uid: string, rawAddress: string, currentPassword: string): Promise<ProfileDto> {
  await requireCurrentPassword(uid, currentPassword);
  const address = requireEmail(rawAddress);
  const data = await ensureUser(uid);
  const emails = readEmails(data.emails);
  const block = primaryBlock(emails, address);
  if (block) throw new HttpError(400, block);
  try {
    await auth().updateUser(uid, { email: address, emailVerified: true });
  } catch (err) {
    if (authCode(err) === 'auth/email-already-exists') throw new HttpError(409, 'That email is already in use.');
    throw err;
  }
  const next = emails.map((email) => ({ ...email, primary: email.address === address }));
  await userDoc(uid).set({ emails: next, email: address }, { merge: true });
  await audit(uid, 'user.email.primary_changed', { email: address });
  return getProfile(uid);
}

export async function changePassword(uid: string, currentPassword: string, newPassword: string): Promise<ProfileDto> {
  checkPasswordLength(newPassword);
  await requireCurrentPassword(uid, currentPassword);
  if (newPassword === currentPassword) throw new HttpError(400, 'Choose a different password.');
  await auth().updateUser(uid, { password: newPassword });
  await auth().revokeRefreshTokens(uid);
  await userDoc(uid).set({ passwordReset: null }, { merge: true });
  await audit(uid, 'user.password.changed');
  return getProfile(uid);
}

export async function requestAccountDeletion(uid: string, currentPassword: string): Promise<ProfileDto> {
  await requireCurrentPassword(uid, currentPassword);
  await ensureUser(uid);
  await userDoc(uid).set({ deletion: { requestedAt: new Date(), completedAt: null } }, { merge: true });
  await audit(uid, 'user.deletion.requested');
  return getProfile(uid);
}

async function findUidByEmail(address: string): Promise<string | null> {
  try {
    return (await auth().getUserByEmail(address)).uid;
  } catch (err) {
    if (authCode(err) !== 'auth/user-not-found') throw err;
  }
  const indexed = await db().collection('emailIndex').doc(address).get();
  const owner = indexed.exists ? (indexed.get('uid') as string | undefined) : undefined;
  if (!owner) return null;
  try {
    await auth().getUser(owner);
    return owner;
  } catch (err) {
    if (authCode(err) !== 'auth/user-not-found') throw err;
    return null;
  }
}

/** Always safe to call for an unknown address: callers return the same success response either way. */
export async function requestPasswordReset(rawEmail: string): Promise<void> {
  const address = normalizeEmail(rawEmail);
  if (!address) return;
  const uid = await findUidByEmail(address);
  if (!uid) return;
  if ((await claimOrRepair(address, uid)) === 'taken') return;

  const data = (await userDoc(uid).get()).data() ?? {};
  const emails = readEmails(data.emails);
  const known = emails.find((email) => email.address === address);
  const login = typeof data.email === 'string' ? normalizeEmail(data.email) : null;
  const authEmail = normalizeEmail((await auth().getUser(uid)).email ?? '');
  // Only a confirmed address, or the sign-in address, can receive a reset code.
  const allowed = (known && known.verified) || login === address || authEmail === address;
  if (!allowed) return;

  const existing = readReset(data.passwordReset);
  if (existing && Date.now() - existing.sentAtMs < LIMITS.resendCooldownMs) return;

  const code = newCode();
  await userDoc(uid).set(
    {
      passwordReset: {
        codeHash: hashCode(uid, 'password-reset', code),
        expiresAtMs: Date.now() + LIMITS.codeTtlMs,
        attempts: 0,
        sentAtMs: Date.now(),
      },
    },
    { merge: true },
  );
  try {
    await sendMail({
      to: address,
      subject: 'Reset your ScholarScope password',
      text: [
        'Use this code to set a new ScholarScope password:',
        '',
        code,
        '',
        'The code expires in 15 minutes. If you did not ask for this, you can ignore this email.',
      ].join('\n'),
    });
  } catch (err) {
    await userDoc(uid).set({ passwordReset: null }, { merge: true });
    log.error('password_reset_email_failed', { error: errorMessage(err) });
    throw new HttpError(503, 'Could not send the email. Try again.');
  }
}

export async function confirmPasswordReset(rawEmail: string, code: string, newPassword: string): Promise<string> {
  checkPasswordLength(newPassword);
  const address = normalizeEmail(rawEmail);
  if (!address || !/^\d{6}$/.test(code)) throw new HttpError(400, 'That code is not valid.');
  const uid = await findUidByEmail(address);
  if (!uid) throw new HttpError(400, 'That code is not valid.');
  const ref = userDoc(uid);
  const data = (await ref.get()).data() ?? {};
  const reset = readReset(data.passwordReset);
  if (!reset || Date.now() > reset.expiresAtMs) throw new HttpError(400, 'That code is not valid. Request a new one.');
  if (reset.attempts >= LIMITS.maxCodeAttempts) {
    await ref.set({ passwordReset: null }, { merge: true });
    throw new HttpError(400, 'That code is no longer valid. Request a new one.');
  }
  if (!hashesEqual(hashCode(uid, 'password-reset', code), reset.codeHash)) {
    await ref.set({ passwordReset: { ...reset, attempts: reset.attempts + 1 } }, { merge: true });
    throw new HttpError(400, 'That code is not valid.');
  }
  await auth().updateUser(uid, { password: newPassword });
  await auth().revokeRefreshTokens(uid);
  await ref.set({ passwordReset: null }, { merge: true });
  await audit(uid, 'user.password.reset');
  // Sign-in uses the Auth email, which may differ from the address that received the code.
  return normalizeEmail((await auth().getUser(uid)).email ?? '') ?? address;
}
