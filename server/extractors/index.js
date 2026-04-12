import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Lazy-load CJS packages to avoid crashes on Vercel (pdf-parse reads test files at import)
let _pdfParse, _mammoth, _XLSX;
function getPdfParse() { return _pdfParse || (_pdfParse = require('pdf-parse')); }
function getMammoth() { return _mammoth || (_mammoth = require('mammoth')); }
function getXLSX() { return _XLSX || (_XLSX = require('xlsx')); }

/**
 * Extract text from a file buffer based on MIME type.
 * Returns { text, error } — text is null on failure.
 */
// Gemini vision fallback for scanned PDFs and images
async function extractWithGemini(buffer, mimeType) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const base64 = buffer.toString('base64');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: base64 } },
            { text: 'Extract ALL text from this document. Return the full text content exactly as it appears — every heading, paragraph, bullet point, table, and number. Do not summarize. Do not add commentary. Just return the raw text.' },
          ],
        }],
        generationConfig: { maxOutputTokens: 8000 },
      }),
    });
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.filter(p => p.text).map(p => p.text).join('\n\n');
    return text?.trim() || null;
  } catch (err) {
    console.error('[Gemini extraction] Failed:', err.message);
    return null;
  }
}

export async function extractText(buffer, mimeType, originalName) {
  try {
    // PDF
    if (mimeType === 'application/pdf') {
      let text = null;
      try {
        const pdfParse = getPdfParse();
        const data = await pdfParse(buffer);
        text = data.text?.trim() || null;
      } catch (pdfErr) {
        console.log('[Extraction] pdf-parse failed:', pdfErr.message);
      }
      // If pdf-parse got nothing or failed, try Gemini vision
      if (!text || text.length < 50) {
        console.log('[Extraction] PDF text empty/short, trying Gemini vision...');
        const geminiText = await extractWithGemini(buffer, mimeType);
        if (geminiText && geminiText.length > 50) {
          console.log(`[Extraction] Gemini extracted ${geminiText.length} chars from PDF`);
          return { text: geminiText, error: null };
        }
      }
      return { text, error: text ? null : 'Could not extract text from PDF' };
    }

    // Images — use Gemini vision for OCR
    if (mimeType?.startsWith('image/')) {
      const geminiText = await extractWithGemini(buffer, mimeType);
      return { text: geminiText || null, error: geminiText ? null : 'Image OCR failed' };
    }

    // DOCX
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        originalName?.match(/\.docx$/i)) {
      const result = await getMammoth().extractRawText({ buffer });
      return { text: result.value?.trim() || null, error: null };
    }

    // DOC (older Word format) — mammoth can sometimes handle these
    if (mimeType === 'application/msword' || originalName?.match(/\.doc$/i)) {
      try {
        const result = await getMammoth().extractRawText({ buffer });
        return { text: result.value?.trim() || null, error: null };
      } catch {
        return { text: null, error: 'Legacy .doc format — please convert to .docx' };
      }
    }

    // Excel (XLSX/XLS)
    if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        mimeType === 'application/vnd.ms-excel' ||
        originalName?.match(/\.xlsx?$/i)) {
      const XLSX = getXLSX();
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

    // Images already handled above via Gemini vision

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
