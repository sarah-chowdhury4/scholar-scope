import { describe, expect, it } from 'vitest';
import { findQuote, quoteHash } from '../src/citations';

const pages = [
  { page: 1, text: 'Welcome to the Example Award.\nApplications  close on\nDecember 1, 2026 at 11:59 PM ET.' },
  { page: 2, text: 'Essay: In 500 words or fewer, describe a challenge you’ve overcome.' },
];

describe('findQuote', () => {
  it('finds a quote across line breaks and extra spaces, with exact offsets', () => {
    const m = findQuote(pages, 'Applications close on December 1, 2026');
    expect(m).not.toBeNull();
    expect(m!.page).toBe(1);
    expect(pages[0]!.text.slice(m!.charStart, m!.charEnd)).toBe('Applications  close on\nDecember 1, 2026');
  });

  it('treats curly and straight apostrophes the same', () => {
    const m = findQuote(pages, "describe a challenge you've overcome");
    expect(m?.page).toBe(2);
  });

  it('is case-insensitive', () => {
    expect(findQuote(pages, 'IN 500 WORDS OR FEWER')).not.toBeNull();
  });

  it('returns null when the model invents text (no source, no claim)', () => {
    expect(findQuote(pages, 'Applications close on November 20, 2026')).toBeNull();
  });

  it('rejects quotes too short to be meaningful', () => {
    expect(findQuote(pages, 'Essay')).toBeNull();
  });
});

describe('quoteHash', () => {
  it('ignores whitespace and case differences', () => {
    expect(quoteHash('Due  December 1')).toBe(quoteHash('due december 1'));
  });
  it('changes when the wording changes', () => {
    expect(quoteHash('Due December 1')).not.toBe(quoteHash('Due December 15'));
  });
});
