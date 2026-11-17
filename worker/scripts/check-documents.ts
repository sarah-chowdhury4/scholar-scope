/**
 * Run the real document check on local files and print what it decides. Nothing is saved.
 * Use it to test the prompt and rules on the fictional samples (samples/documents) or your own synthetic files.
 *
 *   docker compose exec worker npm run check:documents -- ../samples/documents
 *   docker compose exec worker npm run check:documents -- ../samples/documents/not-a-transcript-ml-results-table.pdf --as transcript --name "Test Student"
 *
 * --as    what the student saved the file as (default: transcript)
 * --name  the name on the student's profile (default: Test Student)
 * --pause seconds between files (default: 8, to stay inside the free Gemini tier)
 * Sends the text to Gemini: use synthetic documents only.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { checkDocument, generateJson, sortFindings, worstSeverity } from '@scholarscope/shared';
import { extractText } from '../src/text/extractText';
import { CHECK_DOCUMENT_SCHEMA, CHECK_DOCUMENT_SYSTEM, checkDocumentTask, type RawDocumentFacts } from '../src/prompts/checkDocument';
import { verifyFacts } from '../src/handlers/checkDocument';

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.txt': 'text/plain',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args.splice(i, 2)[1]! : fallback;
};
const declaredType = flag('--as', 'transcript');
const profileName = flag('--name', 'Test Student');
// The free Gemini tier allows only a few requests a minute; space the files out.
const pauseMs = Number(flag('--pause', '8')) * 1000;
if (!args.length) {
  console.error('Usage: npm run check:documents -- <file or folder> [...] [--as transcript] [--name "Test Student"]');
  process.exit(1);
}

const files = args.flatMap((path) =>
  statSync(path).isDirectory()
    ? readdirSync(path).filter((f) => MIME[extname(f).toLowerCase()]).sort().map((f) => join(path, f))
    : [path],
);

let problems = 0;
for (const [index, file] of files.entries()) {
  if (index > 0) await new Promise((resolve) => setTimeout(resolve, pauseMs));
  const mime = MIME[extname(file).toLowerCase()];
  if (!mime) {
    console.log(`\n${basename(file)}: skipped (not a PDF, Word, image or text file)`);
    continue;
  }
  try {
    const text = await extractText(readFileSync(file), mime, 40);
    const documentText = text.pages.map((p) => `[Page ${p.page ?? 1}]\n${p.text}`).join('\n\n');
    const { data } = await generateJson<RawDocumentFacts>({
      system: CHECK_DOCUMENT_SYSTEM,
      task: checkDocumentTask(),
      documentText,
      schema: CHECK_DOCUMENT_SCHEMA,
    });
    const facts = verifyFacts(data, text.pages);
    const findings = sortFindings(checkDocument(facts, { declaredType, profileName }));
    const severity = worstSeverity(findings);
    if (severity === 'problem') problems++;
    const evidence = facts.typeEvidence.map((e) => `${e.signal}${e.found ? '' : ' (quote NOT in file)'}`).join(', ') || 'none';
    console.log(`\n${basename(file)}  [saved as ${declaredType}]${text.ocrUsed ? '  (read by OCR)' : ''}`);
    console.log(`  Gemini: ${facts.detectedType} (${facts.typeConfidence.toFixed(2)}) - ${facts.description ?? 'no description'}`);
    console.log(`  evidence: ${evidence}`);
    if (facts.gpa) console.log(`  GPA: ${facts.gpa.value}${facts.gpa.value.scale ? ' / ' + facts.gpa.value.scale : ''}${facts.gpa.found ? '' : ' (quote NOT in file)'}`);
    console.log(`  verdict: ${severity.toUpperCase()}`);
    for (const f of findings) console.log(`    ${f.severity.padEnd(7)} ${f.message}`);
  } catch (err) {
    console.log(`\n${basename(file)}: check failed: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`);
  }
}
console.log(`\n${files.length} file(s) checked, ${problems} with a problem.`);
process.exit(0);
