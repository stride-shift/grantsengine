# CLAUDE.md — Project Context for Claude Code

## What This Is
d-lab Grant Engine v14 — a React app for managing a grant funding pipeline for d-lab NPC, a South African youth skills NPO. It uses the Anthropic Claude API for AI-powered proposal drafting, funder research, grant scouting, and pipeline intelligence.

## Organisation Context
d-lab NPC (The Field Lab NPC) trains unemployed South African youth in AI-native digital skills. Key stats: 92% completion rate (vs 55% sector average), 85% employment within 3 months, 8 programme types from R199K to R5M. See `src/data/context.js` for the full organisational profile used in AI prompts.

## d-lab Financial Model & Funding Landscape

### Revenue Model (2026)
- **Grant funding:** ~R9.3M (65% of income) from foundations, corporate CSI, SETAs, international agencies
- **Earned revenue:** ~R2.5M — Corporate Collaborations R2.03M, Intensives R225K, Microjobbing R240K
- **In-kind:** ~R4.95M — mentor hours R1.08M, laptops R954K, stipends R2.29M, infrastructure R629K
- **30% org cost model:** Programmes not covered by org budget carry a 30% contribution to core ops

### Financial Position
- Retained reserves: R4.98M (Feb 2025). Cash in bank: R4.83M
- FY2025: Income R6.97M, Expense R7.66M (planned deficit drawdown)
- FY2024: Income R11.11M, Expense R6.33M, Surplus R4.88M
- Budget discipline: 2025 approved R11.08M, actual R8.23M (R2.85M variance — deliberate stewardship)

### Cornerstone Funder: Get It Done Foundation (GIDF)
- Returning annual: R2.84M (2023) → R4.99M (2024) → R4.97M (2025) → requesting R4.97M (2026)
- 49% of project budget, 35% of operating budget
- Always frame as "continuity" not expansion

### 2026 Secured: R8.59M
- Cash: TK Foundation R1M, Inkcubeko R1.23M, CCBA R1.41M
- In-kind: R4.95M

### 8 Programme Types (Budget Reference)
| Type | Description | Cost | Students | Duration |
|------|-------------|------|----------|----------|
| 1 | Standard — Partner-funded | R516K | 20 | 9 months |
| 2 | Standard — Full (stipends+laptops) | R1.597M | 20 | 9 months |
| 3 | Standard — With Stipends | R1.236M | 20 | 9 months |
| 4 | FET High School | R1.08M | 60 | 3 years |
| 5 | Corporate (CCBA Future Leaders) | R651K | 63 | 6 months |
| 6 | Cyborg Habits Short Course | R930/learner | varies | 4-6 weeks |
| 7 | Sci-Bono Employability | R232K | 90 | 13 weeks |
| 8 | Bespoke Corporate Accelerator | R2.75M | 25 | 18 months |

### Key People & Relationship Owners
- **Alison Jacobson** (Director): Correlation Risk Partners, Pragma, Sybrin, Nedbank PW, DGMT
- **Barbara Dale-Jones** (Board): RMB, BII, Old Mutual, MODO, KAVOD, Kagiso, SAB Foundation, Optima, MTM Momo
- **David Kramer** (Board): GDE, Penreach/FRF joint, SAP, SciBono, MICT SETA
- **Nolan Beudeker** (Head of Programmes): ACT Foundation, ALT Capital, Sawabona, MasterCard, iQ, Chartall, Harambee

### Proposal Strategy
- **Returning funders:** "Here's what your investment built" + specific outcomes from last cycle
- **New funders:** "Here's the system and the proof" + matched programme type + alumni story
- **Anti-patterns:** Never lead with "SA has X% unemployment." Never use hollow phrases. Always specific numbers.
- **Programme matching:** Small funder → Type 1 (R516K). Medium → Type 3 (R1.2M). Large → Type 2 (R1.6M) or multi-cohort. Corporate → Type 5/8. SETA → multi-cohort national.
- **Always include:** 30% org cost contribution for sustainability

## Tech Stack
- React 18 (no TypeScript yet)
- Vite for dev/build
- Google Gemini API (`gemini-2.0-flash`) — proxied through Express backend (`server/routes/ai.js`)
- Express 5 backend on port 3001 with Supabase PostgreSQL
- Helmet, CORS, express-rate-limit for security
- No CSS framework — all inline styles using design tokens from `src/theme.js`
- No router — `view` state toggles between Dashboard / Pipeline / Detail / Docs / Tools

## Architecture
- `App.jsx` (~2400 lines) contains all views and AI functions — this is the main file to work in
- `src/data/` has all static data, org context, funder strategy, seed grants
- `src/components/` has shared UI primitives (Btn, Tag, Avatar, CalendarStrip, etc.) + major views (Dashboard, Pipeline, GrantDetail, etc.)
- `src/prompts.js` — only `scoutPrompt` is active (used by Pipeline.jsx). All other exports are LEGACY; App.jsx has its own inline prompts
- `server/` — Express 5 backend: auth, data (grants CRUD), AI proxy, uploads, admin
- `grant-engine.monolith.jsx` is the original single-file version that runs in Claude artifacts — keep it as a working reference

## Key Patterns
- State helpers: `sB("key", true/false)` for busy state, `sA("key", value)` for AI results
- Grant mutations: `up(id, { field: value })` updates a grant, `addL(id, "text")` adds to activity log  
- Fit score: calculated from win/loss factors in `g.on` (comma-separated string)
- Funder strategy: `funderStrategy(grant)` returns `{ lead, hook, lang, structure, budgetEmphasis }` per funder type
- Programme detection: `detectType(grant)` maps grant notes to one of 8 programme types with exact budgets

## AI Prompt Engineering
All prompts follow these principles:
- Clear role definition ("You are a funder intelligence analyst...")
- Anti-patterns list (no "SA has X% unemployment" openers, no hollow phrases)
- Structured output (numbered sections, JSON for scout)
- Funder-specific context (returning vs new, type-matched register)
- Token budgets calibrated to output complexity (800 for extraction → 4096 for full applications)

## Data Flow
1. On load: fetch grants from Supabase via Express API (`GET /api/org/:slug/grants`)
2. Any mutation: `up(id, changes)` → `PUT /api/org/:slug/grants/:id` → Supabase
3. AI calls: `api(system, user, search, maxTokens)` → Express proxy → Gemini API → rendered in UI
4. Scout results: JSON array → parsed → shown as cards with "+ Add" buttons → new grant created via API
5. Context flow: `context.js` (CTX/CTX_SLIM) + `funderStrategy.js` + server profile → injected into every AI prompt as `orgCtx`

## Common Tasks
- **Add a new AI prompt**: Add function to `src/prompts.js`, wire into App.jsx 
- **Add a pipeline stage**: Update STAGES in `src/data/constants.js`, add gate criteria in GATES
- **Change design tokens**: Edit `src/theme.js` (C object)
- **Update org context**: Edit `src/data/context.js` (CTX and CTX_SLIM)
- **Bump storage version**: Change `dlg12` → `dlg13` etc. in App.jsx to force fresh seed data

## Important: South African Context
- Currency is ZAR (Rand), formatted as R1,236,000 or R1.2M
- B-BBEE (Broad-Based Black Economic Empowerment) is a key compliance framework
- SETA = Sector Education and Training Authority (government skills bodies)
- NPO/PBO = Non-Profit Organisation / Public Benefit Organisation
- ICITP = Institute of Chartered IT Professionals (accreditation body)
- FET = Further Education and Training (high school level)
