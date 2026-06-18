/* ── Funder History & Strategy Engine ──
   NOTE: FUNDER_HISTORY and the `angles` object in funderStrategy() contain
   d-lab-specific funder intelligence. For other orgs, the generic fallback
   is used (which references orgCtx). Long-term: store funder hooks per-org in DB.
── */

import { FUNDER_ANGLES } from "./funderAngles";

const FUNDER_HISTORY = {
  "telkom": "returning", "telkom foundation": "returning",
  "get it done": "returning", "get it done foundation": "returning",
  "tk foundation": "returning", "tk": "returning",
  "sage": "returning", "sage foundation": "returning",
  "sap": "returning", "c-track": "returning", "ctrack": "returning",
  "eoh": "returning", "the field institute": "returning", "field institute": "returning",
  "penreach": "returning", "harambee": "returning",
  "ccba": "returning", "coca-cola": "returning", "coca cola": "returning",
  "inkcubeko": "returning",
};

export const isFunderReturning = name => {
  const n = (name || "").toLowerCase().trim();
  return Object.keys(FUNDER_HISTORY).some(k => n.includes(k) || k.includes(n));
};

export const PTYPES = {
  1: { label: "Standard Cohort — Partner-funded", students: 20, cost: 516000, perStudent: 25800, duration: "9 months", desc: "Partner provides infrastructure/stipends/laptops; d-lab provides coaching, curriculum, assessment, accreditation, LMS.", budget: "Travel R38K, Accommodation R38K, Staff S&T R16K, Shuttles R4K, Accreditation R5K, Assessment R95K, AI platform & tools (proprietary) R108K, LMS R11K, Coaches R200K", table: [["Coaches & curriculum","200,000"],["AI platform & tools (proprietary)","108,000"],["ICITP assessment","95,400"],["Travel","38,160"],["Accommodation","38,160"],["Staff S&T","15,722"],["LMS hosting","11,442"],["Accreditation","5,300"],["Airport shuttles","3,816"],["TOTAL","516,000"]] },
  2: { label: "Standard Cohort — d-lab Funded + Stipends + Laptops", students: 20, cost: 1597200, perStudent: 79860, duration: "9 months", desc: "d-lab provides everything including laptops and stipends. Full ownership model.", budget: "Base programme R516K + Laptops R318K (R15,900 × 20) + Stipends R763K (R4,240/student × 9mo)", table: [["Base programme (Type 1)","516,000"],["Laptops (R15,900 × 20)","318,000"],["Stipends (R4,240 × 20 × 9mo)","763,200"],["TOTAL","1,597,200"]] },
  3: { label: "Standard Cohort — With Stipends", students: 20, cost: 1236000, perStudent: 61800, duration: "9 months", desc: "Partner provides infrastructure + laptops; d-lab provides programme + stipends.", budget: "Programme R516K + Stipends R720K (R4,000/student × 9 months)", table: [["Base programme (Type 1)","516,000"],["Stipends (R4,000 × 20 × 9mo)","720,000"],["TOTAL","1,236,000"]] },
  4: { label: "FET High School Programme", students: 60, cost: 1079742, perStudent: 17996, duration: "3 years (425 hours)", desc: "Work-readiness journey for Grade 10–12 learners across 3 Schools of Specialisation. Weekly coaching + Saturday sessions + holiday Design Thinking sprints.", budget: "Subject specialist coaches R960K, FET Teacher Support R14K, Snacks/meals R81K, LMS R11K, Travel R8K, Accreditation R5K", table: [["Subject specialist coaches (R6K × 160 days)","960,000"],["Snacks & meals","81,000"],["FET Teacher Support","14,000"],["LMS hosting","11,442"],["Travel","8,000"],["Accreditation","5,300"],["TOTAL","1,079,742"]] },
  5: { label: "Corporate Programme (CCBA-style)", students: 63, cost: 651000, perStudent: 10333, duration: "6 months", desc: "Corporate-funded leadership development for graduate hires. Design Thinking sprints, group coaching, Enneagram profiles, reflection assessments.", budget: "Enneagram profiles R271K, Group coaching R183K, Phase/DT facilitation R122K, Reflection sessions R46K, Contingency R29K", table: [["Enneagram profiles (R4,300 × 63)","270,900"],["Group coaching (8 sessions)","183,000"],["Phase/DT facilitation","122,000"],["Reflection sessions (8)","46,000"],["Contingency","29,100"],["TOTAL","651,000"]] },
  6: { label: "Cyborg Habits Short Course", students: null, cost: null, perStudent: 930, duration: "4–6 weeks", desc: "Online behaviour-change challenge. Asynchronous, AI-supported work habits platform. R930/learner.", budget: "R930/learner. Scales to any size.", table: [["Platform fee (R930/learner)","varies"]] },
  7: { label: "Sci-Bono Employability Skills", students: 90, cost: 231700, perStudent: 2574, duration: "13 weeks (15 days)", desc: "Short-format: 7 AI coaching days + Design Thinking (1-day + 5-day sprints + 2 presentation days). Includes Cyborg Habits platform.", budget: "AI coaching R84K (2 coaches × R1K/hr × 6hrs × 7d) + DT coaching R64K (1 coach × R2K/hr × 4hrs × 8d) + Cyborg Habits R83.7K (R930 × 90)", table: [["AI coaching (2 coaches × 7 days)","84,000"],["DT coaching (1 coach × 8 days)","64,000"],["Cyborg Habits platform (90 × R930)","83,700"],["TOTAL","231,700"]] },
  8: { label: "Bespoke Corporate — Leadership Accelerator", students: 25, cost: 2753418, perStudent: 92057, duration: "18 months", desc: "Bespoke leadership development for corporate graduate hires. 6-month online learning + 12-month coaching/mentoring extension. Monthly touchpoints: group coaching, individual coaching, reflection pods, mentor meetups. AI tools (Language Leveller, Cyborg Habits) embedded. Delivered via The Field Institute.", budget: "Design R452K + Delivery R2.3M for 25 participants (coaching, facilitation, AI tools, assessment, programme management)", table: [["Design & curriculum development","452,000"],["Delivery (25 participants × 18 months)","2,301,418"],["TOTAL","2,753,418"]] },
};

export const detectType = g => {
  // Priority 1: explicit "Type N" in notes
  const n = (g.notes || "").toLowerCase();
  for (let i = 8; i >= 1; i--) { if (n.includes(`type ${i}`) || n.includes(`(type ${i})`)) return PTYPES[i]; }
  // Priority 2: infer from ask amount (only when ask is set)
  if (!g.ask || g.ask <= 0) return null;
  if (g.ask <= 250000) return PTYPES[7];   // Sci-Bono short course (R232K)
  if (g.ask <= 550000) return PTYPES[1];   // Partner-funded (R516K)
  if (g.ask <= 700000) return PTYPES[5];   // Corporate (R651K)
  if (g.ask <= 1100000) return PTYPES[4];  // FET High School (R1.08M)
  if (g.ask <= 1400000) return PTYPES[3];  // With stipends (R1.24M)
  return PTYPES[2];                         // Full-funded with stipends + laptops (R1.6M+)
};

export const multiCohortInfo = g => {
  const n = (g.notes || "").toLowerCase();
  const m = n.match(/(\d+)\s*[×x]?\s*type\s*(\d)/i) || n.match(/(\d+)\s*cohorts?/i);
  return m ? { count: parseInt(m[1]), typeNum: m[2] ? parseInt(m[2]) : 1 } : null;
};

/**
 * Select the best PTYPE + cohort count that stays within the funder's budget.
 * Used by "Roll the Dice" to auto-populate the BudgetBuilder.
 * Returns { typeNum, cohorts } or null if no funderBudget.
 */
export const selectOptimalBudget = g => {
  // If notes already specify a type, respect that
  const n = (g.notes || "").toLowerCase();
  for (let i = 8; i >= 1; i--) {
    if (n.includes(`type ${i}`) || n.includes(`(type ${i})`)) {
      const mc = multiCohortInfo(g);
      return { typeNum: i, cohorts: mc?.count || 1 };
    }
  }

  // Check for "bespoke" or "leadership accelerator" keywords
  if (n.includes("bespoke") || n.includes("leadership accelerator") || n.includes("grad programme")) {
    return { typeNum: 8, cohorts: 1 };
  }

  const budget = g.funderBudget || g.ask || 0;
  if (budget <= 0) return { typeNum: 1, cohorts: 1 }; // default

  // Preferred types by funder category
  const t = (g.type || "").toLowerCase();
  let preferred;
  if (t.includes("corporate")) preferred = [8, 5, 1, 7, 3];
  else if (t.includes("government") || t.includes("seta")) preferred = [4, 1, 3, 7];
  else if (t.includes("international")) preferred = [1, 3, 2];
  else if (t.includes("tech")) preferred = [1, 5, 7];
  else preferred = [1, 3, 5, 7, 4, 2]; // Foundation + default

  // Prefer the FIRST viable option in the preferred list (strategic fit first)
  // Only fall through to next type if the preferred one doesn't fit the budget at all
  for (const num of preferred) {
    const pt = PTYPES[num];
    if (!pt || !pt.cost) continue; // skip Type 6 (no fixed cost)
    const maxCohorts = Math.floor(budget / pt.cost);
    if (maxCohorts >= 1) {
      // Use as many cohorts as the budget supports for this strategically-preferred type
      return { typeNum: num, cohorts: maxCohorts };
    }
  }

  // If no preferred type fits, find whatever does
  for (let num = 7; num >= 1; num--) {
    const pt = PTYPES[num];
    if (!pt || !pt.cost) continue;
    if (budget >= pt.cost) return { typeNum: num, cohorts: Math.floor(budget / pt.cost) };
  }

  return { typeNum: 1, cohorts: 1 };
};

export const funderStrategy = g => {
  const f = g.funder || "";
  const t = g.type || "";
  const focus = (g.focus || []).join(", ");
  const returning = isFunderReturning(f);
  const pt = detectType(g);
  const mc = multiCohortInfo(g);
  const a = FUNDER_ANGLES[f] || { lead: focus || "youth employment and digital skills", hook: `NO PRE-EXISTING FUNDER INTELLIGENCE for ${f}. Do NOT use generic alignment language like "aligns with our mission." Instead: use the funder research below to identify their SPECIFIC priorities, then open with a concrete connection between what they fund and what the organisation delivers. If no research is available, lead with the organisation's strongest proof points from the context and let the numbers speak.`, sections: ["Impact", "Programme", "Budget", "Sustainability"], lang: "impact, youth, digital skills, employment", noIntel: true };
  const structures = {
    "Corporate CSI": ["Cover Letter", "Executive Summary", "B-BBEE Value Proposition", "Programme Overview", "Impact & Outcomes", "Budget", "Brand Alignment & Visibility", "Sustainability", "Appendices"],
    "Government/SETA": ["Cover Letter", "Executive Summary", "Regulatory Alignment (NQF/SAQA/NSDP)", "Organisational Capacity", "Programme Description", "Accreditation & Quality Assurance", "Budget & Value for Money", "M&E Framework", "Transformation & Equity", "Appendices"],
    "International": ["Cover Letter", "Executive Summary", "Problem Analysis", "Theory of Change", "Programme Design", "Impact Framework (SDG-aligned)", "Budget (with cost-effectiveness analysis)", "Sustainability & Exit Strategy", "Risk Management", "Safeguarding", "Appendices"],
    "Foundation": ["Cover Letter", "Executive Summary", "The Challenge", "Our Approach", "Evidence of Impact", "Programme Details", "Budget", "Sustainability", "Organisational Background", "Appendices"],
    "Tech Company": ["Cover Letter", "Executive Summary", "Technology & Innovation", "Programme Design", "AI Integration", "Impact Metrics", "Budget", "Scale Pathway", "Appendices"],
    "Partnership": ["Cover Letter", "Partnership Proposition", "Programme & Curriculum", "White-Label Delivery Model", "Outcomes & Evidence", "Pricing & Commercial Terms", "Brand Integration", "Implementation Timeline", "Appendices"],
  };
  // Default page targets by funder type — ~500 words/page
  const pageDefaults = {
    "Corporate CSI": 8,
    "Government/SETA": 12,
    "International": 12,
    "Foundation": 8,
    "Tech Company": 6,
    "Partnership": 5,
  };
  const targetPages = a.targetPages || pageDefaults[t] || 8;
  const formatNotes = a.formatNotes || "";
  // Funder-specific sections override generic type structure when they include Cover Letter (= full structure, not just hints)
  const funderHasFullStructure = a.sections && a.sections.length >= 4 && a.sections.some(s => s.toLowerCase().includes("cover") || s.toLowerCase().includes("budget"));
  const structure = funderHasFullStructure ? a.sections : (structures[t] || structures["Foundation"]);
  return { ...a, returning, pt, mc, structure, targetPages, formatNotes };
};
