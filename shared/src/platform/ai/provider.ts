import { geminiJson, geminiModel, isBusyError, isQuotaError } from './gemini';
import { nimJson, nimJsonModel } from './nim';
import { log } from '../../log';

/**
 * Which AI answers the accuracy-critical jobs (reading requirements, document checks, change summaries, drafts):
 *   AI_PROVIDER=gemini -> Gemini only (the default).
 *   AI_PROVIDER=nim    -> NVIDIA NIM only. Needs NVIDIA_API_KEY; Gemini is not called at all.
 *   AI_PROVIDER=auto   -> Gemini first; when it is busy (503/429) or out of quota, NIM answers instead.
 * Searching the web for official pages uses Google Search through Gemini, so it is skipped with AI_PROVIDER=nim.
 * Every job sends text only (scans are OCR'd locally), so both providers see the same input.
 */
export type AiProvider = 'gemini' | 'nim' | 'auto';

export function aiProvider(): AiProvider {
  const value = (process.env.AI_PROVIDER || 'gemini').trim().toLowerCase();
  return value === 'nim' || value === 'auto' ? value : 'gemini';
}

/** Model name recorded with AI results (extractions, checks, drafts), so each says what produced it. */
export function aiModel(): string {
  const provider = aiProvider();
  if (provider === 'nim') return nimJsonModel();
  if (provider === 'auto') return `${process.env.GEMINI_MODEL || 'gemini'} (or ${nimJsonModel()})`;
  return geminiModel();
}

type JsonRequest = {
  system: string;
  documentText: string;
  task: string;
  schema: Record<string, unknown>;
  /** NIM only: false skips its reasoning step (long writing such as essay drafts). Gemini ignores it. */
  reasoning?: boolean;
};
type JsonAnswer<T> = { data: T; inputTokens?: number; outputTokens?: number; model: string };

/**
 * Ask the configured AI for JSON matching `schema`. Document text is passed as data inside a delimited block,
 * and the system instruction tells the model to ignore any instructions inside it (NFR-1.6).
 */
export async function generateJson<T>(options: JsonRequest): Promise<JsonAnswer<T>> {
  const provider = aiProvider();
  if (provider === 'nim') return { ...(await nimJson<T>(options)), model: nimJsonModel() };
  if (provider === 'gemini') return { ...(await geminiJson<T>(options)), model: geminiModel() };
  try {
    return { ...(await geminiJson<T>(options)), model: geminiModel() };
  } catch (err) {
    if (!isBusyError(err) && !isQuotaError(err)) throw err;
    log.warn('ai_fallback_to_nim', { reason: isQuotaError(err) ? 'gemini_quota' : 'gemini_busy' });
    return { ...(await nimJson<T>(options)), model: nimJsonModel() };
  }
}
