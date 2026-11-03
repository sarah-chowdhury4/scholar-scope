import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  db,
  userDoc,
  storage,
  buckets,
  getAppConfig,
  generateJson,
  geminiModel,
  findQuote,
  quoteHash,
  parseSourceDeadline,
  updateJob,
  log,
  type Citation,
  type JobMessage,
  type Verification,
} from '@scholarscope/shared';
import { extractText } from '../text/extractText';
import { EXTRACT_PROMPT_VERSION, EXTRACT_SCHEMA, EXTRACT_SYSTEM, EXTRACT_TASK, type ExtractedItem } from '../prompts/extract';
import { recomputeCounts, upsertRequirement } from '../requirements';

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
  const { data: result, inputTokens, outputTokens } = await generateJson<{ items: ExtractedItem[] }>({
    system: EXTRACT_SYSTEM,
    task: EXTRACT_TASK,
    documentText,
    schema: EXTRACT_SCHEMA,
  });
  await recordTokens(job.uid, inputTokens, outputTokens);
  await updateJob(job.uid, job.jobId, { progress: 75 });

  // 4. Verify each quote against the stored text, then version the requirements
  const scholarshipIds = (source.get('scholarshipIds') as string[] | undefined) ?? [];
  const stats = { created: 0, changed: 0, unchanged: 0, unverified: 0 };
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
    let deadline: ReturnType<typeof parseSourceDeadline> = null;
    if (item.kind === 'deadline' && item.deadlineIso) {
      deadline = parseSourceDeadline(item.deadlineIso, item.timezone || 'UTC');
      if (deadline) {
        value.deadline = { utc: Timestamp.fromDate(deadline.utc), sourceTimezone: item.timezone || 'UTC', sourceText: match?.quote ?? item.quote, allDay: deadline.allDay };
      }
    }
    if (item.wordLimit) value.wordLimit = { max: item.wordLimit, unit: 'words' };
    if (item.minGpa) value.minGpa = item.minGpa;

    for (const sid of scholarshipIds) {
      const schRef = userDoc(job.uid).collection('scholarships').doc(sid);
      const outcome = await upsertRequirement(schRef, {
        kind: item.kind,
        label: item.label,
        value,
        citation,
        verification,
        origin: source.get('kind') === 'url' ? 'refetch' : 'extraction',
        extraction: { model: geminiModel(), promptVersion: EXTRACT_PROMPT_VERSION, confidence: item.confidence, jobId: job.jobId, ocrDerived: text.ocrUsed },
        createdBy: { type: 'ai', id: geminiModel() },
      });
      stats[outcome]++;

      // A cited deadline replaces the student-typed one on the record (FR-1.5, FR-4.2)
      if (deadline && citation) {
        await schRef.update({
          deadline: { utc: Timestamp.fromDate(deadline.utc), sourceTimezone: item.timezone || 'UTC', sourceText: citation.quote, allDay: deadline.allDay, requirementId: null, verification },
        });
      }
    }
  }

  for (const sid of scholarshipIds) await recomputeCounts(userDoc(job.uid).collection('scholarships').doc(sid));

  await versionRef.update({
    extraction: { status: 'done', jobId: job.jobId, itemsFound: result.items?.length ?? 0, ...stats, finishedAt: FieldValue.serverTimestamp() },
  });
  await updateJob(job.uid, job.jobId, { status: 'done', progress: 100 });
  log.info('extraction_done', { target: job.target, ...stats, ocr: text.ocrUsed, pages: text.pageCount });
}

async function consumePages(uid: string, pages: number, limit: number): Promise<boolean> {
  const ref = userDoc(uid).collection('usage').doc(new Date().toISOString().slice(0, 10));
  return db().runTransaction(async (tx) => {
    const used = ((await tx.get(ref)).get('extractedPages') as number | undefined) ?? 0;
    if (used + pages > limit) return false;
    tx.set(ref, { extractedPages: FieldValue.increment(pages) }, { merge: true });
    return true;
  });
}

async function recordTokens(uid: string, input?: number, output?: number) {
  const ref = userDoc(uid).collection('usage').doc(new Date().toISOString().slice(0, 10));
  await ref.set(
    { geminiInputTokens: FieldValue.increment(input ?? 0), geminiOutputTokens: FieldValue.increment(output ?? 0) },
    { merge: true },
  );
}
