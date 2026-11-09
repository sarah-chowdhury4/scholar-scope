/**
 * Application files a student uploads once (transcript, passport, birth certificate)
 * and reuses on every scholarship that asks for that file.
 * "Other" files are extra application documents the student attaches to specific scholarships.
 */

export const STUDENT_DOCUMENT_TYPES = [
  { id: 'transcript', label: 'Transcript', once: true },
  { id: 'passport', label: 'Passport', once: true },
  { id: 'birth_certificate', label: 'Birth certificate', once: true },
  { id: 'other', label: 'Other', once: false },
] as const;

export type StudentDocumentType = (typeof STUDENT_DOCUMENT_TYPES)[number]['id'];

const ONCE_TYPES = ['transcript', 'passport', 'birth_certificate'] as const;
export type OnceDocumentType = (typeof ONCE_TYPES)[number];

export function studentDocumentLabel(type: string): string {
  return STUDENT_DOCUMENT_TYPES.find((item) => item.id === type)?.label ?? 'Document';
}

export function isOnceDocument(type: string): type is OnceDocumentType {
  return (ONCE_TYPES as readonly string[]).includes(type);
}

/** Which one-time files this scholarship's requirements ask for, in a stable order. */
export function documentsAskedFor(requirements: { kind?: string | null; label?: string | null }[]): OnceDocumentType[] {
  const hit = new Set<OnceDocumentType>();
  for (const requirement of requirements) {
    const kind = (requirement.kind ?? '').toLowerCase();
    const label = (requirement.label ?? '').toLowerCase();
    if (kind === 'transcript' || /\btranscripts?\b/.test(label)) hit.add('transcript');
    if (/\bpassports?\b/.test(label)) hit.add('passport');
    if (/\bbirth certificates?\b/.test(label)) hit.add('birth_certificate');
  }
  return ONCE_TYPES.filter((type) => hit.has(type));
}
