import { useState, useEffect, useCallback, useMemo, useRef } from "react";

/* ════════════════════════════════════════════
   d-lab Grant Engine v14
   Design: Light, airy, minimalist.
   7 programme types, funder URLs, red-flag deadlines, programme-type-aware AI.
   Dark sidebar, saturated accents, strong contrast, no pastels.
   ════════════════════════════════════════════ */

const C = {
  bg: "#F7F8FA",
  white: "#FFFFFF",
  card: "#FFFFFF",
  raised: "#ECEEF1",
  subtle: "#D4D7DD",
  line: "#E2E4E9",
  hover: "#F0F1F4",
  green: "#0D9C5C",
  greenSoft: "#E6F5EE",
  greenBorder: "#0D9C5C80",
  dark: "#111318",
  t1: "#1A1D23",
  t2: "#3D4250",
  t3: "#6B7080",
  t4: "#9CA1AE",
  red: "#D94848",
  redSoft: "#FDECEC",
  amber: "#C67B1A",
  amberSoft: "#FDF3E6",
  blue: "#3574D4",
  blueSoft: "#EBF1FB",
  purple: "#6B47B8",
  purpleSoft: "#F0EBFA",
  sidebar: "#111318",
  sidebarHover: "#1C1F26",
  sidebarActive: "#252830",
  sidebarText: "#7D8290",
  sidebarTextActive: "#F0F1F4",
  accent: "#0D9C5C",
};

const FONT = `'Plus Jakarta Sans', 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif`;
const MONO = `'JetBrains Mono', 'SF Mono', 'Fira Code', monospace`;

// Google font injection
const fontLink = document.createElement("link");
fontLink.href = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap";
fontLink.rel = "stylesheet";
if (!document.querySelector(`link[href*="Jakarta"]`)) document.head.appendChild(fontLink);

/* ── ORG CONTEXT ── */
const CTX = `ABOUT d-lab (The Field Lab NPC)
NPO 2017/382673/08 | PBO 930077003 | Section 18A tax-exempt
Founded 2017, programme launched 2022. Director: Alison Jacobson.

MISSION: d-lab equips young innovators with the skills, mindset, and digital fluency needed to thrive in the modern workplace. We combine design thinking, digital competence — particularly AI — and character development through a programme accredited by the Institute of Chartered IT Professionals (ICITP).

ACCREDITATION: ICITP (SAQA registered) via Portfolios of Evidence + ICDL + self-paced micro-courses.

4 PILLARS: Design Thinking, Digital & AI Competency, Power Skills (communication, resilience, teamwork, problem-solving per WEF framework), Work Readiness.

══ PROGRAMME TYPES (d-lab delivers 6 distinct programme types — choose the right one for each funder) ══

TYPE 1: STANDARD COHORT — PARTNER-FUNDED (R516K per 20-student cohort)
9-month accredited work-readiness programme for unemployed youth 18-25. 6 months coursework + 3 months industry internship. Partner provides infrastructure, stipends, laptops. d-lab provides coaching, curriculum, assessment, accreditation, LMS.
Budget: Travel R38K, Accommodation R38K, Staff S&T R16K, Shuttles R4K, Accreditation R5K, Assessment R95K, ChatGPT licenses R108K, LMS R11K, Coaches R200K = R516K total.
Cost per student: R25,800. Model: d-lab provides curriculum, coaching, AI tools, assessment, and accreditation; local delivery partners provide venue, stipends, and student recruitment. Current partners: Inkcubeko (Gauteng), Penreach (Mpumalanga). The model is designed for any partner in any location — geography follows demand, not the other way around.

TYPE 2: STANDARD COHORT — d-lab FUNDED WITH STIPENDS & LAPTOPS (R1.597M per 20-student cohort)
Same 9-month programme, but d-lab provides EVERYTHING including laptops (R318K = R15,900 × 20) and stipends (R763K = R4,240/student × 9 months).
Budget: Base programme R516K + Laptops R318K + Stipends R763K = R1,597,000.
Cost per student: R79,860. Active: Sci-Bono cohort.

TYPE 3: STANDARD COHORT — WITH STIPENDS ONLY (R1.236M per 20-student cohort)
Partner provides infrastructure + laptops, d-lab provides programme + stipends.
Budget: Programme R516K + Stipends R720K (R4,000/student × 9 months) = R1,236,000.
Cost per student: R61,800. Model: Nedbank Private Wealth proposal.

TYPE 4: FET HIGH SCHOOL PROGRAMME (R1.079M for 60 students across 3 schools)
3-year, 425-hour work-readiness journey for Grade 10-12 learners. Partnership with Gauteng Dept of Education + 3 Schools of Specialisation. ~170 hrs/year (Years 1-2), 85 hrs (Year 3). Weekly coaching + Saturday sessions + holiday Design Thinking sprints.
Core blocks: AI/Cyborg Skills, PowerSkills, Digital Tools, Storytelling, Design Thinking, Entrepreneurship, Self-Discovery.
Budget: Travel R8K, FET Teacher Support R14K, Subject specialist coaches R960K (R6,000 × 160 days), Accreditation R5K, Snacks/meals R81K, LMS R11K = R1,079,000.
Cost per student: R18K/year. Status: MOU with GDE in progress.

TYPE 5: CORPORATE PROGRAMME — CCBA FUTURE LEADERS (R651K for 63 participants)
Corporate-funded leadership development for graduate hires. Design Thinking sprints, group coaching, Enneagram profiles, reflection assessments.
Budget: Phase/DT facilitation R122K, 8 Group coaching sessions R183K, 8 Reflection sessions R46K, Enneagram profiles R271K (R4,300 × 63), Contingency R29K = R651,000.
Cost per participant: R10,333. Delivered via The Field Institute.

TYPE 6: CYBORG HABITS SHORT COURSE (US$30/learner = ~R570)
4-6 week online behaviour-change challenge. Asynchronous, AI-supported work habits platform. Revenue-generating, scales to teachers/NGOs/corporates. Can be added to any cohort or sold standalone.

TYPE 7: SCI-BONO EMPLOYABILITY SKILLS (R199K for 90 learners)
Short-format: 15 working days over 13 weeks. 7 AI days (6 hrs/day, 2 coaches) + Design Thinking (1-day sprint + 5-day sprint + 2 presentation days).
Budget: AI coaching R84K (2 coaches × R1K/hr × 6hrs × 7 days) + DT coaching R64K (1 coach × R2K/hr × 4hrs × 8 days) + Cyborg Habits platform R51K (US$30 × 90) = R199K.
Cost per learner: R2,547 (incl VAT). Excludes venue/AV (Sci-Bono provides).

══ 2026 ORGANISATIONAL BUDGET (from approved budget) ══

INCOME: R12.873M total
- Monetary donations: R9.3M
- Non-cash donations: R1.08M (mentor hours)
- Non-donor income: R2.493M (Intensives R225K, Corporate Collaborations R2.028M, Microjobbing R240K)

EXPENSES: R13.431M total
- Personnel: R7.43M (Head of Programmes R1.28M, PM R445K, Lead Facilitator R407K, Senior Specialist R445K, 2 Coordinators R477K, Strategy/curriculum leadership R1.27M, Programme leadership R1.27M, Social media R178K, Mentorship Lead R51K, Mentors R1.08M, AI/automation lead R318K, AI interns R204K)
- Cohort 1 Inkcubeko: R516K (partner-funded)
- Cohort 2 Penreach: R516K (partner-funded)
- Cohort 3 Sci-Bono: R1.597M (d-lab funded + stipends + laptops)
- Cohort 4 Vexospark: R516K (partner-funded)
- CCBA Future Leaders: R651K
- FET Programme: R1.079M
- Operations: R1.045M + Subscriptions R81K

NET DEFICIT: -R558K (fundraising target)
BARE BONES BUDGET: R3.601M (survival mode: 1 cohort, skeleton staff)

30% ORG COST MODEL: For programmes not covered by org budget, add 30% contribution to core operational costs = R2.542M across Sci-Bono, Vexospark, FET.

══ 2025 IMPACT (verified, current) ══
- 3 cohorts, 60 learners — delivered through partner model (Gauteng, Western Cape, Mpumalanga)
- 92% completion rate (vs ~55% sector average)
- 85% of alumni employed, studying, or running ventures within 3 months
- 29% pre-graduation placement
- 100% internship placement for eligible learners, every cohort since inception
- Grew from 12-student pilot (2022) to a complete training SYSTEM with 7 programme types
- FET partnership with Gauteng Dept of Education signed
- Cyborg Habits short course launched
- STEM centre delivery model proven and contracted

2026 MILESTONES (from Get It Done Foundation application):
4-month: FET MOU signed, 100% facilitators trained, Cyborg Habits integrated into LMS
8-month: STEM centre delivery contracts active, for-profit cohort contract signed, 2026 student numbers double 2025
12-month: LMS AI chatbot live, 95% pass summative assessments, social media +50%, corporate collaborative contracts signed

INNOVATIONS (in-house, AI-powered):
- Bespoke LMS: tracks all student data, stores portfolios, supports blended delivery
- Language Leveller: adjusts English content to each learner's proficiency level
- Assessornator: automated assessment for consistent marking at scale
- Cyborg Habits platform: behaviour-change challenge for AI work habits
- Microjobbing programme: graduates earn early income through short paid tasks

GOVERNANCE: Board of 3 executive directors with 140+ years combined education leadership:
- Alison Jacobson: Education, Marketing & Media
- Barbara Dale-Jones: Governance & Finance
- David Kramer: Fundraising & Sustainability
Weekly risk monitoring, quarterly OKR reporting, data-informed decision-making.

EXISTING FUNDERS (previously funded/supported d-lab):
Telkom Foundation, Get It Done Foundation (R2.84M 2023, R4.99M 2024, R4.97M 2025, requesting R4.96M 2026), TK Foundation, Sage Foundation, SAP, C-Track, EOH, The Field Institute (CCBA).

TONE GUIDANCE: Write proposals that are warm, human, and compelling — not dry or bureaucratic. Lead with the human story and real impact. Show passion for the work. Use specific numbers to build credibility but weave them into narrative. When addressing a returning funder, acknowledge the existing relationship warmly and show what their previous support helped achieve. Be conversational but professional. When describing d-lab's growth and trajectory, ALWAYS emphasise the SYSTEM — 7 programme types, partner delivery model, in-house AI tools, diversified revenue, exceptional outcomes. NEVER lead with geographic expansion or province-counting. Geography is where the work happens, not why it matters. The story is: we built a system that works, and it can work anywhere.

PROPOSAL STRATEGY: Match the programme type to the funder. Small foundations (R200K-R600K): offer a partner-funded cohort (R516K) or Sci-Bono-style short course (R199K). Medium foundations/CSI (R600K-R1.5M): offer a cohort with stipends (R1.236M) or FET programme (R1.079M). Large funders (R1.5M+): offer d-lab-funded cohort (R1.597M) or multi-cohort packages. SETAs: multi-cohort national programmes. Corporate: CCBA-style leadership or multi-cohort with B-BBEE value. Always include organisational cost contribution (30%) for sustainability.`;

const CTX_SLIM = `d-lab NPC (The Field Lab NPC) — South African NPO training unemployed youth in AI-native digital skills.
NPO 2017/382673/08 | PBO 930077003 | Section 18A tax-exempt. Director: Alison Jacobson.
KEY OUTCOMES: 92% completion (vs 55% sector avg), 85% employment within 3 months, 29% pre-graduation placement, 60 learners in 2025.
7 PROGRAMME TYPES: Type 1 Partner-funded cohort R516K/20 students | Type 2 d-lab funded R1.597M/20 | Type 3 With stipends R1.236M/20 | Type 4 FET R1.079M/60 | Type 5 Corporate R651K/63 | Type 6 Cyborg Habits R570/learner | Type 7 Short-format R199K/90.
DELIVERY: Partner model — d-lab provides curriculum, coaching, AI tools, assessment, accreditation; local partners provide venue + recruitment. Current: Inkcubeko (Gauteng), Penreach (Mpumalanga).
AI TOOLS (in-house): LMS, Language Leveller, Assessornator, Cyborg Habits platform.
FUNDERS: Telkom Foundation, Get It Done Foundation, TK Foundation, Sage Foundation, SAP, C-Track, EOH.
2026 BUDGET: R13.4M (R9.3M grants + R2.5M earned revenue + R1.08M in-kind).`;

const FUNDER_HISTORY = {
  "telkom": "returning", "telkom foundation": "returning",
  "get it done": "returning", "get it done foundation": "returning",
  "tk foundation": "returning", "sage": "returning", "sage foundation": "returning",
  "sap": "returning", "c-track": "returning", "ctrack": "returning",
  "eoh": "returning", "the field institute": "returning", "field institute": "returning",
};
const isFunderReturning = name => {
  const n = (name || "").toLowerCase().trim();
  return Object.keys(FUNDER_HISTORY).some(k => n.includes(k) || k.includes(n));
};

// Programme type detection from grant notes/ask
const PTYPES = {
  1: { label: "Standard Cohort — Partner-funded", students: 20, cost: 516000, perStudent: 25800, duration: "9 months", desc: "Partner provides infrastructure/stipends/laptops; d-lab provides coaching, curriculum, assessment, accreditation, LMS.", budget: "Travel R38K, Accommodation R38K, Staff S&T R16K, Shuttles R4K, Accreditation R5K, Assessment R95K, ChatGPT licenses R108K, LMS R11K, Coaches R200K", table: [["Coaches & curriculum","200,000"],["Software licenses","108,000"],["ICITP assessment","95,400"],["Travel","38,160"],["Accommodation","38,160"],["Staff S&T","15,722"],["LMS hosting","11,442"],["Accreditation","5,300"],["Airport shuttles","3,816"],["TOTAL","516,000"]] },
  2: { label: "Standard Cohort — d-lab Funded + Stipends + Laptops", students: 20, cost: 1597000, perStudent: 79860, duration: "9 months", desc: "d-lab provides everything including laptops and stipends. Full ownership model.", budget: "Base programme R516K + Laptops R318K (R15,900 × 20) + Stipends R763K (R4,240/student × 9mo)", table: [["Base programme (Type 1)","516,000"],["Laptops (R15,900 × 20)","318,000"],["Stipends (R4,240 × 20 × 9mo)","763,200"],["TOTAL","1,597,200"]] },
  3: { label: "Standard Cohort — With Stipends", students: 20, cost: 1236000, perStudent: 61800, duration: "9 months", desc: "Partner provides infrastructure + laptops; d-lab provides programme + stipends.", budget: "Programme R516K + Stipends R720K (R4,000/student × 9 months)", table: [["Base programme (Type 1)","516,000"],["Stipends (R4,000 × 20 × 9mo)","720,000"],["TOTAL","1,236,000"]] },
  4: { label: "FET High School Programme", students: 60, cost: 1079000, perStudent: 18000, duration: "3 years (425 hours)", desc: "Work-readiness journey for Grade 10–12 learners across 3 Schools of Specialisation. Weekly coaching + Saturday sessions + holiday Design Thinking sprints.", budget: "Subject specialist coaches R960K, FET Teacher Support R14K, Snacks/meals R81K, LMS R11K, Travel R8K, Accreditation R5K", table: [["Subject specialist coaches (R6K × 160 days)","960,000"],["Snacks & meals","81,000"],["FET Teacher Support","14,000"],["LMS hosting","11,442"],["Travel","8,000"],["Accreditation","5,300"],["TOTAL","1,079,742"]] },
  5: { label: "Corporate Programme (CCBA-style)", students: 63, cost: 651000, perStudent: 10333, duration: "6 months", desc: "Corporate-funded leadership development for graduate hires. Design Thinking sprints, group coaching, Enneagram profiles, reflection assessments.", budget: "Enneagram profiles R271K, Group coaching R183K, Phase/DT facilitation R122K, Reflection sessions R46K, Contingency R29K", table: [["Enneagram profiles (R4,300 × 63)","270,900"],["Group coaching (8 sessions)","183,000"],["Phase/DT facilitation","122,000"],["Reflection sessions (8)","46,000"],["Contingency","29,100"],["TOTAL","651,000"]] },
  6: { label: "Cyborg Habits Short Course", students: null, cost: null, perStudent: 570, duration: "4–6 weeks", desc: "Online behaviour-change challenge. Asynchronous, AI-supported work habits platform. US$30/learner.", budget: "US$30/learner (≈R570). Scales to any size.", table: [["Platform fee (US$30/learner)","varies"]] },
  7: { label: "Sci-Bono Employability Skills", students: 90, cost: 199300, perStudent: 2547, duration: "13 weeks (15 days)", desc: "Short-format: 7 AI coaching days + Design Thinking (1-day + 5-day sprints + 2 presentation days). Includes Cyborg Habits platform.", budget: "AI coaching R84K (2 coaches × R1K/hr × 6hrs × 7d) + DT coaching R64K (1 coach × R2K/hr × 4hrs × 8d) + Cyborg Habits R51K (US$30 × 90)", table: [["AI coaching (2 coaches × 7 days)","84,000"],["DT coaching (1 coach × 8 days)","64,000"],["Cyborg Habits platform (90 × US$30)","51,300"],["TOTAL","199,300"]] },
};
const detectType = g => {
  const n = (g.notes || "").toLowerCase();
  for (let i = 7; i >= 1; i--) { if (n.includes(`type ${i}`) || n.includes(`(type ${i})`)) return PTYPES[i]; }
  // Fallback: infer from ask amount
  if (g.ask <= 250000) return PTYPES[7];
  if (g.ask <= 550000) return PTYPES[1];
  if (g.ask <= 700000) return PTYPES[5];
  if (g.ask >= 1500000) return PTYPES[2];
  if (g.ask >= 1000000) return PTYPES[3];
  return PTYPES[1];
};
const multiCohortInfo = g => {
  const n = (g.notes || "").toLowerCase();
  const m = n.match(/(\d+)\s*×?\s*type\s*(\d)/i) || n.match(/(\d+)\s*cohorts?/i);
  return m ? { count: parseInt(m[1]), typeNum: m[2] ? parseInt(m[2]) : 1 } : null;
};

/* ── FUNDER STRATEGY ENGINE ── */
const funderStrategy = g => {
  const f = g.funder || "";
  const t = g.type || "";
  const focus = (g.focus || []).join(", ");
  const returning = isFunderReturning(f);
  const pt = detectType(g);
  const mc = multiCohortInfo(g);
  // Funder-specific angles: what THIS funder cares about most
  const angles = {
    "DG Murray Trust": { lead: "youth transition from education to employment", hook: "DGMT champions systemic change in how young South Africans transition from learning to earning. d-lab's model — where 85% of graduates are employed within 3 months — is exactly the kind of evidence-based intervention that shifts transition outcomes at scale.", sections: ["Theory of Change", "Systems Change", "Evidence Base"], lang: "systems thinking, transition outcomes, evidence-based, catalytic" },
    "MICT SETA": { lead: "NQF-aligned digital skills for the MICT sector", hook: "South Africa's MICT sector faces a critical skills gap. d-lab's ICITP-accredited programme produces ICDL-certified, AI-fluent graduates ready for the digital economy — aligned with NSDP 2030 priorities and MICT sector skills plan.", sections: ["SAQA/NQF Alignment", "Sector Skills Plan Fit", "WSP/ATR Compliance", "Accreditation"], lang: "NQF levels, SAQA alignment, sector skills plan, learnerships, WSP/ATR, transformation" },
    "Industrial Development Corp": { lead: "digital industrialisation and youth economic participation", hook: "The IDC's mandate to drive inclusive industrialisation aligns directly with d-lab's partner delivery model — equipping youth in under-served communities with AI and digital skills that enable them to participate in the emerging digital economy. Our partner-funded delivery model keeps costs low while reaching deep into communities that formal institutions miss.", sections: ["Rural Impact", "Women & Youth", "Economic Development", "Job Creation"], lang: "industrialisation, economic development, rural, women, job creation" },
    "Vodacom Foundation": { lead: "digital inclusion and connectivity for youth", hook: "Vodacom's vision of an inclusive digital society requires more than connectivity — it requires capability. d-lab turns connectivity into career outcomes, teaching young people to use AI and digital tools as daily working instruments.", sections: ["Digital Inclusion", "Brand Alignment", "B-BBEE Impact", "Scale"], lang: "digital inclusion, connected youth, brand alignment, B-BBEE, scale" },
    "Momentum Group": { lead: "financial independence through employability", hook: "Momentum's purpose — enabling financial well-being for every generation — starts with employment. d-lab takes young people from unemployment to their first paycheck, building the foundation for lifelong financial independence.", sections: ["Financial Independence", "Youth Empowerment", "Measurable Outcomes"], lang: "financial well-being, independence, generational impact" },
    "FirstRand Foundation": { lead: "innovative approaches to youth employment", hook: "FirstRand Foundation funds bold ideas that can change the trajectory of young South Africans' lives. d-lab's AI-native model — where completion rates are nearly double the sector average — represents a genuinely new approach to an old problem.", sections: ["Innovation", "Scalability", "Evidence", "Sustainability"], lang: "innovation, bold, scalable, evidence-based" },
    "Microsoft South Africa": { lead: "AI skills and digital transformation for youth", hook: "Microsoft's commitment to skilling South Africans for the AI economy aligns perfectly with d-lab — the only NPO in South Africa that embeds AI tools from day one. Our students don't learn ABOUT AI; they work WITH AI every day.", sections: ["AI Integration", "Tech Platform", "Digital Skills Pipeline", "Innovation"], lang: "AI-native, digital transformation, skilling, technology, cloud" },
    "Google.org": { lead: "using AI to solve youth unemployment at scale", hook: "Google.org supports organisations using technology to create opportunity for underserved communities. d-lab's AI-native model — with in-house tools like Language Leveller and Assessornator — demonstrates how AI can make high-quality skills training accessible and scalable.", sections: ["AI for Social Good", "Technology Innovation", "Scale Model", "Evidence"], lang: "AI for good, scale, innovation, measurable impact, technology" },
    "Mastercard Foundation": { lead: "dignified and fulfilling work for young Africans", hook: "The Young Africa Works strategy envisions 30 million young people in dignified work. d-lab's outcomes — 85% employment, 92% completion — prove that AI-powered, mentored skills training can deliver exactly the kind of quality employment outcomes the Foundation seeks.", sections: ["Young Africa Works Alignment", "Dignified Work", "Scale Pathway", "Africa-wide Model"], lang: "dignified work, young Africa, scale, Africa-wide, systems change" },
    "Telkom Foundation": { lead: "digital skills that connect to real employment", hook: "As a returning partner, Telkom Foundation has seen firsthand what d-lab achieves — your investment helped us build a complete training system — 60 students, 92% completion, 85% employment. That's nearly double the sector average. We're ready to deepen that impact with an expanded programme.", sections: ["Partnership Renewal", "Growth Story", "Outcomes Since Last Funding", "Next Phase"], lang: "partnership, digital skills, connectivity, growth, deepening impact" },
    "Sage Foundation": { lead: "building entrepreneurial and tech-enabled young professionals", hook: "Sage Foundation's focus on economically empowering young people through technology aligns with d-lab's core mission. As a returning partner, you've seen our students go from unemployed to employed, from digitally excluded to AI-fluent.", sections: ["Entrepreneurship", "Technology Empowerment", "Partnership History", "Growth"], lang: "entrepreneurship, technology, empowerment, accounting skills" },
    "SAP": { lead: "enterprise technology skills for the next generation", hook: "SAP's commitment to preparing Africa's youth for the digital economy runs parallel to d-lab's mission. Our AI-native approach produces graduates who are fluent in the kind of enterprise thinking and digital problem-solving that SAP champions.", sections: ["Enterprise Skills", "Digital Readiness", "Partnership Deepening"], lang: "enterprise, digital economy, purpose-driven, technology" },
    "Nedbank Private Wealth": { lead: "transforming lives through accredited vocational skills", hook: "Nedbank Private Wealth's charitable foundations exist to create lasting change. d-lab's programme — combining ICITP-accredited vocational training with AI literacy and stipend support — transforms unemployed youth into employable, digitally fluent professionals, with 85% in work within 3 months of graduation.", sections: ["Accredited Training", "Stipend Model", "Community Impact", "Cost Effectiveness"], lang: "charitable, lasting change, accredited, vocational, transformation" },
    "Gauteng Dept of Education": { lead: "school-to-work pipeline for FET learners", hook: "The Gauteng Department of Education's Schools of Specialisation need a work-readiness partner that can bridge the gap between classroom learning and career readiness. d-lab's 3-year FET programme does exactly this — 425 hours of AI skills, Design Thinking, and employability coaching.", sections: ["Curriculum Alignment", "Schools of Specialisation", "Teacher Development", "Learner Outcomes"], lang: "curriculum, work-readiness, FET, Schools of Specialisation, CAPS alignment" },
    "Sci-Bono Discovery Centre": { lead: "cost-effective employability skills for school-leavers", hook: "Sci-Bono's mission to inspire young people in STEM extends naturally into employability. d-lab's 13-week programme — at just R2,547 per learner — turns 90 school-leavers into AI-literate, Design Thinking-capable candidates ready for the workplace.", sections: ["Cost Effectiveness", "STEM Extension", "Practical Skills", "Scale"], lang: "STEM, discovery, practical skills, cost-effective" },
    "The Field Institute / CCBA": { lead: "leadership development for graduate professionals", hook: "CCBA's Future Leaders programme has proven that combining Design Thinking, Enneagram profiling, and structured coaching creates measurably stronger leaders. The 2027 programme builds on this success with refined delivery and deeper integration.", sections: ["Programme Evolution", "Leadership Outcomes", "Delivery Model"], lang: "leadership, graduate development, coaching, self-awareness" },
    "National Skills Fund": { lead: "national digital skills aligned with NSDP 2030", hook: "The NSF's mandate to fund skills development projects aligned with national priorities makes d-lab's AI-native programme a natural fit. Our scalable model — delivering ICITP-accredited, ICDL-certified graduates — directly advances NSDP 2030 outcomes.", sections: ["NSDP 2030 Alignment", "Scalable Delivery", "Accreditation", "Scale"], lang: "NSDP 2030, national priorities, accredited, scalable, transformation" },
    "Old Mutual Foundation": { lead: "education that leads to economic participation", hook: "Old Mutual Foundation's commitment to responsible business through education and skills development aligns with d-lab's proven model — taking young people from unemployment to economic participation through AI-powered, mentored training.", sections: ["Economic Participation", "Education Outcomes", "Responsible Business"], lang: "responsible business, education, economic participation, financial literacy" },
    "Oppenheimer Memorial Trust": { lead: "education access for under-resourced communities", hook: "OMT's focus on education in under-resourced communities aligns with d-lab's partner-funded delivery model — bringing world-class AI and digital skills training to communities where young people have talent but no pathway, through local partners who provide the infrastructure while d-lab provides the system.", sections: ["Rural Access", "Education Quality", "Community Impact"], lang: "education, under-resourced, rural, access, community" },
    "W&R SETA": { lead: "digital skills for the wholesale and retail sector", hook: "The wholesale and retail sector's digital transformation demands a new kind of worker — AI-fluent, design-thinking capable, and digitally confident. d-lab's programme produces exactly these graduates, with 85% employment outcomes.", sections: ["Sector Skills Plan", "Digital Transformation", "Accreditation", "Employment Outcomes"], lang: "wholesale, retail, sector skills plan, digital transformation, learnerships" },
    "Raith Foundation": { lead: "innovative solutions to systemic youth unemployment", hook: "Raith Foundation funds organisations that take genuinely innovative approaches to South Africa's deepest social challenges. d-lab's AI-native model — the only one of its kind in South African NPO space — represents a fundamentally new approach to youth unemployment.", sections: ["Innovation", "Systemic Change", "Evidence", "Multi-year Vision"], lang: "innovative, systemic, social justice, multi-year" },
  };
  const a = angles[f] || { lead: focus || "youth employment and digital skills", hook: `${f}'s commitment to social impact aligns with d-lab's mission to equip young South Africans with AI-native digital skills and employability competencies. Our 92% completion rate and 85% employment outcomes demonstrate a model that works.`, sections: ["Impact", "Programme", "Budget", "Sustainability"], lang: "impact, youth, digital skills, employment" };
  // Structure varies by funder type
  const structures = {
    "Corporate CSI": ["Cover Letter", "Executive Summary", "B-BBEE Value Proposition", "Programme Overview", "Impact & Outcomes", "Budget", "Brand Alignment & Visibility", "Sustainability", "Appendices"],
    "Government/SETA": ["Cover Letter", "Executive Summary", "Regulatory Alignment (NQF/SAQA/NSDP)", "Organisational Capacity", "Programme Description", "Accreditation & Quality Assurance", "Budget & Value for Money", "M&E Framework", "Transformation & Equity", "Appendices"],
    "International": ["Cover Letter", "Executive Summary", "Problem Analysis", "Theory of Change", "Programme Design", "Impact Framework (SDG-aligned)", "Budget (with cost-effectiveness analysis)", "Sustainability & Exit Strategy", "Risk Management", "Safeguarding", "Appendices"],
    "Foundation": ["Cover Letter", "Executive Summary", "The Challenge", "Our Approach", "Evidence of Impact", "Programme Details", "Budget", "Sustainability", "Organisational Background", "Appendices"],
    "Tech Company": ["Cover Letter", "Executive Summary", "Technology & Innovation", "Programme Design", "AI Integration", "Impact Metrics", "Budget", "Scale Pathway", "Appendices"],
  };
  return { ...a, returning, pt, mc, structure: structures[t] || structures["Foundation"] };
};

/* ── DATA CONSTANTS ── */
const STAGES = [
  { id: "scouted", label: "Scouted", c: "#6B7080" },
  { id: "qualifying", label: "Qualifying", c: "#6B47B8" },
  { id: "drafting", label: "Drafting", c: "#C67B1A" },
  { id: "review", label: "Review", c: "#3574D4" },
  { id: "submitted", label: "Submitted", c: "#8B5CBF" },
  { id: "awaiting", label: "Awaiting", c: "#0891B2" },
  { id: "won", label: "Won", c: "#0D9C5C" },
  { id: "lost", label: "Lost", c: "#D94848" },
  { id: "deferred", label: "Deferred", c: "#9CA1AE" },
];

const FTYPES = ["Corporate CSI", "Government/SETA", "International", "Foundation", "Tech Company"];
const WFAC = ["Outcome data", "Budget fit", "Geographic match", "Relationship", "AI angle", "Rural focus", "Gender angle", "Employment commitment", "Co-funding", "SETA alignment", "Replicable model", "Tech platform"];
const LFAC = ["Budget too high", "Outside focus", "Track record", "Geography", "Missing docs", "Competitive", "Timing missed", "Insufficient detail", "Org too small", "Already funded similar"];
const TOPICS = ["AI in Youth Development", "AI-Native Curricula", "Digital Skills at Scale", "NPO Technology", "Design Thinking for Impact", "JTBD in Education", "Rural Digital Transformation", "AI Governance Africa", "Youth Employment 4IR"];

const DOCS = {
  "Corporate CSI": ["PBO Certificate", "NPO Registration", "Tax Clearance (SARS)", "Audited Financials", "B-BBEE Certificate", "Organisation Profile", "Programme Description", "Logical Framework", "Detailed Budget", "Board Resolution"],
  "Government/SETA": ["PBO Certificate", "NPO Registration", "Tax Clearance (SARS)", "Audited Financials (2yr)", "B-BBEE Certificate", "FICA Compliance", "Accreditation Certificates", "Skills Development Plan", "WSP/ATR", "Board Resolution", "Banking Confirmation", "Company Registration"],
  "International": ["NPO Registration", "Audited Financials (2yr)", "Organisation Profile", "Theory of Change", "M&E Framework", "Programme Description", "Budget (USD)", "Risk Register", "Safeguarding Policy", "Anti-Fraud Policy"],
  "Foundation": ["PBO Certificate", "NPO Registration", "Tax Clearance (SARS)", "Audited Financials", "Organisation Profile", "Programme Description", "Detailed Budget", "Outcomes Framework", "Board Resolution"],
  "Tech Company": ["NPO Registration", "Organisation Profile", "Programme Description", "Detailed Budget", "Impact Metrics", "Tech Platform Overview", "Data Privacy Policy"],
};

// System-level compliance documents shared across all grants
const ORG_DOCS = [
  { id: "pbo", name: "PBO Certificate", desc: "Public Benefit Organisation approval letter from SARS", renew: false, cat: "Registration" },
  { id: "npo", name: "NPO Registration Certificate", desc: "Department of Social Development NPO certificate (NPO 2017/382673/08)", renew: false, cat: "Registration" },
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
const DOC_MAP = {
  "PBO Certificate": "pbo", "NPO Registration": "npo", "Tax Clearance (SARS)": "tax",
  "Audited Financials": "fin1", "Audited Financials (2yr)": "fin1",
  "B-BBEE Certificate": "bbbee", "FICA Compliance": "fica", "Banking Confirmation": "bank",
  "Board Resolution": "board", "Organisation Profile": "orgpro", "Company Registration": "cipc",
  "Accreditation Certificates": "accred", "Skills Development Plan": "sdp", "WSP/ATR": "wsp",
  "Theory of Change": "toc", "M&E Framework": "mne", "Risk Register": "risk",
  "Safeguarding Policy": "safeguard", "Anti-Fraud Policy": "antifraud", "Data Privacy Policy": "privacy",
};

const CAD = {
  "Corporate CSI": [{ d: 14, l: "Status check", t: "status" }, { d: 28, l: "Share success story", t: "update" }, { d: 42, l: "Offer to present", t: "offer" }, { d: 60, l: "Second follow-up", t: "status" }],
  "Government/SETA": [{ d: 21, l: "Confirm submission", t: "status" }, { d: 45, l: "Share interim outcomes", t: "update" }, { d: 75, l: "Request timeline", t: "status" }],
  "International": [{ d: 14, l: "Confirm receipt", t: "status" }, { d: 30, l: "Programme update", t: "update" }, { d: 60, l: "Offer site visit", t: "offer" }, { d: 90, l: "Check timeline", t: "status" }],
  "Foundation": [{ d: 14, l: "Status check", t: "status" }, { d: 35, l: "Share success story", t: "update" }, { d: 56, l: "Offer to discuss", t: "offer" }],
  "Tech Company": [{ d: 10, l: "Quick check-in", t: "status" }, { d: 21, l: "Share AI angle", t: "update" }, { d: 35, l: "Offer demo", t: "offer" }],
};

const CONFS = [
  // ── SOUTH AFRICA ──
  { n: "AfricArena Summit", d: "November 2026", month: 11, l: "Cape Town", reg: "sa", type: "Tech/VC", url: "https://africarena.com", apply: "https://africarena.com/apply", deadline: "August 2026", cost: "From R3,500", audience: "2,000+", r: "Premier Africa tech & VC summit. Showcase AI-native education model to investors and corporates. Strong CSI/impact investing track.", tags: ["AI", "Investment", "Startups"] },
  { n: "EdTech Africa Conference", d: "September 2026", month: 9, l: "Johannesburg", reg: "sa", type: "EdTech", url: "https://edtechafrica.com", apply: "https://edtechafrica.com/speakers", deadline: "May 2026", cost: "From R2,800", audience: "1,500+", r: "Continent's largest EdTech event. Demo Language Leveller and AI-native curriculum. Direct access to education funders, SETA representatives, and government officials.", tags: ["EdTech", "Skills", "AI"] },
  { n: "AI Expo Africa", d: "September 2026", month: 9, l: "Cape Town", reg: "sa", type: "AI/Tech", url: "https://aiexpoafrica.com", apply: "https://aiexpoafrica.com/speakers", deadline: "June 2026", cost: "From R2,200", audience: "3,000+", r: "Africa's largest AI event. Present AI governance work and AI-native NPO model. Connects with tech companies running CSI programmes and potential tech partners.", tags: ["AI", "Governance", "Tech"] },
  { n: "SA Innovation Summit", d: "September 2026", month: 9, l: "Cape Town", reg: "sa", type: "Innovation", url: "https://innovationsummit.co.za", apply: "https://innovationsummit.co.za/speak", deadline: "June 2026", cost: "From R2,500", audience: "2,500+", r: "Innovation & entrepreneurship summit. Youth employment through tech is a headline theme. Strong government and corporate attendance.", tags: ["Innovation", "Youth", "Employment"] },
  { n: "SETA Conference", d: "March 2026", month: 3, l: "Johannesburg", reg: "sa", type: "Skills/Gov", url: null, apply: null, deadline: "Invite-based", cost: "Free (by invitation)", audience: "500+", r: "Skills development sector gathering. Critical for MICT SETA networking, understanding funding windows, and positioning for WSP/ATR alignment. Contact MICT SETA directly.", tags: ["SETA", "Skills", "Government"] },
  { n: "ICT Skills Summit", d: "August 2026", month: 8, l: "Sandton", reg: "sa", type: "Skills/ICT", url: "https://ictskillssummit.co.za", apply: "https://ictskillssummit.co.za/speakers", deadline: "May 2026", cost: "From R1,800", audience: "800+", r: "Digital skills pipeline focused. Position d-lab as a proven delivery model. Attended by SETAs, corporates with bursary programmes, and government skills development units.", tags: ["ICT", "Skills", "Digital"] },
  { n: "Impact Investing SA", d: "October 2026", month: 10, l: "Johannesburg", reg: "sa", type: "Impact/Finance", url: "https://impactinvestingsa.co.za", apply: "https://impactinvestingsa.co.za/apply", deadline: "July 2026", cost: "From R3,000", audience: "600+", r: "Impact investors, DFIs, and foundations. Pitch d-lab's proven 90% completion and 85% employment outcomes. Strong for unlocking multi-year programme funding.", tags: ["Impact", "Investment", "Finance"] },
  { n: "Design Indaba", d: "February 2027", month: 2, l: "Cape Town", reg: "sa", type: "Design/Creative", url: "https://designindaba.com", apply: "https://designindaba.com/conference/speakers", deadline: "Mid-2026", cost: "From R4,500", audience: "3,000+", r: "Prestigious design and creativity festival. Present design thinking pedagogy and human-centred approach to digital skills training. International media coverage.", tags: ["Design", "Creative", "Education"] },
  { n: "Tech4Africa", d: "October 2026", month: 10, l: "Johannesburg", reg: "sa", type: "Tech", url: "https://tech4africa.com", apply: "https://tech4africa.com/speak", deadline: "July 2026", cost: "From R1,500", audience: "1,200+", r: "Technology for social impact. Showcase how d-lab uses AI to scale youth employment outcomes. Good for connecting with CSI managers and tech-for-good community.", tags: ["Tech", "Social Impact", "AI"] },
  { n: "Africa Tech Summit SA", d: "May 2026", month: 5, l: "Cape Town", reg: "sa", type: "Tech/Business", url: "https://www.africatechsummit.com", apply: "https://www.africatechsummit.com/capetown/speak", deadline: "March 2026", cost: "From $495", audience: "1,000+", r: "Pan-African tech and business summit with strong investor attendance. Positions d-lab in the broader African EdTech ecosystem. Networking with continental funders.", tags: ["Tech", "Pan-African", "Investment"] },
  // ── GLOBAL ──
  { n: "Skoll World Forum", d: "April 2026", month: 4, l: "Oxford, UK", reg: "global", type: "Social Enterprise", url: "https://skoll.org/skoll-world-forum", apply: "https://skoll.org/skoll-world-forum/apply", deadline: "January 2026", cost: "By invitation / $2,500", audience: "1,200+", r: "Premier global social entrepreneurship gathering. Attend for international scaling story, connections to Skoll Foundation and global impact funders. Very competitive but high-value.", tags: ["Social Enterprise", "Global", "Impact"] },
  { n: "Google for Startups Africa", d: "Various 2026", month: 6, l: "Online / Lagos / Nairobi", reg: "global", type: "Tech/Accelerator", url: "https://startup.google.com/events", apply: "https://startup.google.com/programs/accelerator/africa", deadline: "Rolling", cost: "Free", audience: "Varies", r: "Google ecosystem events and accelerator programmes. Position for Google.org grant funding. Access to Google Cloud credits, mentorship, and Africa-focused tech community.", tags: ["Google", "Accelerator", "Tech"] },
  { n: "UNESCO Mobile Learning Week", d: "September 2026", month: 9, l: "Paris, France", reg: "global", type: "Education/Policy", url: "https://www.unesco.org/en/digital-education", apply: "https://www.unesco.org/en/digital-education", deadline: "April 2026", cost: "Free (registration required)", audience: "1,500+", r: "Global education technology and policy event. Present AI-native curriculum model to international education community. Connects with UNESCO funding streams and global education NGOs.", tags: ["UNESCO", "Education", "Policy"] },
  { n: "Web Summit", d: "November 2026", month: 11, l: "Lisbon, Portugal", reg: "global", type: "Tech", url: "https://websummit.com", apply: "https://websummit.com/startups/apply", deadline: "August 2026", cost: "From €995 / ALPHA startup free", audience: "70,000+", r: "World's largest tech conference. Apply for ALPHA startup programme (free booth + passes). Massive visibility for AI-in-education model. Media and investor access at scale.", tags: ["Tech", "Startup", "Media"] },
  { n: "WISE Summit", d: "November 2026", month: 11, l: "Doha, Qatar", reg: "global", type: "Education", url: "https://www.wise-qatar.org", apply: "https://www.wise-qatar.org/wise-summit", deadline: "June 2026", cost: "By invitation / $1,200", audience: "2,000+", r: "World Innovation Summit for Education. Highly relevant — education innovation with strong Middle East and Africa funding connections. WISE Prize and project awards available.", tags: ["Education", "Innovation", "Awards"] },
  { n: "Global Impact Investing Network (GIIN)", d: "October 2026", month: 10, l: "The Hague, Netherlands", reg: "global", type: "Impact/Finance", url: "https://thegiin.org/investor-forum", apply: "https://thegiin.org/investor-forum/apply", deadline: "July 2026", cost: "$1,500+", audience: "1,200+", r: "Premier impact investing forum. Pitch to DFIs, foundations, and impact funds. d-lab's measurable employment outcomes align perfectly with impact measurement frameworks.", tags: ["Impact", "Investment", "DFI"] },
  { n: "ASU+GSV Summit", d: "April 2026", month: 4, l: "San Diego, USA", reg: "global", type: "EdTech/Investment", url: "https://www.asugsvsummit.com", apply: "https://www.asugsvsummit.com/apply", deadline: "February 2026", cost: "From $1,995", audience: "7,000+", r: "Largest EdTech + talent innovation summit globally. Cup competition for emerging EdTech. Access to US-based education investors and philanthropic foundations. Strong Africa interest growing.", tags: ["EdTech", "Investment", "USA"] },
  { n: "Social Enterprise World Forum", d: "October 2026", month: 10, l: "Brisbane, Australia", reg: "global", type: "Social Enterprise", url: "https://sewfonline.com", apply: "https://sewfonline.com/speakers", deadline: "May 2026", cost: "From AUD 850", audience: "1,500+", r: "Global social enterprise community. Present the NPC model and AI-for-good approach. Strong connections to British Council, Schwab Foundation, and social enterprise networks.", tags: ["Social Enterprise", "NPC", "Global"] },
  { n: "Transform Africa Summit", d: "August 2026", month: 8, l: "Kigali, Rwanda", reg: "global", type: "Digital/Gov", url: "https://transformafricasummit.org", apply: "https://transformafricasummit.org/speakers", deadline: "May 2026", cost: "From $300", audience: "4,000+", r: "Smart Africa alliance summit. Government and multilateral focus on digital transformation across the continent. Position d-lab as a continental model for AI skills. AfDB and World Bank attendance.", tags: ["Digital", "Government", "Pan-African"] },
];


const TEAM = [
  { id: "alison", name: "Alison", ini: "AJ", c: "#00E676", role: "director", title: "Director" },
  { id: "david", name: "David", ini: "DM", c: "#F59E0B", role: "director", title: "Director" },
  { id: "barbara", name: "Barbara", ini: "BK", c: "#EC4899", role: "director", title: "Director" },
  { id: "nolan", name: "Nolan", ini: "NP", c: "#8B5CF6", role: "hop", title: "Head of Programmes" },
  { id: "ayanda", name: "Ayanda", ini: "AO", c: "#5C9CFF", role: "pm", title: "Programme Manager" },
  { id: "team", name: "Unassigned", ini: "—", c: "#555", role: "none", title: "" },
];

const ROLES = {
  director: { label: "Director", level: 3, can: ["scouted","qualifying","drafting","review","submitted","awaiting","won","lost","deferred"] },
  hop: { label: "Head of Programmes", level: 2, can: ["scouted","qualifying","drafting","review"] },
  pm: { label: "Programme Manager", level: 1, can: ["scouted","qualifying","drafting"] },
};

// Approval gates: stage transitions requiring sign-off from a specific role
const GATES = {
  "drafting->review": { need: "hop", label: "Head of Programmes must approve draft for review" },
  "review->submitted": { need: "director", label: "Director must approve before submission" },
  "awaiting->won": { need: "director", label: "Director must confirm award" },
  "awaiting->lost": { need: "director", label: "Director must confirm loss" },
};

// Agent personas for AI emulation
const PERSONAS = {
  alison: "You are Alison Jacobson, Director of d-lab NPC. Strategic thinker focused on programme impact, sustainability, and mission alignment. Direct, analytical. Push for clarity on budgets and measurable impact.",
  david: "You are David, Director of d-lab NPC. Focus on governance, financial prudence, risk, and compliance. Ask tough questions about budgets, funder relationships, and legal requirements. Thorough and detail-oriented.",
  barbara: "You are Barbara, Director of d-lab NPC. Expertise in partnerships, stakeholder engagement, and programme design. Focus on compelling narratives, genuine partnerships, and appropriate ask amounts.",
  nolan: "You are Nolan, Head of Programmes at d-lab NPC. Oversee programme delivery. Focus on operational feasibility, realistic timelines, curriculum readiness. Push back on overcommitting resources.",
  ayanda: "You are Ayanda, Programme Manager at d-lab NPC. Hands-on with learners and delivery. Focus on practical details: venues, recruitment, facilitator capacity, day-to-day operations. Flag risks early.",
};

const SEED = [
  { id: "g1", name: "DGMT Youth Transition", funder: "DG Murray Trust", type: "Foundation", stage: "drafting", ask: 1236000, deadline: "2026-04-30", focus: ["Youth Employment", "Digital Skills", "Systems Change"], geo: ["Gauteng", "Western Cape"], rel: "Cold", pri: 5, hrs: 12, notes: "Proposal drafted. Cohort with stipends (Type 3). Ready for review.", log: [{ d: "2026-02-06", t: "Draft completed" }], on: "", of: [], owner: "alison", docs: {}, fups: [], subDate: null, applyUrl: "https://dgmt.co.za/apply-for-funding/" },
  { id: "g2", name: "MICT SETA Discretionary", funder: "MICT SETA", type: "Government/SETA", stage: "drafting", ask: 2210000, deadline: "2026-07-15", focus: ["Digital Skills", "MICT", "Youth Employment", "AI/4IR"], geo: ["Gauteng", "Mpumalanga"], rel: "Cold", pri: 5, hrs: 20, notes: "60-learner programme: 3 × Type 1 partner-funded cohorts (R1.548M) + Cyborg Habits AI platform integration (R200K) + SETA compliance & org costs (R462K). Lead with ICITP accreditation + AI-native differentiation. Apply via MICT SETA LMS.", log: [{ d: "2026-02-06", t: "Full proposal drafted" }], on: "", of: [], owner: "alison", docs: {}, fups: [], subDate: null, applyUrl: "https://www.mict.org.za/dg-window-for-2025-26/" },
  { id: "g3", name: "IDC CSI Grant", funder: "Industrial Development Corp", type: "Government/SETA", stage: "drafting", ask: 1597000, deadline: null, focus: ["Youth Employment", "Rural Dev", "Women", "Digital Skills"], geo: ["Gauteng"], rel: "Cold", pri: 4, hrs: 10, notes: "1 × Type 2 d-lab funded cohort (full support incl. stipends + laptops). IDC CSI has R50M+ annual budget — this is well within range. Lead with digital industrialisation + the complete d-lab system. Email csi@idc.co.za.", log: [{ d: "2026-02-06", t: "Proposal drafted" }], on: "", of: [], owner: "alison", docs: {}, fups: [], subDate: null, applyUrl: "https://www.idc.co.za/csi/application-guidelines/" },
  { id: "g4", name: "Vodacom Foundation", funder: "Vodacom Foundation", type: "Corporate CSI", stage: "drafting", ask: 1891000, deadline: null, focus: ["Education", "Digital Skills", "Youth Employment", "Women"], geo: ["Gauteng"], rel: "Cold", pri: 5, hrs: 10, notes: "1 × Type 3 cohort with stipends (R1.236M) + Cyborg Habits AI platform pilot for Vodacom staff (R285K for 500 licences) + 30% org costs (R370K). Bundle: youth skills + corporate digital capability. B-BBEE Skills Dev + SED. Email Foundation@vodacom.co.za.", log: [{ d: "2026-02-06", t: "Partnership proposal drafted" }], on: "", of: [], owner: "alison", docs: {}, fups: [], subDate: null, applyUrl: "https://www.vodacom.com/vodacom-foundation.php" },
  { id: "g5", name: "Momentum Group Foundation", funder: "Momentum Group", type: "Corporate CSI", stage: "scouted", ask: 1236000, deadline: null, focus: ["Youth Employment", "Digital Skills"], geo: ["Gauteng"], rel: "Cold", pri: 4, hrs: 0, notes: "1 × Type 3 cohort with stipends (R1.236M). Momentum's CSI is substantial — lead with financial independence angle + B-BBEE value. 20 youth from unemployment to first paycheck in 9 months.", log: [], on: "", of: [], owner: "team", docs: {}, fups: [], subDate: null, applyUrl: "https://www.momentum.co.za/momentum/about-us/foundation" },
  { id: "g6", name: "FirstRand Foundation", funder: "FirstRand Foundation", type: "Foundation", stage: "scouted", ask: 1597000, deadline: null, focus: ["Youth Employment", "Education"], geo: ["Gauteng"], rel: "Cold", pri: 4, hrs: 0, notes: "R2-3M typical grants. Type 2 d-lab funded cohort. Innovation-focused — emphasise AI-native model.", log: [], on: "", of: [], owner: "team", docs: {}, fups: [], subDate: null, applyUrl: "https://www.firstrandfoundation.org.za/apply" },
  { id: "g7", name: "Microsoft SA Skills", funder: "Microsoft South Africa", type: "Tech Company", stage: "scouted", ask: 1079000, deadline: null, focus: ["AI/4IR", "Digital Skills"], geo: [], rel: "Cold", pri: 4, hrs: 0, notes: "FET programme funding (Type 4). AI-native angle.", log: [], on: "", of: [], owner: "team", docs: {}, fups: [], subDate: null, applyUrl: "https://www.microsoft.com/en-za/corporate-responsibility" },
  { id: "g8", name: "Google.org Impact Challenge", funder: "Google.org", type: "Tech Company", stage: "scouted", ask: 2997000, deadline: null, focus: ["AI/4IR", "Education", "EdTech"], geo: [], rel: "Cold", pri: 4, hrs: 0, notes: "1 × Type 2 d-lab funded cohort (R1.597M) + AI platform R&D: LMS AI chatbot, Language Leveller open-sourcing, Cyborg Habits scaling (R800K) + org capacity (R600K). Lead with: only NPO in SA embedding AI from day one, building replicable AI-education tools.", log: [], on: "", of: [], owner: "team", docs: {}, fups: [], subDate: null, applyUrl: "https://www.google.org/opportunities/" },
  { id: "g9", name: "Mastercard Foundation", funder: "Mastercard Foundation", type: "International", stage: "scouted", ask: 5173000, deadline: null, focus: ["Youth Employment", "Digital Skills"], geo: [], rel: "Cold", pri: 3, hrs: 0, notes: "Young Africa Works — grants typically $5M-$50M over 3-5 years. Year 1 proof: 2 × Type 2 d-lab funded cohorts (R3.194M) + FET pipeline launch (R1.079M) + AI tools (R400K) + org capacity (R500K). Lead with the SYSTEM: 7 programme types, AI tools, partner model, 92% completion. Propose as Year 1 of 3-year partnership.", log: [], on: "", of: [], owner: "team", docs: {}, fups: [], subDate: null, applyUrl: "https://mastercardfdn.org/young-africa-works/" },
  { id: "g10", name: "Telkom Foundation Renewal", funder: "Telkom Foundation", type: "Corporate CSI", stage: "qualifying", ask: 1032000, deadline: "2026-06-30", focus: ["Digital Skills", "Youth Employment"], geo: ["Gauteng", "Western Cape", "Mpumalanga"], rel: "Previous Funder", pri: 5, hrs: 3, notes: "Renewal needed. 2 × Type 1 partner-funded cohorts.", log: [{ d: "2025-12-01", t: "Current funding ends Q2 2026" }], on: "", of: [], owner: "alison", docs: {}, fups: [], subDate: null, applyUrl: "https://www.telkom.co.za/about_us/community/ngo-application.html" },
  { id: "g11", name: "Sage Foundation Renewal", funder: "Sage Foundation", type: "Corporate CSI", stage: "qualifying", ask: 651000, deadline: "2026-06-30", focus: ["Youth Employment", "Entrepreneurship"], geo: ["Gauteng"], rel: "Previous Funder", pri: 5, hrs: 2, notes: "Strong relationship. CCBA-style corporate programme (Type 5) or Type 1 cohort.", log: [], on: "", of: [], owner: "ayanda", docs: {}, fups: [], subDate: null, applyUrl: "https://www.sage.com/en-za/company/sage-foundation/" },
  { id: "g12", name: "SAP Social Impact", funder: "SAP", type: "Tech Company", stage: "qualifying", ask: 516000, deadline: null, focus: ["Digital Skills", "AI/4IR"], geo: ["Gauteng"], rel: "Previous Funder", pri: 4, hrs: 2, notes: "Expanded engagement. Type 1 partner-funded cohort.", log: [], on: "", of: [], owner: "ayanda", docs: {}, fups: [], subDate: null, applyUrl: "https://www.sap.com/africa/about/company/purpose-and-sustainability/csr.html" },
  { id: "g13", name: "Nedbank PW Charitable", funder: "Nedbank Private Wealth", type: "Foundation", stage: "drafting", ask: 1236000, deadline: "2026-03-31", focus: ["Youth Employment", "Digital Skills", "21st Century Skills"], geo: ["Gauteng", "Western Cape"], rel: "Cold", pri: 5, hrs: 8, notes: "20 youth via partner site. Type 3 with stipends. R516K programme + R720K stipends. Ages 15-25, accredited vocational + technology skills = strong fit.", log: [{ d: "2026-02-12", t: "Proposal drafted from Nedbank template" }], on: "", of: [], owner: "alison", docs: {}, fups: [], subDate: null, applyUrl: "https://www.nedbankprivatewealth.co.za/content/private-wealth-sa/south-africa/en/about-us/Socialresponsibility/Howtoapply.html" },
  { id: "g14", name: "GDE FET Programme", funder: "Gauteng Dept of Education", type: "Government/SETA", stage: "qualifying", ask: 1079000, deadline: "2026-05-31", focus: ["FET", "Work-readiness", "AI/4IR", "Youth"], geo: ["Gauteng"], rel: "Warm Intro", pri: 5, hrs: 6, notes: "Type 4 FET programme. 3-year, 425-hour journey for Grade 10-12 across 3 Schools of Specialisation. MOU in progress.", log: [{ d: "2026-02-12", t: "FET concept note completed" }], on: "", of: [], owner: "alison", docs: {}, fups: [], subDate: null, applyUrl: "https://www.education.gpg.gov.za/" },
  { id: "g15", name: "Sci-Bono Employability", funder: "Sci-Bono Discovery Centre", type: "Corporate CSI", stage: "drafting", ask: 199300, deadline: "2026-03-15", focus: ["Employability", "AI", "Design Thinking"], geo: ["Gauteng"], rel: "Warm Intro", pri: 4, hrs: 4, notes: "Type 7 short-format: 15 days over 13 weeks for 90 school-leavers. R148K coaching + R51K Cyborg Habits platform. Quote valid 30 days.", log: [{ d: "2026-02-12", t: "Formal quotation sent" }], on: "", of: [], owner: "alison", docs: {}, fups: [], subDate: null, applyUrl: "https://www.sci-bono.co.za/" },
  { id: "g16", name: "CCBA Future Leaders 2027", funder: "The Field Institute / CCBA", type: "Corporate CSI", stage: "qualifying", ask: 651100, deadline: "2026-09-30", focus: ["Corporate Leadership", "Design Thinking", "Enneagram"], geo: ["Gauteng"], rel: "Previous Funder", pri: 5, hrs: 4, notes: "Type 5 corporate programme. 63 participants: DT sprints, 8 group coaching sessions, Enneagram profiles, reflection assessments. Revenue contract via The Field Institute.", log: [{ d: "2026-02-12", t: "2026 programme in delivery" }], on: "", of: [], owner: "alison", docs: {}, fups: [], subDate: null, applyUrl: "https://www.ccbagroup.com/sustainability/" },
  { id: "g17", name: "NSF Youth Skills", funder: "National Skills Fund", type: "Government/SETA", stage: "scouted", ask: 2500000, deadline: "2026-08-31", focus: ["Youth Employment", "Digital Skills", "AI/4IR"], geo: ["Gauteng", "Western Cape", "Mpumalanga"], rel: "Cold", pri: 4, hrs: 0, notes: "3 × Type 1 partner-funded cohorts (60 learners, R1.548M) + Cyborg Habits AI integration (R200K) + SETA compliance & reporting (R250K) + org capacity (R502K). NSF has R2B+ budget — lead with NSDP 2030 alignment, ICITP accreditation, and 92% completion vs 55% sector average.", log: [], on: "", of: [], owner: "team", docs: {}, fups: [], subDate: null, applyUrl: "https://www.nsf.gov.za/" },
  { id: "g18", name: "Old Mutual Foundation", funder: "Old Mutual Foundation", type: "Foundation", stage: "scouted", ask: 1236000, deadline: null, focus: ["Youth Employment", "Education", "Financial Literacy"], geo: ["Gauteng", "Western Cape"], rel: "Cold", pri: 3, hrs: 0, notes: "Type 3 cohort with stipends. Education & skills development is a key pillar. R1-2M typical grants.", log: [], on: "", of: [], owner: "team", docs: {}, fups: [], subDate: null, applyUrl: "https://www.oldmutual.co.za/about/responsible-business/old-mutual-foundation/" },
  { id: "g19", name: "Oppenheimer Memorial Trust", funder: "Oppenheimer Memorial Trust", type: "Foundation", stage: "scouted", ask: 516000, deadline: "2026-06-30", focus: ["Education", "Youth Development"], geo: ["Mpumalanga"], rel: "Cold", pri: 3, hrs: 0, notes: "Type 1 partner-funded cohort. Strong rural/education focus. R300K-R800K typical grants.", log: [], on: "", of: [], owner: "team", docs: {}, fups: [], subDate: null, applyUrl: "https://www.omt.org.za/how-to-apply/" },
  { id: "g20", name: "Cyborg Habits — Corporate Sales", funder: "Multiple Corporates", type: "Corporate CSI", stage: "qualifying", ask: 570000, deadline: null, focus: ["AI/4IR", "Digital Skills", "Corporate Training"], geo: [], rel: "Warm Intro", pri: 4, hrs: 3, notes: "Type 6 Cyborg Habits short course. 1,000 licences at US$30/R570 each. Target: banks, consulting firms, education departments. Revenue product.", log: [{ d: "2026-01-15", t: "Product launched, sales pipeline building" }], on: "", of: [], owner: "alison", docs: {}, fups: [], subDate: null, applyUrl: "https://www.d-lab.co.za/cyborg-habits" },
  { id: "g21", name: "W&R SETA Discretionary", funder: "W&R SETA", type: "Government/SETA", stage: "scouted", ask: 1032000, deadline: "2026-05-31", focus: ["Digital Skills", "Youth Employment", "Retail/Wholesale"], geo: ["Gauteng", "Western Cape"], rel: "Cold", pri: 3, hrs: 0, notes: "2 × Type 1 cohorts. W&R SETA funds digital skills for retail/wholesale sector. AI + employability skills fit well.", log: [], on: "", of: [], owner: "team", docs: {}, fups: [], subDate: null, applyUrl: "https://www.wrseta.org.za/grant_application.aspx" },
  { id: "g22", name: "Raith Foundation", funder: "Raith Foundation", type: "Foundation", stage: "scouted", ask: 1597000, deadline: null, focus: ["Youth Employment", "Innovation", "Education"], geo: ["Gauteng", "Western Cape"], rel: "Cold", pri: 3, hrs: 0, notes: "Type 2 d-lab funded cohort. Raith funds innovative approaches to social challenges. R1-3M grants. Multi-year potential.", log: [], on: "", of: [], owner: "team", docs: {}, fups: [], subDate: null, applyUrl: "https://www.rfrsa.org/" },
  { id: "g23", name: "Intensives Revenue", funder: "Various STEM Centres", type: "Corporate CSI", stage: "qualifying", ask: 225000, deadline: null, focus: ["AI", "Design Thinking", "Employability"], geo: ["Gauteng", "Western Cape", "Mpumalanga"], rel: "Warm Intro", pri: 4, hrs: 2, notes: "3 × R75K Intensive short programmes at STEM centres. 2-5 day bootcamp format. Revenue product, not grant dependent.", log: [{ d: "2026-01-20", t: "Budgeted for 3 intensives in 2026" }], on: "", of: [], owner: "nolan", docs: {}, fups: [], subDate: null, applyUrl: "https://www.d-lab.co.za/intensives" },
];

/* ── UTILS ── */
const fmt = n => n ? `R${(n / 1e6).toFixed(1)}M` : "—";
const fmtK = n => n ? (n >= 1e6 ? `R${(n / 1e6).toFixed(1)}M` : `R${(n / 1e3).toFixed(0)}K`) : "—";
const dL = d => d ? Math.ceil((new Date(d) - new Date()) / 864e5) : null;
const uid = () => "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const urgC = d => d === null ? C.t3 : d < 0 ? C.red : d <= 14 ? C.red : d < 30 ? C.amber : C.green;
const urgLabel = d => d === null ? null : d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? "Due today" : d <= 3 ? `${d}d left!` : d <= 14 ? `⚠ ${d}d` : `${d}d`;
const td = () => new Date().toISOString().slice(0, 10);
const addD = (date, n) => { const d = new Date(date); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const cp = t => { try { navigator.clipboard.writeText(t); } catch { const a = document.createElement("textarea"); a.value = t; document.body.appendChild(a); a.select(); document.execCommand("copy"); document.body.removeChild(a); } };

/* Pulsing keyframes */
if (typeof document !== "undefined" && !document.getElementById("ge-pulse")) {
  const sty = document.createElement("style"); sty.id = "ge-pulse";
  sty.textContent = `@keyframes ge-pulse{0%,100%{opacity:1}50%{opacity:0.4}}`;
  document.head.appendChild(sty);
}
const DeadlineBadge = ({ d, deadline, size = "sm" }) => {
  if (d === null) return null;
  const col = urgC(d);
  const bg = d < 0 ? C.redSoft : d <= 14 ? C.amberSoft : C.raised;
  const pulse = d >= 0 && d <= 3;
  const label = urgLabel(d);
  const dateStr = deadline ? new Date(deadline).toLocaleDateString("en-ZA", { day: "numeric", month: "short" }) : null;
  const isSm = size === "sm";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: isSm ? "2px 7px" : "3px 10px", fontSize: isSm ? 10 : 12, fontWeight: 700,
      color: col, background: bg, borderRadius: 4,
      animation: pulse ? "ge-pulse 1.2s ease-in-out infinite" : "none", whiteSpace: "nowrap",
      letterSpacing: 0.2,
    }}>
      {d < 0 && "⚠ "}{dateStr && !isSm && <span style={{ opacity: 0.7, marginRight: 2 }}>{dateStr} ·</span>}{label}
    </span>
  );
};

const TypeBadge = ({ type }) => {
  const tc = { "Foundation": C.purple, "Corporate CSI": C.blue, "Government/SETA": C.amber, "International": C.green, "Tech Company": "#0891B2" };
  const bgs = { "Foundation": C.purpleSoft, "Corporate CSI": C.blueSoft, "Government/SETA": C.amberSoft, "International": C.greenSoft, "Tech Company": "#ECFEFF" };
  const col = tc[type] || C.t3;
  const bg = bgs[type] || C.raised;
  return <span style={{ padding: "2px 7px", fontSize: 10, fontWeight: 700, color: col, background: bg, borderRadius: 4, whiteSpace: "nowrap", letterSpacing: 0.3 }}>{type}</span>;
};

const api = async (sys, usr, search = false, maxTok = 1500) => {
  try {
    const body = { model: "claude-sonnet-4-20250514", max_tokens: maxTok, messages: [{ role: "user", content: usr }] };
    if (sys) body.system = sys;
    if (search) body.tools = [{ type: "web_search_20250305", name: "web_search" }];
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) return `API ${r.status}: ${(await r.text()).slice(0, 200)}`;
    const d = await r.json();
    if (d.error) return `API error: ${d.error.message || d.error.type}`;
    const texts = d.content?.filter(b => b.type === "text").map(b => b.text).filter(Boolean);
    return texts?.length ? texts.join("\n\n") : "No response — try again.";
  } catch (e) { return `Connection error: ${e.message}`; }
};

const sG = async (k, fb) => { try { const r = await window.storage.get(k); return r ? JSON.parse(r.value) : fb; } catch { return fb; } };
const sS = async (k, d) => { try { await window.storage.set(k, JSON.stringify(d)); } catch {} };

/* ── COMPONENTS ── */

const Tag = ({ text, color = C.green }) => (
  <span style={{
    display: "inline-block", padding: "2px 8px", fontSize: 11, fontWeight: 600,
    letterSpacing: 0.2, color, background: color + "14", borderRadius: 4,
    marginRight: 4, marginBottom: 3, fontFamily: FONT,
  }}>{text}</span>
);

const Sparkline = ({ data, color = C.green, w = 80, h = 24 }) => {
  if (!data || data.length < 2) return null;
  const mn = Math.min(...data), mx = Math.max(...data), rng = mx - mn || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - mn) / rng) * (h - 4) - 2}`).join(" ");
  return (<svg width={w} height={h} style={{ display: "block" }}><polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" /><circle cx={(data.length - 1) / (data.length - 1) * w} cy={h - ((data[data.length - 1] - mn) / rng) * (h - 4) - 2} r={2.5} fill={color} /></svg>);
};

const CalendarStrip = ({ grants, onClickGrant, C: colors }) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const endDate = new Date(today); endDate.setDate(endDate.getDate() + 90);
  const deadlines = grants.filter(g => g.deadline && !["won", "lost", "deferred"].includes(g.stage)).map(g => {
    const d = new Date(g.deadline); d.setHours(0, 0, 0, 0);
    const days = Math.round((d - today) / 86400000);
    return { ...g, date: d, days, pct: Math.max(0, Math.min(100, (days / 90) * 100)) };
  }).filter(g => g.days >= -7 && g.days <= 90).sort((a, b) => a.days - b.days);
  if (!deadlines.length) return null;
  const months = [];
  for (let i = 0; i <= 3; i++) { const m = new Date(today); m.setMonth(m.getMonth() + i, 1); if (m <= endDate) months.push(m); }
  return (
    <div style={{ background: colors.white, borderRadius: 10, border: `1px solid ${colors.line}`, padding: "12px 16px", marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", color: colors.t4 }}>Deadline timeline</span>
        <span style={{ fontSize: 11, color: colors.t4 }}>Next 90 days</span>
      </div>
      <div style={{ position: "relative", height: 40, background: colors.raised, borderRadius: 6 }}>
        {/* Today marker */}
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 2, background: colors.green, borderRadius: 1, zIndex: 2 }} />
        <div style={{ position: "absolute", left: -2, top: -14, fontSize: 9, fontWeight: 600, color: colors.green }}>Today</div>
        {/* Month markers */}
        {months.map(m => {
          const d = Math.round((m - today) / 86400000); const pct = (d / 90) * 100;
          if (pct <= 0 || pct >= 100) return null;
          return <div key={m.toISOString()} style={{ position: "absolute", left: `${pct}%`, top: 0, bottom: 0, width: 1, background: colors.line }}>
            <span style={{ position: "absolute", top: -14, left: -12, fontSize: 9, color: colors.t4 }}>{m.toLocaleDateString("en-ZA", { month: "short" })}</span>
          </div>;
        })}
        {/* 2-week danger zone */}
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${(14 / 90) * 100}%`, background: "rgba(217,72,72,0.06)", borderRadius: "6px 0 0 6px" }} />
        {/* Deadline dots */}
        {deadlines.map((g, i) => {
          const d = g.days; const urgent = d <= 14; const overdue = d < 0;
          const color = overdue ? colors.red : urgent ? colors.amber : colors.purple;
          // Stack overlapping dots
          const nearby = deadlines.filter(o => Math.abs(o.days - g.days) < 3 && deadlines.indexOf(o) < i);
          const yOff = (nearby.length % 3) * 12;
          return <div key={g.id} title={`${g.name} — ${g.funder}\n${d < 0 ? Math.abs(d) + "d overdue" : d + "d remaining"}\nR${g.ask?.toLocaleString()}`}
            onClick={() => onClickGrant(g.id)}
            style={{ position: "absolute", left: `${Math.max(0.5, Math.min(99, g.pct))}%`, top: 8 + yOff, width: 12, height: 12, borderRadius: "50%", background: color, border: `2px solid ${colors.white}`, cursor: "pointer", transform: "translateX(-6px)", zIndex: 3, transition: "transform 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }}
            onMouseEnter={e => e.currentTarget.style.transform = "translateX(-6px) scale(1.4)"}
            onMouseLeave={e => e.currentTarget.style.transform = "translateX(-6px) scale(1)"} />;
        })}
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
        <span style={{ fontSize: 10, color: colors.t4, display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: colors.red }} /> Overdue</span>
        <span style={{ fontSize: 10, color: colors.t4, display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: colors.amber }} /> Urgent</span>
        <span style={{ fontSize: 10, color: colors.t4, display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: colors.purple }} /> On track</span>
      </div>
    </div>
  );
};

const Num = ({ label, value, sub, color = C.dark, sparkData, sparkColor }) => (
  <div style={{ flex: 1, minWidth: 120, padding: "18px 20px", background: C.white, borderRadius: 8, border: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.t4, marginBottom: 10, letterSpacing: 1.2, textTransform: "uppercase" }}>{label}</div>
      {sparkData && <Sparkline data={sparkData} color={sparkColor || color} />}
    </div>
    <div style={{ fontSize: 28, fontWeight: 800, color, letterSpacing: -1.2, fontFamily: MONO, lineHeight: 1 }}>{value}</div>
    {sub && <div style={{ fontSize: 12, color: C.t3, marginTop: 8, fontWeight: 500 }}>{sub}</div>}
  </div>
);

const Btn = ({ children, onClick, v = "primary", disabled, style: sx }) => {
  const base = { padding: "8px 16px", border: "none", fontSize: 13, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1, fontFamily: FONT, borderRadius: 6, transition: "all 0.15s", letterSpacing: 0.1 };
  const variants = {
    primary: { background: C.dark, color: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,0.2)" },
    ghost: { background: "transparent", color: C.t2, border: `1.5px solid ${C.line}` },
    muted: { background: C.raised, color: C.t2, border: `1px solid ${C.line}` },
    danger: { background: C.redSoft, color: C.red, border: `1.5px solid ${C.red}30` },
    success: { background: C.green, color: "#fff", boxShadow: "0 1px 2px rgba(13,156,92,0.3)" },
  };
  return <button onClick={onClick} disabled={disabled} style={{ ...base, ...variants[v], ...sx }}>{children}</button>;
};

const CopyBtn = ({ text }) => {
  const [ok, setOk] = useState(false);
  return (
    <button onClick={() => { cp(text); setOk(true); setTimeout(() => setOk(false), 2e3); }}
      style={{ padding: "5px 12px", border: `1px solid ${ok ? C.greenBorder : C.line}`, background: ok ? C.greenSoft : C.white, color: ok ? C.green : C.t3, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: FONT, borderRadius: 6 }}>
      {ok ? "Copied" : "Copy"}
    </button>
  );
};

const Label = ({ children, style: sx }) => (
  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase", color: C.t3, marginBottom: 14, ...sx }}>{children}</div>
);

const Avatar = ({ id, size = 26, showRole = false }) => {
  const m = TEAM.find(t => t.id === id) || TEAM.find(t => t.id === "team");
  const avatarColors = {
    alison: { bg: C.greenSoft, fg: C.green }, david: { bg: C.amberSoft, fg: C.amber },
    barbara: { bg: "#EC4899" + "18", fg: "#EC4899" }, nolan: { bg: C.purpleSoft, fg: C.purple },
    ayanda: { bg: C.blueSoft, fg: C.blue }, team: { bg: C.raised, fg: C.t3 },
  };
  const ac = avatarColors[id] || avatarColors.team;
  return (
    <span title={`${m.name}${m.title ? " — " + m.title : ""}`} style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: size, height: size, fontSize: size * 0.36, fontWeight: 600,
      color: ac.fg, background: ac.bg, borderRadius: 7, flexShrink: 0, fontFamily: MONO,
    }}>{m.ini}</span>
  );
};

const RoleBadge = ({ role }) => {
  const rc = { director: { bg: C.greenSoft, fg: C.green, l: "Director" }, hop: { bg: C.purpleSoft, fg: C.purple, l: "Head of Prog" }, pm: { bg: C.blueSoft, fg: C.blue, l: "Prog Manager" } };
  const r = rc[role]; if (!r) return null;
  return <span style={{ padding: "2px 8px", fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: r.fg, background: r.bg, borderRadius: 4, textTransform: "uppercase" }}>{r.l}</span>;
};

const downloadDoc = (text, filename) => {
  const lt = String.fromCharCode(60);
  const escaped = text.replace(/&/g,"&amp;").replace(new RegExp(lt, "g"),"&lt;").replace(/>/g,"&gt;")
    .replace(/═{3,}.*\n?/g, "<hr>")
    .replace(/^(\d+)\.\s+(.+)$/gm, "<h2>$1. $2</h2>")
    .replace(/^([A-Z][A-Z\s&/]{4,})$/gm, "<h2>$1</h2>")
    .replace(/^[•●]\s+(.+)$/gm, "<li>$1</li>")
    .replace(/┌[─┬┐\s\S]*?┘/g, m => {
      const rows = m.split("\n").filter(r => r.startsWith("│"));
      if (!rows.length) return m;
      return "<table>" + rows.map((r, i) => {
        const cells = r.split("│").filter(c => c.trim() !== "").map(c => c.trim());
        const tag = i === 0 ? "th" : "td";
        return "<tr>" + cells.map(c => "<" + tag + ">" + c + "</" + tag + ">").join("") + "</tr>";
      }).join("") + "</table>";
    })
    .replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>");
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.6;color:#222;max-width:7in;margin:0.8in auto}h1,h2,h3{color:#1a1a1a;margin-top:18pt}h1{font-size:16pt;border-bottom:1pt solid #ccc;padding-bottom:6pt}h2{font-size:13pt}pre{white-space:pre-wrap;font-family:Calibri,Arial,sans-serif}table{border-collapse:collapse;width:100%;margin:8pt 0}td,th{border:1pt solid #bbb;padding:4pt 8pt;font-size:10pt}</style></head>
<body>${escaped}</body></html>`;
  const blob = new Blob([html], { type: "application/msword" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename.replace(/[^a-zA-Z0-9_-]/g, "_") + ".doc";
  a.click();
  URL.revokeObjectURL(a.href);
};

const DownloadBtn = ({ text, filename, label }) => (
  <button onClick={() => downloadDoc(text, filename)} style={{
    display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 12px",
    fontSize: 12, fontWeight: 600, color: C.green, background: C.greenSoft,
    border: `1px solid ${C.green}30`, borderRadius: 6, cursor: "pointer", fontFamily: FONT,
  }}>{label || "Download .doc"}</button>
);

const AICard = ({ title, desc, onRun, busy, result, docName }) => (
  <div style={{ background: C.white, borderRadius: 8, padding: 22, marginBottom: 14, border: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 600, color: C.dark, marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 14, color: C.t3, lineHeight: 1.5 }}>{desc}</div>
      </div>
      <Btn onClick={onRun} disabled={busy} v="ghost">{busy ? "Working..." : "Run"}</Btn>
    </div>
    {result && (
      <div style={{ marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8, gap: 6 }}>
          {docName && <DownloadBtn text={result} filename={docName} />}
          <CopyBtn text={result} />
        </div>
        <div style={{ padding: 20, background: C.bg, borderRadius: 10, borderLeft: `3px solid ${C.green}`, fontSize: 14, lineHeight: 1.8, color: C.t1, whiteSpace: "pre-wrap", maxHeight: 420, overflow: "auto" }}>{result}</div>
      </div>
    )}
  </div>
);

/* ── MAIN APP ── */
export default function App() {
  const [grants, setGrants] = useState([]);
  const [confs, setConfs] = useState([]);
  const [learn, setLearn] = useState({ w: {}, o: [] });
  const [view, setView] = useState("dashboard");
  const [sel, setSel] = useState(null);
  const [tab, setTab] = useState(null);
  const [busy, setBusy] = useState({});
  const [ai, setAi] = useState({});
  const [modal, setModal] = useState(null);
  const [confQ, setConfQ] = useState("");
  const [confTab, setConfTab] = useState("sa");
  const [confApp, setConfApp] = useState({}); // { confName: { text, busy } }
  const [grantApp, setGrantApp] = useState({}); // { grantId: { text, busy } }
  const [q, setQ] = useState("");
  const [sf, setSf] = useState("all");
  const [pSort, setPSort] = useState("default"); // default | deadline | ask | fit
  const [pView, setPView] = useState("kanban"); // kanban | list
  const [pGroup, setPGroup] = useState("stage"); // stage | funder
  const [listSort, setListSort] = useState({ col: "deadline", dir: "asc" });
  const [bBusy, setBBusy] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [approvals, setApprovals] = useState([]); // { id, gid, from, to, requestedBy, status, reviews: [{by, decision, note, date}] }
  const [agentBusy, setAgentBusy] = useState({});
  const [orgDocs, setOrgDocs] = useState({}); // { docId: { status, expiry, uploadedDate, fileName, fileSize, notes, fileData } }
  const [quickNote, setQuickNote] = useState({});
  const [confirmDel, setConfirmDel] = useState(null);
  const init = useRef(false);
  const bDone = useRef(false);

  useEffect(() => { if (init.current) return; init.current = true; (async () => {
    const g = await sG("dlg12", null); setGrants(g?.length > 0 ? g : SEED);
    setConfs(await sG("dlc12", [])); setLearn(await sG("dll12", { w: {}, o: [] }));
    setApprovals(await sG("dla12", []));
    setOrgDocs(await sG("dlo12", {}));
  })(); }, []);
  useEffect(() => { if (grants.length) sS("dlg12", grants); }, [grants]);
  useEffect(() => { sS("dlc12", confs); }, [confs]);
  useEffect(() => { sS("dll12", learn); }, [learn]);
  useEffect(() => { if (approvals.length) sS("dla12", approvals); }, [approvals]);
  useEffect(() => { if (Object.keys(orgDocs).length) sS("dlo12", orgDocs); }, [orgDocs]);

  /* ── NOTIFICATIONS ── */
  const notifs = useMemo(() => {
    const n = [];
    grants.forEach(g => {
      if (["won", "lost", "deferred"].includes(g.stage)) return;
      const d = dL(g.deadline);
      if (d !== null && d < 0) n.push({ id: `ov-${g.id}`, ty: "urgent", gid: g.id, tx: `${g.name} — ${Math.abs(d)} days overdue` });
      else if (d !== null && d <= 7) n.push({ id: `ur-${g.id}`, ty: "urgent", gid: g.id, tx: `${g.name} — deadline in ${d} days` });
      else if (d !== null && d <= 14) n.push({ id: `sn-${g.id}`, ty: "warn", gid: g.id, tx: `${g.name} — deadline in ${d} days` });
      (g.fups || []).forEach(fu => {
        if (fu.done) return; const fd = dL(fu.date);
        if (fd !== null && fd <= 0) n.push({ id: `fu-${g.id}-${fu.date}`, ty: "followup", gid: g.id, tx: `Follow-up due: ${fu.label} — ${g.name}` });
      });
      if (["drafting", "review"].includes(g.stage)) {
        const tpl = DOCS[g.type] || []; const miss = tpl.filter(d => !g.docs?.[d] || g.docs[d] === "missing");
        if (miss.length > 0 && miss.length <= 4) n.push({ id: `dc-${g.id}`, ty: "docs", gid: g.id, tx: `${g.name} — ${miss.length} document${miss.length > 1 ? "s" : ""} needed` });
      }
    });
    return n;
  }, [grants]);

  /* ── BRIEFING (structured) ── */
  const localBrief = useCallback((gs) => {
    const g = gs || grants; const act = g.filter(x => !["won", "lost", "deferred"].includes(x.stage));
    const ov = act.filter(x => { const d = dL(x.deadline); return d !== null && d < 0; });
    const urg = act.filter(x => { const d = dL(x.deadline); return d !== null && d >= 0 && d < 14; });
    const fuDue = g.flatMap(x => (x.fups || []).filter(f => !f.done && dL(f.date) <= 0).map(f => ({ ...f, gn: x.name, gid: x.id, ow: x.owner })));
    const ren = act.filter(x => x.rel === "Previous Funder");
    const dr = act.filter(x => x.stage === "drafting");
    const un = act.filter(x => x.owner === "team");
    const items = [];
    ov.forEach(x => items.push({ pr: "urgent", grant: x.name, gid: x.id, action: `${Math.abs(dL(x.deadline))} days overdue — submit or escalate immediately`, by: "Today", who: x.owner }));
    urg.forEach(x => items.push({ pr: "urgent", grant: x.name, gid: x.id, action: `Deadline in ${dL(x.deadline)} days. Currently ${x.stage}.`, by: x.deadline ? new Date(x.deadline).toLocaleDateString("en-ZA", { day: "numeric", month: "short" }) : "", who: x.owner }));
    fuDue.forEach(f => items.push({ pr: "followup", grant: f.gn, gid: f.gid, action: f.label, by: "Today", who: f.ow }));
    ren.forEach(x => { if (!items.find(i => i.gid === x.id)) items.push({ pr: "renewal", grant: x.name, gid: x.id, action: `Prepare renewal — existing relationship with ${x.funder}`, by: x.deadline ? new Date(x.deadline).toLocaleDateString("en-ZA", { day: "numeric", month: "short" }) : "Q2", who: x.owner }); });
    dr.forEach(x => { if (!items.find(i => i.gid === x.id)) items.push({ pr: "action", grant: x.name, gid: x.id, action: "In drafting — review and advance to next stage", by: "", who: x.owner }); });
    un.forEach(x => { if (!items.find(i => i.gid === x.id)) items.push({ pr: "assign", grant: x.name, gid: x.id, action: "Assign an owner", by: "", who: "team" }); });
    if (!items.length) items.push({ pr: "ok", grant: "Pipeline", gid: null, action: `All on track. ${act.length} active grants, R${act.reduce((s, x) => s + (x.ask || 0), 0).toLocaleString()} total.`, by: "", who: "" });
    return items;
  }, [grants]);

  // Parse AI text response into structured items
  const parseAIBrief = (text) => {
    const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 3);
    return lines.map((line, i) => {
      // Strip markdown: numbered list, bold markers, heading markers
      let clean = line.replace(/^#+\s*/, "").replace(/^\d+[.)]\s*/, "").replace(/\*\*/g, "").replace(/^[\-–—]\s*/, "").trim();
      if (!clean || clean.length < 5) return null;
      // Try to extract grant name (before dash or colon)
      const split = clean.match(/^([^–—:]+?)\s*[–—:]\s*(.+)$/);
      const pr = i < 2 ? "urgent" : i < 5 ? "action" : "info";
      if (split) return { pr, grant: split[1].trim(), gid: null, action: split[2].trim(), by: "", who: "" };
      return { pr, grant: "", gid: null, action: clean, by: "", who: "" };
    }).filter(Boolean).slice(0, 10);
  };

  const [briefItems, setBriefItems] = useState([]);
  const [briefRaw, setBriefRaw] = useState("");

  const genBrief = useCallback(async (gs) => {
    if (bBusy) return; setBBusy(true);
    // Set local immediately
    setBriefItems(localBrief(gs));
    const g = gs || grants; const act = g.filter(x => !["won", "lost", "deferred"].includes(x.stage));
    const ov = act.filter(x => { const d = dL(x.deadline); return d !== null && d < 0; });
    const urg = act.filter(x => { const d = dL(x.deadline); return d !== null && d >= 0 && d < 14; });
    const fuDue = g.flatMap(x => (x.fups || []).filter(f => !f.done && dL(f.date) <= 0).map(f => ({ ...f, gn: x.name })));
    const dr = act.filter(x => x.stage === "drafting"); const ren = act.filter(x => x.rel === "Previous Funder");
    const r = await api(`You are d-lab's grant operations manager. You produce a daily action list — the 5-8 things that will move the pipeline forward TODAY.

RULES:
- Each item: "Grant Name — specific action verb + what to do"
- Order by urgency: overdue first, then deadlines within 7 days, then follow-ups, then drafting priorities
- Be blunt: "OVERDUE" or "X days left" where relevant
- No preamble, no markdown, no numbering, no asterisks, no bold
- Plain text, one item per line`,
      `${new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" })}.
Overdue: ${ov.map(x => `${x.name} (${Math.abs(dL(x.deadline))}d overdue, R${(x.ask||0).toLocaleString()})`).join("; ") || "none"}
Urgent (<14d): ${urg.map(x => `${x.name} (${dL(x.deadline)}d, R${(x.ask||0).toLocaleString()})`).join("; ") || "none"}
Follow-ups due: ${fuDue.map(f => `${f.label} for ${f.gn}`).join("; ") || "none"}
In drafting: ${dr.map(x => `${x.name} (R${(x.ask||0).toLocaleString()}, ${x.hrs||0}hrs)`).join("; ") || "none"}
Renewals: ${ren.map(x => x.name).join(", ") || "none"}
Pipeline: ${act.length} grants, R${act.reduce((s,x) => s+(x.ask||0),0).toLocaleString()}`, false, 1000);
    if (!r.startsWith("API") && !r.startsWith("Connection")) {
      const parsed = parseAIBrief(r);
      if (parsed.length > 0) setBriefItems(parsed);
      setBriefRaw(r);
    }
    setBBusy(false);
  }, [grants, bBusy, localBrief]);

  useEffect(() => { if (view === "dashboard" && !bDone.current && grants.length > 0) { bDone.current = true; setBriefItems(localBrief(grants)); genBrief(grants); } }, [view, grants, genBrief, localBrief]);

  /* ── COMPUTED ── */
  const pipe = useMemo(() => {
    const act = grants.filter(g => !["won", "lost", "deferred"].includes(g.stage));
    const won = grants.filter(g => g.stage === "won");
    // Sparkline: pipeline value by stage (funnel shape)
    const stageValues = STAGES.filter(s => !["won", "lost", "deferred"].includes(s.id)).map(s => grants.filter(g => g.stage === s.id).reduce((sum, g) => sum + (g.ask || 0), 0));
    // Sparkline: cumulative pipeline value flowing through stages
    const cumulativeAsk = []; let cum = 0; for (const v of stageValues) { cum += v; cumulativeAsk.push(cum); }
    // Sparkline: won grants by value (ascending)
    const wonValues = won.map(g => g.ask || 0).sort((a, b) => a - b);
    const wonCumulative = []; let wc = 0; for (const v of wonValues) { wc += v; wonCumulative.push(wc); }
    // Sparkline: deadline distribution (count per 2-week bucket)
    const buckets = [0, 0, 0, 0, 0, 0]; // 6 × 2-week buckets = 12 weeks
    act.forEach(g => { const d = g.deadline ? Math.round((new Date(g.deadline) - new Date()) / 86400000) : null; if (d !== null && d >= 0 && d < 84) buckets[Math.floor(d / 14)]++; });
    return {
      act, won, ask: act.reduce((s, g) => s + (g.ask || 0), 0), wonV: won.reduce((s, g) => s + (g.ask || 0), 0),
      stages: STAGES.map(s => ({ ...s, n: grants.filter(g => g.stage === s.id).length })),
      types: FTYPES.map(t => ({ name: t, n: grants.filter(g => g.type === t).length })).filter(t => t.n > 0),
      wr: won.length / Math.max(1, grants.filter(g => ["won", "lost"].includes(g.stage)).length),
      sparkPipeline: stageValues.length > 1 ? stageValues : null,
      sparkWon: wonCumulative.length > 1 ? wonCumulative : null,
      sparkDeadlines: buckets.some(b => b > 0) ? buckets : null,
    };
  }, [grants]);

  const fit = useCallback(g => {
    let s = 50;
    if (g.rel === "Previous Funder") s += 20; else if (g.rel === "Existing Relationship") s += 15; else if (g.rel === "Warm Intro") s += 8;
    if (g.focus?.some(f => ["Digital Skills", "Youth Employment", "AI/4IR"].includes(f))) s += 15;
    if (g.geo?.some(p => ["Gauteng", "Western Cape", "Mpumalanga"].includes(p))) s += 8; // existing delivery footprint
    if (g.geo?.length >= 3) s += 5; // national reach programmes
    if (g.ask && g.ask <= 2e6) s += 8;
    const tpl = DOCS[g.type] || []; const rdy = tpl.filter(d => g.docs?.[d] === "ready").length;
    if (tpl.length > 0 && rdy / tpl.length > 0.7) s += 7;
    return Math.min(100, Math.max(0, Math.round(s)));
  }, []);

  /* ── MUTATIONS ── */
  const up = (id, u) => setGrants(p => p.map(g => g.id === id ? { ...g, ...u } : g));
  const addL = (id, t) => up(id, { log: [...(grants.find(g => g.id === id)?.log || []), { d: td(), t }] });
  const sA = (k, v) => setAi(p => ({ ...p, [k]: v }));
  const sB = (k, v) => setBusy(p => ({ ...p, [k]: v }));

  const moveStage = (id, ns) => {
    const g = grants.find(x => x.id === id); if (!g) return;
    const u = { stage: ns };
    if (ns === "submitted" && g.stage !== "submitted") {
      u.subDate = td();
      u.fups = (CAD[g.type] || CAD["Foundation"]).map(c => ({ date: addD(td(), c.d), label: c.l, type: c.t, done: false }));
      addL(id, "Submitted — follow-up cadence created");
    }
    up(id, u);
    addL(id, "Stage moved to " + ns);
  };

  const STAGE_ORDER = STAGES.map(s => s.id);
  const nextStage = (id) => {
    const g = grants.find(x => x.id === id); if (!g) return;
    const ci = STAGE_ORDER.indexOf(g.stage);
    if (ci >= 0 && ci < STAGE_ORDER.length - 1) {
      const next = STAGE_ORDER[ci + 1];
      const gate = needsApproval(g.stage, next);
      if (gate) { requestApproval(id, g.stage, next); }
      else { moveStage(id, next); }
    }
  };
  const prevStage = (id) => {
    const g = grants.find(x => x.id === id); if (!g) return;
    const ci = STAGE_ORDER.indexOf(g.stage);
    if (ci > 0) moveStage(id, STAGE_ORDER[ci - 1]);
  };

  // Check if a stage transition needs approval
  const needsApproval = (from, to) => GATES[from + "->" + to] || null;

  // Request approval — creates pending approval record
  const requestApproval = (gid, from, to) => {
    const gate = GATES[from + "->" + to]; if (!gate) return;
    const g = grants.find(x => x.id === gid); if (!g) return;
    const existing = approvals.find(a => a.gid === gid && a.from === from && a.to === to && a.status === "pending");
    if (existing) return; // Already pending
    const appr = { id: "a" + Date.now().toString(36), gid, grantName: g.name, from, to, gate: gate.label, need: gate.need, requestedBy: g.owner, status: "pending", reviews: [], created: td() };
    setApprovals(p => [...p, appr]);
    addL(gid, "Approval requested: " + STAGES.find(s=>s.id===from)?.label + " → " + STAGES.find(s=>s.id===to)?.label);
  };

  // Agent review — AI emulates a team member reviewing a grant for approval
  const agentReview = async (approvalId, reviewerId) => {
    setAgentBusy(p => ({ ...p, [approvalId + reviewerId]: true }));
    const appr = approvals.find(a => a.id === approvalId); if (!appr) return;
    const g = grants.find(x => x.id === appr.gid); if (!g) return;
    const reviewer = TEAM.find(t => t.id === reviewerId); if (!reviewer) return;
    const persona = PERSONAS[reviewerId] || "";

    const prompt = `${persona}

Review whether "${g.name}" (R${(g.ask||0).toLocaleString()} to ${g.funder}) should move from "${STAGES.find(s=>s.id===appr.from)?.label}" to "${STAGES.find(s=>s.id===appr.to)?.label}".

FACTS: ${g.type} | R${(g.ask||0).toLocaleString()} | Deadline: ${g.deadline || "Rolling"} | Relationship: ${g.rel} | Fit: ${fit(g)}% | Hours: ${g.hrs||0} | Docs: ${(DOCS[g.type]||[]).filter(d=>g.docs?.[d]==="ready").length}/${(DOCS[g.type]||[]).length}
Notes: ${g.notes || "None"}

CRITERIA for "${STAGES.find(s=>s.id===appr.to)?.label}":
${appr.to === "qualifying" ? "Worth pursuing? Funder fit, realistic ask, relationship warmth, strategic value." : appr.to === "drafting" ? "Enough intel to draft? Do we know what they fund, typical size, process?" : appr.to === "review" ? "Submission-ready? Budget accurate, programme type correct, docs ready, narrative compelling." : appr.to === "submitted" ? "Final check: all docs, clean formatting, justified ask, nothing missing." : "Does this stage move make sense?"}

RESPOND EXACTLY:
DECISION: APPROVE or NEEDS WORK
REASONING: [2-3 sentences in character — specific about what's good or missing]
CONDITIONS: [specific items, or "None"]`;

    const result = await api(persona + " " + CTX, prompt);

    const decision = result.includes("APPROVE") && !result.includes("NEEDS WORK") ? "approved" : "needs_work";
    const review = { by: reviewerId, decision, note: result, date: td() };

    setApprovals(p => p.map(a => {
      if (a.id !== approvalId) return a;
      const reviews = [...a.reviews, review];
      // Check if we have enough approvals
      const approvedCount = reviews.filter(r => r.decision === "approved").length;
      const needRole = a.need;
      const approvers = TEAM.filter(t => t.role === needRole);
      const status = approvedCount >= Math.ceil(approvers.length / 2) ? "approved" : reviews.length >= approvers.length ? "rejected" : "pending";
      return { ...a, reviews, status };
    }));

    // If fully approved, execute the stage move
    setTimeout(() => {
      setApprovals(curr => {
        const latest = curr.find(a => a.id === approvalId);
        if (latest?.status === "approved") {
          moveStage(latest.gid, latest.to);
          addL(latest.gid, "Approved by " + latest.reviews.filter(r => r.decision === "approved").map(r => TEAM.find(t => t.id === r.by)?.name).join(", "));
        }
        return curr;
      });
    }, 100);

    setAgentBusy(p => ({ ...p, [approvalId + reviewerId]: false }));
  };

  // Run all relevant agent reviews for an approval
  const runAllAgentReviews = async (approvalId) => {
    const appr = approvals.find(a => a.id === approvalId); if (!appr) return;
    const reviewers = TEAM.filter(t => t.role === appr.need && !appr.reviews.find(r => r.by === t.id));
    for (const r of reviewers) {
      await agentReview(approvalId, r.id);
    }
  };

  /* ── AI ACTIONS ── */
  const [scoutResults, setScoutResults] = useState([]);
  const SCOUT_FALLBACK = [
    { name: "NSF Digital Skills", funder: "National Skills Fund", type: "Government/SETA", ask: 2500000, deadline: null, fit: "High", reason: "Digital skills, youth employment, scalable partner model", url: "https://www.nsf.gov.za/", focus: ["Youth Employment", "Digital Skills"] },
    { name: "W&R SETA Discretionary", funder: "Wholesale & Retail SETA", type: "Government/SETA", ask: 1500000, deadline: "2026-06-30", fit: "Medium", reason: "Digital skills for retail sector, youth employment", url: "https://www.wrseta.org.za/grant_application.aspx", focus: ["Digital Skills", "Youth Employment"] },
    { name: "National Lotteries Commission", funder: "NLC Charities Sector", type: "Government/SETA", ask: 3000000, deadline: "2026-06-30", fit: "Medium", reason: "Community development, NPO registered, large grants", url: "https://nlcsa.org.za/how-to-apply/", focus: ["Youth Employment", "Education"] },
    { name: "Oppenheimer Memorial Trust", funder: "OMT", type: "Foundation", ask: 550000, deadline: "2026-06-30", fit: "Medium", reason: "Education, under-resourced communities, biannual window", url: "https://www.omt.org.za/how-to-apply/", focus: ["Education", "Rural Dev"] },
    { name: "FirstRand Foundation", funder: "FirstRand Foundation", type: "Foundation", ask: 2000000, deadline: null, fit: "High", reason: "Youth employment, education, innovation — rolling applications", url: "https://www.firstrandfoundation.org.za/apply", focus: ["Youth Employment", "Education"] },
    { name: "Microsoft Skills for Jobs", funder: "Microsoft Philanthropies", type: "Tech Company", ask: 1500000, deadline: null, fit: "High", reason: "AI skills, digital employment, FET programme synergy", url: "https://www.microsoft.com/en-za/corporate-responsibility", focus: ["AI/4IR", "Digital Skills"] },
    { name: "Ford Foundation Future of Work", funder: "Ford Foundation", type: "International", ask: 5400000, deadline: null, fit: "Medium", reason: "Future of work, digital economy, Global South", url: "https://www.fordfoundation.org/work/our-grants/", focus: ["Youth Employment", "AI/4IR"] },
    { name: "Anglo American CSI", funder: "Anglo American", type: "Corporate CSI", ask: 2000000, deadline: null, fit: "Medium", reason: "Skills development, host communities, youth employment", url: "https://www.angloamerican.com/sustainability", focus: ["Youth Employment", "Digital Skills", "Rural Dev"] },
    { name: "Standard Bank CSI", funder: "Standard Bank", type: "Corporate CSI", ask: 1500000, deadline: null, fit: "High", reason: "Youth skills, digital economy, B-BBEE alignment", url: "https://www.standardbank.co.za/southafrica/personal/about-us/corporate-social-investment", focus: ["Youth Employment", "Digital Skills"] },
    { name: "Echoing Green Fellowship", funder: "Echoing Green", type: "International", ask: 1440000, deadline: "2026-03-15", fit: "Medium", reason: "Social entrepreneur fellowship, innovative models, early-stage", url: "https://echoinggreen.org/fellowship/", focus: ["Youth Employment", "Education"] },
  ];

  const parseScoutResults = (text) => {
    try {
      const clean = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const start = clean.indexOf("[");
      const end = clean.lastIndexOf("]");
      if (start >= 0 && end > start) {
        const arr = JSON.parse(clean.substring(start, end + 1));
        if (Array.isArray(arr) && arr.length > 0 && arr[0].name) return arr;
      }
    } catch (e) {}
    return null;
  };

  const addScoutToPipeline = (s) => {
    const typeMap = { "corporate": "Corporate CSI", "csi": "Corporate CSI", "government": "Government/SETA", "seta": "Government/SETA", "international": "International", "foundation": "Foundation", "tech": "Tech Company" };
    const gType = typeMap[Object.keys(typeMap).find(k => (s.type || "").toLowerCase().includes(k))] || "Foundation";
    const newG = {
      id: uid(), name: s.name || "New Grant", funder: s.funder || "Unknown", type: gType,
      stage: "scouted", ask: Number(s.ask) || 0, deadline: s.deadline || null,
      focus: s.focus || ["Youth Employment", "Digital Skills"], geo: [], rel: "Cold", pri: 3, hrs: 0,
      notes: `${s.reason || ""}${s.url ? "\nApply: " + s.url : ""}`, log: [{ d: td(), t: "Scouted by AI" }],
      on: "", of: [], owner: "team", docs: {}, fups: [], subDate: null, applyUrl: s.url || "",
    };
    setGrants(prev => [...prev, newG]);
    setScoutResults(prev => prev.map(x => x.name === s.name && x.funder === s.funder ? { ...x, added: true } : x));
  };

  const aiScout = async () => {
    sB("scout", true); setScoutResults([]);
    const existing = grants.filter(g => !["won","lost","deferred"].includes(g.stage)).map(g => g.funder.toLowerCase());
    const r = await api(`You find grant opportunities for d-lab, a South African NPO training unemployed youth in AI-native digital skills (92% completion, 85% employment, 7 programme types from R199K to R5M).

SEARCH for open grant opportunities, CSI funding calls, SETA discretionary windows, and international tech funder programmes in 2026.

RESPOND WITH ONLY A JSON ARRAY — no markdown, no backticks, no explanation. Each object:
{"name":"[grant name]","funder":"[organisation]","type":"[Corporate CSI|Government/SETA|International|Foundation|Tech Company]","ask":[amount in ZAR integer],"deadline":"[YYYY-MM-DD or null]","fit":"[High|Medium|Low]","reason":"[1 sentence: why it fits d-lab]","url":"[application URL]","focus":["tag1","tag2"]}

FIT = HIGH only if 3+ of: youth employment focus, digital/AI skills, SA or Africa eligible, NPOs eligible, R200K-R5M range, accepts newer organisations.
EXCLUDE: university-only, pure research, sectors with no skills angle.
Return 8-12 real, current opportunities.`,
      `Search for open grants in South Africa for youth digital skills NPOs, February 2026. Include SETA windows, corporate CSI open calls, foundation rounds, and international tech grants (Google.org, Mastercard Foundation, etc). d-lab already has applications with: ${existing.join(", ")}. Find NEW opportunities not already in the pipeline.`, true, 2500);
    
    let parsed = parseScoutResults(r);
    if (!parsed) parsed = SCOUT_FALLBACK;
    // Mark any already in pipeline
    const results = parsed.map(s => ({
      ...s,
      inPipeline: existing.includes((s.funder || "").toLowerCase()),
      added: false,
    }));
    setScoutResults(results);
    sB("scout", false);
  };
  const aiDraft = async g => {
    sB("draft", true); sA("draft", null);
    const fs = funderStrategy(g);
    const returning = isFunderReturning(g.funder);
    const relNote = returning ? `\n\nCRITICAL: ${g.funder} is a RETURNING FUNDER who has previously supported d-lab. Open warmly by acknowledging this existing relationship and what their past support helped achieve. This is a renewal/deepening conversation, not a cold pitch.` : (g.rel === "Warm Intro" ? `\n\nNote: We have a warm introduction to this funder. Reference the connection.` : "");
    const r = await api(`You write funding proposals for d-lab NPC — a South African NPO with 92% completion and 85% employment outcomes in AI-native youth training.

VOICE: Warm, human, confident. Not bureaucratic. Not begging. You're offering a funder the chance to back something that demonstrably works.

FRAMING: d-lab's story is the SYSTEM — 7 programme types, partner delivery model, in-house AI tools (LMS, Language Leveller, Assessornator, Cyborg Habits), corporate clients, diversified revenue. Geography is where it delivers, not why it matters. NEVER lead with provincial expansion.

STRUCTURE — exactly 5 sections:
1. OPENING (2-3 sentences: what THIS funder cares about + d-lab's strongest relevant proof point)
2. THE PROGRAMME (which Type 1-7, how many students, duration, what they get)
3. IMPACT & INVESTMENT (budget lines from CTX, cost per student, outcome stats)
4. WHY d-lab (the system: 7 types, partner model, AI tools, outcomes, growth trajectory)
5. THE ASK (amount, what it buys, one sentence on why it's good value)

ANTI-PATTERNS — never do these:
- Don't open with "South Africa has X% youth unemployment" — every NPO says this
- Don't lead with geography or province-counting
- Don't use hollow phrases: "we believe", "we are passionate", "making a difference"
- Don't pad with generic development language — be specific to d-lab

${CTX}`, `Proposal for ${g.name} to ${g.funder}.
TYPE: ${g.type} | ASK: R${g.ask?.toLocaleString()} | FOCUS: ${g.focus?.join(", ") || "youth employment, digital skills"}
LOCATION: ${g.geo?.join(", ") || "South Africa"} (mention only if relevant)
PROGRAMME: ${g.notes || "Standard cohort"}

FUNDER ANGLE: ${fs.lead}
OPENING HOOK: ${fs.hook}
THEIR LANGUAGE: ${fs.lang}
${relNote}

Detect the programme type (Type 1-7) from PROGRAMME notes. Use the CORRECT budget, student count, and duration from CTX.`, false, 2000);
    if (r.startsWith("API") || r.startsWith("Connection") || r.startsWith("No response")) {
      const geo = (g.geo || []).join(", ") || "South Africa";
      const pt = detectType(g);
      const mc = multiCohortInfo(g);
      const students = mc ? mc.count * (PTYPES[mc.typeNum]?.students || 20) : (pt.students || 20);
      const perStudent = pt.perStudent;
      const isFET = pt === PTYPES[4]; const isCorp = pt === PTYPES[5]; const isShort = pt === PTYPES[7];
      const isSETA = g.type === "Government/SETA"; const isCSI = g.type === "Corporate CSI"; const isIntl = g.type === "International";
      // Funder-tailored opening — lead with THEIR priorities
      const opener = returning
        ? `We are grateful for ${g.funder}'s continued partnership with d-lab. Your previous investment helped us build something remarkable — a complete training system that now serves 60 young people with a 92% completion rate and 85% employment outcomes.\n\nWe are writing because we see an opportunity to deepen that impact together.`
        : fs.hook;
      // Funder-tailored value proposition — speak their language
      const valueProp = isSETA
        ? `d-lab's programme is ICITP-accredited (SAQA registered) and ICDL-certifiable, mapped to NQF standards. Our 92% completion rate — nearly double the sector average of 55% — demonstrates a model that delivers on transformation targets while producing genuinely employable graduates.`
        : isCSI
        ? `Every rand invested in d-lab generates measurable B-BBEE value across Skills Development and Socio-Economic Development scorecard elements. But beyond the scorecard, this is an investment in real human outcomes — 85% of our graduates are employed within 3 months.`
        : isIntl
        ? `d-lab advances SDG 4 (Quality Education), SDG 8 (Decent Work), and SDG 10 (Reduced Inequalities). Our model is designed for replication — what works in Gauteng can work across Africa. And we have the evidence to prove it: 92% completion, 85% employment, 29% pre-graduation placement.`
        : g.type === "Tech Company"
        ? `d-lab is the only NPO in South Africa that embeds AI tools from day one — not as a topic, but as a way of working. Our students graduate more digitally fluent than many working professionals. With 92% completion and 85% employment, we've proven that AI-native training produces real employment outcomes.`
        : `d-lab's outcomes — 92% completion, 85% employment, 29% pre-graduation placement — place us among the most effective youth development programmes in the country. At R${perStudent.toLocaleString()} per ${isCorp ? "participant" : "student"}, this is exceptional value.`;
      // Programme description (varies by type)
      const progDesc = isFET ? `3-year, 425-hour FET Work-Readiness Programme for Grade 10-12 learners across 3 Schools of Specialisation. Weekly coaching, Saturday sessions, holiday Design Thinking sprints. Building AI/Cyborg Skills, PowerSkills, Digital Tools, Storytelling, Entrepreneurship, and Self-Discovery.`
        : isCorp ? `6-month Corporate Leadership Programme: Design Thinking sprints, 8 group coaching sessions, Enneagram personality profiling, structured reflection assessments. 63 participants emerge as confident, self-aware leaders.`
        : isShort ? `13-week Foundational Employability Skills Programme: 15 days of delivery — 7 AI coaching days + Design Thinking sprints + Cyborg Habits platform. 90 school-leavers gain practical AI literacy and employability skills at R2,547/learner.`
        : `9-month, full-time programme for unemployed youth aged 18-25. Six months intensive coursework + three-month industry internship. AI-native from day one, five-phase scaffolded journey (Induction → Launch → Orbit → Landing → Internship), personal mentors, ICITP + ICDL accreditation.`;
      const budgetLines = mc
        ? `${mc.count} × ${PTYPES[mc.typeNum]?.label || "cohort"} @ R${(PTYPES[mc.typeNum]?.cost || 516000).toLocaleString()} = R${(mc.count * (PTYPES[mc.typeNum]?.cost || 516000)).toLocaleString()}${g.ask > mc.count * (PTYPES[mc.typeNum]?.cost || 516000) ? `\nOrganisational costs: R${(g.ask - mc.count * (PTYPES[mc.typeNum]?.cost || 516000)).toLocaleString()}` : ""}`
        : `${pt.table.map(r => `• ${r[0]}: R${r[1]}`).join("\n")}\n\nCost per ${isCorp ? "participant" : "student"}: R${perStudent.toLocaleString()}`;
      sA("draft", `FUNDING PROPOSAL: ${g.name}\n${g.funder} | R${g.ask?.toLocaleString()} | ${g.type}\n\n═══════════════════════════════════════\n\n1. ${returning ? "DEEPENING OUR PARTNERSHIP" : fs.lead.toUpperCase()}\n\n${opener}\n\n${valueProp}\n\n2. THE PROGRAMME\n\n${progDesc}\n\n3. IMPACT & INVESTMENT\n\nR${g.ask?.toLocaleString()} funds ${mc ? `${mc.count} cohorts totalling ${students} learners` : `${students} ${isFET ? "learners in a 3-year journey" : isCorp ? "participants" : isShort ? "learners over 13 weeks" : "learners"}`} in ${geo}.\n\n${budgetLines}\n\nProven track record (2025):\n• 92% completion rate (vs ~55% sector average)\n• 85% alumni in work, study, or enterprise within 3 months\n• 29% placed before graduation\n• 100% internship placement for eligible students\n${isCSI ? "\nB-BBEE: Skills Development + Socio-Economic Development scorecard contribution." : isSETA ? "\nAccreditation: ICITP (SAQA registered) + ICDL certification. NQF-aligned." : isIntl ? "\nSDG alignment: SDG 4 (Quality Education), SDG 8 (Decent Work), SDG 10 (Reduced Inequalities)." : ""}\n\n4. WHY d-lab\n\nWhat started as a 12-student pilot in 2022 is now a complete training system. d-lab offers 7 programme types (from R199K short courses to multi-million-rand national programmes), a partner delivery model that scales into any community, in-house AI tools no other NPO has (LMS, Language Leveller, Assessornator, Cyborg Habits), corporate clients (CCBA Future Leaders), and a high school pipeline (GDE + Sci-Bono). The system works: 92% completion, 85% employment, 29% pre-graduation placement. In 2026 we are doubling student numbers while diversifying revenue across grants, corporate, and commercial streams.\n\nNPO 2017/382673/08 | PBO 930077003 | Section 18A tax-exempt\nBoard: 140+ years combined education leadership\nFunders: Telkom Foundation, Get It Done Foundation, TK Foundation, Sage Foundation, SAP, C-Track, EOH\n\n5. THE ASK\n\nR${g.ask?.toLocaleString()} to ${mc ? `deliver ${mc.count} cohorts for ${students} learners` : `transform the lives of ${students} ${isFET ? "high school learners" : isCorp ? "emerging leaders" : isShort ? "school-leavers" : "young people"}`}. ${isSETA ? "This directly advances NSDP 2030 priorities and sector transformation targets." : isCSI ? "This delivers measurable B-BBEE value while changing real lives." : isIntl ? "This advances SDG outcomes with a proven, replicable model." : `At R${perStudent.toLocaleString()} per ${isCorp ? "participant" : "student"}, this is one of the most cost-effective investments in youth employment available.`}\n\nWe would welcome the opportunity to discuss this in more detail.\n\nAlison Jacobson\nFounder & Director, d-lab NPC\nalison.jacobson@d-lab.co.za`);
    } else { sA("draft", r); }
    sB("draft", false); addL(g.id, "AI draft generated");
  };
  const aiFollow = async (g, fu) => {
    sB("follow", true); sA("follow", null);
    const returning = isFunderReturning(g.funder);
    const fs2 = funderStrategy(g);
    const r = await api(`You write follow-up emails for d-lab NPC, a South African youth skills NPO.

VOICE: Professional but human. Confident founder checking in — not a desperate fundraiser chasing.

FORMAT:
Subject: [concise, specific]
[Body — 4-8 sentences max. No "I hope this finds you well." No "I trust this finds you well."]

RULES:
- Open with context (what was submitted, when)
- Include one new proof point or update since submission
- Close with a specific, low-friction next step (15-min call, site visit, "happy to answer questions")
- Match register: ${g.type === "Government/SETA" ? "formal, reference compliance/accreditation" : g.type === "Corporate CSI" ? "professional, mention B-BBEE value" : g.type === "International" ? "polished, reference SDG outcomes" : "warm, outcomes-focused"}`,
      `Draft a ${fu?.type || "follow-up"} email to ${g.funder} about ${g.name} (R${g.ask?.toLocaleString()}).
Context: ${fu?.label || "General follow-up"}.
Days since submission: ${g.subDate ? Math.abs(dL(g.subDate)) : "unknown"}.
What this funder cares about: ${fs2.lead}
${returning ? "RETURNING FUNDER — reference the existing relationship. This is a partner, not a stranger." : "NEW FUNDER — be respectful, make it easy to say yes to a conversation."}
Recent proof points: 92% completion, 85% employment, FET partnership with GDE, Cyborg Habits live, CCBA programme delivering.`);
    if (r.startsWith("API") || r.startsWith("Connection") || r.startsWith("No response")) {
      const days = g.subDate ? Math.abs(dL(g.subDate)) : "several";
      const warm = returning ? `\n\nAs a valued partner of d-lab, we truly appreciate the foundation's ongoing commitment to youth development, and we hope this proposal reflects the growth your previous support has made possible.` : "";
      sA("follow", `Subject: Following up — ${g.name} (d-lab NPC)\n\nDear ${g.funder} Team,\n\nI hope you're well. I wanted to touch base regarding our funding application for ${g.name} (R${g.ask?.toLocaleString()}), which we submitted ${days} days ago.${warm}\n\n${fu?.label ? `For context: ${fu.label}\n\n` : ""}Since submitting, our 2025 cohorts have continued to deliver strong results — 92% completion and 29% of students already placed in work before graduating. We're excited about what this programme could achieve with ${g.funder}'s support.\n\nWe'd love to answer any questions or provide additional information. Happy to jump on a call at your convenience.\n\nWarm regards,\n\nAlison Jacobson\nFounder & Director\nd-lab NPC | NPO 2017/382673/08\nalison.jacobson@d-lab.co.za`);
    } else { sA("follow", r); }
    sB("follow", false);
  };
  const aiIntel = async g => {
    sB("intel", true); sA("intel", null);
    const returning = isFunderReturning(g.funder);
    const r = await api(`You are a funder intelligence analyst preparing a briefing for d-lab NPC (SA youth skills NPO, 92% completion, 85% employment, 7 programme types, R200K-R5M range).

RESEARCH THOROUGHLY — search their website, annual report, CSI report, and recent news. Find:
1. BUDGET & SCALE: Annual CSI/grant spend, typical grant size range
2. RECENT GRANTS: 2-3 examples of who they funded recently, for how much, for what
3. KEY CONTACTS: Names and titles of CSI/foundation decision-makers
4. WHAT WINS: Their stated priorities + what their actual funding pattern reveals
5. APPLICATION PROCESS: Prescribed form or open proposal? Portal or email? Deadlines?
6. d-lab STRATEGY: What angle to lead with, which programme type to offer (Type 1-7), what to emphasise, what to avoid
${returning ? "7. RELATIONSHIP LEVERAGE: How to use the existing relationship — what to reference, who to contact" : "7. DOOR-OPENER: How to get a first meeting — who to approach, what hook to use"}`,
      `Research ${g.funder} for d-lab NPC.
Type: ${g.type}. Current ask: R${(g.ask||0).toLocaleString()}. Focus: ${(g.focus||[]).join(", ")}.
${returning ? "RETURNING FUNDER — research their renewal process and how to deepen the partnership." : "NEW FUNDER — find how to get in the door. Look for open calls, recent announcements, the right contact person."}
Search their website, annual report, and recent news.`, true, 2500);
    if (r.startsWith("API") || r.startsWith("Connection") || r.startsWith("No response")) {
      const relSection = returning
        ? `\nRELATIONSHIP STATUS: RETURNING FUNDER ✓\n${g.funder} has previously funded d-lab. This is a significant advantage:\n• Reference specific outcomes from their previous funding\n• Position this as a deepening of an existing partnership, not a new pitch\n• Ask for a meeting to share progress before submitting formal proposal\n• Consider inviting them to visit a cohort or attend graduation\n• Thank them specifically in the opening paragraph of any proposal\n`
        : `\nRELATIONSHIP STATUS: NEW FUNDER\n• Consider requesting an introductory meeting before formal submission\n• Research personal connections — do any board members or mentors have links?\n• Start with a shorter concept note rather than full proposal\n`;
      const pt = detectType(g);
      const isFET = pt === PTYPES[4]; const isCorp = pt === PTYPES[5]; const isShort = pt === PTYPES[7];
      sA("intel", `FUNDER INTELLIGENCE: ${g.funder}\n\nNote: Verify details directly with the funder — this is a starting framework.\n${relSection}\nFUNDER PROFILE\n${g.funder} is a ${g.type.toLowerCase()} funder operating in South Africa. ${g.type === "Corporate CSI" ? "Corporate CSI programmes typically prioritise B-BBEE scorecard alignment, brand visibility, measurable social impact, and employee volunteering opportunities." : g.type === "Government/SETA" ? "Government/SETA funders prioritise skills development aligned with national priorities, NQF/SAQA standards, WSP/ATR compliance, and transformation targets." : g.type === "International" ? "International funders prioritise SDG alignment, evidence-based approaches, scalable models, strong M&E frameworks, and value for money." : g.type === "Foundation" ? "Foundations prioritise measurable impact, clear theory of change, programme sustainability beyond the grant, and evidence of outcomes." : "Tech company funders prioritise innovation, AI/digital skills integration, scalable delivery models, and technology-first approaches."}\n\nRECOMMENDED PROGRAMME TYPE\n• Current proposal: ${pt.label} (R${(pt.cost || g.ask)?.toLocaleString()}, ${pt.students || "varies"} ${isCorp ? "participants" : "learners"})\n• ${pt.desc}\n${isFET ? "• Consider: Could this funder also support a standard cohort (Type 1: R516K) as a feeder from the FET pipeline?" : isCorp ? "• Consider: Could this funder also sponsor a Type 1 partner-funded cohort (R516K) for their CSI portfolio?" : isShort ? "• Consider: Could this lead to a longer engagement — Type 1 cohort or even multi-cohort partnership?" : g.ask > 2000000 ? "• Consider: If the ask is too large, offer a single Type 1 cohort (R516K) or Type 3 with stipends (R1.236M) as a first phase." : "• Consider: If the funder wants to go bigger, offer multi-cohort packages with org cost contribution."}\n\nWHAT TO LEAD WITH\n• The human story first — then the numbers. Our 92% completion rate matters because it means real young people finishing what they started.\n• 29% pre-graduation placement is a standout stat — most programmes can't match this.\n• The AI-native angle is genuinely differentiating. No other SA NPO embeds AI tools from day one.\n• ${isFET ? "The FET pipeline angle is unique — no other NPO offers a 3-year high school to work-readiness journey." : isCorp ? "For corporates, the Enneagram + DT combination creates self-aware leaders, not just skilled workers." : isShort ? "At R2,547/learner, this is the most cost-effective employability intervention available." : `Cost per ${pt.perStudent <= 30000 ? "student" : "employed graduate"} (R${pt.perStudent.toLocaleString()}) is exceptional value.`}\n${g.type === "Corporate CSI" ? "• Offer B-BBEE Skills Development and Socio-Economic Development points.\n• Propose co-branding opportunities, employee mentoring, or site visits." : g.type === "Government/SETA" ? "• Map to NQF levels and show SAQA alignment.\n• Reference the ICITP accreditation and ICDL certification." : "• Emphasise the sustainability model — growing from 12 to 60 to 100+ students.\n• Show the theory of change with measurable milestones."}\n\nPROPOSAL STRATEGY\n1. Research ${g.funder}'s most recent annual report or CSI report for current priorities\n2. Identify the correct contact person — don't send to generic inbox\n3. Check if there's a prescribed application form vs open proposal format\n4. Review their funding cycle and deadlines — timing matters\n5. Match ask to their typical grant size — ${g.ask > 3000000 ? "R" + (g.ask/1000000).toFixed(1) + "M is a large ask; consider phasing or starting with a pilot" : g.ask > 1000000 ? "R" + (g.ask/1000000).toFixed(1) + "M is a medium ask; good fit for established CSI/foundation programmes" : "R" + (g.ask/1000).toFixed(0) + "K is a manageable ask; good for first-time relationships"}\n6. d-lab 2026 organisational budget is R13.4M — this grant represents ${(g.ask / 13431000 * 100).toFixed(1)}% of annual budget`);
    } else { sA("intel", r); }
    sB("intel", false); addL(g.id, `Intel: ${g.funder}`);
  };
  const aiConf = async c => {
    sB("conf", true); sA("conf", null);
    const r = await api(`You find speaking opportunities for Alison Jacobson, Director of d-lab NPC — a South African NPO with 92% completion and 85% employment in AI-native youth training.

FOR EACH OPPORTUNITY:
NAME | DATE | LOCATION | TYPE | AUDIENCE | WHY d-lab FITS | SPEAKER APPLICATION URL

PRIORITISE: Events with open calls for speakers. Africa-focused first, then international. EdTech, AI in education, youth employment, social impact, NPO innovation.`,
      `Find speaking and conference opportunities in 2026: ${c || "AI education, EdTech Africa, impact investing SA, youth employment, social innovation"}. Search for open calls for speakers, panel submissions, and deadlines.`, true, 2000);
    if (r.startsWith("API") || r.startsWith("Connection") || r.startsWith("No response")) {
      const kw = (c || "").toLowerCase();
      const m = kw ? CONFS.filter(x => [x.n, x.r, x.l, x.type, ...(x.tags || [])].join(" ").toLowerCase().includes(kw) || kw.split(" ").some(w => w.length > 2 && [x.n, x.r, x.type].join(" ").toLowerCase().includes(w))) : CONFS;
      sA("conf", m.map(x => `${x.n}\nDate: ${x.d}  ·  Location: ${x.l}  ·  Type: ${x.type}\n${x.r}\nCost: ${x.cost || "TBC"}  ·  Deadline: ${x.deadline || "TBC"}\n${x.url ? `Website: ${x.url}` : "No website"}`).join("\n\n———\n\n") || "No matches. Try broader terms.");
    } else { sA("conf", r); }
    sB("conf", false);
  };
  const aiConfApply = async c => {
    setConfApp(p => ({ ...p, [c.n]: { text: null, busy: true } }));
    const prompt = `You are writing a conference speaker application / expression of interest for d-lab NPC.

ABOUT d-lab:
${CTX}
Key outcomes: 9-month digital skills programme, 90% completion rate, 85% employment rate, 60 students in South Africa. AI-native curriculum using design thinking, JTBD methodology, and AI tools.

CONFERENCE:
Name: ${c.n}
Date: ${c.d}
Location: ${c.l}
Type: ${c.type}
About: ${c.r}
Audience: ${c.audience || "Not specified"}

Write a compelling speaker application that includes:
1. A punchy proposed talk title (relevant to this specific conference's audience)
2. A 150-word abstract/session description
3. A speaker bio for Alison Jacobson, Founder & Director of d-lab NPC
4. 3 key takeaways for the audience
5. Why this talk fits THIS specific conference
6. A brief cover note / expression of interest (3-4 sentences, professional but warm)

Make it specific to the conference — not generic. Reference their audience, themes, and what makes d-lab's story relevant to their attendees.`;
    const result = await api("Conference speaker application writer. Write applications specific to each conference — never generic. Research the conference first.", prompt, true, 2500);
    if (result.startsWith("API") || result.startsWith("Connection") || result.startsWith("No response")) {
      const isSA = c.reg === "sa";
      const text = `SPEAKER APPLICATION — ${c.n.toUpperCase()}
${c.d} · ${c.l}

═══════════════════════════════════════

PROPOSED TALK TITLE
"From 65% Youth Unemployment to 85% Employment: How AI-Native Training is Rewriting the Skills Playbook in South Africa"

═══════════════════════════════════════

SESSION ABSTRACT (150 words)

South Africa's youth unemployment crisis demands radical solutions. d-lab NPC has built one: a 9-month digital skills programme that embeds AI tools — ChatGPT, Claude, Copilot, and more — into every module, from day one to graduation. The result? A 90% completion rate and 85% employment rate, in a sector where 55% completion is the norm.

This session unpacks how we moved beyond "teaching about AI" to making AI a daily working tool for young people who had never used a laptop. We'll share our pedagogy (design thinking meets Jobs-to-be-Done), our failures (the modules that bombed), and our data (what actually moves the employment needle). ${isSA ? `For ${c.type.toLowerCase()} professionals, this is a case study in what works — with numbers to prove it.` : `For an international audience, this is a model from the Global South that's outperforming programmes with 10x the budget.`}

Attendees will leave with a practical framework they can adapt for their own contexts.

═══════════════════════════════════════

SPEAKER BIO

Alison Jacobson is the Founder and Director of d-lab NPC, a South African non-profit that delivers AI-native digital skills training to unemployed youth. Under her leadership, d-lab has grown from a 12-student pilot to a complete training system — 7 programme types, in-house AI tools, a partner delivery model designed to scale into any community, corporate clients, and a 92% completion rate that is nearly double the sector average. 85% of alumni are employed within 3 months of graduation.

Alison brings deep expertise in AI governance, strategic consulting, and Jobs-to-be-Done methodology. She is also the founder of StrideShift, an AI Think Tank for Open-Ended Problems, where she works on AI governance solutions and strategic product development. Her approach combines rigorous methodology with practical application, designing programmes where AI is not a topic to be studied but a tool to be used every day.

Prior to founding d-lab, Alison worked in strategy consulting with a focus on emerging markets and digital transformation.

═══════════════════════════════════════

3 KEY TAKEAWAYS FOR THE AUDIENCE

1. AI as a pedagogical tool, not just a subject — How embedding AI into every module (not just an "AI module") transforms learner outcomes and mirrors real workplace expectations.

2. The metrics that matter — Why completion rate and employment rate are the only numbers that count, and how d-lab's model achieves both at scale in underserved communities.

3. A replicable framework — The specific curriculum design, learner selection, and employer-matching approach that other organisations can adapt for their own contexts${isSA ? " within the South African skills ecosystem" : " across emerging markets"}.

═══════════════════════════════════════

WHY THIS TALK FITS ${c.n.toUpperCase()}

${c.r}

d-lab's story is directly relevant to ${c.n} because:
• Our work sits at the intersection of ${(c.tags || []).join(", ").toLowerCase()} — the core themes of this event
• We bring real outcomes data, not aspirational projections — ${c.audience || "your"} attendees can interrogate our numbers
• ${isSA ? `As a South African organisation presenting at a ${c.l}-based event, we offer a local case study with national relevance` : `As a programme from the Global South, we offer a perspective that challenges assumptions about where innovation happens`}
• Our AI-native approach is ahead of the curve — most skills programmes are still debating whether to include AI; we've been doing it since day one

═══════════════════════════════════════

COVER NOTE / EXPRESSION OF INTEREST

Dear ${c.n} Programme Committee,

I am writing to express my interest in presenting at ${c.n} (${c.d}, ${c.l}). As Founder of d-lab NPC, I lead a programme that has achieved a 90% completion rate and 85% employment rate in AI-native digital skills training for South African youth — and I believe our story would resonate strongly with your audience of ${c.audience || ""} ${(c.tags || []).slice(0, 2).join(" and ").toLowerCase()} professionals.

${isSA ? "This is a South African solution to a South African crisis, built with global-standard methodology and measurable outcomes." : "This is a story from the Global South that demonstrates what's possible when emerging-market organisations lead on AI adoption rather than waiting for it to arrive."} I would welcome the opportunity to share our approach, our data, and our lessons learned with the ${c.n} community.

Warm regards,
Alison Jacobson
Founder & Director, d-lab NPC`;
      setConfApp(p => ({ ...p, [c.n]: { text, busy: false } }));
    } else {
      setConfApp(p => ({ ...p, [c.n]: { text: result, busy: false } }));
    }
  };
  const aiReport = async () => {
    sB("report", true); sA("report", null);
    const r = await api(`You write quarterly impact reports for d-lab NPC's funders. Audience: existing funders and board members who want to see progress, outcomes, and pipeline health.

VOICE: Confident, factual. Lead with outcomes, not activities. Show momentum.

STRUCTURE:
1. HEADLINE METRICS (4-5 key numbers — completion rate, employment, pipeline value, student count)
2. PROGRAMME UPDATE (what's active, what's new, 2-3 highlights)
3. FUNDING PIPELINE (won, active, key developments)
4. LOOKING AHEAD (next quarter milestones)
5. THANK YOU (brief, genuine)

One page max. Every sentence earns its place. Use the SYSTEM framing: 7 programme types, partner model, AI tools, diversified revenue.

${CTX_SLIM}`,
      `Q1 2026 quarterly report for d-lab's funders.
Pipeline: ${pipe.act.length} active grants (R${pipe.ask.toLocaleString()}), ${pipe.won.length} won (R${pipe.wonV.toLocaleString()}).
Active programmes: 3 standard cohorts (60 learners), FET (60 learners, 3 schools), CCBA corporate (63 participants), Sci-Bono employability (90 learners), Cyborg Habits scaling.
Outcomes: 92% completion, 85% employment, 29% pre-grad placement.
Milestones: FET MOU signed, Cyborg Habits in LMS, STEM contracts active.
Coming: LMS AI chatbot, doubling student numbers, corporate contracts.`, false, 2000);
    if (r.startsWith("API") || r.startsWith("Connection") || r.startsWith("No response")) {
      const today = new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
      sA("report", `d-lab NPC — QUARTERLY IMPACT REPORT\n${today}\n\n═══════════════════════════════════════\n\nDear Funders and Partners,\n\nPROGRAMME HIGHLIGHTS\nd-lab NPC continues to deliver strong outcomes across our diverse programme portfolio.\n\n• Active learners: 60+ delivered through partner model\n• Programme completion rate: 92% (vs. 55% sector average)\n• Employment rate: 85% within 6 months of graduation\n• AI tools integration: Every module, every day\n\nACTIVE PROGRAMMES\n• Standard 9-month cohorts: Inkcubeko, Penreach, Vexospark (partner-funded via local delivery partners), Sci-Bono (d-lab funded)\n• FET Work-Readiness: 3-year pipeline with Gauteng Dept of Education (60 learners, 3 schools)\n• Corporate Leadership: CCBA Future Leaders via The Field Institute (63 participants)\n• Sci-Bono Employability: 13-week intensive for 90 school-leavers\n• Cyborg Habits: Online behaviour-change platform scaling to new audiences\n\nFUNDING PIPELINE\n• Active pipeline: ${pipe.act.length} opportunities valued at R${pipe.ask.toLocaleString()}\n• Won this period: ${pipe.won.length} grants valued at R${pipe.wonV.toLocaleString()}\n• Win rate: ${pipe.act.length + pipe.won.length > 0 ? Math.round((pipe.won.length / (pipe.act.length + pipe.won.length)) * 100) : 0}%\n• 2026 organisational budget: R13.4M\n\nKEY ACHIEVEMENTS THIS QUARTER\n• Maintained 92%+ completion rate across all cohorts\n• Expanded AI curriculum to include Claude, ChatGPT, Copilot, and Midjourney\n• FET partnership MOU with Gauteng Dept of Education signed\n• Cyborg Habits platform integrated into LMS\n• CCBA corporate programme launched\n• STEM centre delivery model proven and contracted\n\n2026 MILESTONES\n4-month: FET MOU signed ✓, 100% facilitators trained, Cyborg Habits in LMS ✓\n8-month: STEM centre contracts active ✓, for-profit cohort contract, student numbers doubled\n12-month: LMS AI chatbot live, 95% pass rate, corporate collaborative contracts\n\nWe remain grateful for your continued support and partnership.\n\nAlison Jacobson\nFounder & Director, d-lab NPC\nNPO 2017/382673/08 | PBO 930077003`);
    } else { sA("report", r); }
    sB("report", false);
  };

  const aiFullApp = async g => {
    setGrantApp(p => ({ ...p, [g.id]: { text: null, busy: true } }));
    const docReady = (DOCS[g.type] || []).filter(d => g.docs?.[d] === "ready" || (DOC_MAP[d] && orgDocs[DOC_MAP[d]]?.status === "ready")).length;
    const docTotal = (DOCS[g.type] || []).length;
    const returning = isFunderReturning(g.funder);
    const fs = funderStrategy(g);
    const prompt = `You produce COMPLETE, SUBMISSION-READY grant applications for d-lab NPC. Every section must be fully written — no placeholders.

VOICE: Warm, specific, confident. Every paragraph should make the reader think "these people know what they're doing and they know what WE care about."

CRITICAL RULES:
- Use REAL d-lab numbers only. Never fabricate statistics.
- Detect the programme type (Type 1-7) from Notes. Use the CORRECT budget, student count, duration.
- Lead with the SYSTEM (7 programme types, partner model, AI tools, outcomes). Never with geographic expansion.
- Open with what THIS funder cares about, not generic unemployment stats.
- Budget must use actual d-lab budget lines from CTX, not percentages.

${CTX}

GRANT DETAILS:
Funder: ${g.funder}
Grant name: ${g.name}
Type: ${g.type}
Amount requested: R${g.ask?.toLocaleString() || "TBC"}
Deadline: ${g.deadline || "Rolling/TBC"}
Focus areas: ${(g.focus || []).join(", ") || "Not specified"}
Geography: ${(g.geo || []).join(", ") || "National"}
Relationship: ${returning ? "RETURNING FUNDER — they have previously funded d-lab. Acknowledge this warmly in the cover letter and throughout." : g.rel || "New"}
Notes: ${g.notes || "None"}
Document readiness: ${docReady}/${docTotal} compliance docs ready

FUNDER-SPECIFIC STRATEGY:
What ${g.funder} cares about: ${fs.lead}
Opening angle: ${fs.hook}
Key language: ${fs.lang}
Key sections for this funder: ${fs.sections.join(", ")}

CRITICAL: Detect the programme type from the Notes above (Type 1–7) and use the CORRECT budget, student count, duration, and programme description from the CTX. Do NOT default to the 9-month cohort if the notes indicate FET (Type 4), corporate (Type 5), short-format (Type 7), or multi-cohort packages.

Write a COMPLETE, SUBMISSION-READY grant application. Use this structure (tailored for ${g.funder}):
${fs.structure.map((s, i) => `${i + 1}. ${s.toUpperCase()}`).join("\n")}

IMPORTANT GUIDELINES:
- The COVER LETTER should lead with what ${g.funder} specifically cares about, not generic youth unemployment stats
- ${returning ? "Open by thanking them for previous support and referencing specific outcomes their funding enabled" : "Open with the angle that will resonate most with this specific funder"}
- The EXECUTIVE SUMMARY should frame d-lab's work in terms of ${g.funder}'s mission and priorities
- Use language that resonates with ${g.type} funders: ${fs.lang}
- Include d-lab's real numbers: 92% completion, 85% employment, 29% pre-grad placement, 100% internship
${g.type === "Government/SETA" ? "- Include NQF alignment, SAQA references, ICITP accreditation, WSP/ATR compliance language\n- Reference NSDP 2030 and sector skills plan priorities" : g.type === "Corporate CSI" ? "- Lead with B-BBEE value proposition (Skills Development + Socio-Economic Development scorecard)\n- Include brand alignment and co-branding opportunities\n- Mention employee volunteering and site visit options" : g.type === "International" ? "- Frame around SDG 4, 8, 10\n- Include theory of change, cost-effectiveness analysis\n- Address sustainability and exit strategy" : g.type === "Tech Company" ? "- Lead with AI-native angle and technology innovation\n- Reference in-house tools (LMS, Language Leveller, Assessornator)\n- Discuss scale pathway and tech platform" : "- Lead with measurable impact and evidence\n- Include theory of change with clear milestones\n- Address sustainability beyond the grant period"}
- Budget must use actual d-lab budget lines, not percentages
- When describing d-lab's growth story, ALWAYS lead with the SYSTEM (7 programme types, partner delivery model, in-house AI tools, diversified revenue, exceptional outcomes). NEVER lead with geographic expansion or province-counting. Geography follows from the system working, not the other way around.
- Do NOT write a generic proposal that could be sent to any funder — write THIS proposal for THIS funder

Be specific with d-lab's REAL numbers. Do not fabricate statistics.`;
    const result = await api("Grant application writer.", prompt, false, 4096);
    if (result.startsWith("API") || result.startsWith("Connection") || result.startsWith("No response")) {
      // Local fallback — generate full application using actual d-lab data
      const ask = g.ask?.toLocaleString() || "TBC";
      const geo = (g.geo || []).join(", ") || "South Africa";
      const focus = (g.focus || []).join(", ") || "digital skills, youth employment, AI literacy";
      const pt = detectType(g);
      const mc = multiCohortInfo(g);
      const cohortSize = mc ? mc.count * (PTYPES[mc.typeNum]?.students || 20) : (pt.students || 20);
      const costPer = `R${pt.perStudent.toLocaleString()}`;
      const isSETA = g.type === "Government/SETA";
      const isCSI = g.type === "Corporate CSI";
      const isIntl = g.type === "International";
      const isFET = pt === PTYPES[4];
      const isCorp = pt === PTYPES[5];
      const isShort = pt === PTYPES[7];
      const returning = isFunderReturning(g.funder);
      const ffs = funderStrategy(g);

      const text = `═══════════════════════════════════════════════
COVER LETTER
═══════════════════════════════════════════════

${new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}

${g.funder}
[Funder Address]

Dear ${g.funder} Team,

RE: FUNDING APPLICATION — d-lab NPC (R${ask})

${returning ? `We are grateful for ${g.funder}'s previous support of d-lab. Your investment helped us build something remarkable — a complete training system serving 60 young people with a 92% completion rate and 85% of our alumni in work, study, or enterprise within three months of graduating.\n\nWe are writing today because we believe there is an exciting opportunity to deepen that impact together.` : ffs.hook}

We are requesting R${ask} to ${mc ? `deliver ${mc.count} cohorts serving ${cohortSize} learners nationally` : isFET ? `fund a 3-year FET work-readiness programme for ${cohortSize} high school learners` : isCorp ? `deliver a corporate leadership programme for ${cohortSize} graduate participants` : isShort ? `deliver a focused employability skills programme for ${cohortSize} school-leavers` : g.ask > 3000000 ? "scale our training system" : g.ask > 1000000 ? "deepen our programme delivery" : `deliver a focused cohort of ${cohortSize} learners`} in ${geo}. ${isCSI ? `This investment directly contributes to B-BBEE Skills Development and Socio-Economic Development scorecard elements.` : isSETA ? `This programme is ICITP-accredited, NQF-aligned, and directly advances NSDP 2030 priorities.` : isIntl ? `This advances SDG 4 (Quality Education), SDG 8 (Decent Work), and SDG 10 (Reduced Inequalities).` : `At ${costPer} per ${isCorp ? "participant" : "student"}, this is one of the most cost-effective ${isFET ? "school-to-work pipeline" : isShort ? "employability" : "youth employment"} interventions in South Africa.`}

We would love the opportunity to discuss this further — and to invite you to meet our students.

Warm regards,

Alison Jacobson
Founder & Director, d-lab NPC
alison.jacobson@d-lab.co.za


═══════════════════════════════════════════════
1. EXECUTIVE SUMMARY
═══════════════════════════════════════════════

${returning ? `BUILDING ON A PROVEN PARTNERSHIP\n${g.funder}'s previous investment in d-lab helped establish a model that now delivers some of the strongest youth employment outcomes in South Africa. This proposal seeks to deepen that partnership.` : `WHY THIS MATTERS TO ${g.funder.toUpperCase()}\n${ffs.hook}`}

${isSETA ? `THE SKILLS GAP\nSouth Africa's digital sector faces a critical shortage of work-ready graduates. With youth unemployment at 46.1% (ages 15-34) and 58.7% of unemployed youth having no work experience, the need for accredited, outcomes-driven skills programmes has never been greater.` : isCSI ? `THE OPPORTUNITY\nSouth Africa's 46.1% youth unemployment rate represents both a national crisis and a corporate responsibility. Every young person d-lab trains becomes a potential employee, customer, and contributor to the economy — while generating measurable B-BBEE scorecard value for corporate partners.` : isIntl ? `THE CHALLENGE AT SCALE\nAcross sub-Saharan Africa, youth unemployment and underemployment threaten economic stability and social cohesion. In South Africa alone, 46.1% of 15-34 year-olds are unemployed. d-lab's model — proven with 92% completion and 85% employment — offers a replicable approach to this continental challenge.` : `THE CHALLENGE\nIn Q1 2025, youth unemployment in South Africa reached 46.1% for ages 15–34. 58.7% of these unemployed youth have no previous work experience. The training programmes that do exist often feel disconnected from what employers actually need, and completion rates across the sector hover around 55%.`}

OUR SOLUTION
${isFET ? `d-lab NPC's FET Work-Readiness Programme is a 3-year, 425-hour journey for Grade 10–12 learners across 3 Schools of Specialisation, delivered in partnership with the Gauteng Department of Education. Through weekly coaching, Saturday sessions, and holiday Design Thinking sprints, learners build AI/Cyborg Skills, PowerSkills, Digital Tools, Storytelling, Entrepreneurship, and Self-Discovery.` : isCorp ? `d-lab NPC delivers a corporate leadership programme (via The Field Institute) for graduate hires, combining Design Thinking sprints, group coaching, Enneagram personality profiling, and structured reflection assessments. Participants work through phased facilitation, group coaching sessions, and reflection cycles — emerging with measurably stronger leadership capabilities.` : isShort ? `d-lab NPC's Foundational Employability Skills Programme is a 15-day intensive spread across 13 weeks for school-leavers. 7 AI coaching days build practical AI literacy and "Cyborg Habits". Design Thinking sprints teach creative problem-solving. The Cyborg Habits platform reinforces new skills between sessions.` : `d-lab NPC runs a 9-month, full-time programme for unemployed youth aged 18–25 that combines six months of intensive coursework with a three-month industry internship. What makes it different: AI is not a module — it is woven into everything. From day one, students use ChatGPT, Canva, and other AI tools as daily working tools. Our scaffolded five-phase learning journey (Induction → Launch → Orbit → Landing → Internship), aligned with Bloom's taxonomy, takes students from digital foundations through to complex real-world projects and workplace immersion.`}

${isFET || isCorp || isShort ? "" : `Every student has a personal mentor, access to our in-house Language Leveller and Assessornator, and is accredited through ICITP and ICDL.`}

TRACK RECORD (2025, verified)
• 92% programme completion rate (vs ~55% sector average)
• 85% of alumni employed, studying, or running ventures within 3 months
• 29% of students placed in work BEFORE graduating
• 100% internship placement for eligible students, every cohort since inception
• 60 learners delivered through partner model in Gauteng, Western Cape, and Mpumalanga

THE ASK
d-lab requests R${ask} to ${mc ? `deliver ${mc.count} cohorts serving ${cohortSize} learners` : isFET ? `fund a 3-year FET programme for ${cohortSize} learners across 3 schools` : isCorp ? `deliver a leadership programme for ${cohortSize} participants` : isShort ? `deliver a 13-week programme for ${cohortSize} school-leavers` : `train ${cohortSize} learners`} in ${geo}. This translates to ${costPer} per ${isCorp ? "participant" : "student"} for ${isFET ? "a 3-year accredited work-readiness pipeline" : isCorp ? "a 6-month leadership development journey" : isShort ? "a focused 13-week employability programme" : "an accredited, mentored, 9-month programme with guaranteed internship placement"}.


═══════════════════════════════════════════════
2. ORGANISATIONAL BACKGROUND
═══════════════════════════════════════════════

LEGAL STATUS
• Non-Profit Company (NPC) — The Field Lab NPC
• NPO Registration: 2017/382673/08
• Public Benefit Organisation (PBO): 930077003
• Section 18A Tax-Exempt — donations are tax-deductible
${isSETA ? "• ICITP Accreditation (SAQA registered)\n• NQF-aligned qualifications" : ""}

MISSION
d-lab equips young innovators with the skills, mindset, and digital fluency needed to thrive in the modern workplace.

OUR STORY
d-lab launched in 2022 with 12 students and a belief that AI-native, design-thinking training could transform employment outcomes for young South Africans. Four years later, we've built a complete system: 7 programme types (from R199K short courses to multi-million-rand national programmes), a partner delivery model designed to scale into any community, in-house AI tools that no other NPO has (LMS, Language Leveller, Assessornator, Cyborg Habits), and a diversified revenue base spanning grants, corporate clients (CCBA Future Leaders), and commercial products. We serve 60 students with a completion rate nearly double the sector average. In 2026 we are doubling student numbers, launching an FET high school pipeline with the Gauteng Department of Education and Sci-Bono Discovery Centre, growing our STEM centre delivery, and building our corporate and commercial revenue streams.

LEADERSHIP
• Alison Jacobson — Founder & Director. Education, Marketing & Media. Background in AI governance, strategic consulting, and organisational transformation.
• Barbara Dale-Jones — Director. Governance & Finance. Extensive experience in education leadership and institutional governance.
• David Kramer — Director. Fundraising & Sustainability.
Combined: 140+ years of education leadership experience.

GOVERNANCE
Board of 3 executive directors with active governance. Weekly risk monitoring, data-informed decision-making, quarterly OKR reporting. Recruiting non-executive directors in 2026 (finance, technology, education, social impact). Independent ICITP moderation verifies all student outcomes.

${isCSI ? `B-BBEE STATUS\nd-lab NPC qualifies as an Exempt Micro Enterprise (EME) with a Level 1 B-BBEE contribution. Funding d-lab contributes to Skills Development and Socio-Economic Development scorecard elements.\n` : ""}
FUNDERS & PARTNERS
d-lab has received funding and support from: Telkom Foundation, Get It Done Foundation, TK Foundation, Sage Foundation, SAP, C-Track, EOH, and The Field Institute.


═══════════════════════════════════════════════
3. PROGRAMME DESCRIPTION
═══════════════════════════════════════════════

${isFET ? `FET WORK-READINESS PROGRAMME (3 years, 425 hours)

d-lab's FET programme is a 3-year journey for Grade 10–12 learners at Schools of Specialisation, designed to build work-readiness before they leave school.

Year 1 — FOUNDATIONS (~170 hours)
AI/Cyborg Skills basics, PowerSkills introduction, Digital Tools orientation, Design Thinking mindset. Students begin using AI tools and build foundational digital fluency.

Year 2 — DEVELOPMENT (~170 hours)
Deeper Storytelling, Entrepreneurship, advanced Design Thinking sprints, Self-Discovery modules. Students tackle real-world project challenges and build portfolios.

Year 3 — TRANSITION (~85 hours)
Capstone projects, employer connections, CV development, interview preparation. Students emerge work-ready with 425 hours of practical experience.

DELIVERY MODEL
• Weekly coaching sessions at school
• Saturday intensive sessions
• Holiday Design Thinking sprints
• Subject specialist coaches (R6,000/day)
• Teacher support and training
• Snacks/meals for all sessions

CORE BLOCKS
AI/Cyborg Skills · PowerSkills · Digital Tools · Storytelling · Design Thinking · Entrepreneurship · Self-Discovery` : isCorp ? `CORPORATE LEADERSHIP PROGRAMME (6 months)

Delivered via The Field Institute, this programme transforms graduate hires into confident, self-aware professionals.

Phase 1 — DESIGN THINKING IMMERSION
Intensive DT sprints teaching creative problem-solving, empathy-driven design, and rapid prototyping. Participants apply DT to real business challenges.

Phase 2 — GROUP COACHING (8 sessions)
Facilitated group coaching building self-awareness, communication, and leadership skills. Each session builds on the last.

Phase 3 — REFLECTION & INTEGRATION (8 sessions)
Structured reflection assessments helping participants consolidate learning and build personal development frameworks.

ENNEAGRAM PROFILING
Each participant completes a full Enneagram profile (R4,300/person) — providing deep self-insight that anchors the entire leadership development journey.` : isShort ? `FOUNDATIONAL EMPLOYABILITY SKILLS (13 weeks, 15 days)

AI & CYBORG HABITS — 7 days (6 hours/day, 2 coaches)
Day 1: Introduction & Productive Mindsets
Day 2: Prompting & Iteration
Day 3: AI for Job-search & Communication
Day 4: Information Literacy & Verification
Day 5: Cyborg Habits — Time, Attention & Tools
Day 6: Automating Routine Tasks
Day 7: Ethics, Bias & Capstone

DESIGN THINKING — 8 days (4 hours/day)
Sprint 1: 1-day quick cycle (introduce DT mindset + tools)
Presentation Day 1: Team presentations with rubric scoring
Sprint 2: 5-day immersive sprint (problem discovery → prototype → testing)
Presentation Day 2: Formal presentations with coaching feedback

CYBORG HABITS PLATFORM (4–6 weeks)
Online behaviour-change challenge running alongside delivery. US$30/learner.

INTEGRATION: Teams use AI for research summaries, prototype copy, presentation slides.` : `FIVE-PHASE LEARNING JOURNEY (9 months, aligned with Bloom's taxonomy)

Phase 1 — INDUCTION
Orientation, baseline assessments, digital setup. Students are assessed and matched with mentors.

Phase 2 — LAUNCH
Foundational Design Thinking, AI literacy, digital skills, and Power Skills. Students begin using AI tools as daily working tools immediately.

Phase 3 — ORBIT
Deeper practical work. Real-world project-based learning with AI integration. Students build websites, apps, and solve complex tasks.

Phase 4 — LANDING
Final projects, portfolio completion, accreditation preparation. Interview prep, CV development, employer matching.

Phase 5 — INTERNSHIP (3 months)
Industry placement with host employers. Continued mentor support and coaching.`}

AI INTEGRATION
AI is not a separate topic — it is embedded in everything. From day one, ${isFET ? "learners" : isCorp ? "participants" : "students"} use ChatGPT, Canva, and other tools as daily working instruments for research, design, analysis, and communication.

${isFET || isCorp || isShort ? "" : `IN-HOUSE TECHNOLOGY
• Bespoke LMS — tracks all student data, stores portfolios, manages communications
• Language Leveller — adjusts English content to each learner's proficiency level
• Assessornator — automates assessment for consistent standards at scale

ACCREDITATION
• Institute of Chartered IT Professionals (ICITP) — SAQA registered
• ICDL (International Computer Driving Licence)

LEARNER SUPPORT
• Personal mentor from business/industry for every student
• Monthly one-on-one and group coaching sessions
• Daily attendance and progress tracking via LMS
• Stipends to remove financial barriers`}


═══════════════════════════════════════════════
4. IMPACT & OUTCOMES FRAMEWORK
═══════════════════════════════════════════════

2025 VERIFIED OUTCOMES
┌─────────────────────────────────────┬──────────┐
│ Metric                               │ Result   │
├─────────────────────────────────────┼──────────┤
│ Programme completion rate            │ 92%      │
│ Alumni employed/studying/enterprise  │ 85%      │
│ Pre-graduation placement             │ 29%      │
│ Internship placement (eligible)      │ 100%     │
│ Students served (2025)               │ 60       │
│ Provinces active                     │ 3        │
└─────────────────────────────────────┴──────────┘

TARGET OUTCOMES FOR THIS PROGRAMME
• ≥90% completion rate
• ≥85% in work/study/enterprise within 3 months of graduation
• 100% internship placement for eligible students
• All portfolios moderated and accredited by ICITP

M&E METHODOLOGY
• Baseline assessment at intake (digital skills, English proficiency, career aspirations)
• Continuous tracking via bespoke LMS (attendance, task completion, portfolio progress)
• Monthly mentor reports and facilitator feedback
• Quarterly OKR reporting (Objectives and Key Results)
• Post-programme alumni tracking (3-month, 6-month, 12-month)
• Independent verification: ICITP moderates all final portfolios and certifications
• Employer feedback surveys for internship hosts

THEORY OF CHANGE
If unemployed youth receive accredited Design Thinking, digital skills (including practical AI use), Power Skills coaching, and employer-linked internships within a supportive community ecosystem → then they will transition into employment, further study, or entrepreneurship at rates comparable to urban peers → because they gain market-relevant competencies, credible credentials, workplace exposure, and professional networks.


═══════════════════════════════════════════════
5. BUDGET
═══════════════════════════════════════════════

TOTAL REQUEST: R${ask}
${mc ? `PROGRAMME: ${mc.count} × ${(PTYPES[mc.typeNum]?.label || "cohort")}` : `PROGRAMME TYPE: ${pt.label}`}
LEARNERS: ${cohortSize}
COST PER ${isCorp ? "PARTICIPANT" : "STUDENT"}: ${costPer}
DURATION: ${pt.duration}

${mc ? `MULTI-COHORT BUDGET:
┌──────────────────────────────────┬────────────┐
│ Line Item                        │ Amount (R) │
├──────────────────────────────────┼────────────┤
│ ${mc.count} × ${PTYPES[mc.typeNum]?.label || "cohort"}  │            │
│   @ R${(PTYPES[mc.typeNum]?.cost || 516000).toLocaleString()} each        │ ${(mc.count * (PTYPES[mc.typeNum]?.cost || 516000)).toLocaleString().padStart(10)} │
${g.ask > mc.count * (PTYPES[mc.typeNum]?.cost || 516000) ? `├──────────────────────────────────┼────────────┤
│ Org cost contribution (30%)      │ ${(g.ask - mc.count * (PTYPES[mc.typeNum]?.cost || 516000)).toLocaleString().padStart(10)} │` : ""}
├──────────────────────────────────┼────────────┤
│ TOTAL                            │ ${g.ask.toLocaleString().padStart(10)} │
└──────────────────────────────────┴────────────┘` : `DETAILED BUDGET:
┌──────────────────────────────────┬────────────┐
│ Line Item                        │ Amount (R) │
├──────────────────────────────────┼────────────┤
${pt.table.map(r => `│ ${r[0].padEnd(33)}│ ${r[1].padStart(10)} │`).join("\n")}
└──────────────────────────────────┴────────────┘`}

${pt === PTYPES[3] ? `Note: Stipends are critical — our students come from severely impoverished backgrounds and struggle with transport, food, and workplace basics without financial support.` : pt === PTYPES[2] ? `Note: This is a full-ownership model where d-lab provides everything including laptops and stipends. Stipends are critical for retention — our students come from severely impoverished backgrounds.` : pt === PTYPES[4] ? `Note: Subject specialist coaches deliver at R6,000/day across 160 delivery days over 3 years. Snacks/meals are essential as sessions often run through mealtimes.` : pt === PTYPES[5] ? `Note: Enneagram profiling is the single largest cost but is the anchor of the programme — providing deep self-insight that frames the entire leadership development journey.` : pt === PTYPES[7] ? `Note: Sci-Bono provides venue and AV equipment. Coaching rates reflect specialist AI and Design Thinking expertise. Cyborg Habits platform is billed in USD.` : `Note: Laptops provided by delivery partner centre. Stipends are critical for retention.`}

VALUE FOR MONEY
At ${costPer} per ${isCorp ? "participant" : "student"} ${isFET ? "per year" : ""} with ${isFET ? "a school-to-work pipeline model" : isCorp ? "measurable leadership development outcomes" : isShort ? "practical employability skills in just 15 days" : "85% employment outcomes"}, d-lab delivers ${isFET ? "one of the most cost-effective school-to-work pipelines" : isShort ? "exceptional value at scale" : "one of the lowest cost-per-employed-graduate ratios"} in South African ${isCorp ? "corporate development" : "skills development"}. ${isCSI ? "Every rand invested generates measurable B-BBEE scorecard value." : isSETA ? "This compares favourably to SETA learnerships averaging R45,000–R65,000 per learner with lower completion rates." : ""}


═══════════════════════════════════════════════
6. SUSTAINABILITY
═══════════════════════════════════════════════

d-lab's sustainability model is built on diversification and growing earned revenue:

• Multi-funder pipeline — we actively diversify across corporate CSI, foundations, SETAs, and international funders to avoid single-funder dependency
• Fee-for-service contracts — The Field Institute partnership (CCBA Graduate Leadership programme) and EOH graduate onboarding generate earned revenue
• Curriculum licensing — our AI-native curriculum and tools (LMS, Language Leveller, Assessornator) can be licensed to other training providers
• Growing employer network — provides both placement pipeline and potential co-funding
• Alumni community — graduates mentor incoming cohorts, reducing facilitation costs
• Partner delivery model — d-lab's curriculum, AI tools, and assessment systems are centralized; local partners provide venue, stipends, and recruitment. This means the system scales into any community at marginal cost, without d-lab needing to build new infrastructure

2026 organisational budget: R13.4M total income (R10.98M donations + R2.49M non-donor income).


═══════════════════════════════════════════════
7. RISK MANAGEMENT
═══════════════════════════════════════════════

┌──────────────────────┬───────────┬────────────────────────────────────┐
│ Risk                 │ Likelihood│ Mitigation                         │
├──────────────────────┼───────────┼────────────────────────────────────┤
│ Learner dropout      │ Medium    │ Stipends, personal mentors, early  │
│                      │           │ intervention via LMS tracking,     │
│                      │           │ Language Leveller for ESL students  │
├──────────────────────┼───────────┼────────────────────────────────────┤
│ Low employment rate  │ Low       │ 100% internship record; employer   │
│                      │           │ partnerships secured before cohort │
│                      │           │ starts; 29% pre-grad placement     │
├──────────────────────┼───────────┼────────────────────────────────────┤
│ Technology failure   │ Low       │ Partner centre infrastructure,     │
│                      │           │ offline LMS capability,            │
│                      │           │ multiple connectivity options      │
├──────────────────────┼───────────┼────────────────────────────────────┤
│ Funding shortfall    │ Medium    │ Multi-funder pipeline, earned      │
│                      │           │ revenue from TFI/EOH contracts     │
├──────────────────────┼───────────┼────────────────────────────────────┤
│ Curriculum relevance │ Low       │ AI tools keep content current;     │
│                      │           │ quarterly employer advisory input  │
├──────────────────────┼───────────┼────────────────────────────────────┤
│ Quality at scale     │ Medium    │ Assessornator ensures consistent   │
│                      │           │ standards; ICITP independent       │
│                      │           │ verification of all outcomes       │
└──────────────────────┴───────────┴────────────────────────────────────┘

GOVERNANCE CONTROLS
• Board of 3 directors with fiduciary oversight and weekly risk monitoring
• Independent annual audit
• Anti-fraud and corruption policy
• POPIA-compliant data management
• Segregation of duties in financial management
• Quarterly financial and outcomes reporting to funders
• ICITP independent moderation of all certifications


═══════════════════════════════════════════════
8. APPENDICES CHECKLIST
═══════════════════════════════════════════════

□ NPO Registration Certificate (2017/382673/08)
□ PBO Certificate (930077003)
□ Section 18A Tax Exemption
□ CIPC Registration
□ B-BBEE Certificate / EME Affidavit
□ Tax Clearance Certificate (SARS)
□ FICA Compliance Pack
□ Audited Financial Statements (current + prior year)
□ Banking Confirmation Letter
□ Board Resolution authorising this application
□ Memorandum of Incorporation
□ Board Charter
□ Safeguarding Policy
□ Anti-Fraud & Corruption Policy
□ POPIA Data Privacy Policy
□ M&E Framework
□ Theory of Change
□ Signed Board Minutes
${isSETA ? "□ ICITP Accreditation Certificate\n□ Skills Development Plan" : ""}${isIntl ? "□ USD Budget Equivalent\n□ SDG Alignment Matrix" : ""}

Document vault status: ${docReady}/${docTotal} documents ready


═══════════════════════════════════════════════

Prepared by d-lab NPC (The Field Lab NPC)
${new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}

Alison Jacobson | Founder & Director
alison.jacobson@d-lab.co.za
NPO 2017/382673/08 | PBO 930077003`;

      setGrantApp(p => ({ ...p, [g.id]: { text, busy: false } }));
    } else {
      setGrantApp(p => ({ ...p, [g.id]: { text: result, busy: false } }));
    }
    addL(g.id, "Full application drafted by AI");
  };
  const aiURL = async url => { sB("url", true); sA("url", null); sA("url", await api(`Extract grant/funding opportunity details from a URL. Return ONLY valid JSON — no markdown, no backticks, no explanation.

SCHEMA: {"name":"[grant name]","funder":"[funding org]","type":"[Corporate CSI|Government/SETA|International|Foundation|Tech Company]","ask":[amount in ZAR integer, 0 if unknown],"deadline":"[YYYY-MM-DD or null]","focus":["tag1","tag2"],"notes":"[eligibility, requirements, key details for d-lab]","applyUrl":"[direct application URL]"}

RULES: "ask" = realistic midpoint if range given, convert USD at ~R18/$. "type" must be exactly one of the 5 options. "focus" = 2-5 tags from: Youth Employment, Digital Skills, AI/4IR, Education, Women, Rural Dev, STEM, Entrepreneurship. "applyUrl" = most direct application link found.`, `Fetch and extract grant information from: ${url}`, true, 800)); sB("url", false); };

  const sg = sel ? grants.find(g => g.id === sel) : null;
  const filt = useMemo(() => {
    let g = [...grants];
    if (sf !== "all") g = g.filter(x => x.stage === sf);
    if (q) { const s = q.toLowerCase(); g = g.filter(x => x.name.toLowerCase().includes(s) || x.funder.toLowerCase().includes(s) || TEAM.find(t => t.id === x.owner)?.name.toLowerCase().includes(s)); }
    return g;
  }, [grants, sf, q]);

  const inp = { padding: "8px 12px", background: C.white, border: `1px solid ${C.line}`, color: C.t1, fontSize: 13, fontWeight: 500, fontFamily: FONT, outline: "none", borderRadius: 6, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" };
  const nUrg = notifs.filter(n => n.ty === "urgent").length;

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: FONT, background: C.bg, color: C.t1, fontSize: 14, overflow: "hidden" }}>

      {/* ── SIDEBAR ── */}
      <div style={{ width: 230, background: C.sidebar, borderRight: "none", display: "flex", flexDirection: "column", flexShrink: 0, position: "sticky", top: 0, height: "100vh" }}>
        <div style={{ padding: "28px 24px 20px" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: -1, lineHeight: 1 }}>d-lab</div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase", color: C.accent, marginTop: 6 }}>Grant Engine</div>
        </div>

        {notifs.length > 0 && (
          <div style={{ margin: "0 14px 10px", padding: "10px 14px", background: nUrg ? C.red + "20" : C.amber + "20", borderRadius: 8, borderLeft: `3px solid ${nUrg ? C.red : C.amber}` }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: nUrg ? "#FEB2B2" : "#FBD38D" }}>{notifs.length} notification{notifs.length > 1 ? "s" : ""}</div>
          </div>
        )}

        <nav style={{ flex: 1, padding: "4px 10px" }}>
          {[{ id: "dashboard", l: "Dashboard" }, { id: "pipeline", l: "Pipeline" }, { id: "docs", l: "Documents" }, { id: "tools", l: "Insights" }].map(n => (
            <button key={n.id} onClick={() => { setView(n.id); setSel(null); setTab(null); }}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                width: "100%", padding: "10px 14px", border: "none", borderRadius: 6,
                background: view === n.id ? C.sidebarActive : "transparent",
                color: view === n.id ? C.sidebarTextActive : C.sidebarText,
                fontSize: 14, fontWeight: view === n.id ? 600 : 500,
                cursor: "pointer", textAlign: "left", fontFamily: FONT, marginBottom: 1,
                transition: "all 0.12s",
                borderLeft: view === n.id ? `3px solid ${C.accent}` : "3px solid transparent",
              }}>
              {n.l}
              {n.id === "dashboard" && (notifs.length + approvals.filter(a => a.status === "pending").length) > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: C.red, padding: "2px 7px", borderRadius: 20, minWidth: 16, textAlign: "center" }}>{notifs.length + approvals.filter(a => a.status === "pending").length}</span>
              )}
              {n.id === "docs" && ORG_DOCS.filter(d => (orgDocs[d.id]?.expiry && dL(orgDocs[d.id].expiry) < 0) || (d.cat === "Compliance" && (!orgDocs[d.id] || orgDocs[d.id].status === "missing"))).length > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: C.amber, padding: "2px 7px", borderRadius: 20, minWidth: 16, textAlign: "center" }}>{ORG_DOCS.filter(d => (orgDocs[d.id]?.expiry && dL(orgDocs[d.id].expiry) < 0) || (d.cat === "Compliance" && (!orgDocs[d.id] || orgDocs[d.id].status === "missing"))).length}</span>
              )}
            </button>
          ))}
        </nav>

        <div style={{ padding: "14px 18px", borderTop: `1px solid ${C.sidebarHover}` }}>
          <Label style={{ marginBottom: 10, color: C.sidebarText }}>Team</Label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {TEAM.filter(t => t.id !== "team").map(t => {
              const c = grants.filter(g => g.owner === t.id && !["won", "lost", "deferred"].includes(g.stage)).length;
              return (<div key={t.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Avatar id={t.id} size={22} /><span style={{ fontSize: 12, color: C.sidebarText }}>{c}</span>
              </div>);
            })}
          </div>
        </div>

        <div style={{ padding: "20px 24px", borderTop: `1px solid ${C.sidebarHover}` }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 2.5, textTransform: "uppercase", color: C.sidebarText, marginBottom: 8 }}>Pipeline</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.accent, fontFamily: MONO, letterSpacing: -0.8 }}>{fmt(pipe.ask)}</div>
          <div style={{ fontSize: 12, color: C.sidebarText, marginTop: 4, fontWeight: 500 }}>{pipe.act.length} active · {pipe.won.length} won</div>
        </div>
      </div>

      {/* ── MAIN ── */}
      <div style={{ flex: 1, overflow: "auto", padding: "32px 36px", maxWidth: 1100 }}>


        {/* ══ DASHBOARD ══ */}
        {view === "dashboard" && !sel && (<div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 28 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: C.dark, letterSpacing: -0.5 }}>Dashboard</h1>
              <div style={{ fontSize: 14, color: C.t3, marginTop: 6 }}>{new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn v="ghost" onClick={() => setModal("url")}>From URL</Btn>
              <Btn onClick={() => setModal("add")}>Add grant</Btn>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
            <Num label="Active pipeline" value={fmt(pipe.ask)} sub={`${pipe.act.length} opportunities`} color={C.green} sparkData={pipe.sparkPipeline} sparkColor={C.green} />
            <Num label="Won" value={fmt(pipe.wonV)} sub={`${pipe.won.length} grants`} color={C.green} sparkData={pipe.sparkWon} sparkColor={C.green} />
            <Num label="Due this month" value={grants.filter(g => { const d = dL(g.deadline); return d !== null && d >= 0 && d <= 30; }).length} sub={grants.filter(g => { const d = dL(g.deadline); return d !== null && d >= 0 && d <= 14; }).length > 0 ? `${grants.filter(g => { const d = dL(g.deadline); return d !== null && d >= 0 && d <= 14; }).length} within 2 weeks!` : "None urgent"} color={grants.filter(g => { const d = dL(g.deadline); return d !== null && d >= 0 && d <= 14; }).length > 0 ? C.red : C.amber} sparkData={pipe.sparkDeadlines} sparkColor={C.amber} />
            <Num label="Win rate" value={`${Math.round(pipe.wr * 100)}%`} />
            <Num label="Attention" value={notifs.length + approvals.filter(a => a.status === "pending").length} sub={nUrg ? `${nUrg} urgent` : "On track"} color={nUrg ? C.red : C.amber} />
          </div>

          {/* ── URGENCY BANNER ── */}
          {(() => {
            const urg = grants.filter(g => { const d = dL(g.deadline); return d !== null && d <= 14 && g.stage !== "won" && g.stage !== "lost"; });
            if (!urg.length) return null;
            return (<div style={{ background: C.redSoft, borderLeft: `4px solid ${C.red}`, borderRadius: 6, padding: "14px 18px", marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: C.red, marginBottom: 8 }}>🚨 {urg.length} grant{urg.length > 1 ? "s" : ""} due within 2 weeks</div>
              {urg.map(g => { const d = dL(g.deadline); return (
                <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", cursor: "pointer" }} onClick={() => { setSel(g.id); setTab(null); }}>
                  <span style={{ fontWeight: 600, color: C.dark, textDecoration: "underline", textDecorationColor: C.red + "40", textUnderlineOffset: 2 }}>{g.name}</span>
                  <span style={{ color: C.t3, fontSize: 12 }}>R{(g.ask||0).toLocaleString()}</span>
                  <span style={{ color: d < 0 ? C.red : C.amber, fontSize: 12, fontWeight: 600 }}>{d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? "Due today!" : `${d}d left`}</span>
                  {g.applyUrl && <a href={g.applyUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 11, color: C.blue, textDecoration: "none" }}>🔗 Apply</a>}
                </div>
              ); })}
            </div>);
          })()}

          {/* ── TODAY ── */}
          {(() => {
            const todayItems = briefItems.filter(i => i.pr === "urgent" || i.pr === "followup" || i.by === "Today");
            const weekItems = briefItems.filter(i => !todayItems.includes(i) && i.pr !== "ok");
            const okItems = briefItems.filter(i => i.pr === "ok");
            const ActionRow = ({ item, i: idx }) => {
              const prColor = { urgent: C.red, followup: C.amber, renewal: C.blue, action: C.t2, assign: C.purple, info: C.t3, ok: C.green };
              const prBg = { urgent: C.redSoft, followup: C.amberSoft, renewal: C.blueSoft, assign: C.purpleSoft, ok: C.greenSoft };
              const prLabel = { urgent: "Urgent", followup: "Follow-up", renewal: "Renewal", action: "Action", assign: "Assign", info: "Info", ok: "OK" };
              const g = item.gid ? grants.find(x => x.id === item.gid) : null;
              const stgLabel = g ? STAGES.find(s => s.id === g.stage)?.label : "";
              const nextStgLabel = g ? (() => { const ci = STAGE_ORDER.indexOf(g.stage); return ci >= 0 && ci < STAGE_ORDER.length - 1 ? STAGES[ci + 1]?.label : null; })() : null;
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 0, padding: "14px 20px", borderTop: idx > 0 ? `1px solid ${C.line}` : "none", transition: "background 0.1s" }}
                  onMouseOver={e => e.currentTarget.style.background = C.raised} onMouseOut={e => e.currentTarget.style.background = "transparent"}>
                  <span style={{ padding: "3px 9px", fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: prColor[item.pr] || C.t3, background: prBg[item.pr] || C.raised, borderRadius: 4, marginRight: 14, textTransform: "uppercase", flexShrink: 0, minWidth: 60, textAlign: "center" }}>{prLabel[item.pr]}</span>
                  <div style={{ flex: 1, minWidth: 0, cursor: item.gid ? "pointer" : "default" }} onClick={() => { if (item.gid) { setSel(item.gid); setTab(null); } }}>
                    {item.grant && <span style={{ fontWeight: 600, color: item.gid ? C.green : C.dark, marginRight: 4, textDecoration: item.gid ? "underline" : "none", textDecorationColor: C.green + "40", textUnderlineOffset: 2 }}>{item.grant}</span>}
                    {item.grant && <span style={{ color: C.t4, marginRight: 4 }}>–</span>}
                    <span style={{ color: C.t2 }}>{item.action}</span>
                  </div>
                  {g && (
                    <div style={{ display: "flex", gap: 4, marginLeft: 12, flexShrink: 0 }}>
                      {stgLabel && <span style={{ fontSize: 11, color: C.t4, padding: "3px 8px", background: C.raised, borderRadius: 4, marginRight: 4 }}>{stgLabel}</span>}
                      {nextStgLabel && (
                        <button onClick={e => { e.stopPropagation(); nextStage(g.id); }} title={`Move to ${nextStgLabel}`}
                          style={{ padding: "4px 10px", fontSize: 11, fontWeight: 600, border: `1px solid ${C.greenBorder}`, background: C.greenSoft, color: C.green, borderRadius: 6, cursor: "pointer", fontFamily: FONT }}>
                          {nextStgLabel} →
                        </button>
                      )}
                      <Avatar id={g.owner} size={22} />
                    </div>
                  )}
                </div>
              );
            };
            return (<>
              <div style={{ background: C.white, borderRadius: 8, marginBottom: 16, border: `1px solid ${C.line}`, overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: todayItems.length > 0 ? `1px solid ${C.line}` : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: todayItems.length > 0 ? C.red : C.green }} />
                    <span style={{ fontSize: 15, fontWeight: 700, color: C.dark }}>Today</span>
                    {todayItems.length > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: C.red, background: C.redSoft, padding: "2px 8px", borderRadius: 100 }}>{todayItems.length}</span>}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {briefRaw && <CopyBtn text={briefRaw} />}
                    <Btn v="muted" style={{ padding: "5px 12px", fontSize: 11 }} onClick={() => genBrief()} disabled={bBusy}>{bBusy ? "..." : "Refresh"}</Btn>
                  </div>
                </div>
                {todayItems.length > 0 ? todayItems.map((item, i) => <ActionRow key={i} item={item} i={i} />) : <div style={{ padding: "20px 20px", fontSize: 14, color: C.t3 }}>Nothing urgent today. You're on track.</div>}
              </div>
              {weekItems.length > 0 && (
                <div style={{ background: C.white, borderRadius: 8, marginBottom: 16, border: `1px solid ${C.line}`, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px", borderBottom: `1px solid ${C.line}` }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: C.amber }} />
                    <span style={{ fontSize: 15, fontWeight: 700, color: C.dark }}>This week</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.amber, background: C.amberSoft, padding: "2px 8px", borderRadius: 100 }}>{weekItems.length}</span>
                  </div>
                  {weekItems.map((item, i) => <ActionRow key={i} item={item} i={i} />)}
                </div>
              )}
              {okItems.length > 0 && todayItems.length === 0 && weekItems.length === 0 && (
                <div style={{ background: C.greenSoft, borderRadius: 8, padding: "20px 24px", marginBottom: 16, border: `1px solid ${C.greenBorder}` }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: C.green }}>{okItems[0].action}</div>
                </div>
              )}
            </>);
          })()}

          {/* ── PENDING APPROVALS ── */}
          {approvals.filter(a => a.status === "pending").length > 0 && (
            <div style={{ background: C.white, borderRadius: 8, marginBottom: 16, border: `1px solid ${C.amber}30`, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px", borderBottom: `1px solid ${C.line}` }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: C.purple }} />
                <span style={{ fontSize: 15, fontWeight: 700, color: C.dark }}>Pending approvals</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.purple, background: C.purpleSoft, padding: "2px 8px", borderRadius: 100 }}>{approvals.filter(a => a.status === "pending").length}</span>
              </div>
              {approvals.filter(a => a.status === "pending").map(appr => {
                const reviewers = TEAM.filter(t => t.role === appr.need);
                return (
                  <div key={appr.id} style={{ padding: "16px 20px", borderTop: `1px solid ${C.line}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <div>
                        <span style={{ fontWeight: 600, color: C.dark }}>{appr.grantName}</span>
                        <span style={{ color: C.t3, fontSize: 13, marginLeft: 10 }}>{STAGES.find(s=>s.id===appr.from)?.label} → {STAGES.find(s=>s.id===appr.to)?.label}</span>
                      </div>
                      <Btn v="primary" style={{ padding: "5px 14px", fontSize: 12 }} onClick={() => runAllAgentReviews(appr.id)} disabled={Object.values(agentBusy).some(Boolean)}>
                        {Object.values(agentBusy).some(Boolean) ? "Reviewing..." : "Run agent reviews"}
                      </Btn>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {reviewers.map(r => {
                        const rev = appr.reviews.find(rv => rv.by === r.id);
                        const isBusy = agentBusy[appr.id + r.id];
                        return (
                          <div key={r.id} style={{ flex: 1, minWidth: 160, background: rev ? (rev.decision === "approved" ? C.greenSoft : C.redSoft) : C.raised, borderRadius: 8, padding: 12, border: `1px solid ${rev ? (rev.decision === "approved" ? C.greenBorder : C.red + "25") : C.line}` }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                              <Avatar id={r.id} size={22} />
                              <span style={{ fontWeight: 600, fontSize: 12, color: C.dark }}>{r.name}</span>
                              <span style={{ fontSize: 10, color: C.t4 }}>{r.title}</span>
                            </div>
                            {isBusy && <div style={{ fontSize: 12, color: C.t3, fontStyle: "italic" }}>Reviewing...</div>}
                            {rev && (
                              <div>
                                <span style={{ padding: "2px 8px", fontSize: 10, fontWeight: 700, borderRadius: 100, color: rev.decision === "approved" ? C.green : C.red, background: rev.decision === "approved" ? C.green + "14" : C.red + "14", textTransform: "uppercase", borderRadius: 4 }}>{rev.decision === "approved" ? "Approved" : "Needs work"}</span>
                                <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.5, marginTop: 6, maxHeight: 80, overflow: "auto", whiteSpace: "pre-wrap" }}>{rev.note}</div>
                              </div>
                            )}
                            {!rev && !isBusy && <Btn v="muted" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => agentReview(appr.id, r.id)}>Review as {r.name}</Btn>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── TEAM WORKLOAD ── */}
          <div style={{ background: C.white, borderRadius: 8, padding: 20, marginBottom: 16, border: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)" }}>
            <Label>Team</Label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {TEAM.filter(t => t.id !== "team").map(t => {
                const active = grants.filter(g => g.owner === t.id && !["won", "lost", "deferred"].includes(g.stage));
                return (
                  <div key={t.id} onClick={() => { setView("pipeline"); setSel(null); setQ(t.name); setSf("all"); }}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: C.raised, borderRadius: 8, flex: "0 0 auto", cursor: "pointer", transition: "box-shadow 0.15s, border-color 0.15s", border: `1px solid transparent` }}
                    onMouseOver={e => { e.currentTarget.style.borderColor = C.green + "50"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; }}
                    onMouseOut={e => { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.boxShadow = "none"; }}>
                    <Avatar id={t.id} size={26} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: C.dark }}>{t.name}</div>
                      <div style={{ fontSize: 11, color: C.t4 }}>{t.title} · <span style={{ color: active.length > 0 ? C.green : C.t4, fontWeight: active.length > 0 ? 600 : 400 }}>{active.length} active</span></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── PIPELINE SNAPSHOT ── */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 2, minWidth: 280, background: C.white, padding: 22, borderRadius: 8, border: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)" }}>
              <Label>By stage</Label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {pipe.stages.filter(s => s.n > 0).map(s => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
                    onClick={() => { setView("pipeline"); setSel(null); setSf(s.id); setQ(""); }}>
                    <span style={{ fontSize: 12, color: C.t2, width: 72, textAlign: "right", flexShrink: 0 }}>{s.label}</span>
                    <div style={{ flex: 1, height: 20, background: C.raised, borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ width: `${Math.max(8, (s.n / Math.max(1, ...pipe.stages.map(x => x.n))) * 100)}%`, height: "100%", background: s.c, borderRadius: 4, transition: "width 0.3s" }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: s.c, fontFamily: MONO, width: 20 }}>{s.n}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 200, background: C.white, padding: 22, borderRadius: 8, border: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)" }}>
              <Label>By type</Label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {pipe.types.map((t, i) => {
                  const colors = [C.green, C.purple, C.blue, C.amber, "#D4577A"];
                  return (
                    <div key={t.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: colors[i % 5], flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: C.t2, flex: 1 }}>{t.name}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.t1, fontFamily: MONO }}>{t.n}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>)}

        {/* ══ PIPELINE ══ */}
        {view === "pipeline" && !sel && (<div>
          {/* ── STICKY FILTER BAR ── */}
          <div style={{ position: "sticky", top: -32, zIndex: 10, background: C.bg, paddingTop: 32, paddingBottom: 12, marginTop: -32, marginLeft: -36, marginRight: -36, paddingLeft: 36, paddingRight: 36 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: C.dark, letterSpacing: -0.5 }}>Pipeline</h1>
                <div style={{ display: "inline-flex", background: C.raised, borderRadius: 8, padding: 2 }}>
                  {[{ id: "kanban", l: "Board" }, { id: "list", l: "List" }].map(v => (
                    <button key={v.id} onClick={() => setPView(v.id)} style={{
                      padding: "5px 14px", fontSize: 12, fontWeight: 600, border: "none", borderRadius: 6, cursor: "pointer", fontFamily: FONT,
                      background: pView === v.id ? C.white : "transparent", color: pView === v.id ? C.dark : C.t4,
                      boxShadow: pView === v.id ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                    }}>{v.l}</button>
                  ))}
                </div>
                {/* Funder grouping toggle (kanban only) */}
                {pView === "kanban" && (
                  <div style={{ display: "inline-flex", background: C.raised, borderRadius: 8, padding: 2 }}>
                    {[{ id: "stage", l: "By Stage" }, { id: "funder", l: "By Funder" }].map(v => (
                      <button key={v.id} onClick={() => setPGroup(v.id)} style={{
                        padding: "5px 14px", fontSize: 12, fontWeight: 600, border: "none", borderRadius: 6, cursor: "pointer", fontFamily: FONT,
                        background: pGroup === v.id ? C.white : "transparent", color: pGroup === v.id ? C.dark : C.t4,
                        boxShadow: pGroup === v.id ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                      }}>{v.l}</button>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search..." style={{ ...inp, width: 180 }} />
                <select value={sf} onChange={e => setSf(e.target.value)} style={{ ...inp, cursor: "pointer" }}>
                  <option value="all">All stages</option>{STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
                {pView === "kanban" && <select value={pSort} onChange={e => setPSort(e.target.value)} style={{ ...inp, cursor: "pointer" }}>
                  <option value="default">Sort: Default</option>
                  <option value="deadline">Sort: Deadline</option>
                  <option value="ask">Sort: Amount</option>
                  <option value="fit">Sort: Fit score</option>
                </select>}
                <Btn v="ghost" onClick={() => setModal("url")}>URL</Btn>
                <Btn v="ghost" onClick={aiScout} disabled={busy.scout}>{busy.scout ? "Scouting..." : "Scout"}</Btn>
                <Btn onClick={() => setModal("add")}>Add</Btn>
              </div>
            </div>
          </div>

          {/* ── CALENDAR STRIP ── */}
          <CalendarStrip grants={grants} onClickGrant={id => setSel(id)} C={C} />

          {/* ── SCOUT RESULTS ── */}
          {scoutResults.length > 0 && (
            <div style={{ background: C.white, borderRadius: 10, padding: "18px 22px", marginBottom: 16, border: `1px solid ${C.purple}20`, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>Scouted opportunities</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.purple, background: C.purpleSoft, padding: "2px 10px", borderRadius: 100 }}>{scoutResults.length} found</span>
                  {scoutResults.filter(s => s.added).length > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: C.green, background: C.greenSoft, padding: "2px 10px", borderRadius: 100 }}>{scoutResults.filter(s => s.added).length} added</span>}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn v="ghost" style={{ fontSize: 12, padding: "5px 12px" }} onClick={aiScout} disabled={busy.scout}>{busy.scout ? "Searching..." : "Search again"}</Btn>
                  <button onClick={() => setScoutResults([])} style={{ fontSize: 12, color: C.t4, background: "none", border: "none", cursor: "pointer", fontFamily: FONT }}>Dismiss</button>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {scoutResults.map((s, i) => {
                  const fitC = s.fit === "High" ? C.green : s.fit === "Medium" ? C.amber : C.t4;
                  const alreadyIn = s.inPipeline || s.added;
                  return (
                    <div key={i} style={{ padding: "12px 14px", background: s.added ? `${C.green}08` : C.bg, borderRadius: 8, border: `1px solid ${s.added ? C.green + "30" : C.line}`, opacity: s.inPipeline && !s.added ? 0.45 : 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
                            <span style={{ fontWeight: 600, fontSize: 13, color: C.dark }}>{s.name}</span>
                            <span style={{ fontSize: 10, fontWeight: 600, color: fitC, background: fitC + "15", padding: "1px 7px", borderRadius: 100 }}>{s.fit}</span>
                            {s.added && <span style={{ fontSize: 10, fontWeight: 600, color: C.green }}>✓</span>}
                          </div>
                          <div style={{ fontSize: 12, color: C.t3 }}>
                            {s.funder}{s.ask ? ` · R${Number(s.ask).toLocaleString()}` : ""}{s.deadline ? ` · ${new Date(s.deadline).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}` : ""}
                          </div>
                          <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.4, marginTop: 3 }}>{s.reason}</div>
                        </div>
                        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                          {s.url && <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: C.purple, textDecoration: "none", padding: "4px 8px", border: `1px solid ${C.purple}25`, borderRadius: 5, fontFamily: FONT, fontWeight: 500 }}>↗</a>}
                          {!alreadyIn && <button onClick={() => addScoutToPipeline(s)} style={{ fontSize: 11, color: C.green, padding: "4px 8px", border: `1px solid ${C.green}30`, borderRadius: 5, background: "none", cursor: "pointer", fontFamily: FONT, fontWeight: 600 }}>+ Add</button>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── LIST VIEW ── */}
          {pView === "list" && (() => {
            const toggleSort = col => setListSort(p => ({ col, dir: p.col === col && p.dir === "asc" ? "desc" : "asc" }));
            const arrow = col => listSort.col === col ? (listSort.dir === "asc" ? " ↑" : " ↓") : "";
            const sorted = [...filt].sort((a, b) => {
              const m = listSort.dir === "asc" ? 1 : -1;
              if (listSort.col === "name") return m * a.name.localeCompare(b.name);
              if (listSort.col === "funder") return m * a.funder.localeCompare(b.funder);
              if (listSort.col === "ask") return m * ((a.ask || 0) - (b.ask || 0));
              if (listSort.col === "stage") return m * (STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage));
              if (listSort.col === "fit") return m * (fit(a) - fit(b));
              if (listSort.col === "deadline") {
                const da = dL(a.deadline), db = dL(b.deadline);
                if (da === null && db === null) return 0; if (da === null) return 1; if (db === null) return -1;
                return m * (da - db);
              }
              return 0;
            });
            const totalAsk = sorted.reduce((s, g) => s + (g.ask || 0), 0);
            const thStyle = col => ({
              padding: "10px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase",
              color: listSort.col === col ? C.green : C.t4, cursor: "pointer", userSelect: "none",
              textAlign: "left", whiteSpace: "nowrap", borderBottom: `2px solid ${listSort.col === col ? C.green : C.line}`,
              background: C.white, position: "sticky", top: 0, zIndex: 2,
            });
            return (
              <div style={{ background: C.white, borderRadius: 8, border: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)", overflow: "hidden" }}>
                {/* Summary bar */}
                <div style={{ display: "flex", gap: 20, padding: "14px 20px", background: C.raised, borderBottom: `1px solid ${C.line}`, fontSize: 13 }}>
                  <span style={{ color: C.t2 }}><strong style={{ color: C.dark }}>{sorted.length}</strong> grants</span>
                  <span style={{ color: C.t2 }}>Total: <strong style={{ color: C.green }}>{fmtK(totalAsk)}</strong></span>
                  <span style={{ color: C.t2 }}>Avg fit: <strong style={{ color: C.dark }}>{sorted.length ? Math.round(sorted.reduce((s, g) => s + fit(g), 0) / sorted.length) : 0}%</strong></span>
                  {sorted.filter(g => { const d = dL(g.deadline); return d !== null && d <= 14; }).length > 0 && (
                    <span style={{ color: C.red, fontWeight: 600 }}>⚠ {sorted.filter(g => { const d = dL(g.deadline); return d !== null && d <= 14; }).length} due within 2 weeks{sorted.filter(g => dL(g.deadline) < 0).length > 0 ? ` (${sorted.filter(g => dL(g.deadline) < 0).length} overdue)` : ""}</span>
                  )}
                </div>

                <div style={{ maxHeight: "calc(100vh - 240px)", overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr>
                      <th onClick={() => toggleSort("name")} style={{ ...thStyle("name"), width: "22%" }}>Grant{arrow("name")}</th>
                      <th onClick={() => toggleSort("funder")} style={{ ...thStyle("funder"), width: "14%" }}>Funder{arrow("funder")}</th>
                      <th onClick={() => toggleSort("ask")} style={{ ...thStyle("ask"), width: "10%", textAlign: "right" }}>Amount{arrow("ask")}</th>
                      <th onClick={() => toggleSort("stage")} style={{ ...thStyle("stage"), width: "12%" }}>Stage{arrow("stage")}</th>
                      <th onClick={() => toggleSort("deadline")} style={{ ...thStyle("deadline"), width: "14%" }}>Deadline{arrow("deadline")}</th>
                      <th onClick={() => toggleSort("fit")} style={{ ...thStyle("fit"), width: "10%" }}>Fit{arrow("fit")}</th>
                      <th style={{ ...thStyle(null), width: "8%", cursor: "default" }}>Owner</th>
                      <th style={{ ...thStyle(null), width: "10%", cursor: "default" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((g, idx) => {
                      const d = dL(g.deadline); const f = fit(g); const stg = STAGES.find(s => s.id === g.stage);
                      const fuN = (g.fups || []).filter(x => !x.done && dL(x.date) <= 0).length;
                      const ci = STAGE_ORDER.indexOf(g.stage);
                      const nextStgLabel = ci >= 0 && ci < STAGE_ORDER.length - 1 ? STAGES[ci + 1]?.label : null;
                      return (
                        <tr key={g.id}
                          style={{ borderBottom: `1px solid ${C.line}`, transition: "background 0.1s", cursor: "pointer", background: (d !== null && d <= 14) ? C.redSoft : "transparent" }}
                          onMouseOver={e => e.currentTarget.style.background = (d !== null && d <= 14) ? "#FDDEDE" : C.bg}
                          onMouseOut={e => e.currentTarget.style.background = (d !== null && d <= 14) ? C.redSoft : "transparent"}
                          onClick={() => { setSel(g.id); setTab(null); }}>
                          <td style={{ padding: "12px 14px" }}>
                            <div style={{ fontWeight: 600, color: C.dark, marginBottom: 2, lineHeight: 1.3 }}>{g.name}</div>
                            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                              <TypeBadge type={g.type} />
                              {fuN > 0 && <span style={{ fontSize: 10, fontWeight: 600, color: C.amber, background: C.amberSoft, padding: "1px 6px", borderRadius: 4 }}>{fuN} follow-up{fuN > 1 ? "s" : ""}</span>}
                            </div>
                          </td>
                          <td style={{ padding: "12px 14px", color: C.t2, fontSize: 13 }}>
                            <div>{g.funder}</div>
                            {g.applyUrl && <a href={g.applyUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 10, color: C.blue, textDecoration: "none", fontWeight: 600 }}>🔗 Apply page</a>}
                          </td>
                          <td style={{ padding: "12px 14px", textAlign: "right" }}>
                            <span style={{ fontWeight: 700, fontSize: 15, color: C.green, fontFamily: MONO }}>{fmtK(g.ask)}</span>
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            <span style={{ display: "inline-block", padding: "3px 10px", fontSize: 11, fontWeight: 700, letterSpacing: 0.3, color: stg?.c || C.t3, background: (stg?.c || C.t3) + "18", borderRadius: 4, whiteSpace: "nowrap" }}>{stg?.label}</span>
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            <DeadlineBadge d={d} deadline={g.deadline} size="md" />
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <div style={{ flex: 1, height: 4, background: C.raised, borderRadius: 2, maxWidth: 60 }}>
                                <div style={{ width: `${f}%`, height: 4, borderRadius: 2, background: f > 70 ? C.green : f > 40 ? C.amber : C.red }} />
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 600, color: f > 70 ? C.green : f > 40 ? C.amber : C.red, fontFamily: MONO }}>{f}%</span>
                            </div>
                          </td>
                          <td style={{ padding: "12px 14px" }}><Avatar id={g.owner} size={24} /></td>
                          <td style={{ padding: "12px 14px" }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: "flex", gap: 4 }}>
                              {nextStgLabel && (
                                <button onClick={() => nextStage(g.id)} title={`Move to ${nextStgLabel}`}
                                  style={{ padding: "4px 8px", fontSize: 10, fontWeight: 600, border: `1px solid ${C.greenBorder}`, background: C.greenSoft, color: C.green, borderRadius: 5, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap" }}>
                                  {nextStgLabel} →
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {sorted.length === 0 && (
                  <div style={{ padding: "40px 20px", textAlign: "center", color: C.t4, fontSize: 14 }}>
                    No grants match your filters. <button onClick={() => { setQ(""); setSf("all"); }} style={{ color: C.green, border: "none", background: "none", cursor: "pointer", fontWeight: 600, fontFamily: FONT }}>Clear filters</button>
                  </div>
                )}
                </div>

                {/* Footer totals */}
                {sorted.length > 0 && (
                  <div style={{ display: "flex", padding: "12px 20px", borderTop: `2px solid ${C.line}`, background: C.raised, fontSize: 12, fontWeight: 600, color: C.t2 }}>
                    <span style={{ width: "22%", padding: "0 14px" }}>{sorted.length} grant{sorted.length !== 1 ? "s" : ""}</span>
                    <span style={{ width: "14%", padding: "0 14px" }}>{[...new Set(sorted.map(g => g.funder))].length} funder{[...new Set(sorted.map(g => g.funder))].length !== 1 ? "s" : ""}</span>
                    <span style={{ width: "10%", padding: "0 14px", textAlign: "right", color: C.green, fontFamily: MONO, fontSize: 14, fontWeight: 700 }}>{fmtK(totalAsk)}</span>
                    <span style={{ width: "12%", padding: "0 14px" }}></span>
                    <span style={{ width: "14%", padding: "0 14px" }}></span>
                    <span style={{ width: "10%", padding: "0 14px", color: C.dark, fontFamily: MONO }}>{sorted.length ? Math.round(sorted.reduce((s, g) => s + fit(g), 0) / sorted.length) : 0}% avg</span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── KANBAN VIEW ── */}
          {pView === "kanban" && pGroup === "stage" && <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 16 }}>
            {STAGES.filter(s => !["won", "lost", "deferred"].includes(s.id) || grants.some(g => g.stage === s.id)).map(stg => {
              const items = filt.filter(g => g.stage === stg.id).sort((a, b) => {
                if (pSort === "deadline") { const da = dL(a.deadline), db = dL(b.deadline); if (da === null && db === null) return 0; if (da === null) return 1; if (db === null) return -1; return da - db; }
                if (pSort === "ask") return (b.ask || 0) - (a.ask || 0);
                if (pSort === "fit") return fit(b) - fit(a);
                return 0;
              });
              return (<div key={stg.id} style={{ minWidth: 250, maxWidth: 280, flex: "0 0 auto" }}
                onDragOver={e => { e.preventDefault(); e.currentTarget.style.background = stg.c + "1A"; e.currentTarget.style.borderRadius = "12px"; }}
                onDragLeave={e => { e.currentTarget.style.background = "transparent"; }}
                onDrop={e => { e.preventDefault(); e.currentTarget.style.background = "transparent"; if (dragId) { moveStage(dragId, stg.id); setDragId(null); } }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, padding: "8px 14px", borderRadius: 6, background: stg.c + "1A", borderLeft: `3px solid ${stg.c}` }}>
                  <span style={{ fontWeight: 600, fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase", color: stg.c }}>{stg.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: stg.c, fontFamily: MONO }}>{items.length}</span>
                </div>
                {items.map(g => {
                  const d = dL(g.deadline); const f = fit(g); const fuN = (g.fups || []).filter(x => !x.done && dL(x.date) <= 0).length;
                  const ci = STAGE_ORDER.indexOf(g.stage);
                  const nextStgLabel = ci >= 0 && ci < STAGE_ORDER.length - 1 ? STAGES[ci + 1]?.label : null;
                  const showNote = quickNote[g.id];
                  return (<div key={g.id}
                    draggable
                    onDragStart={e => { setDragId(g.id); e.dataTransfer.effectAllowed = "move"; }}
                    onDragEnd={() => setDragId(null)}
                    style={{
                      background: (d !== null && d <= 14) ? C.redSoft : C.white, padding: 14, borderRadius: 8, cursor: "grab", marginBottom: 8,
                      border: `1px solid ${dragId === g.id ? C.green : ((d !== null && d <= 14) ? C.red + "40" : C.line)}`,
                      borderLeft: (d !== null && d <= 14) ? `3px solid ${C.red}` : undefined,
                      opacity: dragId === g.id ? 0.5 : 1,
                      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                      transition: "border-color 0.12s, opacity 0.15s, box-shadow 0.15s",
                    }}
                    onMouseOver={e => { if (!dragId) { e.currentTarget.style.borderColor = C.green; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)"; } }}
                    onMouseOut={e => { if (!dragId) { e.currentTarget.style.borderColor = (d !== null && d <= 14) ? C.red + "40" : C.line; e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06)"; } }}>
                    <div onClick={() => { setSel(g.id); setTab(null); }} style={{ cursor: "pointer" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: C.dark, lineHeight: 1.3, flex: 1 }}>{g.name}</div>
                        <Avatar id={g.owner} size={20} />
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 13, color: C.t3 }}>{g.funder}</span>
                        <TypeBadge type={g.type} />
                      </div>
                      {g.applyUrl && <a href={g.applyUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 10, color: C.blue, textDecoration: "none", fontWeight: 600, display: "inline-block", marginBottom: 6 }}>🔗 {g.applyUrl.replace(/https?:\/\/(www\.)?/, "").split("/")[0]}</a>}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 18, color: C.green, fontFamily: MONO, letterSpacing: -0.5 }}>{fmtK(g.ask)}</span>
                        <span style={{ marginLeft: "auto" }}><DeadlineBadge d={d} deadline={g.deadline} /></span>
                      </div>
                      {fuN > 0 && <div style={{ fontSize: 12, fontWeight: 600, color: C.amber, marginBottom: 6 }}>{fuN} follow-up{fuN > 1 ? "s" : ""} due</div>}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 0 }}>
                        <div style={{ flex: 1, height: 3, background: C.raised, borderRadius: 2 }}><div style={{ width: `${f}%`, height: 3, borderRadius: 2, background: f > 70 ? C.green : f > 40 ? C.amber : C.red }} /></div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: f > 70 ? C.green : f > 40 ? C.amber : C.red, fontFamily: MONO }}>{f}%</span>
                      </div>
                    </div>

                    {/* Quick actions bar */}
                    <div style={{ display: "flex", gap: 4, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.line}` }}>
                      {nextStgLabel && (
                        <button onClick={e => { e.stopPropagation(); nextStage(g.id); }}
                          title={`Move to ${nextStgLabel}`}
                          style={{ flex: 1, padding: "5px 0", fontSize: 11, fontWeight: 700, border: "none", background: C.dark, color: "#fff", borderRadius: 4, cursor: "pointer", fontFamily: FONT }}>
                          {nextStgLabel} →
                        </button>
                      )}
                      <button onClick={e => { e.stopPropagation(); setQuickNote(p => ({ ...p, [g.id]: !p[g.id] })); }}
                        title="Add note"
                        style={{ padding: "5px 8px", fontSize: 11, border: `1px solid ${C.line}`, background: C.white, color: C.t3, borderRadius: 6, cursor: "pointer", fontFamily: FONT }}>
                        Note
                      </button>
                      <select
                        value={g.owner}
                        onClick={e => e.stopPropagation()}
                        onChange={e => { e.stopPropagation(); up(g.id, { owner: e.target.value }); }}
                        style={{ padding: "5px 4px", fontSize: 11, border: `1px solid ${C.line}`, background: C.white, color: C.t2, borderRadius: 6, cursor: "pointer", fontFamily: FONT, maxWidth: 70 }}>
                        {TEAM.map(t => <option key={t.id} value={t.id}>{t.ini}</option>)}
                      </select>
                    </div>
                    {/* Inline note input */}
                    {showNote && (
                      <div style={{ marginTop: 8, display: "flex", gap: 4 }}>
                        <input
                          id={`qn-${g.id}`}
                          placeholder="Quick note..."
                          onKeyDown={e => { if (e.key === "Enter" && e.target.value.trim()) { addL(g.id, e.target.value.trim()); setQuickNote(p => ({ ...p, [g.id]: false })); } if (e.key === "Escape") setQuickNote(p => ({ ...p, [g.id]: false })); }}
                          onClick={e => e.stopPropagation()}
                          autoFocus
                          style={{ ...inp, flex: 1, padding: "6px 10px", fontSize: 12 }} />
                        <button onClick={e => { e.stopPropagation(); const el = document.getElementById(`qn-${g.id}`); if (el?.value.trim()) { addL(g.id, el.value.trim()); } setQuickNote(p => ({ ...p, [g.id]: false })); }}
                          style={{ padding: "6px 10px", fontSize: 11, fontWeight: 600, border: `1px solid ${C.greenBorder}`, background: C.greenSoft, color: C.green, borderRadius: 6, cursor: "pointer", fontFamily: FONT }}>
                          Save
                        </button>
                      </div>
                    )}
                  </div>);
                })}
              </div>);
            })}
          </div>}

          {/* ── FUNDER-GROUPED KANBAN ── */}
          {pView === "kanban" && pGroup === "funder" && (() => {
            const funderNames = [...new Set(filt.map(g => g.funder))].sort();
            const funderColors = ["#1A8754", "#6B47B8", "#3574D4", "#C67B1A", "#D4577A", "#7C5CBF", "#D97706", "#2563EB", "#059669", "#8B5CF6"];
            return <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 16 }}>
              {funderNames.map((fname, fi) => {
                const items = filt.filter(g => g.funder === fname).sort((a, b) => {
                  if (pSort === "deadline") { const da = dL(a.deadline), db = dL(b.deadline); if (da === null && db === null) return 0; if (da === null) return 1; if (db === null) return -1; return da - db; }
                  if (pSort === "ask") return (b.ask || 0) - (a.ask || 0);
                  if (pSort === "fit") return fit(b) - fit(a);
                  return 0;
                });
                const fc = funderColors[fi % funderColors.length];
                const totalAsk = items.reduce((s, g) => s + (g.ask || 0), 0);
                const returning = isFunderReturning(fname);
                return (<div key={fname} style={{ minWidth: 250, maxWidth: 280, flex: "0 0 auto" }}>
                  <div style={{ marginBottom: 10, padding: "8px 14px", borderRadius: 6, background: fc + "1A", borderLeft: `3px solid ${fc}` }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontWeight: 600, fontSize: 12, letterSpacing: 0.3, color: fc, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fname}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: fc, fontFamily: MONO }}>{items.length}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: fc, fontFamily: MONO }}>{fmtK(totalAsk)}</span>
                      {returning && <span style={{ fontSize: 9, fontWeight: 700, background: C.greenSoft, color: C.green, padding: "1px 6px", borderRadius: 3 }}>Returning</span>}
                    </div>
                  </div>
                  {items.map(g => {
                    const d = dL(g.deadline); const f = fit(g);
                    const stg = STAGES.find(s => s.id === g.stage);
                    return (<div key={g.id}
                      draggable
                      onDragStart={e => { setDragId(g.id); e.dataTransfer.effectAllowed = "move"; }}
                      onDragEnd={() => setDragId(null)}
                      style={{
                        background: (d !== null && d <= 14) ? C.redSoft : C.white, padding: 14, borderRadius: 8, cursor: "pointer", marginBottom: 8,
                        border: `1.5px solid ${(d !== null && d <= 14) ? C.red + "60" : C.line}`,
                        borderLeft: (d !== null && d <= 14) ? `4px solid ${C.red}` : `4px solid ${stg?.c || C.line}`,
                      }}
                      onClick={() => { setSel(g.id); setTab(null); }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: C.dark, lineHeight: 1.3, marginBottom: 4 }}>{g.name}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: stg?.c, background: stg?.c + "18", padding: "1px 8px", borderRadius: 4 }}>{stg?.label}</span>
                        <TypeBadge type={g.type} />
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontWeight: 700, fontSize: 16, color: C.green, fontFamily: MONO }}>{fmtK(g.ask)}</span>
                        <DeadlineBadge d={d} deadline={g.deadline} />
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                        <div style={{ flex: 1, height: 3, background: C.raised, borderRadius: 2 }}><div style={{ width: `${f}%`, height: 3, borderRadius: 2, background: f > 70 ? C.green : f > 40 ? C.amber : C.red }} /></div>
                        <span style={{ fontSize: 10, fontWeight: 600, color: f > 70 ? C.green : f > 40 ? C.amber : C.red, fontFamily: MONO }}>{f}%</span>
                      </div>
                    </div>);
                  })}
                </div>);
              })}
            </div>;
          })()}
        </div>)}



        {/* ══ GRANT DETAIL ══ */}
        {sel && sg && (<div>
          <button onClick={() => { setSel(null); setTab(null); sA("draft", null); sA("follow", null); sA("intel", null); setGrantApp(p => { const n = { ...p }; delete n[sg?.id]; return n; }); }}
            style={{ padding: 0, border: "none", background: "none", color: C.green, fontSize: 13, cursor: "pointer", fontWeight: 600, fontFamily: FONT, marginBottom: 20 }}>
            ← Back to {view}
          </button>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.dark }}>{sg.name}</h1>
              <div style={{ fontSize: 14, color: C.t3, marginTop: 4 }}>{sg.funder} · {sg.type}</div>
              {sg.applyUrl && <div style={{ marginTop: 4 }}><a href={sg.applyUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: C.blue, fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", background: C.blueSoft, borderRadius: 4 }}>🔗 Apply: {sg.applyUrl.replace(/https?:\/\/(www\.)?/, "").split("/")[0]} →</a></div>}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Avatar id={sg.owner} />
              <select value={sg.owner || "team"} onChange={e => up(sg.id, { owner: e.target.value })} style={{ ...inp }}>{TEAM.map(t => <option key={t.id} value={t.id}>{t.name}{t.title ? ` (${t.title})` : ""}</option>)}</select>
              <select value={sg.stage} onChange={e => {
                const gate = needsApproval(sg.stage, e.target.value);
                if (gate) { requestApproval(sg.id, sg.stage, e.target.value); }
                else { moveStage(sg.id, e.target.value); }
              }} style={{ ...inp, borderColor: STAGES.find(s => s.id === sg.stage)?.c + "40", color: STAGES.find(s => s.id === sg.stage)?.c }}>
                {STAGES.map(s => {
                  const gate = needsApproval(sg.stage, s.id);
                  return <option key={s.id} value={s.id}>{s.label}{gate ? " (needs approval)" : ""}</option>;
                })}
              </select>
              <Btn v="success" onClick={() => aiFullApp(sg)} disabled={grantApp[sg.id]?.busy}>
                {grantApp[sg.id]?.busy ? "Writing..." : grantApp[sg.id]?.text ? "Rewrite" : "Write application"}
              </Btn>
              <Btn v="ghost" onClick={() => {
                const dup = { ...sg, id: uid(), name: sg.name + " (copy)", funder: sg.funder, log: [{ d: td(), t: `Duplicated from "${sg.name}"` }], stage: "scouted", subDate: null, docs: { ...sg.docs }, fups: [...(sg.fups || [])], focus: [...(sg.focus || [])], geo: [...(sg.geo || [])] };
                setGrants(p => [...p, dup]);
                setSel(dup.id);
                addL(sg.id, `Duplicated as "${dup.name}"`);
              }}>Duplicate</Btn>
              {confirmDel === sg.id ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12, color: C.red, fontWeight: 600 }}>Delete?</span>
                  <Btn v="danger" style={{ padding: "5px 12px", fontSize: 12 }} onClick={() => { setGrants(p => p.filter(g => g.id !== sg.id)); setSel(null); setConfirmDel(null); }}>Yes, delete</Btn>
                  <button onClick={() => setConfirmDel(null)} style={{ fontSize: 12, color: C.t4, background: "none", border: "none", cursor: "pointer", fontFamily: FONT }}>Cancel</button>
                </span>
              ) : (
                <Btn v="danger" onClick={() => setConfirmDel(sg.id)}>Delete</Btn>
              )}
            </div>
            {/* Inline approval panel */}
            {approvals.filter(a => a.gid === sg.id && a.status === "pending").map(appr => {
              const reviewers = TEAM.filter(t => t.role === appr.need);
              return (
                <div key={appr.id} style={{ background: C.white, border: `1px solid ${C.amber}40`, borderRadius: 8, marginTop: 12, overflow: "hidden" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", background: C.amberSoft, borderBottom: `1px solid ${C.amber}25` }}>
                    <div>
                      <span style={{ fontWeight: 700, color: C.amber, fontSize: 14 }}>Approval required</span>
                      <span style={{ color: C.t2, fontSize: 13, marginLeft: 10 }}>{STAGES.find(s=>s.id===appr.from)?.label} → {STAGES.find(s=>s.id===appr.to)?.label}</span>
                    </div>
                    <Btn v="primary" style={{ padding: "5px 14px", fontSize: 12 }} onClick={() => runAllAgentReviews(appr.id)} disabled={Object.values(agentBusy).some(Boolean)}>
                      {Object.values(agentBusy).some(Boolean) ? "Reviewing..." : "Run all reviews"}
                    </Btn>
                  </div>
                  <div style={{ display: "flex", gap: 8, padding: "14px 20px", flexWrap: "wrap" }}>
                    {reviewers.map(r => {
                      const rev = appr.reviews.find(rv => rv.by === r.id);
                      const isBusy = agentBusy[appr.id + r.id];
                      return (
                        <div key={r.id} style={{ flex: 1, minWidth: 150, background: rev ? (rev.decision === "approved" ? C.greenSoft : C.redSoft) : C.raised, borderRadius: 8, padding: 12, border: `1px solid ${rev ? (rev.decision === "approved" ? C.greenBorder : C.red + "25") : C.line}` }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                            <Avatar id={r.id} size={20} />
                            <span style={{ fontWeight: 600, fontSize: 12, color: C.dark }}>{r.name}</span>
                          </div>
                          {isBusy && <div style={{ fontSize: 12, color: C.t3, fontStyle: "italic" }}>Reviewing...</div>}
                          {rev && (
                            <div>
                              <span style={{ padding: "2px 8px", fontSize: 10, fontWeight: 700, borderRadius: 100, color: rev.decision === "approved" ? C.green : C.red, background: rev.decision === "approved" ? C.green + "14" : C.red + "14", textTransform: "uppercase", borderRadius: 4 }}>{rev.decision === "approved" ? "Approved" : "Needs work"}</span>
                              <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.5, marginTop: 6, maxHeight: 60, overflow: "auto", whiteSpace: "pre-wrap" }}>{rev.note}</div>
                            </div>
                          )}
                          {!rev && !isBusy && <Btn v="muted" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => agentReview(appr.id, r.id)}>Review</Btn>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Full application draft panel */}
          {grantApp[sg.id]?.busy && (
            <div style={{ background: C.purpleSoft, border: `1px solid ${C.purple}25`, borderRadius: 8, padding: "20px 24px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 20, height: 20, border: `2.5px solid ${C.purple}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: C.purple }}>Writing full application...</div>
                <div style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>Generating cover letter, proposal, budget, and appendices for {sg.funder}</div>
              </div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}
          {grantApp[sg.id]?.text && !grantApp[sg.id]?.busy && (
            <div style={{ background: C.white, border: `1px solid ${C.purple}30`, borderRadius: 8, marginBottom: 16, overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px", background: C.purpleSoft, borderBottom: `1px solid ${C.purple}15` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: C.purple }}>Draft application</span>
                  <span style={{ fontSize: 12, color: C.t3 }}>for {sg.funder} · R{sg.ask?.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <DownloadBtn text={grantApp[sg.id].text} filename={`dlab_application_${sg.funder.replace(/\s+/g,"_")}`} />
                  <CopyBtn text={grantApp[sg.id].text} />
                  <Btn v="ghost" style={{ fontSize: 12, padding: "5px 12px" }} onClick={() => aiFullApp(sg)}>Regenerate</Btn>
                  <button onClick={() => setGrantApp(p => { const n = { ...p }; delete n[sg.id]; return n; })} style={{ fontSize: 12, color: C.t4, background: "none", border: "none", cursor: "pointer", fontFamily: FONT }}>Dismiss</button>
                </div>
              </div>
              <div style={{ padding: "20px 24px", fontSize: 14, lineHeight: 1.9, color: C.t1, whiteSpace: "pre-wrap", maxHeight: 500, overflow: "auto" }}>{grantApp[sg.id].text}</div>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
            <Num label="Ask" value={fmtK(sg.ask)} color={C.green} />
            <Num label="Deadline" value={sg.deadline ? new Date(sg.deadline).toLocaleDateString("en-ZA", { day: "numeric", month: "short" }) : "Rolling"} sub={sg.deadline ? <DeadlineBadge d={dL(sg.deadline)} deadline={sg.deadline} size="md" /> : ""} color={urgC(dL(sg.deadline))} />
            <Num label="Fit score" value={`${fit(sg)}%`} color={fit(sg) > 70 ? C.green : C.amber} />
            <Num label="Hours logged" value={sg.hrs || 0} />
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: `1.5px solid ${C.line}` }}>
            {[
              { id: null, l: "Details" },
              { id: "docs", l: `Documents (${(DOCS[sg.type] || []).filter(d => sg.docs?.[d] === "ready").length}/${(DOCS[sg.type] || []).length})` },
              { id: "fups", l: `Follow-ups${(sg.fups || []).filter(f => !f.done).length ? ` (${(sg.fups || []).filter(f => !f.done).length})` : ""}` },
              { id: "ai", l: "AI Tools" },
            ].map(t => (
              <button key={t.id || "d"} onClick={() => setTab(t.id)} style={{
                padding: "10px 20px", border: "none",
                borderBottom: tab === t.id ? `2px solid ${C.dark}` : "2px solid transparent",
                background: "transparent", color: tab === t.id ? C.dark : C.t4,
                fontSize: 13, fontWeight: tab === t.id ? 700 : 500, cursor: "pointer", fontFamily: FONT,
                letterSpacing: 0.1,
              }}>{t.l}</button>
            ))}
          </div>

          {/* Details tab */}
          {tab === null && (() => {
            const fld = (label, k, t, ph, extra) => (
              <div key={k} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.t4, letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</label>
                {extra || <input type={t} placeholder={ph} value={sg[k] || ""} onChange={e => up(sg.id, { [k]: t === "number" ? Number(e.target.value) : e.target.value })} style={{ ...inp, width: "100%" }} />}
              </div>
            );
            return (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ background: C.white, padding: 24, borderRadius: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                    {fld("Ask (R)", "ask", "number", "e.g. 1236000")}
                    {fld("Deadline", "deadline", "date", "")}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                    {fld("Contact person", "contact", "text", "e.g. Sarah Molefe")}
                    {fld("Email", "email", "email", "e.g. sarah@funder.co.za")}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    {fld("Hours logged", "hrs", "number", "0")}
                    {fld("Relationship", "rel", "text", "", (
                      <select value={sg.rel || "Cold"} onChange={e => up(sg.id, { rel: e.target.value })} style={{ ...inp, width: "100%", cursor: "pointer" }}>
                        {["Cold", "Warm Intro", "Existing Relationship", "Previous Funder"].map(r => <option key={r}>{r}</option>)}
                      </select>
                    ))}
                  </div>
                </div>
                <div style={{ background: C.white, padding: 24, borderRadius: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: C.t4, letterSpacing: 0.5, textTransform: "uppercase" }}>Focus tags</label>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {(sg.focus || []).map((f, i) => (
                      <span key={i} style={{ fontSize: 12, fontWeight: 600, color: C.purple, background: C.purpleSoft, padding: "4px 10px", borderRadius: 100, display: "flex", alignItems: "center", gap: 6 }}>
                        {f}
                        <span style={{ cursor: "pointer", opacity: 0.5, fontSize: 14, lineHeight: 1 }} onClick={() => up(sg.id, { focus: sg.focus.filter((_, j) => j !== i) })}>×</span>
                      </span>
                    ))}
                    <input placeholder="Add tag..." style={{ ...inp, width: 100, fontSize: 12, padding: "4px 10px" }} onKeyDown={e => {
                      if (e.key === "Enter" && e.target.value.trim()) {
                        up(sg.id, { focus: [...(sg.focus || []), e.target.value.trim()] });
                        e.target.value = "";
                      }
                    }} />
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ background: C.white, padding: 24, borderRadius: 12, flex: 1, display: "flex", flexDirection: "column" }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: C.t4, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>Notes</label>
                  <textarea value={sg.notes || ""} placeholder="Programme details, funder intelligence, strategic notes..." onChange={e => up(sg.id, { notes: e.target.value })} style={{ ...inp, width: "100%", minHeight: 110, resize: "vertical", boxSizing: "border-box", lineHeight: 1.6, flex: 1 }} />
                </div>
                <div style={{ background: C.white, padding: 24, borderRadius: 12 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: C.t4, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 10, display: "block" }}>Activity log</label>
                  <div style={{ maxHeight: 160, overflow: "auto", marginBottom: 12 }}>
                    {(sg.log || []).length === 0 && <div style={{ fontSize: 13, color: C.t4, padding: "8px 0" }}>No activity logged yet</div>}
                    {(sg.log || []).slice().reverse().map((a, i) => (
                      <div key={i} style={{ fontSize: 13, padding: "7px 0", borderBottom: `1px solid ${C.line}`, display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <span style={{ color: C.t4, fontFamily: MONO, fontSize: 11, flexShrink: 0, marginTop: 1, minWidth: 80 }}>{a.d}</span>
                        <span style={{ color: C.t2, lineHeight: 1.4 }}>{a.t}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input id="nA" placeholder="Log activity..." style={{ ...inp, flex: 1 }} onKeyDown={e => { if (e.key === "Enter" && e.target.value) { addL(sg.id, e.target.value); e.target.value = ""; } }} />
                    <Btn v="muted" onClick={() => { const el = document.getElementById("nA"); if (el?.value) { addL(sg.id, el.value); el.value = ""; } }}>Add</Btn>
                  </div>
                </div>
              </div>
            </div>
            );
          })()}

          {/* Documents tab */}
          {tab === "docs" && (() => {
            const docList = DOCS[sg.type] || [];
            const getEffective = (doc) => {
              const grantSt = sg.docs?.[doc] || "missing";
              const orgId = DOC_MAP[doc];
              const orgDoc = orgId ? orgDocs[orgId] : null;
              const orgReady = orgDoc?.status === "ready" && !(orgDoc?.expiry && dL(orgDoc.expiry) < 0);
              const orgExpired = orgDoc?.expiry && dL(orgDoc.expiry) < 0;
              if (orgReady && grantSt !== "ready") return { st: "vault", label: "Vault", src: "org" };
              if (orgExpired) return { st: "expired", label: "Expired (vault)", src: "org" };
              return { st: grantSt, label: grantSt.charAt(0).toUpperCase() + grantSt.slice(1), src: "grant" };
            };
            const readyCount = docList.filter(d => { const e = getEffective(d); return e.st === "ready" || e.st === "vault"; }).length;

            return (
            <div>
              <div style={{ background: C.white, padding: 28, borderRadius: 8, marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <Label style={{ marginBottom: 0 }}>Document checklist — {sg.type}</Label>
                  <span style={{ fontSize: 14, color: C.green, fontWeight: 700, fontFamily: MONO }}>{readyCount}/{docList.length}</span>
                </div>
                <div style={{ width: "100%", height: 4, background: C.raised, borderRadius: 2, marginBottom: 20 }}>
                  <div style={{ width: `${(readyCount / Math.max(1, docList.length)) * 100}%`, height: 4, background: C.green, borderRadius: 2, transition: "width 0.3s" }} />
                </div>
                {docList.map(doc => {
                  const eff = getEffective(doc);
                  const cl = { ready: C.green, vault: C.green, missing: C.red, expired: C.amber, pending: C.purple };
                  const orgId = DOC_MAP[doc];
                  const orgDoc = orgId ? orgDocs[orgId] : null;
                  const orgInfo = orgId ? ORG_DOCS.find(o => o.id === orgId) : null;

                  return (
                    <div key={doc} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderBottom: `1px solid ${C.line}` }}>
                      <span style={{ width: 10, height: 10, borderRadius: 5, background: cl[eff.st] || C.t3, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 14, color: C.dark }}>{doc}</span>
                        {eff.st === "vault" && (
                          <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: C.green, background: C.greenSoft, padding: "2px 8px", borderRadius: 100, cursor: "pointer" }}
                            onClick={() => setView("docs")}
                            title={orgDoc?.fileName ? `File: ${orgDoc.fileName}` : "View in vault"}>
                            ✓ From vault{orgDoc?.fileName ? `: ${orgDoc.fileName}` : ""}
                          </span>
                        )}
                        {eff.st === "expired" && eff.src === "org" && (
                          <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: C.amber, background: C.amberSoft, padding: "2px 8px", borderRadius: 100, cursor: "pointer" }}
                            onClick={() => setView("docs")}>
                            Expired in vault — renew
                          </span>
                        )}
                        {orgId && eff.src === "grant" && eff.st === "missing" && (
                          <span style={{ marginLeft: 8, fontSize: 11, color: C.t4, cursor: "pointer" }}
                            onClick={() => setView("docs")}>
                            Upload in vault →
                          </span>
                        )}
                      </div>
                      {eff.src !== "org" && (
                        <select value={sg.docs?.[doc] || "missing"} onChange={e => { const docs = { ...sg.docs, [doc]: e.target.value }; up(sg.id, { docs }); if (e.target.value === "ready") addL(sg.id, `Doc ready: ${doc}`); }}
                          style={{ ...inp, width: 100, fontSize: 13, cursor: "pointer", color: cl[eff.st] }}>
                          <option value="missing">Missing</option><option value="pending">Pending</option><option value="ready">Ready</option><option value="expired">Expired</option>
                        </select>
                      )}
                      {eff.src === "org" && (
                        <span style={{ fontSize: 12, color: cl[eff.st], fontWeight: 600, padding: "4px 10px", background: eff.st === "vault" ? C.greenSoft : C.amberSoft, borderRadius: 6 }}>
                          {eff.st === "vault" ? "Ready" : "Expired"}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Vault coverage summary */}
              {(() => {
                const vaultCovered = docList.filter(d => { const oid = DOC_MAP[d]; return oid && orgDocs[oid]?.status === "ready"; }).length;
                const grantOnly = docList.filter(d => !DOC_MAP[d]).length;
                return vaultCovered > 0 || grantOnly > 0 ? (
                  <div style={{ background: C.raised, borderRadius: 10, padding: "14px 20px", fontSize: 13, color: C.t2, display: "flex", gap: 16 }}>
                    {vaultCovered > 0 && <span><strong style={{ color: C.green }}>{vaultCovered}</strong> covered by vault</span>}
                    {grantOnly > 0 && <span><strong style={{ color: C.t1 }}>{grantOnly}</strong> grant-specific (not in vault)</span>}
                    <span style={{ marginLeft: "auto", color: C.green, cursor: "pointer", fontWeight: 600 }} onClick={() => setView("docs")}>Open vault →</span>
                  </div>
                ) : null;
              })()}
            </div>
            );
          })()}

          {/* Follow-ups tab */}
          {tab === "fups" && (
            <div>
              {(sg.fups || []).length === 0 ? (
                <div style={{ background: C.white, padding: 36, borderRadius: 8, textAlign: "center" }}>
                  <div style={{ fontSize: 15, color: C.t3, marginBottom: 16, lineHeight: 1.6 }}>No follow-up cadence yet. Move to "Submitted" to auto-create, or set one up manually.</div>
                  <Btn v="ghost" onClick={() => {
                    const base = sg.subDate || td();
                    up(sg.id, { fups: (CAD[sg.type] || CAD["Foundation"]).map(c => ({ date: addD(base, c.d), label: c.l, type: c.t, done: false })), subDate: base });
                    addL(sg.id, "Manual follow-up cadence created");
                  }}>Create cadence</Btn>
                </div>
              ) : (
                <div style={{ background: C.white, padding: 28, borderRadius: 12 }}>
                  <Label>Follow-up schedule</Label>
                  {sg.subDate && <div style={{ fontSize: 13, color: C.t3, marginBottom: 14 }}>Submitted: {sg.subDate}</div>}
                  {sg.fups.map((fu, i) => {
                    const d = dL(fu.date); const due = d !== null && d <= 0 && !fu.done;
                    return (
                      <div key={i} style={{ padding: "14px 0", borderBottom: `1px solid ${C.line}`, opacity: fu.done ? 0.45 : 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                          <button onClick={() => { const fups = [...sg.fups]; fups[i] = { ...fups[i], done: !fups[i].done }; up(sg.id, { fups }); if (!fu.done) addL(sg.id, `Follow-up done: ${fu.label}`); }}
                            style={{ width: 22, height: 22, border: `2px solid ${fu.done ? C.green : C.line}`, background: fu.done ? C.greenSoft : C.white, cursor: "pointer", flexShrink: 0, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: C.green, fontWeight: 700 }}>
                            {fu.done ? "✓" : ""}
                          </button>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 15, fontWeight: 600, color: due ? C.amber : fu.done ? C.t3 : C.t1 }}>{fu.label}</div>
                            <div style={{ fontSize: 13, color: due ? C.amber : C.t3, marginTop: 2 }}>
                              {fu.date}{d !== null && !fu.done && (d < 0 ? ` — ${Math.abs(d)}d overdue` : d === 0 ? " — today" : ` — ${d} days`)}
                            </div>
                          </div>
                          {!fu.done && <Btn v="ghost" style={{ padding: "6px 14px", fontSize: 12 }} disabled={busy.follow} onClick={() => aiFollow(sg, fu)}>Draft email</Btn>}
                        </div>
                      </div>
                    );
                  })}
                  {ai.follow && (
                    <div style={{ marginTop: 20 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontSize: 13, color: C.green, fontWeight: 600 }}>Drafted email</span>
                        <CopyBtn text={ai.follow} />
                      </div>
                      <div style={{ padding: 20, background: C.bg, borderRadius: 10, borderLeft: `3px solid ${C.green}`, fontSize: 14, lineHeight: 1.9, color: C.t1, whiteSpace: "pre-wrap", maxHeight: 320, overflow: "auto" }}>{ai.follow}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* AI tab */}
          {tab === "ai" && (
            <div>
              <AICard title="Draft proposal" desc={`Full proposal using d-lab context, funder priorities, and past wins`} onRun={() => aiDraft(sg)} busy={busy.draft} result={ai.draft} docName={`dlab_proposal_${sg.funder.replace(/\s+/g,"_")}`} />
              <AICard title="Funder intelligence" desc={`Research ${sg.funder}: budget, recent grants, contacts, strategy`} onRun={() => aiIntel(sg)} busy={busy.intel} result={ai.intel} docName={`dlab_intel_${sg.funder.replace(/\s+/g,"_")}`} />
            </div>
          )}

          {/* Outcome */}
          {["won", "lost"].includes(sg.stage) && (
            <div style={{ background: C.white, border: `1px solid ${sg.stage === "won" ? C.green : C.red}20`, padding: 28, marginTop: 20, borderRadius: 12 }}>
              <Label>{sg.stage === "won" ? "Outcome: Won" : "Outcome: Not successful"}</Label>
              <textarea placeholder="What happened? Feedback?" value={sg.on || ""} onChange={e => up(sg.id, { on: e.target.value })} style={{ ...inp, width: "100%", minHeight: 60, resize: "vertical", boxSizing: "border-box", marginBottom: 12 }} />
              <Label>{sg.stage === "won" ? "Contributing factors" : "Barriers"}</Label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                {(sg.stage === "won" ? WFAC : LFAC).map(f => {
                  const on = (sg.of || []).includes(f);
                  return (<button key={f} onClick={() => up(sg.id, { of: on ? (sg.of || []).filter(x => x !== f) : [...(sg.of || []), f] })}
                    style={{ padding: "6px 14px", border: `1.5px solid ${on ? (sg.stage === "won" ? C.green : C.red) : C.line}`, background: on ? (sg.stage === "won" ? C.green : C.red) + "1A" : C.bg, color: on ? C.dark : C.t3, fontSize: 13, cursor: "pointer", fontWeight: on ? 600 : 400, fontFamily: FONT, borderRadius: 6 }}>{f}</button>);
                })}
              </div>
              <Btn onClick={() => setLearn(p => ({ ...p, o: [...p.o, { id: sg.id, r: sg.stage, f: sg.of || [], n: sg.on || "", rel: sg.rel, type: sg.type }] }))}>Save and train</Btn>
            </div>
          )}
        </div>)}





        {/* ══ DOCUMENTS ══ */}
        {view === "docs" && !sel && (<div>
          <h1 style={{ margin: "0 0 8px", fontSize: 24, fontWeight: 800, color: C.dark, letterSpacing: -0.5 }}>Documents</h1>
          <div style={{ color: C.t3, fontSize: 14, marginBottom: 24 }}>Organisation compliance docs and per-grant checklists in one place.</div>

          {/* Summary */}
          {(() => {
            const total = ORG_DOCS.length;
            const ready = ORG_DOCS.filter(d => orgDocs[d.id]?.status === "ready").length;
            const expired = ORG_DOCS.filter(d => orgDocs[d.id]?.expiry && dL(orgDocs[d.id].expiry) < 0).length;
            return (
              <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
                <Num label="Org docs" value={`${ready}/${total}`} sub={`${Math.round(ready/total*100)}% ready`} color={ready === total ? C.green : C.amber} />
                <Num label="Expired" value={expired} color={expired > 0 ? C.red : C.green} />
              </div>
            );
          })()}

          {/* Org-level docs by category */}
          {["Registration", "Compliance", "Financial", "Governance", "Org"].map(cat => {
            const docs = ORG_DOCS.filter(d => d.cat === cat);
            if (!docs.length) return null;
            const catReady = docs.filter(d => orgDocs[d.id]?.status === "ready").length;
            return (
              <div key={cat} style={{ background: C.white, borderRadius: 8, padding: 22, marginBottom: 12, border: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <Label style={{ marginBottom: 0 }}>{cat}</Label>
                  <span style={{ fontSize: 13, fontWeight: 700, color: catReady === docs.length ? C.green : C.t3, fontFamily: MONO }}>{catReady}/{docs.length}</span>
                </div>
                <div style={{ width: "100%", height: 4, background: C.raised, borderRadius: 2, marginBottom: 14 }}>
                  <div style={{ width: `${(catReady / docs.length) * 100}%`, height: 4, background: C.green, borderRadius: 2, transition: "width 0.3s" }} />
                </div>
                {docs.map(doc => {
                  const d = orgDocs[doc.id] || {};
                  const st = d.status || "missing";
                  const isExpired = d.expiry && dL(d.expiry) < 0;
                  const isExpiring = d.expiry && dL(d.expiry) >= 0 && dL(d.expiry) <= 30;
                  const effectiveStatus = isExpired ? "expired" : st;
                  const cl = { ready: C.green, missing: C.red, expired: C.amber, pending: C.purple };
                  return (
                    <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: `1px solid ${C.line}` }}>
                      <span style={{ width: 10, height: 10, borderRadius: 5, background: cl[effectiveStatus] || C.t3, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                          <span style={{ fontWeight: 600, fontSize: 14, color: C.dark }}>{doc.name}</span>
                          {doc.renew && <span style={{ fontSize: 10, color: C.t4, padding: "1px 6px", border: `1px solid ${C.line}`, borderRadius: 4 }}>Renewable</span>}
                        </div>
                        <div style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>{doc.desc}</div>
                        {d.fileName && <span style={{ fontSize: 11, color: C.t2, background: C.raised, padding: "1px 6px", borderRadius: 3, marginTop: 2, display: "inline-block" }}>{d.fileName}</span>}
                        {isExpired && <span style={{ fontSize: 11, fontWeight: 600, color: C.red, marginLeft: 8 }}>Expired {Math.abs(dL(d.expiry))}d ago</span>}
                        {isExpiring && !isExpired && <span style={{ fontSize: 11, fontWeight: 600, color: C.amber, marginLeft: 8 }}>Expires in {dL(d.expiry)}d</span>}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                        {doc.renew && <input type="date" value={d.expiry || ""} onChange={e => setOrgDocs(p => ({ ...p, [doc.id]: { ...p[doc.id], expiry: e.target.value } }))} style={{ ...inp, width: 100, fontSize: 11, padding: "4px 6px" }} />}
                        <select value={effectiveStatus} onChange={e => setOrgDocs(p => ({ ...p, [doc.id]: { ...p[doc.id], status: e.target.value } }))} style={{ ...inp, width: 90, fontSize: 12, cursor: "pointer", color: cl[effectiveStatus] }}>
                          <option value="missing">Missing</option><option value="pending">Pending</option><option value="ready">Ready</option><option value="expired">Expired</option>
                        </select>
                        <label style={{ padding: "4px 10px", fontSize: 11, fontWeight: 600, border: `1px solid ${C.greenBorder}`, background: C.greenSoft, color: C.green, borderRadius: 6, cursor: "pointer", fontFamily: FONT }}>
                          Upload
                          <input type="file" style={{ display: "none" }} accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx" onChange={e => {
                            const file = e.target.files?.[0]; if (!file) return;
                            if (file.size > 5*1024*1024) { setOrgDocs(p => ({ ...p, [doc.id]: { ...p[doc.id], status: "ready", fileName: file.name, fileSize: file.size, uploadedDate: td() } })); return; }
                            const reader = new FileReader();
                            reader.onload = () => setOrgDocs(p => ({ ...p, [doc.id]: { ...p[doc.id], status: "ready", fileName: file.name, fileSize: file.size, uploadedDate: td(), fileData: reader.result } }));
                            reader.readAsDataURL(file);
                          }} />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Grant readiness matrix */}
          <div style={{ background: C.white, borderRadius: 8, padding: 22, border: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)" }}>
            <Label>Grant readiness</Label>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: C.raised }}>
                    <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: C.t2, borderBottom: `1px solid ${C.line}` }}>Document</th>
                    {grants.filter(g => !["won","lost","deferred"].includes(g.stage)).slice(0,8).map(g => (
                      <th key={g.id} style={{ padding: "8px 6px", textAlign: "center", fontWeight: 600, color: C.t2, borderBottom: `1px solid ${C.line}`, fontSize: 11, maxWidth: 80 }} title={g.name}>{g.name.length > 10 ? g.name.slice(0,10)+"…" : g.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ORG_DOCS.filter(od => grants.filter(g => !["won","lost","deferred"].includes(g.stage)).some(g => (DOCS[g.type]||[]).some(d => DOC_MAP[d] === od.id))).map(od => {
                    const d = orgDocs[od.id] || {};
                    const isReady = d.status === "ready" && !(d.expiry && dL(d.expiry) < 0);
                    return (
                      <tr key={od.id}>
                        <td style={{ padding: "6px 12px", borderBottom: `1px solid ${C.line}`, color: C.t1 }}>{od.name}</td>
                        {grants.filter(g => !["won","lost","deferred"].includes(g.stage)).slice(0,8).map(g => {
                          const needed = (DOCS[g.type]||[]).some(d => DOC_MAP[d] === od.id);
                          return (
                            <td key={g.id} style={{ padding: "6px 8px", textAlign: "center", borderBottom: `1px solid ${C.line}` }}>
                              {needed ? <span style={{ color: isReady ? C.green : C.red, fontWeight: 700, fontSize: 14 }}>{isReady ? "✓" : "✗"}</span> : <span style={{ color: C.t4 }}>—</span>}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>)}


        {/* ══ INSIGHTS ══ */}
        {view === "tools" && !sel && (<div>
          <h1 style={{ margin: "0 0 8px", fontSize: 24, fontWeight: 800, color: C.dark, letterSpacing: -0.5 }}>Insights</h1>
          <div style={{ color: C.t3, fontSize: 14, marginBottom: 24 }}>AI-powered research and drafting up top. Outcomes, patterns, and recommendations below — all in one place.</div>

          {/* ── AI RESEARCH ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.t3, letterSpacing: 0.5, textTransform: "uppercase" }}>AI Research</span>
            <div style={{ flex: 1, height: 1, background: C.line }} />
          </div>

          <AICard title="Impact report" desc="Quarterly summary for board or existing funders" onRun={aiReport} busy={busy.report} result={ai.report} docName="dlab_quarterly_impact_report" />

          {/* Conferences */}
          <div style={{ background: C.white, borderRadius: 8, padding: 22, marginBottom: 16, border: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <Label style={{ marginBottom: 0 }}>Conferences & speaking</Label>
              <div style={{ display: "flex", gap: 0, background: C.raised, borderRadius: 8, padding: 2 }}>
                {[{ id: "sa", l: "South Africa" }, { id: "global", l: "Global" }].map(t => (
                  <button key={t.id} onClick={() => setConfTab(t.id)} style={{
                    padding: "6px 16px", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600,
                    background: confTab === t.id ? C.white : "transparent", color: confTab === t.id ? C.dark : C.t3,
                    cursor: "pointer", fontFamily: FONT, boxShadow: confTab === t.id ? "0 1px 3px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s"
                  }}>{t.l}</button>
                ))}
              </div>
            </div>

            {/* AI search */}
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <input value={confQ} onChange={e => setConfQ(e.target.value)} placeholder="Search by topic, type, location..." style={{ ...inp, flex: 1 }} onKeyDown={e => e.key === "Enter" && aiConf(confQ)} />
              <Btn onClick={() => aiConf(confQ)} disabled={busy.conf}>{busy.conf ? "Searching..." : "AI Search"}</Btn>
            </div>
            {ai.conf && <div style={{ background: C.bg, padding: 16, borderRadius: 10, fontSize: 13, lineHeight: 1.8, color: C.t1, whiteSpace: "pre-wrap", maxHeight: 250, overflow: "auto", marginBottom: 16 }}>{ai.conf}</div>}

            {/* Conference cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {CONFS.filter(c => c.reg === confTab).sort((a, b) => a.month - b.month).map((c, i) => (
                <div key={i} style={{ background: C.bg, borderRadius: 10, padding: "18px 20px", border: `1px solid ${C.line}`, transition: "border-color 0.15s" }}
                  onMouseOver={e => e.currentTarget.style.borderColor = C.green} onMouseOut={e => e.currentTarget.style.borderColor = C.line}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 15, color: C.dark }}>{c.n}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: C.green, background: C.greenSoft, padding: "2px 8px", borderRadius: 100 }}>{c.type}</span>
                      </div>
                      <div style={{ display: "flex", gap: 14, fontSize: 13, color: C.t2, marginTop: 4 }}>
                        <span>{c.d}</span>
                        <span>{c.l}</span>
                        {c.audience && <span>{c.audience} attendees</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      {c.url && <a href={c.url} target="_blank" rel="noopener" style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600, border: `1px solid ${C.line}`, background: C.white, color: C.t2, borderRadius: 6, cursor: "pointer", fontFamily: FONT, textDecoration: "none", transition: "all 0.12s" }} onMouseOver={e => { e.currentTarget.style.borderColor = C.green; e.currentTarget.style.color = C.green; }} onMouseOut={e => { e.currentTarget.style.borderColor = C.line; e.currentTarget.style.color = C.t2; }}>Website</a>}
                      {c.apply && <a href={c.apply} target="_blank" rel="noopener" style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600, border: `1px solid ${C.greenBorder}`, background: C.greenSoft, color: C.green, borderRadius: 6, cursor: "pointer", fontFamily: FONT, textDecoration: "none" }}>Apply</a>}
                      <button onClick={() => aiConfApply(c)} disabled={confApp[c.n]?.busy}
                        style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600, border: `1px solid ${C.purple}40`, background: C.purpleSoft, color: C.purple, borderRadius: 6, cursor: confApp[c.n]?.busy ? "wait" : "pointer", fontFamily: FONT, opacity: confApp[c.n]?.busy ? 0.7 : 1 }}>
                        {confApp[c.n]?.busy ? "Drafting..." : confApp[c.n]?.text ? "Redraft" : "Draft application"}
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: C.t1, lineHeight: 1.6, marginBottom: 10 }}>{c.r}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {(c.tags || []).map(t => <span key={t} style={{ fontSize: 10, fontWeight: 600, color: C.t4, padding: "2px 8px", border: `1px solid ${C.line}`, borderRadius: 4 }}>{t}</span>)}
                    </div>
                    <div style={{ display: "flex", gap: 12, fontSize: 12, color: C.t3 }}>
                      {c.cost && <span>Cost: {c.cost}</span>}
                      {c.deadline && <span style={{ fontWeight: 600, color: C.amber }}>Deadline: {c.deadline}</span>}
                    </div>
                  </div>
                  {/* Draft result */}
                  {confApp[c.n]?.text && (
                    <div style={{ marginTop: 12, background: C.white, borderRadius: 8, border: `1px solid ${C.purple}20`, overflow: "hidden" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", background: C.purpleSoft, borderBottom: `1px solid ${C.purple}15` }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: C.purple }}>Draft application</span>
                        <div style={{ display: "flex", gap: 6 }}>
                          <DownloadBtn text={confApp[c.n].text} filename={`dlab_speaker_${c.n.replace(/\s+/g,"_")}`} label="Download" />
                          <CopyBtn text={confApp[c.n].text} />
                          <button onClick={() => setConfApp(p => { const n = { ...p }; delete n[c.n]; return n; })} style={{ fontSize: 11, color: C.t4, background: "none", border: "none", cursor: "pointer", fontFamily: FONT }}>Dismiss</button>
                        </div>
                      </div>
                      <div style={{ padding: "14px 16px", fontSize: 13, lineHeight: 1.8, color: C.t1, whiteSpace: "pre-wrap", maxHeight: 400, overflow: "auto" }}>{confApp[c.n].text}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ fontSize: 12, color: C.t4, marginTop: 14, textAlign: "center" }}>
              {confTab === "sa" ? `${CONFS.filter(c => c.reg === "sa").length} SA conferences` : `${CONFS.filter(c => c.reg === "global").length} global conferences`} · Sorted by date
            </div>
          </div>

          {/* ── OUTCOMES & PATTERNS ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, marginTop: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.t3, letterSpacing: 0.5, textTransform: "uppercase" }}>Outcomes & Patterns</span>
            <div style={{ flex: 1, height: 1, background: C.line }} />
          </div>

          {/* Learning + outcomes */}
          <div style={{ display: "flex", gap: 14, marginBottom: 16, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 260, background: C.white, padding: 22, borderRadius: 8, border: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)" }}>
              <Label>Win / loss record</Label>
              {grants.filter(g => ["won","lost"].includes(g.stage)).length === 0
                ? <div style={{ fontSize: 13, color: C.t3, padding: "12px 0" }}>Mark grants as Won or Lost to build intelligence.</div>
                : grants.filter(g => ["won","lost"].includes(g.stage)).map(g => (
                  <div key={g.id} onClick={() => setSel(g.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: `1px solid ${C.line}`, cursor: "pointer" }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: g.stage === "won" ? C.green : C.red }} />
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{g.name}</span>
                    <span style={{ fontSize: 12, color: C.t3, marginLeft: "auto" }}>{fmtK(g.ask)}</span>
                  </div>
                ))
              }
            </div>
            <div style={{ flex: 1, minWidth: 260, background: C.white, padding: 22, borderRadius: 8, border: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)" }}>
              <Label>Effort vs outcome</Label>
              {grants.filter(g => g.hrs > 0).length === 0
                ? <div style={{ fontSize: 13, color: C.t3, padding: "12px 0" }}>Log hours on grants to see effort patterns.</div>
                : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {grants.filter(g => g.hrs > 0).sort((a,b) => b.hrs - a.hrs).slice(0,8).map(g => {
                      const max = Math.max(...grants.filter(x => x.hrs > 0).map(x => x.hrs));
                      const col = g.stage === "won" ? C.green : g.stage === "lost" ? C.red : C.blue;
                      return (
                        <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 11, color: C.t3, width: 80, textAlign: "right", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name.slice(0,14)}</span>
                          <div style={{ flex: 1, height: 16, background: C.raised, borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ width: `${(g.hrs/max)*100}%`, height: "100%", background: col, borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: col, fontFamily: MONO, width: 28 }}>{g.hrs}h</span>
                        </div>
                      );
                    })}
                  </div>
              }
            </div>
          </div>

          {/* Recommendations */}
          <div style={{ background: C.amberSoft, border: `1px solid ${C.amber}25`, padding: 24, borderRadius: 12 }}>
            <Label>Recommendations</Label>
            <div style={{ fontSize: 14, lineHeight: 1.8, color: C.t2 }}>
              {pipe.act.filter(g => g.rel === "Previous Funder").length > 0 && <p style={{ margin: "0 0 8px" }}><strong style={{ color: C.dark }}>Prioritise renewals.</strong> {pipe.act.filter(g => g.rel === "Previous Funder").length} existing funder relationships. These convert at the highest rate.</p>}
              {pipe.act.filter(g => g.stage === "scouted").length > 3 && <p style={{ margin: "0 0 8px" }}><strong style={{ color: C.dark }}>Qualify your pipeline.</strong> {pipe.act.filter(g => g.stage === "scouted").length} grants at Scouted. Run Funder Intelligence on the top 3.</p>}
              {pipe.act.filter(g => g.stage === "drafting").length > 2 && <p style={{ margin: "0 0 8px" }}><strong style={{ color: C.dark }}>Drafting bottleneck.</strong> {pipe.act.filter(g => g.stage === "drafting").length} in Drafting. Use Grant Scout + AI draft to move them.</p>}
              <p style={{ margin: 0 }}><strong style={{ color: C.dark }}>Pattern:</strong> Corporate CSI decides faster. Government/SETA and international grants are larger but have longer cycles.</p>
            </div>
          </div>
        </div>)}

        {/* ── ADD MODAL ── */}
        {modal === "add" && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, backdropFilter: "blur(4px)" }}>
            <div style={{ background: C.white, padding: 32, width: 440, maxHeight: "85vh", overflow: "auto", borderRadius: 12, border: "none", boxShadow: "0 24px 48px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.08)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                <div style={{ fontWeight: 700, fontSize: 20, color: C.dark }}>Add opportunity</div>
                <button onClick={() => setModal(null)} style={{ background: "none", border: "none", color: C.t3, fontSize: 14, cursor: "pointer", fontFamily: FONT, fontWeight: 600 }}>Close</button>
              </div>
              <form onSubmit={e => { e.preventDefault(); const fd = new FormData(e.target);
                setGrants(p => [...p, { id: uid(), name: fd.get("name"), funder: fd.get("funder"), type: fd.get("type"), stage: "scouted", ask: Number(fd.get("ask")) || 0, deadline: fd.get("deadline") || null, focus: [], geo: [], rel: fd.get("rel"), pri: 3, hrs: 0, notes: fd.get("notes"), log: [{ d: td(), t: "Added to pipeline" }], on: "", of: [], owner: fd.get("owner"), docs: {}, fups: [], subDate: null, applyUrl: fd.get("applyUrl") || "" }]);
                setModal(null);
              }}>
                {[{ n: "name", l: "Grant name", r: true }, { n: "funder", l: "Funder", r: true }, { n: "ask", l: "Amount (R)", t: "number" }, { n: "deadline", l: "Deadline", t: "date" }].map(f => (
                  <div key={f.n} style={{ marginBottom: 14 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.t3, marginBottom: 6 }}>{f.l}</label>
                    <input name={f.n} type={f.t || "text"} required={f.r} style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
                  </div>
                ))}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                  <div><label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.t3, marginBottom: 6 }}>Type</label><select name="type" style={{ ...inp, width: "100%", cursor: "pointer" }}>{FTYPES.map(t => <option key={t}>{t}</option>)}</select></div>
                  <div><label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.t3, marginBottom: 6 }}>Owner</label><select name="owner" style={{ ...inp, width: "100%", cursor: "pointer" }}>{TEAM.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
                </div>
                <div style={{ marginBottom: 14 }}><label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.t3, marginBottom: 6 }}>Relationship</label><select name="rel" style={{ ...inp, width: "100%", cursor: "pointer" }}>{["Cold", "Warm Intro", "Existing Relationship", "Previous Funder"].map(r => <option key={r}>{r}</option>)}</select></div>
                <div style={{ marginBottom: 14 }}><label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.t3, marginBottom: 6 }}>Application URL</label><input name="applyUrl" type="url" placeholder="https://..." style={{ ...inp, width: "100%", boxSizing: "border-box" }} /></div>
                <div style={{ marginBottom: 20 }}><label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.t3, marginBottom: 6 }}>Notes</label><textarea name="notes" style={{ ...inp, width: "100%", minHeight: 50, resize: "vertical", boxSizing: "border-box" }} /></div>
                <Btn style={{ width: "100%", padding: "12px" }}>Add to pipeline</Btn>
              </form>
            </div>
          </div>
        )}

        {/* ── URL MODAL ── */}
        {modal === "url" && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, backdropFilter: "blur(4px)" }}>
            <div style={{ background: C.white, padding: 32, width: 480, maxHeight: "85vh", overflow: "auto", borderRadius: 12, border: "none", boxShadow: "0 24px 48px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.08)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                <div style={{ fontWeight: 700, fontSize: 20, color: C.dark }}>Add from URL</div>
                <button onClick={() => { setModal(null); sA("url", null); }} style={{ background: "none", border: "none", color: C.t3, fontSize: 14, cursor: "pointer", fontFamily: FONT, fontWeight: 600 }}>Close</button>
              </div>
              <div style={{ fontSize: 14, color: C.t3, marginBottom: 14, lineHeight: 1.5 }}>Paste a funder website or grant listing. AI extracts all details automatically.</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
                <input id="gUrl" placeholder="https://..." style={{ ...inp, flex: 1 }} onKeyDown={e => { if (e.key === "Enter") aiURL(e.target.value); }} />
                <Btn onClick={() => { const v = document.getElementById("gUrl")?.value; if (v) aiURL(v); }} disabled={busy.url}>{busy.url ? "Extracting..." : "Extract"}</Btn>
              </div>
              {ai.url && (() => {
                let p = null; try { p = JSON.parse(ai.url.replace(/```json|```/g, "").trim()); } catch {}
                if (p) return (
                  <div>
                    <div style={{ background: C.bg, padding: 20, borderRadius: 10, borderLeft: `3px solid ${C.green}`, marginBottom: 18 }}>
                      {[{ l: "Name", v: p.name }, { l: "Funder", v: p.funder }, { l: "Type", v: p.type }, { l: "Amount", v: p.ask ? fmtK(p.ask) : "TBD" }, { l: "Deadline", v: p.deadline || "Unknown" }, { l: "Focus", v: p.focus?.join(", ") }].map(r => (
                        <div key={r.l} style={{ display: "flex", gap: 10, marginBottom: 6 }}>
                          <span style={{ fontSize: 13, color: C.t3, width: 65, flexShrink: 0 }}>{r.l}</span>
                          <span style={{ fontSize: 14, color: C.t1 }}>{r.v || "—"}</span>
                        </div>
                      ))}
                    </div>
                    <Btn onClick={() => {
                      setGrants(prev => [...prev, { id: uid(), name: p.name || "New Grant", funder: p.funder || "Unknown", type: p.type || "Foundation", stage: "scouted", ask: p.ask || 0, deadline: p.deadline || null, focus: p.focus || [], geo: [], rel: "Cold", pri: 3, hrs: 0, notes: p.notes || "", log: [{ d: td(), t: "Added from URL" }], on: "", of: [], owner: "team", docs: {}, fups: [], subDate: null, applyUrl: p.applyUrl || "" }]);
                      setModal(null); sA("url", null);
                    }} style={{ width: "100%" }}>Add to pipeline</Btn>
                  </div>
                );
                return (<div style={{ padding: 20, background: C.bg, borderRadius: 10, borderLeft: `3px solid ${C.amber}`, fontSize: 14, lineHeight: 1.7, color: C.t1, whiteSpace: "pre-wrap" }}>{ai.url}</div>);
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
