import { Router } from 'express';
import type { Timestamp } from 'firebase-admin/firestore';
import { userDoc, buildCsv, buildIcs, writeAudit, type CalendarDeadline } from '@scholarscope/shared';

/** Downloads (FR-7.3): deadlines as a calendar file, and the whole checklist as a spreadsheet. */
export const exportsRouter = Router();

const VERIFICATION_TEXT: Record<string, string> = { verified: 'From source', needs_review: 'Needs review', unverified: 'Unverified' };

async function activeScholarships(uid: string) {
  const snap = await userDoc(uid).collection('scholarships').where('status', '!=', 'archived').get();
  return snap.docs.sort((a, b) => {
    const da = (a.get('deadline.utc') as Timestamp | undefined)?.toMillis() ?? Infinity;
    const dbb = (b.get('deadline.utc') as Timestamp | undefined)?.toMillis() ?? Infinity;
    return da - dbb;
  });
}

exportsRouter.get('/calendar.ics', async (req, res) => {
  const docs = await activeScholarships(req.uid!);
  const events: CalendarDeadline[] = [];
  for (const doc of docs) {
    const due = (doc.get('deadline.utc') as Timestamp | undefined)?.toDate();
    if (!due) continue;
    const verification = String(doc.get('deadline.verification') ?? 'unverified');
    const name = String(doc.get('name') ?? 'Scholarship');
    events.push({
      uid: doc.id,
      title: `${name} due`,
      description:
        `${doc.get('provider') ?? ''}\n` +
        (verification === 'verified' ? `Deadline from the official source: "${doc.get('deadline.sourceText') ?? ''}"` : 'This deadline is not confirmed from a source yet. Check the official page.'),
      url: (doc.get('url') as string | null) ?? null,
      due,
      allDay: doc.get('deadline.allDay') === true,
    });
  }
  await writeAudit({ actor: { type: 'student', id: req.uid! }, subjectUid: req.uid!, action: 'export.calendar', resource: `users/${req.uid}` });
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="scholarship-deadlines.ics"');
  res.setHeader('Cache-Control', 'no-store');
  res.send(buildIcs(events));
});

exportsRouter.get('/checklist.csv', async (req, res) => {
  const docs = await activeScholarships(req.uid!);
  const rows: unknown[][] = [
    ['Scholarship', 'Provider', 'Status', 'Deadline (UTC)', 'Deadline badge', 'Requirement', 'Kind', 'Checklist', 'Badge', 'Source quote', 'Page', 'Page URL'],
  ];
  for (const doc of docs) {
    const due = (doc.get('deadline.utc') as Timestamp | undefined)?.toDate().toISOString() ?? '';
    const base = [doc.get('name'), doc.get('provider'), doc.get('status'), due, VERIFICATION_TEXT[String(doc.get('deadline.verification'))] ?? ''];
    const reqs = await doc.ref.collection('requirements').where('removedAt', '==', null).get();
    if (reqs.empty) rows.push([...base, '', '', '', '', '', '', doc.get('url') ?? '']);
    for (const r of reqs.docs) {
      rows.push([
        ...base,
        r.get('label'),
        r.get('kind'),
        r.get('readiness') === 'ready' ? 'Done' : r.get('readiness') === 'in_draft' ? 'In draft' : r.get('readiness') === 'changed' ? 'Changed' : 'To do',
        VERIFICATION_TEXT[String(r.get('verification'))] ?? '',
        r.get('current.citation.quote') ?? '',
        r.get('current.citation.page') ?? '',
        doc.get('url') ?? '',
      ]);
    }
  }
  await writeAudit({ actor: { type: 'student', id: req.uid! }, subjectUid: req.uid!, action: 'export.csv', resource: `users/${req.uid}` });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="scholarship-checklist.csv"');
  res.setHeader('Cache-Control', 'no-store');
  res.send(buildCsv(rows));
});
