import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const BOOKS = [
  { file: 'PNVA_English.pdf', title: 'The Politics of Nonviolent Action', shortName: 'PNVA' },
  { file: 'HNVSW.pdf', title: 'How Nonviolent Struggle Works', shortName: 'HNVSW' },
  { file: 'FDTD.pdf', title: 'From Dictatorship to Democracy', shortName: 'FDTD' },
  { file: '198-Methods.pdf', title: '198 Methods of Nonviolent Action', shortName: '198-Methods' },
  { file: 'TAC.pdf', title: 'The Anti-Coup', shortName: 'TAC' },
  { file: 'OSNC.pdf', title: 'On Strategic Nonviolent Conflict', shortName: 'OSNC' },
  { file: 'TARA.pdf', title: 'There Are Realistic Alternatives', shortName: 'TARA' },
];

const CHUNK_SIZE = 400;   // words per chunk (~500 tokens)
const OVERLAP = 50;       // word overlap between chunks

// Find pdftotext path via devbox
let pdftotextPath;
// First check devbox nix profile (most reliable)
const devboxNixPath = join(projectRoot, '.devbox/nix/profile/default/bin/pdftotext');
if (existsSync(devboxNixPath)) {
  pdftotextPath = devboxNixPath;
  console.log(`Found pdftotext at devbox nix path: ${pdftotextPath}`);
} else {
  try {
    pdftotextPath = execSync('devbox run which pdftotext', { cwd: projectRoot }).toString().trim();
    console.log(`Found pdftotext via devbox: ${pdftotextPath}`);
  } catch {
    pdftotextPath = 'pdftotext'; // fallback to PATH
    console.log('Using pdftotext from system PATH');
  }
}

/**
 * Detect if a line looks like a chapter/section heading.
 * Criteria:
 *   - All uppercase (and not just punctuation/whitespace)
 *   - Starts with "Chapter" (case-insensitive)
 *   - Numbered heading: "1.", "2.", "1.1", etc. at start, short line (<= 80 chars)
 *   - Roman numerals at start: "I.", "II.", "III.", etc.
 */
function isHeading(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length < 2) return false;

  // All caps check (at least 3 alpha chars, not just numbers/symbols)
  const alphaChars = trimmed.replace(/[^a-zA-Z]/g, '');
  if (alphaChars.length >= 3 && trimmed === trimmed.toUpperCase() && trimmed.length <= 120) {
    return true;
  }

  // Starts with "Chapter"
  if (/^chapter\b/i.test(trimmed)) return true;

  // Numbered heading like "1.", "2.3.", "12." at start, short line
  if (/^\d+(\.\d+)*\.?\s+\S/.test(trimmed) && trimmed.length <= 80) return true;

  // Roman numeral heading
  if (/^(I{1,3}|IV|VI{0,3}|IX|X{1,3}|XI{1,3}|XIV|XV|XVI{0,3}|XIX|XX|XXI)\.\s+\S/i.test(trimmed) && trimmed.length <= 80) return true;

  return false;
}

/**
 * Extract text from a PDF file using pdftotext.
 */
function extractText(pdfPath) {
  const cmd = `"${pdftotextPath}" -layout "${pdfPath}" -`;
  try {
    const text = execSync(cmd, { maxBuffer: 50 * 1024 * 1024 }).toString();
    return text;
  } catch (err) {
    console.error(`Error extracting text from ${pdfPath}:`, err.message);
    throw err;
  }
}

/**
 * Split raw text into chunks with metadata.
 * Returns array of { chapter, text } objects.
 */
function chunkText(rawText, shortName, title) {
  const lines = rawText.split('\n');
  const chunks = [];
  let currentChapter = 'Introduction';
  let wordBuffer = [];
  let chunkId = 0;

  function flushChunk() {
    if (wordBuffer.length < 10) return; // skip tiny chunks
    const text = wordBuffer.join(' ').replace(/\s+/g, ' ').trim();
    chunks.push({
      id: `${shortName}-${String(chunkId).padStart(4, '0')}`,
      source: shortName,
      title: title,
      chapter: currentChapter,
      text: text,
    });
    chunkId++;
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect headings
    if (isHeading(trimmed) && trimmed.length > 0) {
      // Before switching chapter, flush current buffer
      if (wordBuffer.length >= CHUNK_SIZE) {
        flushChunk();
        // Keep overlap
        wordBuffer = wordBuffer.slice(-OVERLAP);
      }
      currentChapter = trimmed;
      continue;
    }

    // Skip page number lines (just numbers, possibly with whitespace)
    if (/^\s*\d+\s*$/.test(line)) continue;

    // Add words from this line to buffer
    const words = trimmed.split(/\s+/).filter(Boolean);
    wordBuffer.push(...words);

    // When buffer reaches chunk size, flush and keep overlap
    while (wordBuffer.length >= CHUNK_SIZE + OVERLAP) {
      const chunkWords = wordBuffer.slice(0, CHUNK_SIZE);
      const savedChapter = currentChapter;
      const savedBuffer = wordBuffer;
      wordBuffer = chunkWords;
      flushChunk();
      wordBuffer = savedBuffer.slice(CHUNK_SIZE - OVERLAP);
      wordBuffer = wordBuffer; // keep overlap from end of flushed chunk
      // Recalculate: overlap is last OVERLAP words of the chunk we just flushed
      wordBuffer = [...chunkWords.slice(-OVERLAP), ...savedBuffer.slice(CHUNK_SIZE)];
    }
  }

  // Flush any remaining words
  if (wordBuffer.length > 0) {
    flushChunk();
  }

  return chunks;
}

async function main() {
  const allChunks = [];
  const pdfsDir = join(projectRoot, 'pdfs');
  const corpusDir = join(projectRoot, 'corpus');
  const outputPath = join(corpusDir, 'sharp-corpus.json');

  for (const book of BOOKS) {
    const pdfPath = join(pdfsDir, book.file);

    if (!existsSync(pdfPath)) {
      console.warn(`WARNING: PDF not found: ${pdfPath} — skipping`);
      continue;
    }

    console.log(`\nProcessing: ${book.title} (${book.file})`);

    let rawText;
    try {
      rawText = extractText(pdfPath);
      console.log(`  Extracted ${rawText.length.toLocaleString()} characters`);
    } catch (err) {
      console.error(`  FAILED to extract text: ${err.message}`);
      continue;
    }

    const chunks = chunkText(rawText, book.shortName, book.title);
    console.log(`  Produced ${chunks.length} chunks`);
    allChunks.push(...chunks);
  }

  console.log(`\nTotal chunks: ${allChunks.length}`);
  writeFileSync(outputPath, JSON.stringify(allChunks, null, 2));
  console.log(`Saved to: ${outputPath}`);

  // Print first 3 entries (truncated)
  console.log('\n--- First 3 corpus entries (text truncated to 200 chars) ---');
  for (const entry of allChunks.slice(0, 3)) {
    console.log(JSON.stringify({
      ...entry,
      text: entry.text.slice(0, 200) + (entry.text.length > 200 ? '...' : ''),
    }, null, 2));
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
