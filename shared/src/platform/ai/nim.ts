import { getSecret } from '../secrets/index';

/**
 * NVIDIA NIM hosted API (OpenAI-compatible). Free Developer Program access is for prototyping:
 * send synthetic materials only until the NVIDIA data terms are reviewed.
 */
const baseUrl = () => process.env.NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1';

async function call<T>(path: string, body: unknown): Promise<T> {
  const key = await getSecret('nvidia-api-key');
  if (!key) throw new Error('NVIDIA API key is not set (add NVIDIA_API_KEY to .env.secrets)');
  const res = await fetch(`${baseUrl()}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 429) throw new Error('NIM rate limited (429); the queue will retry');
  if (!res.ok) throw new Error(`NIM ${path} failed with HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function nimEmbed(texts: string[], inputType: 'passage' | 'query'): Promise<number[][]> {
  const r = await call<{ data: { embedding: number[] }[] }>('/embeddings', {
    model: process.env.NIM_EMBED_MODEL || 'nvidia/nv-embedqa-e5-v5',
    input: texts,
    input_type: inputType,
  });
  return r.data.map((d) => d.embedding);
}

export async function nimChat(system: string, user: string): Promise<string> {
  const r = await call<{ choices: { message: { content: string } }[] }>('/chat/completions', {
    model: process.env.NIM_CHAT_MODEL || 'nvidia/llama-3.3-nemotron-super-49b-v1',
    temperature: 0,
    max_tokens: 400,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  return r.choices[0]?.message.content ?? '';
}
