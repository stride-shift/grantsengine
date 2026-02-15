/**
 * Build enriched AI context from uploads.
 * Token budget: ~8000 chars for uploads (~2000 tokens),
 * leaving room for org context, prompt, and response.
 */

const MAX_CONTEXT_CHARS = 8000;
const MAX_PER_DOC_CHARS = 3000;

/**
 * Build a context string from upload records.
 * Each record has { original_name, category, extracted_text }.
 * Grant-level uploads get priority (more specific to the task).
 */
export function buildUploadsContext(orgUploads = [], grantUploads = []) {
  const sections = [];
  let charBudget = MAX_CONTEXT_CHARS;

  // Grant-level uploads get priority (more specific)
  if (grantUploads.length) {
    sections.push('=== GRANT-SPECIFIC DOCUMENTS ===');
    for (const u of grantUploads) {
      if (charBudget <= 0) break;
      if (!u.extracted_text) continue;
      const text = u.extracted_text.slice(0, Math.min(MAX_PER_DOC_CHARS, charBudget));
      sections.push(`[${u.original_name}${u.category ? ` (${u.category})` : ''}]\n${text}`);
      charBudget -= text.length + 100;
    }
  }

  // Org-level uploads (knowledge base)
  if (orgUploads.length && charBudget > 500) {
    sections.push('=== ORGANISATION KNOWLEDGE BASE ===');
    for (const u of orgUploads) {
      if (charBudget <= 0) break;
      if (!u.extracted_text) continue;
      const text = u.extracted_text.slice(0, Math.min(MAX_PER_DOC_CHARS, charBudget));
      sections.push(`[${u.original_name}${u.category ? ` (${u.category})` : ''}]\n${text}`);
      charBudget -= text.length + 100;
    }
  }

  return sections.length > 1 ? sections.join('\n\n') : '';
}
