import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@scholarscope/shared', () => ({
  getSecret: async () => '',
  log: { warn: () => undefined, info: () => undefined },
  errorMessage: (e: unknown) => String(e),
}));

const { markdownToText, readWithJina, readerEnabled } = await import('../src/net/jinaReader');

const ok = (content: string) => new Response(JSON.stringify({ code: 200, data: { title: 'Awards', content } }), { status: 200 });

describe('markdownToText', () => {
  it('keeps one line per heading and bullet but drops the Markdown syntax', () => {
    const md = '# Application Guidelines\n\nApplications close on **December 1, 2026** at 11:59 PM ET.\n\n- Essay of [500 words](https://x.org/essay) or fewer\n* One _official_ transcript\n\n![logo](https://x.org/l.png)\n---';
    expect(markdownToText(md)).toBe(
      'Application Guidelines\n\nApplications close on December 1, 2026 at 11:59 PM ET.\n\n• Essay of 500 words or fewer\n• One official transcript',
    );
  });
});

describe('readWithJina', () => {
  afterEach(() => {
    delete process.env.READER_BACKEND;
  });

  it('asks for no cache and no logging, and returns the page Markdown', async () => {
    let seen: { url: string; headers: Record<string, string> } | null = null;
    const page = await readWithJina('https://example.org/award', async (url, init) => {
      seen = { url, headers: init?.headers as Record<string, string> };
      return ok('# Award\n\nApplications close on December 1, 2026.');
    });
    expect(page).toEqual({ title: 'Awards', markdown: '# Award\n\nApplications close on December 1, 2026.' });
    expect(seen!.url).toBe('https://r.jina.ai/https://example.org/award');
    expect(seen!.headers).toMatchObject({ 'X-No-Cache': 'true', DNT: '1' });
    expect(seen!.headers['X-Robots-Txt']).toBeUndefined();
    expect(seen!.headers.Authorization).toBeUndefined();
  });

  it('returns null so the caller falls back when Jina fails or returns nothing useful', async () => {
    expect(await readWithJina('https://example.org', async () => new Response('busy', { status: 429 }))).toBeNull();
    expect(await readWithJina('https://example.org', async () => ok('  '))).toBeNull();
    expect(
      await readWithJina('https://example.org', async () => {
        throw new Error('network down');
      }),
    ).toBeNull();
  });

  it('can be switched off', () => {
    expect(readerEnabled()).toBe(true);
    process.env.READER_BACKEND = 'direct';
    expect(readerEnabled()).toBe(false);
  });
});
