// Heuristic: does fetched HTML look like an actual application page — a real
// input form, an "apply/submit" affordance, or a downloadable application form —
// versus a funder homepage with no visible way to apply?
//
// Returns 'apply-page' | 'homepage-only' | 'unknown'. Deliberately conservative:
// it only returns 'homepage-only' when the page loaded with enough HTML to judge
// AND none of the apply signals are present. Anything ambiguous (empty body,
// JS-only shell, unreadable) returns 'unknown' so we never wrongly discourage a
// real lead. The Playwright /verify-link endpoint runs the equivalent check on
// the live DOM; this string version backs the fetch-based /ai/verify-urls path.

const APPLY_TEXT = /\bapply\b|how to apply|application (form|process|portal|guideline|deadline|window)|submit (a |your |an )?(application|proposal|expression)|expression of interest|request for proposals?|\brfp\b|\beoi\b|start (your )?application/i;
const APPLY_HREF = /(apply|application|grant-application|funding-application|submit-proposal|expression-of-interest)/i;

export function classifyApplyHtml(html) {
  if (!html || html.length < 400) return 'unknown'; // empty / JS shell — can't judge

  // A real input form (ignore pages whose only <form> is search/newsletter by
  // requiring a text-ish field).
  const hasForm = /<form[\s>]/i.test(html) && (
    /<textarea[\s>]/i.test(html) ||
    /<input[^>]+type\s*=\s*["']?(text|email|tel|file)/i.test(html) ||
    /<select[\s>]/i.test(html)
  );

  // A link/href that points at an apply/application path.
  const hasApplyHref = new RegExp(`href\\s*=\\s*["'][^"']*(?:${APPLY_HREF.source})`, 'i').test(html);

  // Visible-text apply affordance (strip script/style/markup first).
  const visible = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  const hasApplyText = APPLY_TEXT.test(visible);

  if (hasForm || hasApplyHref || hasApplyText) return 'apply-page';
  return 'homepage-only';
}
