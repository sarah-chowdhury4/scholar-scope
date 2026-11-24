import { describe, expect, it } from 'vitest';
import {
  canonicalUrl,
  isOfficialResult,
  linksFromHtml,
  linksFromMarkdown,
  officialSiteFrom,
  pickRelatedLinks,
  sameSite,
  siteOf,
} from '../src/relatedPages';

describe('siteOf', () => {
  it('groups subdomains under one site, including country second-level domains', () => {
    expect(siteOf('https://www.daad.de/en/x')).toBe('daad.de');
    expect(siteOf('https://apply.daad.de')).toBe('daad.de');
    expect(siteOf('https://www.ox.ac.uk/admissions')).toBe('ox.ac.uk');
    expect(siteOf('https://scholarships.gov.bd')).toBe('scholarships.gov.bd');
    expect(sameSite('https://www.dellscholars.org/a', 'https://dellscholars.org/b')).toBe(true);
    expect(sameSite('https://www.ox.ac.uk', 'https://www.cam.ac.uk')).toBe(false);
  });
});

describe('links', () => {
  const base = 'https://www.dellscholars.org/students/';

  it('reads Markdown links, resolves relative ones, skips images, mail links and anchors', () => {
    const md = [
      'See [Eligibility](/students/eligibility/) and [the FAQ](https://www.dellscholars.org/faq/#top "FAQ").',
      '![logo](/logo.png) [Email us](mailto:a@b.org) [Top](#top)',
    ].join('\n');
    expect(linksFromMarkdown(md, base)).toEqual([
      { url: 'https://www.dellscholars.org/students/eligibility/', text: 'Eligibility' },
      { url: 'https://www.dellscholars.org/faq/', text: 'the FAQ' },
    ]);
  });

  it('reads HTML links with their text', () => {
    const html = `<a href="guidelines.pdf"><span>Program&nbsp;guidelines</span></a><a class=x href='/apply'>Apply now</a>`;
    expect(linksFromHtml(html, base)).toEqual([
      { url: 'https://www.dellscholars.org/students/guidelines.pdf', text: 'Program guidelines' },
      { url: 'https://www.dellscholars.org/apply', text: 'Apply now' },
    ]);
  });

  it('drops the #fragment so one page is one source', () => {
    expect(canonicalUrl('https://a.org/x#y')).toBe('https://a.org/x');
    expect(canonicalUrl('ftp://a.org/x')).toBeNull();
  });
});

describe('pickRelatedLinks', () => {
  const page = 'https://www.daad.de/en/study/scholarship/summer-course/';
  const links = [
    { url: 'https://www.daad.de/en/study/scholarship/summer-course/eligibility/', text: 'Who can apply' },
    { url: 'https://www.daad.de/files/summer-course-guidelines.pdf', text: 'Download' },
    { url: 'https://www.daad.de/en/faq/', text: 'Frequently asked questions' },
    { url: 'https://www.daad.de/en/login/', text: 'Log in to apply' },
    { url: 'https://www.daad.de/en/news/', text: 'News about requirements' },
    { url: 'https://www.facebook.com/daad', text: 'Eligibility on Facebook' },
    { url: 'https://www.daad.de/en/about/', text: 'About us' },
    { url: page, text: 'Requirements (this page)' },
  ];

  it('keeps same-site links that look like rules and ranks them', () => {
    const picked = pickRelatedLinks(links, page).map((l) => l.url);
    expect(picked).toEqual([
      'https://www.daad.de/en/study/scholarship/summer-course/eligibility/',
      'https://www.daad.de/files/summer-course-guidelines.pdf',
      'https://www.daad.de/en/faq/',
    ]);
  });

  it('never picks log-in pages, news, other sites, unrelated pages or the page itself', () => {
    const picked = pickRelatedLinks(links, page).map((l) => l.url);
    for (const bad of ['/login/', '/news/', 'facebook.com', '/about/']) expect(picked.join(' ')).not.toContain(bad);
    expect(picked).not.toContain(page);
  });

  it('stops at the limit', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ url: `https://www.daad.de/requirements-${i}`, text: 'Requirements' }));
    expect(pickRelatedLinks(many, page, 4)).toHaveLength(4);
  });
});

describe('search results', () => {
  it('accepts the saved site, the official site Gemini names, and university or government pages', () => {
    expect(isOfficialResult('https://apply.daad.de/x', ['https://www.daad.de/en/'], null)).toBe(true);
    expect(isOfficialResult('https://www.thegatesscholarship.org/faq', [], 'thegatesscholarship.org')).toBe(true);
    expect(isOfficialResult('https://finaid.stanford.edu/gates', [], null)).toBe(true);
    expect(isOfficialResult('https://www.ox.ac.uk/rhodes', [], null)).toBe(true);
  });

  it('rejects listing sites, blogs, forums and unknown sites', () => {
    expect(isOfficialResult('https://www.scholarships.com/gates', [], 'scholarships.com')).toBe(false);
    expect(isOfficialResult('https://www.reddit.com/r/scholarships/abc', [], null)).toBe(false);
    expect(isOfficialResult('https://someblog.net/how-i-won', [], 'thegatesscholarship.org')).toBe(false);
  });

  it('reads the official site line from the answer', () => {
    expect(officialSiteFrom('OFFICIAL_SITE: www.thegatesscholarship.org\n- page')).toBe('thegatesscholarship.org');
    expect(officialSiteFrom('**OFFICIAL_SITE:** `https://daad.de/en`')).toBe('daad.de');
    expect(officialSiteFrom('OFFICIAL_SITE: unknown')).toBeNull();
    expect(officialSiteFrom('OFFICIAL_SITE: fastweb.com')).toBeNull();
    expect(officialSiteFrom('no line here')).toBeNull();
  });
});
