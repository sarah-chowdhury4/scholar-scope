/**
 * Scholarship catalog: the shared list of known scholarships a student can browse on the
 * Discover page and add to their own records. Catalog values come from a curated dataset,
 * not from a cited source document, so anything copied from it starts as "unverified".
 */

export type CatalogEntry = {
  catalogId: string; // SCH-001
  organization: string;
  name: string;
  deadline: string | null; // YYYY-MM-DD
  minGpa: number | null;
  promptOrMaterials: string;
  sourceUrl: string | null;
  datasetVersion: string | null;
  datasetStatus: string | null;
  tags: CatalogTag[];
};

/** What an application asks for, derived from the requirements text (used as a filter). */
export const CATALOG_TAGS = ['essay', 'recommendation', 'transcript', 'video', 'financial', 'resume'] as const;
export type CatalogTag = (typeof CATALOG_TAGS)[number];

const TAG_PATTERNS: Record<CatalogTag, RegExp> = {
  essay: /\b(essay|statement|narrative|motivation letter|personal statement|describe|detail|explain|reflective)\b/i,
  recommendation: /\b(recommendation|recommender|reference|endorsement)\b/i,
  transcript: /\btranscripts?\b/i,
  video: /\bvideo\b/i,
  financial: /\b(financial|fafsa|pell|tax|budget|income)\b/i,
  resume: /\b(resume|résumé|cv|curriculum vitae)\b/i,
};

export function tagsFor(text: string): CatalogTag[] {
  return CATALOG_TAGS.filter((tag) => TAG_PATTERNS[tag].test(text));
}

// ---------- CSV import (dataset sheet exported as CSV) ----------

export type CsvRow = Record<string, string>;

/** Minimal RFC 4180 CSV parser (quoted fields, doubled quotes, CRLF). */
export function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  const [header, ...body] = rows;
  if (!header) return [];
  return body.map((cells) => Object.fromEntries(header.map((h, i) => [h.trim(), (cells[i] ?? '').trim()])));
}

/** One dataset row → catalog entry, or an error message explaining why it was skipped. */
export function catalogEntryFromRow(r: CsvRow): CatalogEntry | { error: string } {
  const catalogId = r.scholarship_id ?? '';
  if (!/^SCH-\d{3}$/.test(catalogId)) return { error: `invalid scholarship_id "${catalogId}"` };
  if (!r.scholarship_name) return { error: `${catalogId}: missing scholarship_name` };
  const deadline = r.current_deadline ?? '';
  if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return { error: `${catalogId}: deadline must be YYYY-MM-DD` };
  const gpa = r.min_gpa ? Number(r.min_gpa) : null;
  if (gpa !== null && !Number.isFinite(gpa)) return { error: `${catalogId}: min_gpa must be a number` };
  const [datasetVersion, datasetStatus] = (r.version_flag ?? '').split(/\s+-\s+/, 2);
  const promptOrMaterials = r.essay_prompt ?? '';
  return {
    catalogId,
    organization: r.organization ?? '',
    name: r.scholarship_name,
    deadline: deadline || null,
    minGpa: gpa,
    promptOrMaterials,
    sourceUrl: /^https?:\/\//i.test(r.verified_source_url ?? '') ? r.verified_source_url! : null,
    datasetVersion: datasetVersion || null,
    datasetStatus: datasetStatus || null,
    tags: tagsFor(promptOrMaterials),
  };
}

/** Requirement checklist items to create when a student adds a catalog scholarship. */
export function requirementsFromCatalog(e: CatalogEntry): { kind: string; label: string; value: Record<string, unknown> }[] {
  const items: { kind: string; label: string; value: Record<string, unknown> }[] = [];
  if (e.deadline) items.push({ kind: 'deadline', label: 'Application deadline', value: { deadline: { sourceText: e.deadline, allDay: true } } });
  if (e.minGpa !== null) items.push({ kind: 'eligibility', label: `Minimum GPA ${e.minGpa.toFixed(2)}`, value: { minGpa: e.minGpa } });
  for (const part of e.promptOrMaterials.split(';').map((s) => s.trim()).filter(Boolean)) {
    const tags = tagsFor(part);
    const kind = tags.includes('essay')
      ? 'essay'
      : tags.includes('recommendation')
        ? 'recommendation'
        : tags.includes('transcript')
          ? 'transcript'
          : tags.includes('video')
            ? 'video'
            : tags.includes('financial')
              ? 'financial_doc'
              : 'other';
    items.push({ kind, label: part.slice(0, 200), value: { text: part } });
  }
  return items;
}

// ---------- Search and filters (Discover page) ----------

export type CatalogQuery = {
  q?: string;
  /** upcoming (default): deadline today or later · 30 / 90: within that many days · all: include past */
  deadline?: 'upcoming' | '30' | '90' | 'all';
  /** The student's GPA: hide scholarships whose minimum is higher. */
  gpa?: number;
  /** Only scholarships that ask for ALL of these. */
  requires?: CatalogTag[];
  /** Only scholarships that do NOT ask for any of these (e.g. no video). */
  excludes?: CatalogTag[];
  organization?: string;
  sort?: 'deadline' | 'name' | 'gpa';
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function filterCatalog(entries: CatalogEntry[], query: CatalogQuery, today: string): CatalogEntry[] {
  const words = (query.q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const window = query.deadline ?? 'upcoming';
  const todayMs = Date.parse(`${today}T00:00:00Z`);

  const matches = entries.filter((e) => {
    if (words.length) {
      const hay = `${e.name} ${e.organization} ${e.promptOrMaterials}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) return false;
    }
    if (window !== 'all') {
      if (!e.deadline) return false;
      const d = Date.parse(`${e.deadline}T00:00:00Z`);
      if (d < todayMs) return false;
      if (window !== 'upcoming' && d > todayMs + Number(window) * DAY_MS) return false;
    }
    if (query.gpa !== undefined && e.minGpa !== null && e.minGpa > query.gpa) return false;
    if (query.requires?.length && !query.requires.every((t) => e.tags.includes(t))) return false;
    if (query.excludes?.length && query.excludes.some((t) => e.tags.includes(t))) return false;
    if (query.organization && e.organization !== query.organization) return false;
    return true;
  });

  const sort = query.sort ?? 'deadline';
  return matches.sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'gpa') return (a.minGpa ?? 0) - (b.minGpa ?? 0) || a.name.localeCompare(b.name);
    return (a.deadline ?? '9999-12-31').localeCompare(b.deadline ?? '9999-12-31') || a.name.localeCompare(b.name);
  });
}
