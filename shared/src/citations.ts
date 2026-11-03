import { createHash } from 'node:crypto';

/**
 * "No source, no claim": an extracted item only gets a citation if its quote is actually
 * found in the stored text of the source. Model output alone is never trusted as a source.
 */

export type PageText = { page: number | null; text: string };

export type QuoteMatch = { page: number | null; charStart: number; charEnd: number; quote: string };

/** Lowercase, unify quotes/dashes, collapse whitespace. Keeps a map back to original offsets. */
function normalizeWithMap(input: string): { norm: string; map: number[] } {
  const out: string[] = [];
  const map: number[] = [];
  let lastWasSpace = true;
  for (let i = 0; i < input.length; i++) {
    let ch = input[i]!;
    if (/\s/.test(ch)) {
      if (lastWasSpace) continue;
      ch = ' ';
      lastWasSpace = true;
    } else {
      lastWasSpace = false;
      ch = ch
        .toLowerCase()
        .replace(/[‘’‛]/g, "'")
        .replace(/[“”‟]/g, '"')
        .replace(/[‐-―]/g, '-');
    }
    out.push(ch);
    map.push(i);
  }
  while (out.length && out[out.length - 1] === ' ') {
    out.pop();
    map.pop();
  }
  return { norm: out.join(''), map };
}

export function normalizeQuote(quote: string): string {
  return normalizeWithMap(quote).norm;
}

export function quoteHash(quote: string): string {
  return createHash('sha256').update(normalizeQuote(quote)).digest('hex');
}

/**
 * Find a quote in the source pages. Returns the original-text offsets of the first match,
 * or null if the quote does not appear (then the item must be shown as "unverified").
 */
export function findQuote(pages: PageText[], quote: string, minLength = 8): QuoteMatch | null {
  const needle = normalizeQuote(quote);
  if (needle.length < minLength) return null;
  for (const page of pages) {
    const { norm, map } = normalizeWithMap(page.text);
    const at = norm.indexOf(needle);
    if (at === -1) continue;
    const charStart = map[at]!;
    const charEnd = map[at + needle.length - 1]! + 1;
    return { page: page.page, charStart, charEnd, quote: page.text.slice(charStart, charEnd) };
  }
  return null;
}
