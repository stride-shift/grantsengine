/* Static data constants */

export const STAGES = [
  { id: "scouted", label: "Scouted", c: "#6B7280" },
  { id: "qualifying", label: "Qualifying", c: "#1E56A0" },
  { id: "drafting", label: "Drafting", c: "#D4A017" },
  { id: "review", label: "Review", c: "#2B6CB0" },
  { id: "submitted", label: "Submitted", c: "#D03228" },
  { id: "awaiting", label: "Awaiting", c: "#1A7FAD" },
  { id: "won", label: "Won", c: "#16A34A" },
  { id: "lost", label: "Lost", c: "#D03228" },
  { id: "deferred", label: "Deferred", c: "#9CA3AF" },
];

export const FTYPES = ["Corporate CSI", "Government/SETA", "International", "Foundation", "Tech Company"];
export const WFAC = ["Outcome data", "Budget fit", "Geographic match", "Relationship", "AI angle", "Rural focus", "Gender angle", "Employment commitment", "Co-funding", "SETA alignment", "Replicable model", "Tech platform"];
export const LFAC = ["Budget too high", "Outside focus", "Track record", "Geography", "Missing docs", "Competitive", "Timing missed", "Insufficient detail", "Org too small", "Already funded similar"];
export const TOPICS = ["AI in Youth Development", "AI-Native Curricula", "Digital Skills at Scale", "NPO Technology", "Design Thinking for Impact", "JTBD in Education", "Rural Digital Transformation", "AI Governance Africa", "Youth Employment 4IR"];

export const DOCS = {
  "Corporate CSI": ["PBO Certificate", "NPO Registration", "Tax Clearance (SARS)", "Audited Financials", "B-BBEE Certificate", "Organisation Profile", "Programme Description", "Logical Framework", "Detailed Budget", "Board Resolution"],
  "Government/SETA": ["PBO Certificate", "NPO Registration", "Tax Clearance (SARS)", "Audited Financials", "Audited Financials (Prior Year)", "B-BBEE Certificate", "FICA Compliance", "Accreditation Certificates", "Skills Development Plan", "WSP/ATR", "Board Resolution", "Banking Confirmation", "Company Registration"],
  "International": ["NPO Registration", "Audited Financials", "Audited Financials (Prior Year)", "Organisation Profile", "Theory of Change", "M&E Framework", "Programme Description", "Budget (USD)", "Risk Register", "Safeguarding Policy", "Anti-Fraud Policy"],
  "Foundation": ["PBO Certificate", "NPO Registration", "Tax Clearance (SARS)", "Audited Financials", "Organisation Profile", "Programme Description", "Detailed Budget", "Outcomes Framework", "Board Resolution"],
  "Tech Company": ["NPO Registration", "Organisation Profile", "Programme Description", "Detailed Budget", "Impact Metrics", "Tech Platform Overview", "Data Privacy Policy"],
};

// System-level compliance documents shared across all grants
export const ORG_DOCS = [
  { id: "pbo", name: "PBO Certificate", desc: "Public Benefit Organisation approval letter from SARS", renew: false, cat: "Registration" },
  { id: "npo", name: "NPO Registration Certificate", desc: "Department of Social Development NPO certificate (273-412 NPO)", renew: false, cat: "Registration" },
  { id: "cipc", name: "Company Registration (CIPC)", desc: "CIPC registration documents for d-lab NPC", renew: false, cat: "Registration" },
  { id: "bbbee", name: "B-BBEE Certificate / Affidavit", desc: "Broad-Based Black Economic Empowerment verification certificate or EME/QSE affidavit", renew: true, cat: "Compliance" },
  { id: "tax", name: "Tax Clearance (SARS)", desc: "Valid SARS Tax Compliance Status (TCS) pin or certificate", renew: true, cat: "Compliance" },
  { id: "fica", name: "FICA Compliance Pack", desc: "FICA documentation: directors' IDs, proof of address, bank confirmation", renew: true, cat: "Compliance" },
  { id: "fin1", name: "Audited Financials (Current Year)", desc: "Latest independently audited annual financial statements", renew: true, cat: "Financial" },
  { id: "fin2", name: "Audited Financials (Prior Year)", desc: "Previous year independently audited annual financial statements", renew: true, cat: "Financial" },
  { id: "bank", name: "Banking Confirmation Letter", desc: "Bank-stamped confirmation of account details", renew: true, cat: "Financial" },
  { id: "board", name: "Board Resolution (Current)", desc: "Signed board resolution authorising grant applications", renew: true, cat: "Governance" },
  { id: "orgpro", name: "Organisation Profile", desc: "d-lab NPC overview, history, mission, team, and track record", renew: false, cat: "Org" },
  { id: "safeguard", name: "Safeguarding Policy", desc: "Child and vulnerable person safeguarding policy", renew: false, cat: "Governance" },
  { id: "antifraud", name: "Anti-Fraud & Corruption Policy", desc: "Organisational anti-fraud and anti-corruption policy", renew: false, cat: "Governance" },
  { id: "privacy", name: "Data Privacy / POPIA Policy", desc: "POPIA-compliant data privacy and protection policy", renew: false, cat: "Governance" },
  { id: "accred", name: "Accreditation Certificates", desc: "SETA or other accreditation for training delivery", renew: true, cat: "Compliance" },
  { id: "wsp", name: "WSP/ATR", desc: "Workplace Skills Plan and Annual Training Report", renew: true, cat: "Compliance" },
  { id: "sdp", name: "Skills Development Plan", desc: "Organisation-level skills development strategy", renew: false, cat: "Org" },
  { id: "toc", name: "Theory of Change", desc: "d-lab\'s theory of change document", renew: false, cat: "Org" },
  { id: "mne", name: "M&E Framework", desc: "Monitoring and evaluation framework for programmes", renew: false, cat: "Org" },
  { id: "risk", name: "Risk Register", desc: "Organisational risk register and mitigation plan", renew: true, cat: "Governance" },
];

// Map grant-level doc names to org-level doc IDs
export const DOC_MAP = {
  "PBO Certificate": "pbo", "NPO Registration": "npo", "Tax Clearance (SARS)": "tax",
  "Audited Financials": "fin1", "Audited Financials (Prior Year)": "fin2",
  "B-BBEE Certificate": "bbbee", "FICA Compliance": "fica", "Banking Confirmation": "bank",
  "Board Resolution": "board", "Organisation Profile": "orgpro", "Company Registration": "cipc",
  "Accreditation Certificates": "accred", "Skills Development Plan": "sdp", "WSP/ATR": "wsp",
  "Theory of Change": "toc", "M&E Framework": "mne", "Risk Register": "risk",
  "Safeguarding Policy": "safeguard", "Anti-Fraud Policy": "antifraud", "Data Privacy Policy": "privacy",
};


export const CAD = {
  "Corporate CSI": [{ d: 14, l: "Status check", t: "status" }, { d: 28, l: "Share success story", t: "update" }, { d: 42, l: "Offer to present", t: "offer" }, { d: 60, l: "Second follow-up", t: "status" }],
  "Government/SETA": [{ d: 21, l: "Confirm submission", t: "status" }, { d: 45, l: "Share interim outcomes", t: "update" }, { d: 75, l: "Request timeline", t: "status" }],
  "International": [{ d: 14, l: "Confirm receipt", t: "status" }, { d: 30, l: "Programme update", t: "update" }, { d: 60, l: "Offer site visit", t: "offer" }, { d: 90, l: "Check timeline", t: "status" }],
  "Foundation": [{ d: 14, l: "Status check", t: "status" }, { d: 35, l: "Share success story", t: "update" }, { d: 56, l: "Offer to discuss", t: "offer" }],
  "Tech Company": [{ d: 10, l: "Quick check-in", t: "status" }, { d: 21, l: "Share AI angle", t: "update" }, { d: 35, l: "Offer demo", t: "offer" }],
};


export const TEAM = [
  { id: "alison", name: "Alison", ini: "AJ", c: "#00E676", role: "director", title: "Director" },
  { id: "david", name: "David", ini: "DK", c: "#F59E0B", role: "board", title: "Board Member" },
  { id: "barbara", name: "Barbara", ini: "BD", c: "#EC4899", role: "board", title: "Board Member" },
  { id: "nolan", name: "Nolan", ini: "NB", c: "#8B5CF6", role: "hop", title: "Head of Programmes" },
  { id: "ayanda", name: "Ayanda", ini: "AO", c: "#5C9CFF", role: "pm", title: "Programme Manager" },
  { id: "siphumezo", name: "Siphumezo", ini: "SA", c: "#14B8A6", role: "coord", title: "Cohort Coordinator" },
  { id: "shanne", name: "Shanne", ini: "SS", c: "#F97316", role: "comms", title: "Social Media Coordinator" },
  { id: "team", name: "Unassigned", ini: "—", c: "#555", role: "none", title: "" },
];

export const ROLES = {
  director: { label: "Director", level: 3, can: ["scouted","qualifying","drafting","review","submitted","awaiting","won","lost","deferred"] },
  board: { label: "Board Member", level: 3, can: ["scouted","qualifying","drafting","review","submitted","awaiting","won","lost","deferred"] },
  hop: { label: "Head of Programmes", level: 2, can: ["scouted","qualifying","drafting","review"] },
  pm: { label: "Programme Manager", level: 1, can: ["scouted","qualifying","drafting"] },
  coord: { label: "Coordinator", level: 1, can: ["scouted","qualifying","drafting"] },
  comms: { label: "Communications", level: 0, can: ["scouted"] },
};

// Approval gates: stage transitions requiring sign-off from a specific role
export const GATES = {
  "drafting->review": { need: "hop", label: "Head of Programmes must approve draft for review" },
  "review->submitted": { need: "director", label: "Director must approve before submission" },
  "awaiting->won": { need: "director", label: "Director must confirm award" },
  "awaiting->lost": { need: "director", label: "Director must confirm loss" },
};

// Agent personas for AI emulation
export const PERSONAS = {
  alison: "You are Alison Jacobson, Director of d-lab NPC. Strategic thinker focused on programme impact, sustainability, and mission alignment. Direct, analytical. Push for clarity on budgets and measurable impact.",
  david: "You are David Kramer, Board Member of d-lab NPC (Fundraising & Sustainability). Focus on governance, financial prudence, risk, and compliance. Ask tough questions about budgets, funder relationships, and legal requirements. Thorough and detail-oriented.",
  barbara: "You are Barbara Dale-Jones, Board Member of d-lab NPC (Governance & Finance). Expertise in partnerships, stakeholder engagement, and programme design. Focus on compelling narratives, genuine partnerships, and appropriate ask amounts.",
  nolan: "You are Nolan Beudeker, Head of Programmes at d-lab NPC. Oversee programme delivery. Authorised to sign contracts up to R5K. Focus on operational feasibility, realistic timelines, curriculum readiness. Push back on overcommitting resources.",
  ayanda: "You are Ayanda Orrai, Programme Manager at d-lab NPC. Hands-on with learners and delivery. Focus on practical details: venues, recruitment, facilitator capacity, day-to-day operations. Flag risks early.",
};
