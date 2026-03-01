/*
  Seed script: Creates the d-lab NPC org with team, pipeline config, and seed grants.
  Run once: node server/seed.js
*/
import 'dotenv/config';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import {
  getOrgBySlug, createOrg, updateOrgProfile, setOrgPassword,
  upsertTeamMember, upsertPipelineConfig, upsertGrant,
} from './db.js';

// Rich org context for AI prompts — sourced from src/data/context.js
const CTX_SLIM = `d-lab NPC (The Field Lab NPC) — South African NPO training unemployed youth in AI-native digital skills.
NPO 2017/382673/08 | PBO 930077003 | Section 18A tax-exempt. Director: Alison Jacobson.
KEY OUTCOMES: 92% completion (vs 55% sector avg), 85% employment within 3 months, 29% pre-graduation placement, 60 learners in 2025.
7 PROGRAMME TYPES: Type 1 Partner-funded cohort R516K/20 students | Type 2 d-lab funded R1.597M/20 | Type 3 With stipends R1.236M/20 | Type 4 FET R1.079M/60 | Type 5 Corporate R651K/63 | Type 6 Cyborg Habits R930/learner | Type 7 Short-format R232K/90.
DELIVERY: Partner model — d-lab provides curriculum, coaching, AI tools, assessment, accreditation; local partners provide venue + recruitment. Current: Inkcubeko (Gauteng), Penreach (Mpumalanga).
AI TOOLS (in-house): LMS, Language Leveller, Assessornator, Cyborg Habits platform.
FUNDERS: Telkom Foundation, Get It Done Foundation, TK Foundation, Sage Foundation, SAP, C-Track, EOH.
2026 BUDGET: R13.4M (R9.3M grants + R2.5M earned revenue + R1.08M in-kind).`;

const CTX_FULL = `ABOUT d-lab (The Field Lab NPC)
NPO 2017/382673/08 | PBO 930077003 | Section 18A tax-exempt
Founded 2017, programme launched 2022. Director: Alison Jacobson.

MISSION: d-lab equips young innovators with the skills, mindset, and digital fluency needed to thrive in the modern workplace. We combine design thinking, digital competence — particularly AI — and character development through a programme accredited by the Institute of Chartered IT Professionals (ICITP).

ACCREDITATION: ICITP (SAQA registered) via Portfolios of Evidence + ICDL + self-paced micro-courses.

4 PILLARS: Design Thinking, Digital & AI Competency, Power Skills (communication, resilience, teamwork, problem-solving per WEF framework), Work Readiness.

PROGRAMME TYPES:
TYPE 1: STANDARD COHORT — PARTNER-FUNDED (R516K per 20-student cohort) — 9-month accredited work-readiness programme for unemployed youth 18-25. 6 months coursework + 3 months industry internship. Cost per student: R25,800.
TYPE 2: STANDARD COHORT — d-lab FUNDED WITH STIPENDS & LAPTOPS (R1.597M per 20-student cohort) — Same programme, d-lab provides everything including laptops (R318K) and stipends (R763K). Cost per student: R79,860.
TYPE 3: STANDARD COHORT — WITH STIPENDS ONLY (R1.236M per 20-student cohort) — Partner provides infrastructure + laptops, d-lab provides programme + stipends (R720K). Cost per student: R61,800.
TYPE 4: FET HIGH SCHOOL PROGRAMME (R1.079M for 60 students across 3 schools) — 3-year, 425-hour work-readiness journey for Grade 10-12 learners. Cost per student: R18K/year.
TYPE 5: CORPORATE PROGRAMME — CCBA FUTURE LEADERS (R651K for 63 participants) — Corporate leadership development. Cost per participant: R10,333.
TYPE 6: CYBORG HABITS SHORT COURSE (US$49/learner = ~R930) — 4-6 week online AI behaviour-change challenge.
TYPE 7: SCI-BONO EMPLOYABILITY SKILLS (R232K for 90 learners) — Short-format: 15 working days over 13 weeks. Cost per learner: R2,576.

2026 BUDGET: R13.431M total expenses. Income R12.873M. Personnel R7.43M, Cohorts R3.145M, FET R1.079M, CCBA R651K, Operations R1.126M.

2025 IMPACT: 3 cohorts, 60 learners. 92% completion (vs ~55% sector avg). 85% employed within 3 months. 29% pre-graduation placement. 100% internship placement every cohort since inception.

GOVERNANCE: Board of 3 executive directors with 140+ years combined education leadership:
- Alison Jacobson: Education, Marketing & Media
- Barbara Dale-Jones: Governance & Finance
- David Kramer: Fundraising & Sustainability

AI TOOLS (in-house): Bespoke LMS, Language Leveller, Assessornator, Cyborg Habits platform, Microjobbing programme.

EXISTING FUNDERS: Telkom Foundation, Get It Done Foundation, TK Foundation, Sage Foundation, SAP, C-Track, EOH, The Field Institute (CCBA).

TONE: Warm, human, compelling — not dry or bureaucratic. Lead with human story and real impact. Specific numbers woven into narrative. Emphasise the SYSTEM — 7 programme types, partner delivery model, in-house AI tools, diversified revenue, exceptional outcomes.`;

const hashPw = async (pw) => bcrypt.hash(pw, 10);

// ── Check if already seeded ──
const existing = getOrgBySlug('dlab');
if (existing) {
  console.log('d-lab org already exists. Skipping seed.');
  process.exit(0);
}

console.log('Seeding d-lab NPC...');

// ── Create org ──
const orgId = createOrg({
  slug: 'dlab',
  name: 'd-lab NPC',
  website: 'https://www.d-lab.co.za',
  industry: 'Education / Youth Development',
  country: 'South Africa',
  currency: 'ZAR',
});

// ── Set password ──
setOrgPassword(orgId, await hashPw('dlab2026'));

// ── Profile ──
updateOrgProfile(orgId, {
  mission: 'd-lab NPC (The Field Lab NPC) trains unemployed South African youth in AI-native digital skills, achieving 92% completion (vs 55% sector average) and 85% employment within 3 months.',
  programmes: [
    { id: 'type1', name: 'Partner-Funded Cohort', cost: 516000, desc: '20 youth, 9 months, digital skills + AI tools, funded by partner' },
    { id: 'type2', name: 'd-lab Funded Cohort', cost: 1597000, desc: '20 youth, full support incl. stipends + laptops + devices' },
    { id: 'type3', name: 'Cohort with Stipends', cost: 1236000, desc: '20 youth, 9 months, includes R720K stipends' },
    { id: 'type4', name: 'FET Programme', cost: 1079000, desc: '425-hour journey for Grade 10-12, 3-year programme' },
    { id: 'type5', name: 'Corporate Programme', cost: 651000, desc: 'Design Thinking + Enneagram for corporate teams' },
    { id: 'type6', name: 'Cyborg Habits Short Course', cost: 930, desc: 'AI literacy short course, per-licence pricing' },
    { id: 'type7', name: 'Intensive Short Format', cost: 231790, desc: '15 days over 13 weeks, 90 school-leavers' },
  ],
  impact_stats: {
    completion_rate: 0.92,
    employment_rate: 0.85,
    sector_average_completion: 0.55,
    learners_trained: 500,
    employment_window_months: 3,
  },
  tone: 'Direct, evidence-based, outcomes-focused. No hollow development jargon.',
  anti_patterns: 'No "SA has X% unemployment" openers. No hollow phrases like "holistic approach" or "cutting-edge solutions". No generic impact claims without data.',
  past_funders: 'Telkom Foundation, Sage Foundation, SAP, CCBA, Sci-Bono',
  context_slim: CTX_SLIM,
  context_full: CTX_FULL,
});

// ── Team ──
const team = [
  { id: 'alison', name: 'Alison', initials: 'AJ', role: 'director', persona: 'Strategic thinker focused on programme impact, sustainability, and mission alignment.' },
  { id: 'david', name: 'David', initials: 'DM', role: 'director', persona: 'Focus on governance, financial prudence, risk, and compliance.' },
  { id: 'barbara', name: 'Barbara', initials: 'BK', role: 'director', persona: 'Expertise in partnerships, stakeholder engagement, and programme design.' },
  { id: 'nolan', name: 'Nolan', initials: 'NP', role: 'hop', persona: 'Oversee programme delivery. Focus on operational feasibility.' },
  { id: 'ayanda', name: 'Ayanda', initials: 'AO', role: 'pm', persona: 'Hands-on with learners and delivery. Focus on practical details.' },
  { id: 'team', name: 'Unassigned', initials: '\u2014', role: 'none' },
];
for (const m of team) {
  upsertTeamMember(orgId, m);
}

// ── Pipeline Config ──
upsertPipelineConfig(orgId, {
  stages: [
    { id: 'scouted', label: 'Scouted', c: '#64748B', bg: '#F1F5F9' },
    { id: 'qualifying', label: 'Qualifying', c: '#2563EB', bg: '#EFF6FF' },
    { id: 'drafting', label: 'Drafting', c: '#EA580C', bg: '#FFF7ED' },
    { id: 'review', label: 'Review', c: '#7C3AED', bg: '#F5F3FF' },
    { id: 'submitted', label: 'Submitted', c: '#DB2777', bg: '#FDF2F8' },
    { id: 'awaiting', label: 'Awaiting', c: '#0891B2', bg: '#ECFEFF' },
    { id: 'won', label: 'Won', c: '#059669', bg: '#ECFDF5' },
    { id: 'lost', label: 'Lost', c: '#DC2626', bg: '#FEF2F2' },
    { id: 'deferred', label: 'Deferred', c: '#94A3B8', bg: '#F8FAFC' },
  ],
  gates: {
    'drafting->review': { need: 'hop', label: 'Head of Programmes must approve draft for review' },
    'review->submitted': { need: 'director', label: 'Director must approve before submission' },
    'awaiting->won': { need: 'director', label: 'Director must confirm award' },
    'awaiting->lost': { need: 'director', label: 'Director must confirm loss' },
  },
  funder_types: ['Corporate CSI', 'Government/SETA', 'International', 'Foundation', 'Tech Company'],
  win_factors: ['Outcome data', 'Budget fit', 'Geographic match', 'Relationship', 'AI angle', 'Rural focus', 'Gender angle', 'Employment commitment', 'Co-funding', 'SETA alignment', 'Replicable model', 'Tech platform'],
  loss_factors: ['Budget too high', 'Outside focus', 'Track record', 'Geography', 'Missing docs', 'Competitive', 'Timing missed', 'Insufficient detail', 'Org too small', 'Already funded similar'],
  doc_requirements: {
    'Corporate CSI': ['PBO Certificate', 'NPO Registration', 'Tax Clearance (SARS)', 'Audited Financials', 'B-BBEE Certificate', 'Organisation Profile', 'Programme Description', 'Logical Framework', 'Detailed Budget', 'Board Resolution'],
    'Government/SETA': ['PBO Certificate', 'NPO Registration', 'Tax Clearance (SARS)', 'Audited Financials (2yr)', 'B-BBEE Certificate', 'FICA Compliance', 'Accreditation Certificates', 'Skills Development Plan', 'WSP/ATR', 'Board Resolution', 'Banking Confirmation', 'Company Registration'],
    'International': ['NPO Registration', 'Audited Financials (2yr)', 'Organisation Profile', 'Theory of Change', 'M&E Framework', 'Programme Description', 'Budget (USD)', 'Risk Register', 'Safeguarding Policy', 'Anti-Fraud Policy'],
    'Foundation': ['PBO Certificate', 'NPO Registration', 'Tax Clearance (SARS)', 'Audited Financials', 'Organisation Profile', 'Programme Description', 'Detailed Budget', 'Outcomes Framework', 'Board Resolution'],
    'Tech Company': ['NPO Registration', 'Organisation Profile', 'Programme Description', 'Detailed Budget', 'Impact Metrics', 'Tech Platform Overview', 'Data Privacy Policy'],
  },
  roles: {
    director: { label: 'Director', level: 3, can: ['scouted', 'qualifying', 'drafting', 'review', 'submitted', 'awaiting', 'won', 'lost', 'deferred'] },
    hop: { label: 'Head of Programmes', level: 2, can: ['scouted', 'qualifying', 'drafting', 'review'] },
    pm: { label: 'Programme Manager', level: 1, can: ['scouted', 'qualifying', 'drafting'] },
  },
});

// ── Seed Grants ──
const SEED = [
  { id: "g1", name: "DGMT Youth Transition", funder: "DG Murray Trust", type: "Foundation", stage: "drafting", ask: 1236000, deadline: "2026-04-30", focus: ["Youth Employment", "Digital Skills", "Systems Change"], geo: ["Gauteng", "Western Cape"], rel: "Cold", pri: 5, hrs: 12, notes: "Proposal drafted. Cohort with stipends (Type 3). Ready for review.", log: [{ d: "2026-02-06", t: "Draft completed" }], on: "", of: [], owner: "alison", docs: {}, fups: [], subDate: null, applyUrl: "https://dgmt.co.za/apply-for-funding/" },
  { id: "g2", name: "MICT SETA Discretionary", funder: "MICT SETA", type: "Government/SETA", stage: "drafting", ask: 2210000, deadline: "2026-07-15", focus: ["Digital Skills", "MICT", "Youth Employment", "AI/4IR"], geo: ["Gauteng", "Mpumalanga"], rel: "Cold", pri: 5, hrs: 20, notes: "60-learner programme: 3 x Type 1 partner-funded cohorts.", log: [{ d: "2026-02-06", t: "Full proposal drafted" }], on: "", of: [], owner: "alison", docs: {}, fups: [], subDate: null, applyUrl: "https://www.mict.org.za/dg-window-for-2025-26/" },
  { id: "g3", name: "IDC CSI Grant", funder: "Industrial Development Corp", type: "Government/SETA", stage: "drafting", ask: 1597000, deadline: null, focus: ["Youth Employment", "Rural Dev", "Women", "Digital Skills"], geo: ["Gauteng"], rel: "Cold", pri: 4, hrs: 10, notes: "1 x Type 2 d-lab funded cohort.", log: [{ d: "2026-02-06", t: "Proposal drafted" }], on: "", of: [], owner: "alison", docs: {}, fups: [], subDate: null, applyUrl: "https://www.idc.co.za/csi/application-guidelines/" },
  { id: "g4", name: "Vodacom Foundation", funder: "Vodacom Foundation", type: "Corporate CSI", stage: "drafting", ask: 1891000, deadline: null, focus: ["Education", "Digital Skills", "Youth Employment", "Women"], geo: ["Gauteng"], rel: "Cold", pri: 5, hrs: 10, notes: "1 x Type 3 cohort with stipends + Cyborg Habits AI platform pilot.", log: [{ d: "2026-02-06", t: "Partnership proposal drafted" }], on: "", of: [], owner: "alison", docs: {}, fups: [], subDate: null, applyUrl: "https://www.vodacom.com/vodacom-foundation.php" },
  { id: "g5", name: "Momentum Group Foundation", funder: "Momentum Group", type: "Corporate CSI", stage: "scouted", ask: 1236000, deadline: null, focus: ["Youth Employment", "Digital Skills"], geo: ["Gauteng"], rel: "Cold", pri: 4, hrs: 0, notes: "1 x Type 3 cohort with stipends.", log: [], on: "", of: [], owner: "team", docs: {}, fups: [], subDate: null, applyUrl: "https://www.momentum.co.za/momentum/about-us/foundation" },
  { id: "g6", name: "FirstRand Foundation", funder: "FirstRand Foundation", type: "Foundation", stage: "scouted", ask: 1597000, deadline: null, focus: ["Youth Employment", "Education"], geo: ["Gauteng"], rel: "Cold", pri: 4, hrs: 0, notes: "R2-3M typical grants. Type 2 d-lab funded cohort.", log: [], on: "", of: [], owner: "team", docs: {}, fups: [], subDate: null, applyUrl: "https://www.firstrandfoundation.org.za/apply" },
  { id: "g7", name: "Microsoft SA Skills", funder: "Microsoft South Africa", type: "Tech Company", stage: "scouted", ask: 1079000, deadline: null, focus: ["AI/4IR", "Digital Skills"], geo: [], rel: "Cold", pri: 4, hrs: 0, notes: "FET programme funding (Type 4).", log: [], on: "", of: [], owner: "team", docs: {}, fups: [], subDate: null, applyUrl: "https://www.microsoft.com/en-za/corporate-responsibility" },
  { id: "g8", name: "Google.org Impact Challenge", funder: "Google.org", type: "Tech Company", stage: "scouted", ask: 2997000, deadline: null, focus: ["AI/4IR", "Education", "EdTech"], geo: [], rel: "Cold", pri: 4, hrs: 0, notes: "1 x Type 2 d-lab funded cohort + AI platform R&D.", log: [], on: "", of: [], owner: "team", docs: {}, fups: [], subDate: null, applyUrl: "https://www.google.org/opportunities/" },
  { id: "g9", name: "Mastercard Foundation", funder: "Mastercard Foundation", type: "International", stage: "scouted", ask: 5173000, deadline: null, focus: ["Youth Employment", "Digital Skills"], geo: [], rel: "Cold", pri: 3, hrs: 0, notes: "Young Africa Works — Year 1 proof proposal.", log: [], on: "", of: [], owner: "team", docs: {}, fups: [], subDate: null, applyUrl: "https://mastercardfdn.org/young-africa-works/" },
  { id: "g10", name: "Telkom Foundation Renewal", funder: "Telkom Foundation", type: "Corporate CSI", stage: "qualifying", ask: 1032000, deadline: "2026-06-30", focus: ["Digital Skills", "Youth Employment"], geo: ["Gauteng", "Western Cape", "Mpumalanga"], rel: "Previous Funder", pri: 5, hrs: 3, notes: "Renewal needed. 2 x Type 1 partner-funded cohorts.", log: [{ d: "2025-12-01", t: "Current funding ends Q2 2026" }], on: "", of: [], owner: "alison", docs: {}, fups: [], subDate: null, applyUrl: "https://www.telkom.co.za/about_us/community/ngo-application.html" },
  { id: "g11", name: "Sage Foundation Renewal", funder: "Sage Foundation", type: "Corporate CSI", stage: "qualifying", ask: 651000, deadline: "2026-06-30", focus: ["Youth Employment", "Entrepreneurship"], geo: ["Gauteng"], rel: "Previous Funder", pri: 5, hrs: 2, notes: "Strong relationship.", log: [], on: "", of: [], owner: "ayanda", docs: {}, fups: [], subDate: null, applyUrl: "https://www.sage.com/en-za/company/sage-foundation/" },
  { id: "g12", name: "SAP Social Impact", funder: "SAP", type: "Tech Company", stage: "qualifying", ask: 516000, deadline: null, focus: ["Digital Skills", "AI/4IR"], geo: ["Gauteng"], rel: "Previous Funder", pri: 4, hrs: 2, notes: "Expanded engagement. Type 1 partner-funded cohort.", log: [], on: "", of: [], owner: "ayanda", docs: {}, fups: [], subDate: null, applyUrl: "https://www.sap.com/africa/about/company/purpose-and-sustainability/csr.html" },
  { id: "g13", name: "Nedbank PW Charitable", funder: "Nedbank Private Wealth", type: "Foundation", stage: "drafting", ask: 1236000, deadline: "2026-03-31", focus: ["Youth Employment", "Digital Skills", "21st Century Skills"], geo: ["Gauteng", "Western Cape"], rel: "Cold", pri: 5, hrs: 8, notes: "20 youth via partner site. Type 3 with stipends.", log: [{ d: "2026-02-12", t: "Proposal drafted from Nedbank template" }], on: "", of: [], owner: "alison", docs: {}, fups: [], subDate: null, applyUrl: "https://www.nedbankprivatewealth.co.za" },
  { id: "g14", name: "GDE FET Programme", funder: "Gauteng Dept of Education", type: "Government/SETA", stage: "qualifying", ask: 1079000, deadline: "2026-05-31", focus: ["FET", "Work-readiness", "AI/4IR", "Youth"], geo: ["Gauteng"], rel: "Warm Intro", pri: 5, hrs: 6, notes: "Type 4 FET programme. 3-year, 425-hour journey.", log: [{ d: "2026-02-12", t: "FET concept note completed" }], on: "", of: [], owner: "alison", docs: {}, fups: [], subDate: null, applyUrl: "https://www.education.gpg.gov.za/" },
  { id: "g15", name: "Sci-Bono Employability", funder: "Sci-Bono Discovery Centre", type: "Corporate CSI", stage: "drafting", ask: 199300, deadline: "2026-03-15", focus: ["Employability", "AI", "Design Thinking"], geo: ["Gauteng"], rel: "Warm Intro", pri: 4, hrs: 4, notes: "Type 7 short-format: 15 days over 13 weeks for 90 school-leavers.", log: [{ d: "2026-02-12", t: "Formal quotation sent" }], on: "", of: [], owner: "alison", docs: {}, fups: [], subDate: null, applyUrl: "https://www.sci-bono.co.za/" },
  { id: "g16", name: "CCBA Future Leaders 2027", funder: "The Field Institute / CCBA", type: "Corporate CSI", stage: "qualifying", ask: 651100, deadline: "2026-09-30", focus: ["Corporate Leadership", "Design Thinking", "Enneagram"], geo: ["Gauteng"], rel: "Previous Funder", pri: 5, hrs: 4, notes: "Type 5 corporate programme. 63 participants.", log: [{ d: "2026-02-12", t: "2026 programme in delivery" }], on: "", of: [], owner: "alison", docs: {}, fups: [], subDate: null, applyUrl: "https://www.ccbagroup.com/sustainability/" },
  { id: "g17", name: "NSF Youth Skills", funder: "National Skills Fund", type: "Government/SETA", stage: "scouted", ask: 2500000, deadline: "2026-08-31", focus: ["Youth Employment", "Digital Skills", "AI/4IR"], geo: ["Gauteng", "Western Cape", "Mpumalanga"], rel: "Cold", pri: 4, hrs: 0, notes: "3 x Type 1 partner-funded cohorts.", log: [], on: "", of: [], owner: "team", docs: {}, fups: [], subDate: null, applyUrl: "https://www.nsf.gov.za/" },
  { id: "g18", name: "Old Mutual Foundation", funder: "Old Mutual Foundation", type: "Foundation", stage: "scouted", ask: 1236000, deadline: null, focus: ["Youth Employment", "Education", "Financial Literacy"], geo: ["Gauteng", "Western Cape"], rel: "Cold", pri: 3, hrs: 0, notes: "Type 3 cohort with stipends.", log: [], on: "", of: [], owner: "team", docs: {}, fups: [], subDate: null, applyUrl: "https://www.oldmutual.co.za/about/responsible-business/old-mutual-foundation/" },
  { id: "g19", name: "Oppenheimer Memorial Trust", funder: "Oppenheimer Memorial Trust", type: "Foundation", stage: "scouted", ask: 516000, deadline: "2026-06-30", focus: ["Education", "Youth Development"], geo: ["Mpumalanga"], rel: "Cold", pri: 3, hrs: 0, notes: "Type 1 partner-funded cohort.", log: [], on: "", of: [], owner: "team", docs: {}, fups: [], subDate: null, applyUrl: "https://www.omt.org.za/how-to-apply/" },
  { id: "g20", name: "Cyborg Habits Corporate Sales", funder: "Multiple Corporates", type: "Corporate CSI", stage: "qualifying", ask: 570000, deadline: null, focus: ["AI/4IR", "Digital Skills", "Corporate Training"], geo: [], rel: "Warm Intro", pri: 4, hrs: 3, notes: "Type 6 Cyborg Habits short course. 1,000 licences.", log: [{ d: "2026-01-15", t: "Product launched, sales pipeline building" }], on: "", of: [], owner: "alison", docs: {}, fups: [], subDate: null, applyUrl: "https://www.d-lab.co.za/cyborg-habits" },
  { id: "g21", name: "W&R SETA Discretionary", funder: "W&R SETA", type: "Government/SETA", stage: "scouted", ask: 1032000, deadline: "2026-05-31", focus: ["Digital Skills", "Youth Employment", "Retail/Wholesale"], geo: ["Gauteng", "Western Cape"], rel: "Cold", pri: 3, hrs: 0, notes: "2 x Type 1 cohorts.", log: [], on: "", of: [], owner: "team", docs: {}, fups: [], subDate: null, applyUrl: "https://www.wrseta.org.za/grant_application.aspx" },
  { id: "g22", name: "Raith Foundation", funder: "Raith Foundation", type: "Foundation", stage: "scouted", ask: 1597000, deadline: null, focus: ["Youth Employment", "Innovation", "Education"], geo: ["Gauteng", "Western Cape"], rel: "Cold", pri: 3, hrs: 0, notes: "Type 2 d-lab funded cohort.", log: [], on: "", of: [], owner: "team", docs: {}, fups: [], subDate: null, applyUrl: "https://www.rfrsa.org/" },
  { id: "g23", name: "Intensives Revenue", funder: "Various STEM Centres", type: "Corporate CSI", stage: "qualifying", ask: 225000, deadline: null, focus: ["AI", "Design Thinking", "Employability"], geo: ["Gauteng", "Western Cape", "Mpumalanga"], rel: "Warm Intro", pri: 4, hrs: 2, notes: "3 x R75K Intensive short programmes.", log: [{ d: "2026-01-20", t: "Budgeted for 3 intensives in 2026" }], on: "", of: [], owner: "nolan", docs: {}, fups: [], subDate: null, applyUrl: "https://www.d-lab.co.za/intensives" },
];

for (const g of SEED) {
  upsertGrant(orgId, g);
}

console.log(`Seeded d-lab NPC: ${SEED.length} grants, ${team.length} team members`);
console.log(`Login: /org/dlab with password: dlab2026`);
process.exit(0);
