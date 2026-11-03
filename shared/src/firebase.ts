import { initializeApp, getApps, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { requireEnv } from './env';

/**
 * Locally, FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST point the Admin SDK at the
 * emulators. On Google Cloud, credentials come from the Cloud Run service account.
 */
let app: App | undefined;

function firebaseApp(): App {
  if (!app) {
    app = getApps()[0] ?? initializeApp({ projectId: requireEnv('GCLOUD_PROJECT') });
  }
  return app;
}

let firestore: Firestore | undefined;
export function db(): Firestore {
  if (!firestore) {
    firestore = getFirestore(firebaseApp());
    firestore.settings({ ignoreUndefinedProperties: true });
  }
  return firestore;
}

export function auth(): Auth {
  return getAuth(firebaseApp());
}

/** Every student-owned path starts here. Always build it from the verified token's uid. */
export const userDoc = (uid: string) => db().collection('users').doc(uid);
