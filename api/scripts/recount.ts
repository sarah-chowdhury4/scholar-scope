/**
 * One-off: recompute every scholarship's checklist counts and readiness, for example after the application deadline
 * stopped counting as a checklist item. Running it twice changes nothing.
 *
 *   docker compose exec api npm run recount
 *
 * Local emulators only, like the seed script.
 */
import { assertSafeEnvironment, countRequirements, db, sameCounts } from '@scholarscope/shared';

if (process.env.APP_ENV !== 'local') {
  console.error('This script only runs against the local emulators (APP_ENV=local).');
  process.exit(1);
}
assertSafeEnvironment();

let changed = 0;
const all = (await db().collectionGroup('scholarships').get()).docs;
for (const sch of all) {
  const reqs = await sch.ref.collection('requirements').where('removedAt', '==', null).get();
  const { counts, readinessPct } = countRequirements(reqs.docs.map((d) => d.data()));
  if (sameCounts(sch.get('counts'), counts) && sch.get('readinessPct') === readinessPct) continue;
  await sch.ref.update({ counts, readinessPct });
  changed++;
}
console.log(`Recounted ${changed} of ${all.length} scholarships.`);
