# CLAUDE.md — Project Context for Claude Code

## What This Is
d-lab Grant Engine v14 — a React app for managing a grant funding pipeline for d-lab NPC, a South African youth skills NPO. It uses the Anthropic Claude API for AI-powered proposal drafting, funder research, grant scouting, and pipeline intelligence.

## Organisation Context
d-lab NPC (The Field Lab NPC) trains unemployed South African youth in AI-native digital skills. Key stats: 92% completion rate (vs 55% sector average), 85% employment within 3 months, 7 programme types from R199K to R5M. See `src/data/context.js` for the full organisational profile used in AI prompts.

## Tech Stack
- React 18 (no TypeScript yet)
- Vite for dev/build
- Anthropic Claude API (`claude-sonnet-4-20250514`) — called directly from browser
- `window.storage` for persistence (Claude artifacts API; swap to localStorage for standalone)
- No CSS framework — all inline styles using design tokens from `src/theme.js`
- No router — `view` state toggles between Dashboard / Pipeline / Detail / Docs / Tools

## Architecture
- `App.jsx` (~2400 lines) contains all views and AI functions — this is the main file to work in
- `src/data/` has all static data, org context, funder strategy, seed grants
- `src/components/` has shared UI primitives (Btn, Tag, Avatar, CalendarStrip, etc.)
- `src/prompts.js` has all AI prompts as exportable functions (not yet wired into App — App still has inline prompts)
- `grant-engine.monolith.jsx` is the original single-file version that runs in Claude artifacts — keep it as a working reference

## Key Patterns
- State helpers: `sB("key", true/false)` for busy state, `sA("key", value)` for AI results
- Grant mutations: `up(id, { field: value })` updates a grant, `addL(id, "text")` adds to activity log  
- Fit score: calculated from win/loss factors in `g.on` (comma-separated string)
- Funder strategy: `funderStrategy(grant)` returns `{ lead, hook, lang, structure, budgetEmphasis }` per funder type
- Programme detection: `detectType(grant)` maps grant notes to one of 7 programme types with exact budgets

## AI Prompt Engineering
All prompts follow these principles:
- Clear role definition ("You are a funder intelligence analyst...")
- Anti-patterns list (no "SA has X% unemployment" openers, no hollow phrases)
- Structured output (numbered sections, JSON for scout)
- Funder-specific context (returning vs new, type-matched register)
- Token budgets calibrated to output complexity (800 for extraction → 4096 for full applications)

## Data Flow
1. On load: `window.storage.get("dlg12")` → grants array (falls back to SEED)
2. Any mutation: `setGrants(...)` → `useEffect` → `window.storage.set("dlg12", grants)`
3. AI calls: `api(system, user, search, maxTokens)` → Anthropic API → rendered in UI
4. Scout results: JSON array → parsed → shown as cards with "+ Add" buttons → `setGrants(prev => [...prev, newGrant])`

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
