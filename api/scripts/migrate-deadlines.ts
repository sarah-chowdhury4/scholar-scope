/**
 * One-off: move saved deadlines to the time-zone-aware shape (scholarship's own zone, date/time as written).
 * Only deadlines without a `date` field are touched; running it twice changes nothing.
 *
 *   docker compose exec api npm run migrate:deadlines            # show what would change
 *   docker compose exec api npm run migrate:deadlines -- --apply # write the changes
 *
 * Local emulators only, like the seed script.
 */
import type { DocumentReference, Timestamp } from 'firebase-admin/firestore';
import { assertSafeEnvironment, db, deadlineRecord, upgradeLegacyDeadline } from '@scholarscope/shared';

if (process.env.APP_ENV !== 'local') {
  console.error('This script only runs against the local emulators (APP_ENV=local).');
  process.exit(1);
}
assertSafeEnvironment();
const apply = process.argv.includes('--apply');

type Stored = { utc?: Timestamp; sourceTimezone?: string | null; sourceText?: string | null; allDay?: boolean; date?: string | null };

function plan(stored: Stored | undefined) {
  if (!stored?.utc) return null;
  const parts = upgradeLegacyDeadline({ ...stored, utc: stored.utc.toDate() });
  return parts ? { parts, sourceText: stored.sourceText ?? parts.date } : null;
}

const updates: { ref: DocumentReference; field: string; value: Record<string, unknown>; note: string }[] = [];

for (const sch of (await db().collectionGroup('scholarships').get()).docs) {
  const stored = sch.get('deadline') as Stored | undefined;
  const p = plan(stored);
  if (!p) continue;
  const extra = { requirementId: sch.get('deadline.requirementId') ?? null, verification: sch.get('deadline.verification') ?? 'unverified' };
  updates.push({
    ref: sch.ref,
    field: 'deadline',
    value: { ...deadlineRecord(p.parts, p.sourceText), ...extra },
    note: `${sch.get('name')}: ${stored!.utc!.toDate().toISOString()} [${stored!.sourceTimezone}] -> ${p.parts.date}${p.parts.time ? ' ' + p.parts.time : ''} [${p.parts.sourceTimezone ?? 'zone not known'}]`,
  });
}

for (const req of (await db().collectionGroup('requirements').where('kind', '==', 'deadline').get()).docs) {
  const p = plan(req.get('current.value.deadline') as Stored | undefined);
  if (!p) continue;
  updates.push({
    ref: req.ref,
    field: 'current.value.deadline',
    value: deadlineRecord(p.parts, p.sourceText),
    note: `requirement "${req.get('label')}" -> ${p.parts.date} [${p.parts.sourceTimezone ?? 'zone not known'}]`,
  });
}

for (const u of updates) console.log(`${apply ? 'update' : 'would update'}: ${u.note}`);
if (apply) {
  for (const u of updates) await u.ref.update({ [u.field]: u.value });
  console.log(`Updated ${updates.length} deadline(s).`);
} else {
  console.log(`${updates.length} deadline(s) to update. Run again with --apply to write them.`);
}
process.exit(0);
