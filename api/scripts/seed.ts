/**
 * Seed the LOCAL emulators from a CSV export of the dataset sheet.
 *
 *   Catalog only (what the Discover page lists):
 *     docker compose exec api npm run seed:catalog -- seed/dataset.csv
 *
 *   Catalog + a demo student with every catalog scholarship already added:
 *     docker compose exec api npm run seed -- seed/dataset.csv demo@student.test 'a-long-demo-password'
 *
 * CSV columns (header row required):
 *   scholarship_id,organization,scholarship_name,current_deadline,min_gpa,essay_prompt,verified_source_url,version_flag
 *
 * Catalog values have NO citation: anything a student adds starts as "unverified" until the real
 * guideline document is uploaded and extracted ("no source, no claim").
 */
import { readFileSync } from 'node:fs';
import { FieldValue } from 'firebase-admin/firestore';
import {
  addFromCatalog,
  assertSafeEnvironment,
  auth,
  catalogEntryFromRow,
  claimEmail,
  ensureAppConfig,
  getAppConfig,
  normalizeEmail,
  parseCsv,
  saveCatalog,
  userDoc,
  type CatalogEntry,
} from '@scholarscope/shared';

if (process.env.APP_ENV !== 'local') {
  console.error('The seed script only runs against the local emulators (APP_ENV=local).');
  process.exit(1);
}
assertSafeEnvironment();

const args = process.argv.slice(2);
const catalogOnly = args.includes('--catalog-only');
const [csvPath, email, password] = args.filter((a) => a !== '--catalog-only');
if (!csvPath || (!catalogOnly && (!email || !password))) {
  console.error('Usage: npm run seed:catalog -- <csv>   |   npm run seed -- <csv> <demo-email> <demo-password>');
  process.exit(1);
}

// 1. Catalog
const entries: CatalogEntry[] = [];
for (const row of parseCsv(readFileSync(csvPath, 'utf8'))) {
  const result = catalogEntryFromRow(row);
  if ('error' in result) console.warn(`Skipped row: ${result.error}`);
  else entries.push(result);
}
await ensureAppConfig();
await saveCatalog(entries);
console.log(`Catalog: ${entries.length} scholarships saved.`);

if (catalogOnly) process.exit(0);

// 2. Demo student in the Auth emulator, with catalog scholarships added (up to the cap)
let uid: string;
try {
  uid = (await auth().getUserByEmail(email!)).uid;
} catch {
  uid = (await auth().createUser({ email: email!, password: password!, emailVerified: true })).uid;
}
const loginEmail = normalizeEmail(email!) ?? email!.trim().toLowerCase();
const existingUser = await userDoc(uid).get();
await userDoc(uid).set(
  {
    email: loginEmail,
    ...(existingUser.get('emails')
      ? {}
      : { emails: [{ address: loginEmail, verified: true, primary: true }] }),
    timezone: existingUser.get('timezone') ?? 'UTC',
    consent: existingUser.get('consent') ?? { version: 'seed', acceptedAt: new Date() },
    notificationPrefs: existingUser.get('notificationPrefs') ?? { email: true, inApp: true },
    deletion: existingUser.get('deletion') ?? null,
    createdAt: existingUser.get('createdAt') ?? FieldValue.serverTimestamp(),
  },
  { merge: true },
);
if ((await claimEmail(loginEmail, uid)) === 'taken') {
  console.error(`Email ${loginEmail} is already indexed to another account.`);
  process.exit(1);
}

const { maxScholarshipsPerStudent } = await getAppConfig({ fresh: true });
let added = 0;
for (const e of entries) {
  const r = await addFromCatalog(uid, e.catalogId, maxScholarshipsPerStudent);
  if (r.status === 'added') added++;
  if (r.status === 'limit_reached') break;
}
console.log(`Demo student ${email} (uid ${uid}): ${added} scholarships added.`);
process.exit(0);
