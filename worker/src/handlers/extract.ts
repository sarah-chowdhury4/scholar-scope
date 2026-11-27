import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  db,
  userDoc,
  storage,
  buckets,
  getAppConfig,
  generateJson,
  findQuote,
  quoteHash,
  deadlineFromSource,
  pickApplicationDeadline,
  deadlineRecord,
  syncAutoReadiness,
  updateJob,
  enqueueJob,
  log,
  type Citation,
  type JobMessage,
  type SourceOrigin,
  type Verification,
} from '@scholarscope/shared';
import { extractText } from '../text/extractText';
import { EXTRACT_PROMPT_VERSION, EXTRACT_SCHEMA, EXTRACT_SYSTEM, EXTRACT_TASK, forScholarship, skipKnown, type ExtractedItem } from '../prompts/extract';
import { recomputeCounts, upsertRequirement } from '../requirements';
import { consumePages, recordTokens } from '../usage';
import { createChangeAlert } from '../alerts';
import { maybeSearch } from '../discovery';

/**
 * Extract requirements from one stored source version (FR-2.2–2.4, FR-2.6).
 * Every item must quote the source; the quote is located in the stored text to build the
 * citation (page + exact span). Items whose quote can't be found are kept but "unverified".
 * target = users/{uid}/sources/{sourceId}/versions/{versionId}
 */
export async function handleExtract(job: JobMessage): Promise<void> {
  const versionRef = db().doc(job.target);
  const version = await versionRef.get();
  const sourceRef = versionRef.parent.parent!;
  const source = await sourceRef.get();
  if (!version.exists || !source.exists) throw new Error(`Missing ${job.target}`);

  const config = await getAppConfig();
  if (!config.aiEnabled) {
    await versionRef.update({ extraction: { status: 'paused', reason: config.aiPausedReason ?? 'AI paused' } });
    await updateJob(job.uid, job.jobId, { status: 'paused_ai_off' });
    log.warn('extraction_paused', { target: job.target });
    return;
  }

  await updateJob(job.uid, job.jobId, { status: 'running', progress: 10 });
  await versionRef.update({ 'extraction.status': 'running', 'extraction.jobId': job.jobId });

  // 1. Text, page by page (OCR when needed)
  const stored = version.get('stored') as { bucket: string; key: string; versionId?: string | null };
  const store = await storage();
  const data = await store.get(stored.bucket, stored.key, stored.versionId ?? undefined);
  const text = await extractText(data, version.get('mimeType'), config.maxUploadPages);

  // 2. Daily page budget per student
  const allowed = await consumePages(job.uid, text.pageCount, config.dailyPageLimit);
  if (!allowed) {
    await versionRef.update({ extraction: { status: 'paused', reason: 'Daily page limit reached; try again tomorrow' } });
    await updateJob(job.uid, job.jobId, { status: 'failed', error: 'daily_page_limit' });
    return;
  }

  const textKey = stored.key.replace(/original\.[a-z]+$/, 'text.json');
  await store.put(buckets.originals(), textKey, Buffer.from(JSON.stringify(text)), 'application/json');
  await versionRef.update({ text: { key: textKey, ocrUsed: text.ocrUsed }, pageCount: text.pageCount });
  await updateJob(job.uid, job.jobId, { progress: 40 });

  // 3. Ask Gemini (document text is data only)
  const documentText = text.pages.map((p) => `[Page ${p.page ?? 1}]\n${p.text}`).join('\n\n');
  const scholarshipIds = (source.get('scholarshipIds') as string[] | undefined) ?? [];
  const origin = (source.get('origin') as SourceOrigin | undefined) ?? 'student';
  let task = EXTRACT_TASK;
  if (origin !== 'student' && scholarshipIds[0]) {
    // A page we found (linked or by search) may cover other programmes too: keep to this scholarship.
    const sch = await userDoc(job.uid).collection('scholarships').doc(scholarshipIds[0]).get();
    task += forScholarship(String(sch.get('name') ?? ''), String(sch.get('provider') ?? ''));
    const known = await sch.ref.collection('requirements').where('removedAt', '==', null).get();
    if (!known.empty) task += skipKnown(known.docs.map((d) => String(d.get('label') ?? '')).filter(Boolean));
  }
  const { data: result, inputTokens, outputTokens, model: aiModelUsed } = await generateJson<{ items: ExtractedItem[] }>({
    system: EXTRACT_SYSTEM,
    task,
    documentText,
    schema: EXTRACT_SCHEMA,
  });
  await recordTokens(job.uid, inputTokens, outputTokens);
  await updateJob(job.uid, job.jobId, { progress: 75 });

  // 4. Verify each quote against the stored text, then version the requirements
  const stats = { created: 0, changed: 0, unchanged: 0, unverified: 0 };
  const datedItems: { label: string; deadline: NonNullable<ReturnType<typeof deadlineFromSource>>; citation: Citation; verification: Verification }[] = [];
  for (const item of result.items ?? []) {
    const match = findQuote(text.pages, item.quote);
    const citation: Citation | null = match
      ? {
          sourceId: sourceRef.id,
          sourceVersionId: versionRef.id,
          page: match.page,
          section: null,
          charStart: match.charStart,
          charEnd: match.charEnd,
          quote: match.quote.slice(0, 1000),
          quoteHash: quoteHash(match.quote),
          ocrDerived: text.ocrUsed,
        }
      : null;
    const verification: Verification = !citation
      ? 'unverified'
      : item.confidence >= config.confidenceThreshold
        ? 'verified'
        : 'needs_review';
    if (!citation) stats.unverified++;

    const value: Record<string, unknown> = { text: item.label };
    // The zone is the one the guidelines state; when they state none it stays unknown (never assumed UTC).
    let deadline: ReturnType<typeof deadlineFromSource> = null;
    if (item.kind === 'deadline' && item.deadlineIso) {
      deadline = deadlineFromSource(item.deadlineIso, item.timezone || null);
      if (deadline) value.deadline = deadlineRecord(deadline, match?.quote ?? item.quote);
    }
    if (item.wordLimit) value.wordLimit = { max: item.wordLimit, unit: 'words' };
    if (item.minGpa) value.minGpa = item.minGpa;

    for (const sid of scholarshipIds) {
      const schRef = userDoc(job.uid).collection('scholarships').doc(sid);
      const { outcome, changeId } = await upsertRequirement(schRef, {
        kind: item.kind,
        label: item.label,
        value,
        citation,
        verification,
        origin: source.get('kind') === 'url' ? 'refetch' : 'extraction',
        sourceOrigin: origin,
        extraction: { model: aiModelUsed, promptVersion: EXTRACT_PROMPT_VERSION, confidence: item.confidence, jobId: job.jobId, ocrDerived: text.ocrUsed },
        createdBy: { type: 'ai', id: aiModelUsed },
      });
      stats[outcome]++;
      if (changeId) {
        await createChangeAlert(job.uid, schRef, changeId, item.label);
        await enqueueJob(job.uid, 'diff', schRef.collection('changes').doc(changeId).path);
      }
    }
    if (deadline && citation) datedItems.push({ label: item.label, deadline, citation, verification });
  }

  // A cited application deadline replaces the student-typed one on the record (FR-1.5, FR-4.2). Other dates on
  // the page (finalist steps, award letters, results) stay as requirements but never become "the" deadline.
  // Pages we found ourselves only fill in a deadline that no source has given yet.
  const appDeadline = pickApplicationDeadline(datedItems);
  if (appDeadline) {
    for (const sid of scholarshipIds) {
      const schRef = userDoc(job.uid).collection('scholarships').doc(sid);
      if (origin !== 'student') {
        const current = (await schRef.get()).get('deadline');
        if (current && current.verification && current.verification !== 'unverified') continue;
      }
      await schRef.update({
        deadline: { ...deadlineRecord(appDeadline.deadline, appDeadline.citation.quote), requirementId: null, verification: appDeadline.verification },
      });
    }
  }

  for (const sid of scholarshipIds) await recomputeCounts(userDoc(job.uid).collection('scholarships').doc(sid));
  // New or changed rules (a minimum GPA, a transcript) are judged against the student's documents right away.
  await syncAutoReadiness(job.uid, scholarshipIds);

  await versionRef.update({
    extraction: { status: 'done', jobId: job.jobId, itemsFound: result.items?.length ?? 0, ...stats, finishedAt: FieldValue.serverTimestamp() },
  });
  await updateJob(job.uid, job.jobId, { status: 'done', progress: 100 });
  // Every page read and still few requirements: look for the official pages on the web (once).
  await maybeSearch(job.uid, scholarshipIds);
  log.info('extraction_done', { target: job.target, ...stats, ocr: text.ocrUsed, pages: text.pageCount });
}

