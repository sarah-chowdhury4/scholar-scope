/**
 * Application files a student keeps and reuses.
 * Academic files are named, and a student can keep more than one of a kind:
 * a master's application may need a high school transcript and an undergraduate transcript,
 * and school certificates follow the exam system of the student's country.
 * A passport and a birth certificate stay one file each.
 */

export const STUDENT_DOCUMENT_TYPES = [
  { id: 'transcript', label: 'Transcript', plural: 'Transcripts', once: false },
  { id: 'school_certificate', label: 'School certificate', plural: 'School certificates', once: false },
  { id: 'university_certificate', label: 'University certificate', plural: 'University certificates', once: false },
  { id: 'passport', label: 'Passport', plural: 'Passport', once: true },
  { id: 'birth_certificate', label: 'Birth certificate', plural: 'Birth certificate', once: true },
  { id: 'other', label: 'Other', plural: 'Other documents', once: false },
] as const;

export type StudentDocumentType = (typeof STUDENT_DOCUMENT_TYPES)[number]['id'];

const ASKED_ORDER = ['transcript', 'school_certificate', 'university_certificate', 'passport', 'birth_certificate'] as const;
export type AskedDocumentType = (typeof ASKED_ORDER)[number];

export function studentDocumentLabel(type: string): string {
  return STUDENT_DOCUMENT_TYPES.find((item) => item.id === type)?.label ?? 'Document';
}

export function studentDocumentHeading(type: string): string {
  return STUDENT_DOCUMENT_TYPES.find((item) => item.id === type)?.plural ?? studentDocumentLabel(type);
}

export function isStudentDocumentType(type: string): type is StudentDocumentType {
  return STUDENT_DOCUMENT_TYPES.some((item) => item.id === type);
}

export function isOnceDocument(type: string): boolean {
  return STUDENT_DOCUMENT_TYPES.some((item) => item.id === type && item.once);
}

/** Compare names so uploading "Undergraduate transcript" again replaces that file. */
export function normalizeDocumentTitle(title: string): string {
  return title.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Which kinds of saved file this scholarship's requirements ask for.
 * Several transcript lines still count as one kind: the page shows every transcript the student has.
 */
export function documentsAskedFor(requirements: { kind?: string | null; label?: string | null }[]): AskedDocumentType[] {
  const hit = new Set<AskedDocumentType>();
  for (const requirement of requirements) {
    const kind = (requirement.kind ?? '').toLowerCase();
    const label = (requirement.label ?? '').toLowerCase();
    if (kind === 'transcript' || /\btranscripts?\b/.test(label)) hit.add('transcript');
    if (/\bpassports?\b/.test(label)) hit.add('passport');
    if (/\bbirth certificates?\b/.test(label)) {
      hit.add('birth_certificate');
      continue;
    }
    const schoolExam = /\b(igcses?|gcses?|a-levels?|a levels?|o-levels?|o levels?)\b/.test(label);
    const schoolCert = /\b(school leaving|secondary school)\b/.test(label) && /\b(certificates?|diplomas?)\b/.test(label);
    const university = /\b(degree|graduation|provisional|enrol+ment)\b/.test(label) && /\b(certificates?|diplomas?)\b/.test(label);
    if (schoolExam || schoolCert) hit.add('school_certificate');
    if (university) hit.add('university_certificate');
    if (/\b(certificates?|diplomas?)\b/.test(label) && !schoolExam && !schoolCert && !university) {
      hit.add('school_certificate');
      hit.add('university_certificate');
    }
  }
  return ASKED_ORDER.filter((type) => hit.has(type));
}
