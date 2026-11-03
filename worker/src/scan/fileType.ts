/**
 * Decide the real file type from its first bytes, never from the name or the declared type
 * (uploads are untrusted, NFR-1.4). Returns null for anything we don't accept.
 */
export type DetectedType = { mime: string; ext: string };

const startsWith = (buf: Buffer, bytes: number[], offset = 0) =>
  buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b);

export function detectFileType(buf: Buffer): DetectedType | null {
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { mime: 'application/pdf', ext: 'pdf' }; // %PDF-
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: 'image/png', ext: 'png' };
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', ext: 'jpg' };
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) {
    // ZIP container: accept only Word documents
    const head = buf.subarray(0, Math.min(buf.length, 64 * 1024)).toString('latin1');
    if (head.includes('word/') || head.includes('[Content_Types].xml')) {
      return { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' };
    }
    return null;
  }
  if (looksLikeText(buf)) return { mime: 'text/plain', ext: 'txt' };
  return null;
}

function looksLikeText(buf: Buffer): boolean {
  if (buf.length === 0) return false;
  const sample = buf.subarray(0, Math.min(buf.length, 8192));
  if (sample.includes(0)) return false;
  // Control characters other than tab/newline/carriage return/form feed mean binary data.
  let control = 0;
  for (const byte of sample) if (byte < 0x09 || (byte > 0x0d && byte < 0x20) || byte === 0x7f) control++;
  if (control / sample.length > 0.01) return false;
  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(sample);
  const bad = (decoded.match(/�/g) ?? []).length;
  return bad / decoded.length < 0.01;
}
