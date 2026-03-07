/* ═══════════════════════════════════════
   Edit Learner — learn writing preferences from user edits
   ═══════════════════════════════════════

   When a user edits an AI-generated proposal section, this module:
   1. Diffs the original vs edited text (paragraph-level)
   2. Asks AI to extract concise writing rules from the changes
   3. Merges new rules with existing learnings (dedup, consolidate)
   4. Stores in org-scoped KV for injection into future prompts
*/

import { api, kvGet, kvSet } from "./api";

const KV_KEY = "writing_learnings";
const MAX_LEARNINGS_CHARS = 600;
const MIN_DIFF_CHARS = 30;
const MAX_RULES = 8;

// ── Public API ──────────────────────────────────────────

/**
 * Fire-and-forget: analyse an edit and update stored writing preferences.
 * Called from ProposalWorkspace.saveSectionEdit — never blocks the UI.
 */
export async function analyzeEditInBackground(sectionName, originalText, editedText) {
  try {
    // Skip trivially small changes (typos, whitespace)
    const diffSize = Math.abs(originalText.length - editedText.length) +
      countCharDiffs(originalText, editedText);
    if (diffSize < MIN_DIFF_CHARS) return;

    // 1. Build a compact diff summary (saves tokens vs sending full texts)
    const diffSummary = buildCompactDiff(originalText, editedText);
    if (!diffSummary) return;

    // 2. Ask AI to extract writing preferences from the diff
    const newRules = await extractPreferences(sectionName, diffSummary);
    if (!newRules) return;

    // 3. Load existing learnings from KV
    let existing = null;
    try {
      existing = await kvGet(KV_KEY);
    } catch {
      // KV not available or empty — proceed with empty
    }

    // 4. Merge new rules with existing (AI-powered dedup + consolidation)
    const merged = await mergeLearnings(existing, newRules);

    // 5. Persist
    await kvSet(KV_KEY, merged);
    console.log(`[EditLearner] Updated writing preferences (${merged.editCount} edits analysed)`);
  } catch (e) {
    console.warn("[EditLearner] Analysis failed (non-blocking):", e.message);
  }
}

/**
 * Load stored writing learnings. Returns the rules string or null.
 * Used by App.jsx runAI to inject into prompts.
 */
export async function getWritingLearnings() {
  try {
    const data = await kvGet(KV_KEY);
    return data?.rules || null;
  } catch {
    return null;
  }
}

// ── Diff Helpers ────────────────────────────────────────

/**
 * Produces a compact representation of what changed, suitable for AI analysis.
 * Compares paragraph-by-paragraph using word-overlap similarity.
 * Caps at ~1500 chars to keep the analysis prompt small.
 */
function buildCompactDiff(original, edited) {
  const oParagraphs = original.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  const eParagraphs = edited.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  const changes = [];

  // Match original paragraphs to edited paragraphs by similarity
  const used = new Set();
  for (const op of oParagraphs) {
    let bestMatch = -1;
    let bestScore = 0;
    for (let j = 0; j < eParagraphs.length; j++) {
      if (used.has(j)) continue;
      const score = similarity(op, eParagraphs[j]);
      if (score > bestScore) { bestScore = score; bestMatch = j; }
    }
    if (bestMatch >= 0 && bestScore > 0.3) {
      used.add(bestMatch);
      if (op.trim() !== eParagraphs[bestMatch].trim()) {
        changes.push(`CHANGED:\n- ${op.slice(0, 250)}\n+ ${eParagraphs[bestMatch].slice(0, 250)}`);
      }
    } else {
      changes.push(`REMOVED:\n- ${op.slice(0, 250)}`);
    }
  }
  for (let j = 0; j < eParagraphs.length; j++) {
    if (!used.has(j)) {
      changes.push(`ADDED:\n+ ${eParagraphs[j].slice(0, 250)}`);
    }
  }

  if (changes.length === 0) return null;
  return changes.join("\n\n").slice(0, 2500);
}

/** Simple word-overlap similarity (Jaccard index on word sets) */
function similarity(a, b) {
  const wa = new Set(a.toLowerCase().split(/\s+/));
  const wb = new Set(b.toLowerCase().split(/\s+/));
  let intersection = 0;
  for (const w of wa) if (wb.has(w)) intersection++;
  const union = wa.size + wb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Approximate character-level diff count (capped for performance) */
function countCharDiffs(a, b) {
  const shorter = Math.min(a.length, b.length);
  let diffs = Math.abs(a.length - b.length);
  const sampleLimit = Math.min(shorter, 500);
  for (let i = 0; i < sampleLimit; i++) {
    if (a[i] !== b[i]) diffs++;
  }
  return diffs;
}

// ── AI Analysis ─────────────────────────────────────────

/**
 * Calls AI to extract writing preference rules from a diff.
 * Returns a string of 1-5 concise rules, or null if nothing useful.
 */
async function extractPreferences(sectionName, diffSummary) {
  const system = `You are a writing style analyst. You examine how a user edited an AI-generated grant proposal section and extract concise writing rules that capture what the user prefers.

OUTPUT FORMAT: Return 1-5 short rules, one per line, starting with "- ". Each rule should be an imperative instruction that can be injected into a future writing prompt. Rules should be specific and actionable, not vague.

GOOD RULES (specific, actionable):
- Use "learners" not "students"
- Keep paragraphs to 3-4 sentences max
- Lead budget items with the impact, then the cost
- Avoid passive voice in impact sections
- Reference the organisation's AI tools by name when mentioned in context
- Don't use semicolons
- Open with a concrete number, not a general claim

BAD RULES (too vague — never produce these):
- Write better
- Be more professional
- Improve the text

If the changes are purely factual corrections (fixing a number, a name, a date) or too small/ambiguous to extract a clear style preference, return exactly: NO_STYLE_PREFERENCE`;

  const user = `Section: "${sectionName}"

The user made these edits to the AI-generated text:

${diffSummary}

What writing style rules do these edits reveal? Extract only clear, reusable preferences.`;

  const result = await api(system, user, false, 300);

  if (!result || result.startsWith("Error") || result.startsWith("Rate limit") ||
      result.startsWith("Connection") || result.includes("NO_STYLE_PREFERENCE")) {
    return null;
  }
  return result.trim();
}

/**
 * Merges new rules with existing learnings — deduplicates, consolidates, caps.
 * Uses AI for intelligent merging when existing learnings exist.
 */
async function mergeLearnings(existing, newRules) {
  const existingRules = existing?.rules || "";
  const editCount = (existing?.editCount || 0) + 1;
  const lastUpdated = new Date().toISOString();

  // First edit — no merge needed, just clean and store
  if (!existingRules) {
    const trimmed = newRules.split("\n").slice(0, MAX_RULES).join("\n").slice(0, MAX_LEARNINGS_CHARS);
    return { rules: trimmed, editCount, lastUpdated };
  }

  // Merge via AI — deduplicate, consolidate, prioritise by recency
  const system = `You consolidate writing style rules. Given EXISTING rules and NEW rules from a recent user edit, produce a single merged list.

RULES:
- Deduplicate: if new rule overlaps with an existing one, keep the more specific version
- Consolidate: combine related rules (e.g. "Use learners not students" + "Say learners instead of participants" → "Use 'learners' — never 'students' or 'participants'")
- Prioritise: newer rules take precedence if they contradict older ones
- Cap: maximum ${MAX_RULES} rules total — drop the least specific ones if needed
- Format: one rule per line, starting with "- ", imperative voice

OUTPUT ONLY THE MERGED RULES — no explanation, no preamble.`;

  const user = `EXISTING RULES:\n${existingRules}\n\nNEW RULES FROM LATEST EDIT:\n${newRules}`;

  const merged = await api(system, user, false, 400);

  if (!merged || merged.startsWith("Error") || merged.startsWith("Rate limit") || merged.startsWith("Connection")) {
    // Fallback: just append and truncate
    const fallback = (existingRules + "\n" + newRules)
      .split("\n").filter(l => l.trim()).slice(0, MAX_RULES).join("\n")
      .slice(0, MAX_LEARNINGS_CHARS);
    return { rules: fallback, editCount, lastUpdated };
  }

  return {
    rules: merged.trim().slice(0, MAX_LEARNINGS_CHARS),
    editCount,
    lastUpdated,
  };
}
