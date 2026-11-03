import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import mammoth from 'mammoth';
import type { PageText } from '@scholarscope/shared';

const run = promisify(execFile);
const standardFontDataUrl = join(dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json')), 'standard_fonts') + '/';

export type ExtractedText = { pages: PageText[]; ocrUsed: boolean; pageCount: number };

/** Below this many characters per page a PDF is treated as scanned and sent to OCR. */
const MIN_CHARS_PER_PAGE = 40;

export async function extractText(buf: Buffer, mime: string, maxPages: number): Promise<ExtractedText> {
  switch (mime) {
    case 'application/pdf':
      return extractPdf(buf, maxPages);
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
      const { value } = await mammoth.extractRawText({ buffer: buf });
      return { pages: [{ page: null, text: value }], ocrUsed: false, pageCount: 1 };
    }
    case 'text/plain':
      return { pages: [{ page: null, text: buf.toString('utf8') }], ocrUsed: false, pageCount: 1 };
    case 'image/png':
    case 'image/jpeg':
      return { pages: [{ page: 1, text: await ocrImage(buf, mime === 'image/png' ? 'png' : 'jpg') }], ocrUsed: true, pageCount: 1 };
    default:
      throw new Error(`Unsupported type ${mime}`);
  }
}

async function extractPdf(buf: Buffer, maxPages: number): Promise<ExtractedText> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: false, standardFontDataUrl }).promise;
  if (doc.numPages > maxPages) throw new Error(`PDF has ${doc.numPages} pages; the limit is ${maxPages}`);
  const pages: PageText[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : ''))
      .join('')
      .replace(/[ \t]+\n/g, '\n');
    pages.push({ page: p, text });
  }
  await doc.destroy();

  const totalChars = pages.reduce((n, p) => n + p.text.trim().length, 0);
  if (totalChars / Math.max(1, pages.length) >= MIN_CHARS_PER_PAGE) {
    return { pages, ocrUsed: false, pageCount: pages.length };
  }
  return { pages: await ocrPdf(buf), ocrUsed: true, pageCount: pages.length };
}

/** Local stand-in for Cloud Vision OCR: Tesseract (installed in the worker image). */
async function ocrImage(buf: Buffer, ext: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ocr-'));
  try {
    const file = join(dir, `in.${ext}`);
    await writeFile(file, buf);
    const { stdout } = await run('tesseract', [file, 'stdout', '-l', 'eng'], { maxBuffer: 20 * 1024 * 1024 });
    return stdout;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function ocrPdf(buf: Buffer): Promise<PageText[]> {
  const dir = await mkdtemp(join(tmpdir(), 'ocrpdf-'));
  try {
    const file = join(dir, 'in.pdf');
    await writeFile(file, buf);
    await run('pdftoppm', ['-r', '200', '-png', file, join(dir, 'page')]);
    const images = (await readdir(dir)).filter((f) => f.startsWith('page') && f.endsWith('.png')).sort();
    const pages: PageText[] = [];
    for (const [i, img] of images.entries()) {
      const { stdout } = await run('tesseract', [join(dir, img), 'stdout', '-l', 'eng'], { maxBuffer: 20 * 1024 * 1024 });
      pages.push({ page: i + 1, text: stdout });
    }
    return pages;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
