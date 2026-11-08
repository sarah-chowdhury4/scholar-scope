/**
 * Seed the LOCAL emulators with scholarship records from a CSV export of the dataset sheet.
 *
 *   docker compose exec api npm run seed -- seed/dataset.csv demo@student.test 'a-long-demo-password'
 *
 * CSV columns (header row required):
 *   scholarship_id,organization,scholarship_name,current_deadline,min_gpa,essay_prompt,verified_source_url,version_flag
 *
 * Seeded values have NO citation: they show as "unverified" until a real guideline document is
 * uploaded and extracted ("no source, no claim").
 */
import { readFileSync } from 'node:fs';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { assertSafeEnvironment, auth, db, userDoc, ensureAppConfig, getAppConfig, claimEmail, normalizeEmail } from '@scholarscope/shared';

if (process.env.APP_ENV !== 'local') {
  console.error('The seed script only runs against the local emulators (APP_ENV=local).');
  process.exit(1);
}
assertSafeEnvironment();

const [csvPath, email, password] = process.argv.slice(2);
if (!csvPath || !email || !password) {
  console.error('Usage: npm run seed -- <csv> <demo-email> <demo-password>');
  process.exit(1);
}

type Row = Record<string, string>;

function parseCsv(text: string): Row[] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  const [header, ...body] = rows;
  if (!header) return [];
  return body.map((cells) => Object.fromEntries(header.map((h, i) => [h.trim(), (cells[i] ?? '').trim()])));
}

const rows = parseCsv(readFileSync(csvPath, 'utf8'));
await ensureAppConfig();
const { maxScholarshipsPerStudent } = await getAppConfig({ fresh: true });

// Demo student in the Auth emulator
let uid: string;
try {
  uid = (await auth().getUserByEmail(email)).uid;
} catch {
  uid = (await auth().createUser({ email, password, emailVerified: true })).uid;
}
const loginEmail = normalizeEmail(email) ?? email.trim().toLowerCase();
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

let created = 0;
for (const r of rows.slice(0, maxScholarshipsPerStudent)) {
  const id = r.scholarship_id;
  if (!id || !/^SCH-\d{3}$/.test(id)) {
    console.warn(`Skipping row without a valid scholarship_id: ${JSON.stringify(r)}`);
    continue;
  }
  const [datasetVersion, datasetStatus] = (r.version_flag ?? '').split(/\s*-\s*/, 2);
  const deadline = /^\d{4}-\d{2}-\d{2}$/.test(r.current_deadline ?? '') ? r.current_deadline! : null;
  const minGpa = Number(r.min_gpa);

  await db().collection('scholarshipCatalog').doc(id).set({
    organization: r.organization,
    name: r.scholarship_name,
    deadline,
    minGpa: Number.isFinite(minGpa) ? minGpa : null,
    promptOrMaterials: r.essay_prompt,
    sourceUrl: r.verified_source_url,
    datasetVersion: datasetVersion ?? null,
    datasetStatus: datasetStatus ?? null,
    importedAt: FieldValue.serverTimestamp(),
  });

  const sch = userDoc(uid).collection('scholarships').doc(id.toLowerCase());
  const seedVersion = (value: Record<string, unknown>) => ({
    versionNo: 1,
    value,
    citation: null,
    origin: 'seed',
    extraction: null,
    review: null,
    correctsVersionId: null,
    previousVersionId: null,
    createdBy: { type: 'system', id: 'seed' },
    createdAt: FieldValue.serverTimestamp(),
  });
  const requirements: { kind: string; label: string; value: Record<string, unknown> }[] = [];
  if (deadline) requirements.push({ kind: 'deadline', label: 'Application deadline', value: { deadline: { sourceText: deadline, allDay: true } } });
  if (Number.isFinite(minGpa)) requirements.push({ kind: 'eligibility', label: `Minimum GPA ${minGpa.toFixed(2)}`, value: { minGpa } });
  for (const part of (r.essay_prompt ?? '').split(';').map((s) => s.trim()).filter(Boolean)) {
    requirements.push({ kind: /essay|statement|letter|narrative|describe|detail|provide|submit/i.test(part) ? 'essay' : 'other', label: part.slice(0, 200), value: { text: part } });
  }

  const batch = db().batch();
  batch.set(sch, {
    name: r.scholarship_name,
    provider: r.organization,
    url: r.verified_source_url || null,
    catalogId: id,
    awardAmount: null,
    deadline: deadline
      ? { utc: Timestamp.fromDate(new Date(`${deadline}T23:59:59Z`)), sourceTimezone: 'UTC', sourceText: deadline, allDay: true, requirementId: null, verification: 'unverified' }
      : null,
    status: 'researching',
    counts: { open: requirements.length, changed: 0, unverified: requirements.length, needsReview: 0, ready: 0, total: requirements.length },
    readinessPct: 0,
    recheck: { enabled: false, lastCheckedAt: null, lastVerifiedAt: null, status: 'ok', consecutiveFailures: 0, nextCheckAt: null },
    archivedAt: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  for (const req of requirements) {
    const reqRef = sch.collection('requirements').doc();
    const verRef = reqRef.collection('versions').doc();
    batch.set(verRef, seedVersion(req.value));
    batch.set(reqRef, {
      kind: req.kind,
      label: req.label,
      currentVersionId: verRef.id,
      currentVersionNo: 1,
      current: { value: req.value, citation: null },
      verification: 'unverified',
      readiness: 'missing',
      changeFlag: null,
      needsRecheck: false,
      removedAt: null,
      matchKey: `${req.kind}:${req.label.toLowerCase().slice(0, 40)}`,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  created++;
}

const count = (await userDoc(uid).collection('scholarships').where('status', '!=', 'archived').count().get()).data().count;
await userDoc(uid).set({ scholarshipCount: count }, { merge: true });
console.log(`Seeded ${created} scholarships for ${email} (uid ${uid}).`);
process.exit(0);
