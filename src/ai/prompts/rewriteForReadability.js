// Prompt builder for type === "rewriteForReadability".
// Extracted verbatim from useAI.js. Short-circuits with { result: "[]" } when
// there are no sentences to rewrite; otherwise returns prompt + api options.
export default function buildRewriteForReadability(ctx) {
  const { priorResearch } = ctx;
  const { sentences = [], target = 50 } = priorResearch || {};
  if (!Array.isArray(sentences) || !sentences.length) return { result: "[]" };
  const numbered = sentences.map((s, i) => `${i + 1}. ${s}`).join("\n");
  return {
    system: `You rewrite individual sentences from a funding proposal to be clearer and easier to read, WITHOUT changing their meaning.

RULES:
- Return ONLY a JSON array of strings — the rewritten sentences, in the SAME ORDER and SAME COUNT as the input. No prose, no keys, no markdown fences.
- Make each one SIMPLER: shorter, common words, active voice, one idea per sentence (you may split a long sentence into two within the same string).
- PRESERVE every fact, number, percentage, name, programme title and claim exactly — never invent or drop information.
- Keep a professional, donor-facing register — plain English, not casual or hype.
- NEVER use: "imagine a", "picture a", "we believe", "passionate", "making a difference", "brighter future", "empowering", "leverage" (as a verb), "paradigm shift".
- If a sentence is already clear, return it unchanged.`,
    user: `Rewrite each of these ${sentences.length} sentences to read more easily (Flesch target ~${target}). Return a JSON array of exactly ${sentences.length} strings, in order:\n\n${numbered}`,
    search: false,
    maxTokens: 1200,
  };
}
