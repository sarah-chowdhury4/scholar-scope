import { describe, expect, it } from 'vitest';
import { detectFileType } from '../src/scan/fileType';

describe('detectFileType', () => {
  it('detects PDF, PNG, JPEG by magic bytes', () => {
    expect(detectFileType(Buffer.from('%PDF-1.7\n...'))?.ext).toBe('pdf');
    expect(detectFileType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))?.ext).toBe('png');
    expect(detectFileType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe('jpg');
  });
  it('accepts plain UTF-8 text', () => {
    expect(detectFileType(Buffer.from('Deadline: December 1, 2026 — essay ≤ 500 words'))?.mime).toBe('text/plain');
  });
  it('rejects executables and unknown binaries even if renamed', () => {
    expect(detectFileType(Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03]))).toBeNull(); // Windows .exe
    expect(detectFileType(Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02]))).toBeNull(); // ELF
  });
  it('accepts only Word documents among ZIP files', () => {
    const docx = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('....[Content_Types].xml....word/document.xml')]);
    const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('....payload.bin....')]);
    expect(detectFileType(docx)?.ext).toBe('docx');
    expect(detectFileType(zip)).toBeNull();
  });
  it('rejects empty files', () => {
    expect(detectFileType(Buffer.alloc(0))).toBeNull();
  });
});
