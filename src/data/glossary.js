/* Glossary of internal / sector jargon that confuses external readers.
 *
 * When a proposal is generated, the first occurrence of each term gets a
 * bracketed plain-English definition inserted after it. Subsequent uses are
 * left alone so the document doesn't read like a dictionary.
 *
 * Source: Net Bank feedback called out internal jargon as a credibility
 * killer. Nolan also flagged "type 1 cohort", "cyborg", "FET", "SETA" etc.
 * in the May 12 transcript.
 *
 * Add new terms here as Nolan / d-lab identify them. Keep the regex case-
 * insensitive but match whole words only so we don't insert a definition
 * for "FET" inside "fetch" or "type 1" inside "stereotype 1234".
 *
 * Format: { term: "displayed jargon", regex: /word-boundary pattern/i,
 *           definition: "short, plain-English explanation in brackets" }
 */

export const GLOSSARY = [
  {
    term: "Type 1 cohort",
    regex: /\btype\s*1\s*cohort(s)?\b/i,
    definition: "(d-lab's R516K standard 9-month cohort of 20 learners, partner-funded)",
  },
  {
    term: "Type 2 cohort",
    regex: /\btype\s*2\s*cohort(s)?\b/i,
    definition: "(d-lab's R1.6M full cohort of 20 learners with stipends and laptops included)",
  },
  {
    term: "Type 3 cohort",
    regex: /\btype\s*3\s*cohort(s)?\b/i,
    definition: "(d-lab's R1.24M cohort of 20 learners including monthly stipends)",
  },
  {
    term: "Type 4 cohort",
    regex: /\btype\s*4\s*cohort(s)?\b/i,
    definition: "(d-lab's three-year FET high-school programme reaching 60 learners)",
  },
  {
    term: "Type 5 cohort",
    regex: /\btype\s*5\s*cohort(s)?\b/i,
    definition: "(corporate accelerator format, e.g. CCBA Future Leaders — 63 learners over 6 months)",
  },
  {
    term: "Type 6 cohort",
    regex: /\btype\s*6\s*cohort(s)?\b/i,
    definition: "(Cyborg Habits short course — 4-6 weeks at R930 per learner)",
  },
  {
    term: "Type 7 cohort",
    regex: /\btype\s*7\s*cohort(s)?\b/i,
    definition: "(Sci-Bono employability programme — 90 learners over 13 weeks)",
  },
  {
    term: "Type 8 cohort",
    regex: /\btype\s*8\s*cohort(s)?\b/i,
    definition: "(bespoke corporate accelerator — 25 learners over 18 months)",
  },
  {
    term: "Cyborg Habits",
    regex: /\bcyborg\s+habits\b/i,
    definition: "(d-lab's short course teaching practical AI-assisted work routines)",
  },
  {
    term: "cyborg",
    regex: /\bcyborg(s)?\b(?!\s+habits)/i,
    definition: "(a worker fluent in pairing human judgement with AI tools — d-lab's term for its graduates)",
  },
  {
    term: "FET",
    regex: /\bFET\b/,
    definition: "(Further Education and Training — the South African schooling phase covering Grades 10-12)",
  },
  {
    term: "SETA",
    regex: /\bSETA(s)?\b/,
    definition: "(Sector Education and Training Authority — government skills body funded by the levy)",
  },
  {
    term: "B-BBEE",
    regex: /\bB-BBEE\b/i,
    definition: "(Broad-Based Black Economic Empowerment — South Africa's transformation scorecard)",
  },
  {
    term: "BBBEE",
    regex: /\bBBBEE\b/i,
    definition: "(Broad-Based Black Economic Empowerment — South Africa's transformation scorecard)",
  },
  {
    term: "ICITP",
    regex: /\bICITP\b/,
    definition: "(Institute of Chartered IT Professionals — d-lab's accreditation body for IT skills)",
  },
  {
    term: "PBO",
    regex: /\bPBO\b/,
    definition: "(Public Benefit Organisation — SARS-approved tax-exempt nonprofit status)",
  },
  {
    term: "NPO",
    regex: /\bNPO\b/,
    definition: "(Non-Profit Organisation — registered with the Department of Social Development)",
  },
  {
    term: "NQF",
    regex: /\bNQF\b/,
    definition: "(National Qualifications Framework — South Africa's 10-level qualification system)",
  },
  {
    term: "SAQA",
    regex: /\bSAQA\b/,
    definition: "(South African Qualifications Authority — sets and oversees the NQF)",
  },
  {
    term: "NSDP",
    regex: /\bNSDP\b/,
    definition: "(National Skills Development Plan — government's master plan for workforce skills)",
  },
  {
    term: "DHET",
    regex: /\bDHET\b/,
    definition: "(Department of Higher Education and Training)",
  },
  {
    term: "WSP/ATR",
    regex: /\bWSP\s*\/\s*ATR\b/i,
    definition: "(Workplace Skills Plan and Annual Training Report — annual SETA submission)",
  },
  {
    term: "M&E",
    regex: /\bM&E\b/,
    definition: "(monitoring and evaluation — the systems that track programme outcomes)",
  },
  {
    term: "4IR",
    regex: /\b4IR\b/,
    definition: "(Fourth Industrial Revolution — the wave of AI, automation and digital convergence)",
  },
  {
    term: "POPIA",
    regex: /\bPOPIA\b/,
    definition: "(Protection of Personal Information Act — South Africa's data privacy law)",
  },
  {
    term: "RFP",
    regex: /\bRFP\b/,
    definition: "(Request for Proposals — a funder's open call for application submissions)",
  },
  {
    term: "LOI",
    regex: /\bLOI\b/,
    definition: "(Letter of Inquiry — a short preliminary pitch before a full proposal)",
  },
  {
    term: "TCS",
    regex: /\bTCS\b/,
    definition: "(Tax Compliance Status — SARS confirmation that an organisation is tax-compliant)",
  },
  {
    term: "CSI",
    regex: /\bCSI\b/,
    definition: "(Corporate Social Investment — South African term for corporate philanthropy spend)",
  },
];

/* Detect which glossary terms appear in a body of text. Returns an array of
 * { term, definition } entries, deduplicated, in the order they first appear.
 * Use this to build a glossary appendix for a proposal that contains jargon. */
export const detectGlossaryTerms = (text) => {
  if (!text || typeof text !== "string") return [];
  const hits = [];
  const seen = new Set();
  for (const { term, regex, definition } of GLOSSARY) {
    if (seen.has(term)) continue;
    const m = regex.exec(text);
    if (m) {
      hits.push({ term, definition: definition.replace(/^\(/, "").replace(/\)$/, ""), index: m.index });
      seen.add(term);
    }
    regex.lastIndex = 0; // reset for next call (regex is shared)
  }
  // Sort by first appearance so the glossary follows the proposal's reading order
  hits.sort((a, b) => a.index - b.index);
  return hits.map(({ term, definition }) => ({ term, definition }));
};

/* Build a markdown-formatted glossary section ready to append to a proposal. */
export const buildGlossaryAppendix = (text) => {
  const terms = detectGlossaryTerms(text);
  if (terms.length === 0) return "";
  const lines = terms.map(({ term, definition }) => `**${term}** — ${definition}`);
  return [
    "",
    "---",
    "",
    "## Glossary",
    "",
    "Definitions for acronyms and sector terminology used in this proposal:",
    "",
    ...lines,
    "",
  ].join("\n");
};

/* Apply glossary: insert a bracketed definition the first time each term appears.
 * Skips terms already followed by an open parenthesis (assume the writer already
 * defined it). Idempotent — running twice does not double-insert.
 */
export const applyGlossary = (text) => {
  if (!text || typeof text !== "string") return text;
  let out = text;
  for (const { regex, definition } of GLOSSARY) {
    // Build a "match the term, then any whitespace, then NOT already a definition" pattern.
    // We use the existing regex (must be non-global) and find its FIRST occurrence.
    const flags = regex.flags.includes("g") ? regex.flags : regex.flags + "g";
    const globalRe = new RegExp(regex.source, flags);
    let firstMatch = null;
    let m;
    while ((m = globalRe.exec(out)) !== null) {
      const after = out.slice(m.index + m[0].length).trimStart();
      // Already followed by an opening parenthesis with our definition? skip.
      if (after.startsWith("(")) continue;
      firstMatch = m;
      break;
    }
    if (firstMatch) {
      const insertAt = firstMatch.index + firstMatch[0].length;
      out = out.slice(0, insertAt) + " " + definition + out.slice(insertAt);
    }
  }
  return out;
};
