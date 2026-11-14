import { FieldValue } from 'firebase-admin/firestore';
import {
  db,
  userDoc,
  storage,
  getAppConfig,
  generateJson,
  geminiModel,
  findQuote,
  readProfileRecord,
  checkDocument,
  sortFindings,
  worstSeverity,
  updateJob,
  log,
  DOCUMENT_CHECK_PROMPT_VERSION,
  type DocumentFact,
  type DocumentFacts,
  type DetectedDocumentType,
  type JobMessage,
  type PageText,
} from '@scholarscope/shared';
import { extractText } from '../text/extractText';
import { CHECK_DOCUMENT_SCHEMA, CHECK_DOCUMENT_SYSTEM, checkDocumentTask, type RawDocumentFacts } from '../prompts/checkDocument';
import { consumePages, recordTokens } from '../usage';

/**
 * AI check of a student's own file (transcript, certificate, passport…).
 * Gemini reports facts with quotes; each quote is located in the stored text before the fact is used.
 * The findings that do not depend on a scholarship are saved on the file; the scholarship page adds
 * deadline and GPA comparisons from the same facts.
 * target = users/{uid}/materials/{materialId}/versions/{versionId}
 */
export async function handleCheckDocument(job: JobMessage): Promise<void> {
  const versionRef = db().doc(job.target);
  const version = await versionRef.get();
  const materialRef = versionRef.parent.parent!;
  const material = await materialRef.get();
  if (!version.exists || !material.exists) throw new Error(`Missing ${job.target}`);

  const setCheck = async (fields: Record<string, unknown>) => {
    const check = { ...fields, versionId: versionRef.id, jobId: job.jobId, updatedAt: FieldValue.serverTimestamp() };
    await versionRef.set({ check }, { merge: true });
    // Only the file's current version speaks for the file.
    if (material.get('currentVersionId') === versionRef.id) await materialRef.set({ check }, { merge: true });
  };

  const config = await getAppConfig();
  if (!config.aiEnabled) {
    await setCheck({ status: 'paused', reason: config.aiPausedReason ?? 'AI checks are paused' });
    await updateJob(job.uid, job.jobId, { status: 'paused_ai_off' });
    return;
  }
  if (version.get('scan.status') !== 'clean') {
    await setCheck({ status: 'failed', reason: 'The file did not pass the virus check' });
    await updateJob(job.uid, job.jobId, { status: 'failed', error: 'not_clean' });
    return;
  }

  await updateJob(job.uid, job.jobId, { status: 'running', progress: 10 });
  await setCheck({ status: 'running' });

  const stored = version.get('stored') as { bucket: string; key: string; versionId?: string | null };
  const data = await (await storage()).get(stored.bucket, stored.key, stored.versionId ?? undefined);
  const text = await extractText(data, version.get('mimeType'), config.maxUploadPages);

  if (!(await consumePages(job.uid, text.pageCount, config.dailyPageLimit))) {
    await setCheck({ status: 'paused', reason: 'Daily page limit reached; the check will run when you ask again tomorrow' });
    await updateJob(job.uid, job.jobId, { status: 'failed', error: 'daily_page_limit' });
    return;
  }
  await updateJob(job.uid, job.jobId, { progress: 40 });

  const declaredType = String(material.get('type') ?? 'other');
  const documentText = text.pages.map((p) => `[Page ${p.page ?? 1}]\n${p.text}`).join('\n\n');
  const readable = documentText.replace(/\[Page \d+\]/g, '').replace(/\s+/g, '').length;

  let facts: DocumentFacts;
  if (readable < 20) {
    facts = emptyFacts(true);
  } else {
    const { data: raw, inputTokens, outputTokens } = await generateJson<RawDocumentFacts>({
      system: CHECK_DOCUMENT_SYSTEM,
      task: checkDocumentTask(declaredType),
      documentText,
      schema: CHECK_DOCUMENT_SCHEMA,
    });
    await recordTokens(job.uid, inputTokens, outputTokens);
    facts = verifyFacts(raw, text.pages);
  }
  await updateJob(job.uid, job.jobId, { progress: 80 });

  const profile = readProfileRecord((await userDoc(job.uid).get()).data());
  const findings = sortFindings(checkDocument(facts, { declaredType, profileName: profile.displayName }));

  await setCheck({
    status: 'done',
    facts,
    findings,
    severity: worstSeverity(findings),
    model: geminiModel(),
    promptVersion: DOCUMENT_CHECK_PROMPT_VERSION,
    ocrUsed: text.ocrUsed,
    checkedAt: FieldValue.serverTimestamp(),
  });
  await updateJob(job.uid, job.jobId, { status: 'done', progress: 100 });
  log.info('document_checked', { target: job.target, severity: worstSeverity(findings), findings: findings.length, ocr: text.ocrUsed });
}

function emptyFacts(hardToRead: boolean): DocumentFacts {
  return {
    detectedType: 'unknown',
    typeConfidence: 0,
    holderName: null,
    issuer: null,
    issueDate: null,
    expiryDate: null,
    language: null,
    gpa: null,
    unofficial: null,
    hardToRead,
  };
}

/** Keep each fact, but mark whether its quote really is in the stored text. */
export function verifyFacts(raw: RawDocumentFacts, pages: PageText[]): DocumentFacts {
  const locate = <T>(value: T, quote: string): DocumentFact<T> => {
    const match = findQuote(pages, quote, 3);
    return { value, quote: (match?.quote ?? quote).slice(0, 500), page: match?.page ?? null, found: Boolean(match) };
  };
  const str = (item: { value: string; quote: string } | null | undefined) =>
    item && typeof item.value === 'string' && item.value.trim() ? locate(item.value.trim().slice(0, 200), item.quote ?? '') : null;
  const gpa =
    raw.gpa && typeof raw.gpa.value === 'number' && Number.isFinite(raw.gpa.value)
      ? locate({ value: raw.gpa.value, scale: typeof raw.gpa.scale === 'number' ? raw.gpa.scale : null }, raw.gpa.quote ?? '')
      : null;
  const unofficial = raw.unofficial && typeof raw.unofficial.value === 'boolean' ? locate(raw.unofficial.value, raw.unofficial.quote ?? '') : null;
  return {
    detectedType: (raw.detectedType || 'unknown') as DetectedDocumentType,
    typeConfidence: Math.max(0, Math.min(1, Number(raw.typeConfidence) || 0)),
    holderName: str(raw.holderName),
    issuer: str(raw.issuer),
    issueDate: str(raw.issueDate),
    expiryDate: str(raw.expiryDate),
    language: typeof raw.language === 'string' && raw.language.trim() ? raw.language.trim().slice(0, 40) : null,
    gpa,
    // "Unofficial" with no quote is only a guess; ignore it.
    unofficial: unofficial && unofficial.value && !unofficial.found ? null : unofficial,
    hardToRead: raw.hardToRead === true,
  };
}
