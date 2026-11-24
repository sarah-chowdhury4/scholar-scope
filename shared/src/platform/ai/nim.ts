import { getSecret } from '../secrets/index';
import { geminiEmbed, geminiText } from './gemini';

/**
 * NVIDIA NIM hosted API (OpenAI-compatible). Free Developer Program access is for prototyping:
 * send synthetic materials only until the NVIDIA data terms are reviewed.
 *
 * NIM is optional per developer. With NIM_ENABLED=false (for anyone without an NVIDIA key),
 * nimEmbed and nimChat run on Gemini instead, so the same job code works on every machine.
 * Embeddings from the two providers have different sizes and must not be mixed: keep one
 * setting per environment, and re-embed stored items after switching.
 */
export function nimEnabled(): boolean {
  return process.env.NIM_ENABLED !== 'false';
}

const baseUrl = () => process.env.NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1';

/**
 * Default models, checked against the NVIDIA catalog on 2026-11-24. NVIDIA retires hosted models (the earlier
 * nemotron-super-49b-v1 and nv-embedqa-e5-v5 now answer HTTP 410), so both can be changed in .env without a code
 * change: NIM_CHAT_MODEL and NIM_EMBED_MODEL. The embedding model returns 2048 numbers per text.
 */
export const NIM_DEFAULT_CHAT_MODEL = 'nvidia/nemotron-3.5-lightning-30b-a3b';
export const NIM_DEFAULT_EMBED_MODEL = 'nvidia/nemotron-3.5-embed-1b';

async function call<T>(path: string, body: unknown): Promise<T> {
  const key = await getSecret('nvidia-api-key');
  if (!key) throw new Error('NVIDIA API key is not set (add NVIDIA_API_KEY to .env.secrets, or set NIM_ENABLED=false in .env to use Gemini)');
  const res = await fetch(`${baseUrl()}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 429) throw new Error('NIM rate limited (429); the queue will retry');
  if (res.status === 410) throw new Error(`NIM ${path}: the model was retired by NVIDIA (HTTP 410); set NIM_CHAT_MODEL / NIM_EMBED_MODEL in .env to a current one`);
  if (!res.ok) throw new Error(`NIM ${path} failed with HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function nimEmbed(texts: string[], inputType: 'passage' | 'query'): Promise<number[][]> {
  if (!nimEnabled()) return geminiEmbed(texts, inputType === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT');
  const r = await call<{ data: { embedding: number[] }[] }>('/embeddings', {
    model: process.env.NIM_EMBED_MODEL || NIM_DEFAULT_EMBED_MODEL,
    input: texts,
    input_type: inputType,
  });
  return r.data.map((d) => d.embedding);
}

export async function nimChat(system: string, user: string): Promise<string> {
  if (!nimEnabled()) return geminiText(system, user, 400);
  const r = await call<{ choices: { message: { content: string } }[] }>('/chat/completions', {
    model: process.env.NIM_CHAT_MODEL || NIM_DEFAULT_CHAT_MODEL,
    temperature: 0,
    max_tokens: 400,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  return r.choices[0]?.message.content ?? '';
}
