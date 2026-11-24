/**
 * Finding more of a scholarship's official rules than the one page a student saved.
 *
 * 1. Linked pages: a scholarship page often says "see eligibility", "FAQ" or "full guidelines (PDF)". Links on
 *    the same site whose words point at requirements are read as extra sources (one level deep, a few at most).
 * 2. Search: when the pages still give few requirements, Gemini searches the web once. Only official-looking
 *    results are read: the scholarship's own site, the site Gemini names as official (unless it is a listing
 *    site, blog or social network), and university or government pages.
 *
 * Everything found is read like any saved page (robots.txt, quotes checked against the stored text), so the
 * "no source, no claim" rule is unchanged: each requirement still cites the exact page it came from.
 */

export type PageLink = { url: string; text: string };

/** How a source came to be: added by the student, linked from a saved page, or found by search. */
export type SourceOrigin = 'student' | 'linked' | 'search';

export const MAX_LINKED_PAGES = 3;
export const MAX_SEARCH_PAGES = 2;
/** Fewer active requirements than this after reading every page → search once. */
export const SPARSE_REQUIREMENTS = 4;

const SECOND_LEVEL = /^(ac|co|com|edu|gov|govt|net|org|sch|nic|mil)$/;

/** "www.apply.daad.de" → "daad.de"; "www.ox.ac.uk" → "ox.ac.uk". */
export function siteOf(hostOrUrl: string): string {
  let host = hostOrUrl;
  try {
    host = new URL(hostOrUrl).hostname;
  } catch {
    // already a host name
  }
  const labels = host.toLowerCase().replace(/\.$/, '').split('.');
  if (labels.length <= 2) return labels.join('.');
  const tld = labels[labels.length - 1]!;
  const second = labels[labels.length - 2]!;
  const keep = tld.length === 2 && SECOND_LEVEL.test(second) ? 3 : 2;
  return labels.slice(-keep).join('.');
}

export function sameSite(a: string, b: string): boolean {
  return siteOf(a) === siteOf(b);
}

/** The address without its #fragment, so "page#faq" and "page" count as one page. */
export function canonicalUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

/** Links in Jina's Markdown: [text](url "title"). Images are skipped. */
export function linksFromMarkdown(markdown: string, baseUrl: string): PageLink[] {
  const out: PageLink[] = [];
  const re = /(!?)\[([^\]]{0,300})\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
  for (const m of markdown.matchAll(re)) {
    if (m[1]) continue;
    const url = resolve(m[3]!, baseUrl);
    if (url) out.push({ url, text: m[2]!.replace(/!\[[^\]]*\]\([^)]*\)/g, '').trim() });
  }
  return out;
}

/** Links in raw HTML (when the page was fetched directly). */
export function linksFromHtml(html: string, baseUrl: string): PageLink[] {
  const out: PageLink[] = [];
  const re = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]{0,600}?)<\/a>/gi;
  for (const m of html.matchAll(re)) {
    const url = resolve((m[1] ?? m[2] ?? m[3] ?? '').replace(/&amp;/g, '&'), baseUrl);
    if (url) out.push({ url, text: m[4]!.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim() });
  }
  return out;
}

function resolve(href: string, baseUrl: string): string | null {
  if (!href || /^(mailto|tel|javascript|data):/i.test(href) || href.startsWith('#')) return null;
  try {
    return canonicalUrl(new URL(href, baseUrl).toString());
  } catch {
    return null;
  }
}

const SIGNALS: [RegExp, number][] = [
  [/eligib/i, 5],
  [/requirement/i, 5],
  [/guideline/i, 5],
  [/criteria/i, 4],
  [/how[\s_-]*to[\s_-]*apply/i, 4],
  [/\bfaqs?\b|frequently[\s_-]asked/i, 3],
  [/\bdeadlines?\b|important[\s_-]dates/i, 3],
  [/application|\bapply\b/i, 3],
  [/\bdocuments?\b|checklist/i, 2],
  [/selection|\bprocess\b|instructions/i, 2],
  [/\bterms[\s_-]and[\s_-]conditions\b|\brules\b/i, 2],
];

const NOT_RULES =
  /(log[\s_-]?in|sign[\s_-]?(in|up)|register\b|my[\s_-]?account|password|cart|checkout|donat|careers?|jobs?\b|press|news|blog|events?\b|privacy|cookie|imprint|impressum|accessibility|sitemap|contact|newsletter|subscribe|share|facebook|twitter|instagram|linkedin|youtube|tiktok|whatsapp)/i;

/**
 * The links on a saved page most likely to hold its rules: same site, not the page itself, and with words
 * like "eligibility", "requirements", "FAQ" or "guidelines" in the link text or address. PDFs on the same
 * site count a little extra, since full guidelines are often a PDF.
 */
export function pickRelatedLinks(links: PageLink[], pageUrl: string, max = MAX_LINKED_PAGES): PageLink[] {
  const self = canonicalUrl(pageUrl);
  const best = new Map<string, { link: PageLink; score: number }>();
  for (const link of links) {
    if (link.url === self || !sameSite(link.url, pageUrl)) continue;
    const path = new URL(link.url).pathname + new URL(link.url).search;
    const words = `${link.text} ${decodeURIComponent(path).replace(/[/_.-]+/g, ' ')}`;
    if (NOT_RULES.test(link.text) || NOT_RULES.test(path)) continue;
    let score = 0;
    for (const [re, points] of SIGNALS) if (re.test(words)) score += points;
    if (score > 0 && /\.pdf($|\?)/i.test(path)) score += 2;
    if (score < 3) continue;
    const prev = best.get(link.url);
    if (!prev || prev.score < score) best.set(link.url, { link: { url: link.url, text: link.text || path }, score });
  }
  return [...best.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => x.link);
}

/** Listing sites, blogs, forums and social networks: never treated as a scholarship's official page. */
const NOT_OFFICIAL_SITES = new Set([
  'scholarships.com', 'fastweb.com', 'niche.com', 'bold.org', 'scholarshipowl.com', 'unigo.com', 'cappex.com',
  'collegeboard.org', 'petersons.com', 'scholarshipportal.com', 'opportunitydesk.org', 'scholars4dev.com',
  'afterschoolafrica.com', 'scholarshipsads.com', 'scholarshiproar.com', 'studyportals.com', 'mastersportal.com',
  'internationalscholarships.com', 'goingmerry.com', 'scholarshipamerica.org', 'collegexpress.com', 'raise.me',
  'reddit.com', 'quora.com', 'medium.com', 'substack.com', 'wordpress.com', 'blogspot.com', 'tumblr.com',
  'youtube.com', 'facebook.com', 'instagram.com', 'linkedin.com', 'x.com', 'twitter.com', 'tiktok.com',
  'wikipedia.org', 'wikihow.com', 'pinterest.com', 'scribd.com', 'slideshare.net', 'google.com',
]);

/** University or government pages (.edu, .gov, .ac.uk, .edu.au, .gov.bd…). */
export function isAcademicOrGovernment(url: string): boolean {
  const site = siteOf(url);
  const labels = site.split('.');
  return /^(edu|gov|mil)$/.test(labels[labels.length - 1]!) || (labels.length === 3 && /^(ac|edu|gov|govt)$/.test(labels[1]!));
}

/**
 * Whether a search result may be read as an official source for this scholarship.
 * `knownSites`: sites of pages already saved for it. `officialSite`: the site Gemini named as official.
 */
export function isOfficialResult(url: string, knownSites: string[], officialSite: string | null): boolean {
  if (!canonicalUrl(url)) return false;
  const site = siteOf(url);
  if (NOT_OFFICIAL_SITES.has(site)) return false;
  if (knownSites.some((k) => siteOf(k) === site)) return true;
  if (officialSite && siteOf(officialSite) === site) return true;
  return isAcademicOrGovernment(url);
}

/** Pull "OFFICIAL_SITE: example.org" out of Gemini's search answer (or null for "none"/"unknown"). */
export function officialSiteFrom(answer: string): string | null {
  const m = /OFFICIAL_SITE[*_]*:[\s*_`]*([^\s,;`*]+)/i.exec(answer);
  if (!m) return null;
  const raw = m[1]!.replace(/[*`"'<>()[\]]/g, '').replace(/\.$/, '');
  if (!raw || /^(none|unknown|n\/a)$/i.test(raw)) return null;
  const site = siteOf(raw.includes('://') ? raw : `https://${raw}`);
  return site.includes('.') && !NOT_OFFICIAL_SITES.has(site) ? site : null;
}
