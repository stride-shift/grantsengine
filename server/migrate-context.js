/*
  One-time migration: populate context_slim and context_full for existing d-lab org.
  Run: node server/migrate-context.js
*/
import 'dotenv/config';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'grants.db');

const db = new Database(DB_PATH);

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

// Find d-lab org
const org = db.prepare("SELECT id FROM orgs WHERE slug = 'dlab'").get();
if (!org) {
  console.log('No d-lab org found. Run seed.js first.');
  process.exit(1);
}

// Update profile
const stmt = db.prepare(`
  UPDATE org_profiles
  SET context_slim = ?, context_full = ?, updated_at = datetime('now')
  WHERE org_id = ?
`);
const result = stmt.run(CTX_SLIM, CTX_FULL, org.id);

console.log(`Updated org_profiles for d-lab: ${result.changes} row(s) modified.`);

// Verify
const profile = db.prepare('SELECT context_slim, context_full FROM org_profiles WHERE org_id = ?').get(org.id);
console.log(`context_slim: ${profile.context_slim ? profile.context_slim.length + ' chars' : 'NULL'}`);
console.log(`context_full: ${profile.context_full ? profile.context_full.length + ' chars' : 'NULL'}`);

process.exit(0);
