# d-lab Grant Engine v14

AI-powered grant pipeline management for d-lab NPC.

## Project Structure

```
dlab-grants/
├── index.html                          # Vite entry
├── package.json
├── vite.config.js
├── .gitignore
│
├── src/
│   ├── main.jsx                        # React mount point
│   ├── App.jsx                         # Main app (2400 lines — split further below)
│   ├── theme.js                        # Design tokens (C, FONT, MONO)
│   ├── utils.js                        # Pure utility functions
│   ├── api.js                          # Anthropic API + persistent storage
│   ├── prompts.js                      # All AI prompt templates (reference — not yet wired in)
│   │
│   ├── data/
│   │   ├── context.js                  # CTX + CTX_SLIM (org context fed to prompts)
│   │   ├── funderStrategy.js           # Funder hooks, angles, programme matching
│   │   ├── constants.js                # STAGES, TEAM, DOCS, GATES, PERSONAS, etc.
│   │   ├── conferences.js              # Conference calendar
│   │   └── seed.js                     # Initial pipeline data (23 grants, R32M)
│   │
│   ├── components/
│   │   └── index.jsx                   # Shared UI: Btn, Tag, Avatar, AICard, CalendarStrip, etc.
│   │
│   └── grant-engine.monolith.jsx       # Original single-file (working reference)
│
└── scripts/
    └── build-standalone.js             # Compile to single HTML for demos
```

## Getting Started

```bash
npm install
npm run dev          # Vite dev server on :3000
```

## How It Works

- **Pipeline**: 23 grants across 7 stages (Scouted → Won/Lost)
- **AI Tools**: Draft proposals, research funders, scout opportunities, write follow-ups — all via Claude API
- **Storage**: Uses `window.storage` (Claude artifacts persistent storage) for data persistence
- **Prompts**: All AI prompts are engineered with role definitions, anti-patterns, token budgets (800–4096)

## Key Architecture Decisions

| Decision | Rationale |
|---|---|
| Single App.jsx for now | Views are tightly coupled to shared state; splitting too early adds prop-drilling overhead |
| Prompts in prompts.js | Easy to tune independently; not yet wired into App (inline prompts still work) |
| `window.storage` | Built for Claude artifacts; swap to localStorage/Supabase for standalone deployment |
| No router | Single-page with `view` state toggle; add react-router when needed |

## Next Steps (in Claude Code)

### Phase 1: Wire up prompt imports
The prompts.js file has all prompts as clean functions returning `{ system, user, maxTok, search }` objects. Currently App.jsx still has inline prompts. Wire the imports:
```js
import { draftPrompt, intelPrompt, scoutPrompt } from "./prompts";
// Then in aiDraft: const p = draftPrompt({ g, fs, relNote }); const r = await api(p.system, p.user, p.search, p.maxTok);
```

### Phase 2: Split App.jsx into views
```
src/views/
  DashboardView.jsx      (~250 lines)
  PipelineView.jsx       (~500 lines)
  GrantDetailView.jsx    (~400 lines)
  DocumentsView.jsx      (~120 lines)
  ToolsView.jsx          (~200 lines)
  Modals.jsx             (~100 lines)
```
Each view receives `{ grants, setGrants, sel, setSel, ... }` as props or via context.

### Phase 3: State management
Move from prop-drilling to React Context or Zustand:
```js
// src/store.js
export const useGrantStore = create((set) => ({
  grants: [],
  setGrants: (fn) => set(s => ({ grants: typeof fn === 'function' ? fn(s.grants) : fn })),
  ...
}));
```

### Phase 4: Replace window.storage
For standalone deployment, swap `sG`/`sS` in api.js to localStorage, Supabase, or any backend.

## Storage Keys
| Key | Data | Current |
|---|---|---|
| `dlg12` | Grants array | 23 grants |
| `dlc12` | Conferences | 12 events |
| `dll12` | Learning log | Empty |
| `dla12` | Approvals | Empty |
| `dlo12` | Org documents | Empty |

Bump the number suffix to force a fresh data load from seed.

## Token Budgets
| Prompt | Tokens | Purpose |
|---|---|---|
| URL extract | 800 | JSON extraction from URLs |
| Review (agent) | 800 | Stage gate decisions |
| Brief | 1000 | Daily action list |
| Follow-up | 1500 | Email drafts |
| Draft | 2000 | Funding proposals |
| Report | 2000 | Quarterly impact reports |
| Conf search | 2000 | Speaking opportunity discovery |
| Intel | 2500 | Funder research briefs |
| Scout | 2500 | Pipeline expansion (JSON) |
| Conf apply | 2500 | Conference applications |
| Full application | 4096 | Complete grant submissions |
