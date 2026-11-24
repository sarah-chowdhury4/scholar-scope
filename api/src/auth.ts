import type { NextFunction, Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { auth, userDoc, log, errorMessage } from '@scholarscope/shared';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      uid?: string;
      email?: string;
      /** True when the signed token carries the `admin` custom claim (set only by an admin or the admin script). */
      admin?: boolean;
    }
  }
}

const IDLE_LIMIT_MS = 30 * 60 * 1000; // NFR-1.3: sessions expire after 30 min idle
const TOUCH_EVERY_MS = 60 * 1000;

/**
 * Verifies the Identity Platform / Firebase ID token on every /api route (except health).
 * All Firestore paths are then built from req.uid — never from ids in the request body —
 * so one student can never reach another student's data (FR-8.2).
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Sign in required' });

  let authTimeMs = 0;
  try {
    const decoded = await auth().verifyIdToken(token, true);
    req.uid = decoded.uid;
    req.email = decoded.email;
    req.admin = decoded.admin === true;
    authTimeMs = decoded.auth_time * 1000;
  } catch (err) {
    log.warn('auth_rejected', { reason: errorMessage(err) });
    return res.status(401).json({ error: 'Session expired, please sign in again' });
  }

  // Idle timeout, enforced server-side using users/{uid}.lastSeenAt.
  // A sign-in that happened after the last activity starts a new session.
  try {
    const ref = userDoc(req.uid);
    const snap = await ref.get();
    const lastSeen = snap.get('lastSeenAt')?.toMillis?.() as number | undefined;
    const now = Date.now();
    const freshSignIn = !lastSeen || authTimeMs > lastSeen;
    if (!freshSignIn && now - lastSeen! > IDLE_LIMIT_MS) {
      return res.status(401).json({ error: 'Signed out after 30 minutes of inactivity', code: 'idle_timeout' });
    }
    if (freshSignIn || now - lastSeen! > TOUCH_EVERY_MS) {
      await ref.set({ lastSeenAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  } catch (err) {
    return next(err);
  }
  return next();
}

/**
 * Admin-only routes. The role comes from the `admin` custom claim inside the signed ID token, so a student can't
 * grant it to themselves; the claim is set by `npm run admin -- grant <email>` or by another admin.
 * Hiding the Admin link in the web app is only a convenience: this check is what protects the routes.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.admin) return res.status(403).json({ error: 'Admins only' });
  return next();
}
