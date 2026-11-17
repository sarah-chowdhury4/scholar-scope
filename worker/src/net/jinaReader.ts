import { getSecret, log, errorMessage } from '@scholarscope/shared';

/**
 * Jina Reader (https://r.jina.ai) turns a PUBLIC scholarship page into Markdown. It runs the page in a browser,
 * so content built by JavaScript is kept, and it reads PDFs behind a link.
 *
 * Only saved scholarship web pages go through it, after our own robots.txt and private-address checks.
 * Student uploads (transcripts, passports) never do. Requests ask Jina not to cache or log them.
 *
 *   READER_BACKEND=jina    (default) try Jina first, fall back to fetching the page ourselves
 *   READER_BACKEND=direct  never call Jina
 *   JINA_API_KEY in .env.secrets is optional; without it Jina allows 20 requests a minute.
 */
export function readerEnabled(): boolean {
  return (process.env.READER_BACKEND ?? 'jina') !== 'direct';
}

export type ReaderPage = { title: string | null; markdown: string };

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const ENDPOINT = () => process.env.JINA_READER_URL || 'https://r.jina.ai/';

export async function readWithJina(url: string, fetchImpl: FetchLike = fetch): Promise<ReaderPage | null> {
  let key = '';
  try {
    key = await getSecret('jina-api-key');
  } catch {
    // No secrets backend reachable: use the keyless tier.
  }
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-No-Cache': 'true', // re-checks must see the live page, not a 5-minute-old copy
    DNT: '1', // ask Jina not to cache or log the request
    // No X-Robots-Txt: our own robots.txt check runs before every request, and Jina's misreads an empty
    // "Disallow:" (which allows everything) as a block, as on dellscholars.org.
  };
  if (key) headers.Authorization = `Bearer ${key}`;
  try {
    const res = await fetchImpl(ENDPOINT() + url, { headers, signal: AbortSignal.timeout(45_000) });
    if (!res.ok) {
      log.warn('reader_failed', { status: res.status });
      return null;
    }
    const body = (await res.json()) as { data?: { title?: unknown; content?: unknown } };
    const markdown = typeof body.data?.content === 'string' ? body.data.content : '';
    if (markdown.replace(/\s+/g, '').length < 40) return null; // nothing useful came back
    return { title: typeof body.data?.title === 'string' && body.data.title.trim() ? body.data.title.trim() : null, markdown };
  } catch (err) {
    log.warn('reader_failed', { error: errorMessage(err) });
    return null;
  }
}

/**
 * Markdown → plain text that keeps the page's structure (one heading, list item or paragraph per line) but
 * drops the syntax, so the quotes Gemini copies match the stored text character for character.
 */
export function markdownToText(markdown: string): string {
  return markdown
    .replace(/\r\n?/g, '\n')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
    .replace(/\[([^\]]+)\]\((?:[^()]|\([^)]*\))*\)/g, '$1') // links keep their text
    .replace(/^#{1,6}[ \t]+/gm, '') // heading markers
    .replace(/^[ \t]*[-*+][ \t]+/gm, '• ') // bullets
    .replace(/^[ \t]*>[ \t]?/gm, '') // block quotes
    .replace(/(\*\*|__)(.+?)\1/g, '$2') // bold
    .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,;:!?]|$)/gm, '$1$2') // italics
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[ \t]*[-=*_]{3,}[ \t]*$/gm, '') // horizontal rules and setext underlines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
