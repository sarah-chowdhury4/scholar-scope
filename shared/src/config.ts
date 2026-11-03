import { db } from './firebase';
import type { AppConfig } from './types';

export const DEFAULT_CONFIG: AppConfig = {
  aiEnabled: true,
  aiPausedReason: null,
  maxScholarshipsPerStudent: 15,
  confidenceThreshold: 0.85,
  dailyDraftLimit: 20,
  dailyPageLimit: 100,
  maxUploadBytes: 25 * 1024 * 1024,
  maxUploadPages: 40,
  alertOffsetsDays: [14, 7, 3, 1],
};

const CACHE_MS = 30_000;
let cached: { value: AppConfig; at: number } | undefined;

/** config/app, merged over defaults. Cached briefly; the AI kill switch takes effect within 30 s. */
export async function getAppConfig(options: { fresh?: boolean } = {}): Promise<AppConfig> {
  if (!options.fresh && cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const snap = await db().doc('config/app').get();
  const value = { ...DEFAULT_CONFIG, ...(snap.data() as Partial<AppConfig> | undefined) };
  cached = { value, at: Date.now() };
  return value;
}

/** Create config/app with defaults if it does not exist (never overwrites). */
export async function ensureAppConfig(): Promise<void> {
  const ref = db().doc('config/app');
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) tx.set(ref, { ...DEFAULT_CONFIG, updatedAt: new Date(), updatedBy: { type: 'system', id: 'bootstrap' } });
  });
}
