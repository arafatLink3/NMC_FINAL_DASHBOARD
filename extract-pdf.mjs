// Extract text from the white paper PDF using pdfjs-dist.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const pdfPath = path.join(
  here,
  'Flies',
  'White paper about Zero-Install Offline-Tolerant Automation Console for NMC Dashboard Management.pdf',
);
const outPath = path.join(here, 'white-paper-text.txt');

const data = await readFile(pdfPath);
// pdfjs-dist legacy build for Node, no DOM.
const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

const loadingTask = pdfjsLib.getDocument({
  data: new Uint8Array(data),
  useSystemFonts: true,
  disableFontFace: true,
});
const pdf = await loadingTask.promise;
let allText = '';
for (let p = 1; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p);
  const content = await page.getTextContent();
  const pageText = content.items.map((it) => it.str).join(' ');
  allText += `\n\n===== PAGE ${p} =====\n\n${pageText}`;
}
await writeFile(outPath, allText, 'utf8');
console.log(`Wrote ${outPath} (${allText.length} chars, ${pdf.numPages} pages)`);