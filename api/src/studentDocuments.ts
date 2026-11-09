import { documentsAskedFor, studentDocumentLabel, STUDENT_DOCUMENT_TYPES, userDoc, type StudentDocumentType } from '@scholarscope/shared';

export type StudentDocumentDto = {
  id: string;
  type: StudentDocumentType | string;
  title: string;
  fileName: string;
  scanStatus: string;
  /** The saved file can be opened. A replacement that is still being checked does not clear this. */
  ready: boolean;
  usedIn: string[];
};

const KNOWN = new Set<string>(STUDENT_DOCUMENT_TYPES.map((item) => item.id));

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

async function toDto(snap: FirebaseFirestore.QueryDocumentSnapshot): Promise<StudentDocumentDto> {
  const data = snap.data();
  const versionId = typeof data.currentVersionId === 'string' ? data.currentVersionId : null;
  let ready = false;
  if (versionId) {
    const version = await snap.ref.collection('versions').doc(versionId).get();
    ready = version.get('scan')?.status === 'clean';
  }
  return {
    id: snap.id,
    type: typeof data.type === 'string' ? data.type : 'other',
    title: typeof data.title === 'string' && data.title.trim() ? data.title : 'Document',
    fileName: typeof data.fileName === 'string' && data.fileName.trim() ? data.fileName : 'Uploaded file',
    scanStatus: typeof data.scanStatus === 'string' ? data.scanStatus : 'pending',
    ready,
    usedIn: asStrings(data.usedIn),
  };
}

export async function listStudentDocuments(uid: string): Promise<StudentDocumentDto[]> {
  const snap = await userDoc(uid).collection('materials').get();
  const items = await Promise.all(snap.docs.filter((doc) => KNOWN.has(String(doc.get('type')))).map((doc) => toDto(doc)));
  return items.sort((a, b) => a.title.localeCompare(b.title));
}

export function documentsForScholarship(
  docs: StudentDocumentDto[],
  requirements: { kind?: string | null; label?: string | null }[],
  scholarshipId: string,
) {
  const needed = documentsAskedFor(requirements).map((type) => ({
    type,
    label: studentDocumentLabel(type),
    document: docs.find((doc) => doc.type === type) ?? null,
  }));
  const extras = docs.filter((doc) => doc.type === 'other' && doc.usedIn.includes(scholarshipId));
  return { needed, extras };
}
