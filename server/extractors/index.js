import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// These packages are CJS-only, so we use require()
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const XLSX = require('xlsx');

/**
 * Extract text from a file buffer based on MIME type.
 * Returns { text, error } — text is null on failure.
 */
export async function extractText(buffer, mimeType, originalName) {
  try {
    // PDF
    if (mimeType === 'application/pdf') {
      const data = await pdfParse(buffer);
      return { text: data.text?.trim() || null, error: null };
    }

    // DOCX
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        originalName?.match(/\.docx$/i)) {
      const result = await mammoth.extractRawText({ buffer });
      return { text: result.value?.trim() || null, error: null };
    }

    // DOC (older Word format) — mammoth can sometimes handle these
    if (mimeType === 'application/msword' || originalName?.match(/\.doc$/i)) {
      try {
        const result = await mammoth.extractRawText({ buffer });
        return { text: result.value?.trim() || null, error: null };
      } catch {
        return { text: null, error: 'Legacy .doc format — please convert to .docx' };
      }
    }

    // Excel (XLSX/XLS)
    if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        mimeType === 'application/vnd.ms-excel' ||
        originalName?.match(/\.xlsx?$/i)) {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheets = workbook.SheetNames.map(name => {
        const sheet = workbook.Sheets[name];
        return `[${name}]\n${XLSX.utils.sheet_to_csv(sheet)}`;
      });
      return { text: sheets.join('\n\n').trim() || null, error: null };
    }

    // CSV
    if (mimeType === 'text/csv' || originalName?.match(/\.csv$/i)) {
      return { text: buffer.toString('utf-8').trim(), error: null };
    }

    // Plain text / Markdown
    if (mimeType?.startsWith('text/') || originalName?.match(/\.(txt|md|markdown)$/i)) {
      return { text: buffer.toString('utf-8').trim(), error: null };
    }

    // Images — no extraction (would need Tesseract/OCR)
    if (mimeType?.startsWith('image/')) {
      return { text: null, error: null }; // silently skip
    }

    // Unknown type
    return { text: null, error: `Unsupported file type: ${mimeType}` };
  } catch (err) {
    return { text: null, error: `Extraction failed: ${err.message}` };
  }
}

/**
 * Truncate extracted text to a character limit, preserving whole words.
 */
export function truncateText(text, maxChars = 15000) {
  if (!text || text.length <= maxChars) return text;
  const truncated = text.slice(0, maxChars);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > maxChars * 0.8 ? truncated.slice(0, lastSpace) : truncated) + '...';
}
