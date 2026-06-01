import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Lazy-load CJS packages to avoid crashes on Vercel (pdf-parse reads test files at import)
let _pdfParse, _mammoth, _ExcelJS;
function getPdfParse() { return _pdfParse || (_pdfParse = require('pdf-parse')); }
function getMammoth() { return _mammoth || (_mammoth = require('mammoth')); }
function getExcelJS() { return _ExcelJS || (_ExcelJS = require('exceljs')); }

/**
 * Extract text from a file buffer based on MIME type.
 * Returns { text, error } — text is null on failure.
 */
// OpenAI vision fallback for scanned PDFs and images
async function extractWithVision(buffer, mimeType) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  // gpt-4o-mini supports images directly. For PDFs, OpenAI accepts them via the
  // Responses API with input_file — but Chat Completions only handles image_url.
  // Easiest: send as a data URL for images; PDFs fall through unless we render them.
  if (!mimeType?.startsWith('image/')) {
    // PDFs as base64 data URL aren't reliably accepted by chat completions vision —
    // skip the vision fallback for PDFs and rely on pdf-parse upstream.
    return null;
  }

  try {
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64}`;
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 8000,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Extract ALL text from this document. Return the full text content exactly as it appears — every heading, paragraph, bullet point, table, and number. Do not summarize. Do not add commentary. Just return the raw text.' },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        }],
      }),
    });
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    return text?.trim() || null;
  } catch (err) {
    console.error('[OpenAI vision extraction] Failed:', err.message);
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
      // If pdf-parse got nothing or failed, try vision OCR
      if (!text || text.length < 50) {
        console.log('[Extraction] PDF text empty/short, trying vision OCR...');
        const ocrText = await extractWithVision(buffer, mimeType);
        if (ocrText && ocrText.length > 50) {
          console.log(`[Extraction] Vision OCR extracted ${ocrText.length} chars from PDF`);
          return { text: ocrText, error: null };
        }
      }
      return { text, error: text ? null : 'Could not extract text from PDF' };
    }

    // Images — use vision model for OCR
    if (mimeType?.startsWith('image/')) {
      const ocrText = await extractWithVision(buffer, mimeType);
      return { text: ocrText || null, error: ocrText ? null : 'Image OCR failed' };
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

    // Excel (XLSX/XLS) — switched from `xlsx` (SheetJS, unfixable npm vulnerabilities)
    // to `exceljs` which is actively maintained. xls (legacy binary format) isn't
    // supported by exceljs — only xlsx — but it's rarely seen in modern uploads.
    if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        mimeType === 'application/vnd.ms-excel' ||
        originalName?.match(/\.xlsx?$/i)) {
      const ExcelJS = getExcelJS();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const sheets = workbook.worksheets.map(ws => {
        const rows = [];
        ws.eachRow({ includeEmpty: false }, (row) => {
          // row.values is 1-indexed and starts with undefined at [0]; slice it off.
          // Map each cell to a flat string representation suitable for AI ingestion.
          const cells = (row.values || []).slice(1).map(v => {
            if (v === null || v === undefined) return '';
            if (typeof v === 'object') {
              if (v.text) return v.text;            // rich-text cell
              if (v.result !== undefined) return v.result; // formula cell
              if (v instanceof Date) return v.toISOString().slice(0, 10);
              return JSON.stringify(v);
            }
            return String(v);
          });
          rows.push(cells.join(','));
        });
        return `[${ws.name}]\n${rows.join('\n')}`;
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

    // Images already handled above via vision OCR

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
