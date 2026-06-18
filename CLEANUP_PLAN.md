# Grant Engine — Codebase Cleanup Working Document

> **Status:** Living plan, executing phase by phase. · **Owner:** Johannes (D-Lab)
> **Last updated:** 2026-06-18 · **Suite:** 169 tests green, build passing. History now tracked on branch `johannes-plumbing` (Phases 0–4.5e committed + pushed to `stride-shift/grantsengine`).

---

## ⭐ THE GOAL (owner's words — do not drift from this)

> **Stick to the original vision as much as possible** — the owner does not know the app's
> functionality/purpose in detail and cannot adjudicate behaviour changes, so we **must not invent,
> redesign, or "improve" features**. The job is purely to **clean this up so it's respectable**:
> modular, readable, client-ready. **Move with purpose, don't dawdle, delegate where it helps, stop
> at meaningful checkpoints — and take no big risks that could introduce mistakes.** When in doubt,
> preserve behaviour exactly (move-only) and leave logic decisions parked for the owner. Respectable,
> not reimagined.

---

## 1. Core Principles (the discipline we hold constant)

- **Structure first, behaviour second — never in the same commit.** Every move in Phases 0–5 is
  *behaviour-preserving* ("move-only"). Logic changes are Phase 7+ and out of scope.
- **No refactor without a test net** (see §3). We pin behaviour *before* we move code, then re-run the
  net to prove nothing drifted. No net → the refactor is deferred, not done blind.
- **Adaptive by design.** This is a guide, not a contract. We re-plan at each phase boundary; the plan
  must never become its own bottleneck. The *principle* is fixed; the *phase list* may reshape.
- **Execution = wave-based sub-agents** (`./SUBAGENT_PLAYBOOK.org`): no two agents edit the same file in
  one wave; verify (test suite + build) between waves; broad import-rewrites go in the final wave.

---

## 2. Target Architecture (what we split *toward*)

**Headless / "humble component":**
- **Components** (`src/components/`) — render + wire events only. No business logic, fetch calls, or big inline data.
- **Hooks** (`src/hooks/`) — the logic layer; return `{ data, actions }`. No JSX, no inline prompt/data literals.
- **Utils** (`src/utils.js`) — pure functions. No React, no I/O. Trivially testable.
- **Data / prompts** (`src/data/`, `src/prompts/`) — static data + prompt builders, out of code.
- **Service layer** (`src/api.js`) — one module owning backend calls. *(Already coherent; see Changelog note.)*
- **Naming:** components `PascalCase.jsx`; hooks `useThing.js`; everything else `camelCase.js`.
  Folder layout is **function-based** (decided — repo is already ~90% this shape; no router, so feature folders = churn).

---

## 3. Testing Strategy — "Test Nets" (STANDING POLICY, owner-adopted 2026-06-18)

The whole cleanup rides on this: a *test net* captures what code does **now**, so a refactor can be
*proven* behaviour-preserving instead of merely hoped to be. **Pick the most impactful net per target**
— they overlap, so we use the cheapest one that reliably catches drift for that kind of code:

| Code being refactored | Net to use | Why it's the right fit |
|---|---|---|
| **Pure functions / helpers** (utils) | **Characterization unit tests** — `expect(input).toBe(output)` | Cheap, exact, reads like documentation. |
| **Deterministic large output** (prompt/data builders, big strings/objects) | **Golden-master snapshot** — `toMatchSnapshot()` | Auto-captures the whole output; screams on a 1-char drift. No hand-written assertions. |
| **Component render trees** (the god components) | **Render test** (`@testing-library/react` + `jsdom`): a DOM **snapshot** as the broad net + a few **targeted interaction** characterization tests on the riskiest handlers | The snapshot pins the rendered HTML; the interaction tests pin click/toggle behaviour a snapshot can't see. This is the net we don't have yet. |

**Sequence rule:** build the net *first*, against the *un-refactored* code (that recording IS the golden
master), then refactor and confirm green. Net and refactor never share a commit.

**Lineage / vocabulary** (so the terms travel): *characterization tests* — Feathers, *Working Effectively
with Legacy Code*; *golden master / approval testing* — Falco; *snapshot testing* — Jest (2016).
Stack here: **Vitest** (runner, `npx vitest run`), **`@testing-library/react`** + **jsdom** (render tests).
Shorthand: *"do we have a net here?"* = can I safely refactor; *"pin it first"* = write the net before touching.

---

## 4. Progress Log (commit-ready changelog)

Each row = a logical commit. New files/line-deltas kept so a fresh context knows what exists.

| Phase | What shipped | Net | Suite | Suggested commit message |
|---|---|---|---|---|
| 0 | Asset triage (5 loose imgs → `archive/`, 3 wired → `src/assets/`); monolith + `build-standalone.js` → `archive/legacy-monolith/`; lightweight `CLAUDE.md` fact-fix | build | — | `chore: archive legacy monolith + loose assets, de-noise tree` |
| 1 | Re-baselined red suite as characterization tests; characterized `utils.js` (`utils.hygiene` 29, `utils.scoring` 9); unified the drifted `SCORE:/VERDICT:` regex → `parseFitScore` in utils (`utils.fitscore` 7), swapped 7 sites in 5 files | char + golden | 63→108 | `test: characterize utils + consolidate parseFitScore` |
| 2 | Locked function-based layout + conventions; created `src/prompts/`, reserved `src/services/` | — | — | `docs: lock target folder conventions` |
| 3 | `FUNDER_ANGLES` → `data/funderAngles.js`; `prompts.js` → `prompts/scout.js`; prompt primitives → `prompts/lib.js` (`promptsLib` 12); **golden-master snapshot net** (`useAI.prompts.snapshot` 18); then moved all ~17 inline prompt builders → `prompts/{draft,research,extraction,operations}.js` **byte-identical**. **`useAI.js` 1457→278** | golden master | 108→137 | `refactor: extract all AI prompts to src/prompts behind snapshot net` |
| 4A | 4 pure helpers → `utils.js` w/ tests (`extractAskFromDraft`,`fmtTs`,`calcTotalAsk`,`buildPtypeNotes`) | char | 137→153 | `refactor: lift pure helpers from GrantDetail/Pipeline to utils` |
| 4B | 3 leaf components out of `App.jsx` → `ErrorBoundary.jsx`, `GlobalSearch.jsx`, `HelpButton.jsx` | build | 153 | `refactor: extract leaf components from App.jsx` |
| 4C | `App.jsx` hygiene side-effect → `hooks/useHygiene.js` (byte-identical body, TDZ-safe). **App.jsx 1306→831** | build | 153 | `refactor: extract hygiene effect to useHygiene hook` |
| 4D | `OutstandingActions` → own file (**GrantDetail 3235→3092**); AutoFillPanel's 4 trailing sub-components → `AutoFillPanelParts.jsx` byte-identical (**1553→980**) | build | 153 | `refactor: extract leaf components from GrantDetail/AutoFillPanel` |
| 5 | Dedup recon (Explore); consolidated the 2 equivalent `fmtR` formatters → `utils.js` (`utils.format` 3), swapped both sites | char | 153→156 | `refactor: consolidate fmtR money formatter into utils` |
| 4.5a | **Stood up the render net.** Added dev deps `@testing-library/react`+`jest-dom`+`jsdom`; new `vitest.config.js` (jsdom env, globals, setup) + `src/__tests__/setup.js` (jest-dom matchers) + `renderNet.smoke.test.jsx`. Vite build reads no config → untouched. | render | 156→157 | `test: stand up render-net harness (jsdom + @testing-library/react)` |
| 4.5b | **First component net:** `Dashboard.render.test.jsx` — 2 golden-master DOM snapshots (empty + populated) + 3 interaction/assert tests, clock pinned via `vi.useFakeTimers({toFake:['Date']})` for determinism. Recorded against UN-split Dashboard. | render | 157→163 | `test: characterize Dashboard render + interactions (render net)` |
| 4.5c | **First netted split (move-only):** lifted 8 presentational primitives (`Bar`,`Spark`,`Hd`,`Section`,`Card`,`Stat`,`HRow`,`AIBlock`) → new `components/DashboardParts.jsx` (147 ln); **Dashboard.jsx 1254→1115**; trimmed 2 now-orphaned imports (`Btn`,`CopyBtn`). Snapshots **matched** (DOM identical) → behaviour-neutral. | render (held) | 163 | `refactor: extract Dashboard presentational primitives to DashboardParts` |
| 4.5d | **2nd component net:** `Pipeline.render.test.jsx` — 3 golden-master DOM snapshots (no-grants, list, Board) + interaction tests (zero-grants branch, kanban card → `onSelectGrant`). Mocks `../api`, stubs `ScoutPanel`, clock pinned. Recorded against UN-split Pipeline. **Characterized a parked bug:** `GateIndicator`'s `?.level \|\| 99` makes the level-0 `comms` gate always read "needed". | render | 163→169 | `test: characterize Pipeline render + interactions (render net)` |
| 4.5e | **2nd netted split (move-only):** lifted the 2 pure kanban-card leaves (`ReadinessChips`,`GateIndicator` + private `STAGE_ORDER`) → new `components/PipelineParts.jsx` (52 ln); **Pipeline.jsx 1468→1423**; trimmed now-orphaned `GATES`/`ROLES` import. Board snapshot **matched** → behaviour-neutral. | render (held) | 169 | `refactor: extract Pipeline kanban leaf components to PipelineParts` |

**Phase-5 recon finding (locks future dedup):** the once-suspected "recurring primitives"
(`Field`/`Stat`/`Bar`/`MiniDonut`/`ReadinessChips`/`GateIndicator`) are each **single-file — not duplicated**.
The only real cross-file duplicates are `Card` (4 sites), `Hd` (2), `Spark` vs `Sparkline` — **all DRIFTED**
(different padding/spacing/stroke per context), so merging them is a *visual* change → needs the render net (Phase 4.5).

**`api.js` assessed, split NOT taken:** it's already a clean, domain-sectioned ~611-line service module.
Splitting into `services/*` = broad import-rewrite of every call site for little gain. Parked unless owner wants it.

---

## 5. Remaining Plan

### Phase 4.5 — Render-Test Net  *(harness + first netted split DONE 2026-06-18; now fanning out)*
**Goal:** the render net (§3 row 3) is now live and proven, so god-component splits are provably safe.
**Done:** ✅ harness (4.5a) · ✅ Dashboard net + primitive split → `DashboardParts.jsx` (4.5b/c) · ✅ Pipeline net + kanban-leaf split → `PipelineParts.jsx` (4.5d/e). The full loop *net → split → snapshots still match* is proven on two god components.

**Established pattern (reuse for every target):**
1. Profile the component's mount surface (props, top-level hooks, mount-time I/O, riskiest handlers) — an Explore agent is good here.
2. Write the net against the **un-split** component: a `*.render.test.jsx` with golden-master DOM snapshot(s) for representative states + a few interaction/assert tests on the riskiest handlers. **Pin the clock** (`vi.useFakeTimers({toFake:['Date']})`) for any date-relative rendering, mock `../api`/`useAI` as needed. Commit the net on its own.
3. Split move-only behind the net; confirm snapshots **match** (not rewrite). Trim only the imports *that split* orphaned. Commit the split on its own.
4. **Verify by line-number Python edits with boundary asserts, not 100-line Edit matches** — the 4.5c slice bug (accidentally dropped the `CLOSED`/`PRE_SUB` consts that sat just above the moved block) was caught instantly by the net, but assert the lines above *and* below the block before slicing.

**▶ NEXT — fan out, one component per wave, verify between:**
- ✅ ~~Pipeline (1468)~~ — netted + leaf split done (4.5d/e); now 1423. Deeper Pipeline bodies (the add-grant wizard, batch toolbar, the three view renders) close over state — later wave if pursued.
- **GrantDetail (3092)** — ▶ the big one, do next. Most coupled; expect the strangler fallback (net what renders cleanly, lift already-pure props-only leaf JSX). Profile its mount surface first (an Explore agent) — it imports `../api`/`useAI`-style deps, so identify what to mock before writing the net.
- **Deeper Dashboard** — `DashboardParts` was the cheap primitive lift; the section bodies (AI Tools, Funder Intelligence, Pipeline Intelligence) close over state, so extracting them threads props — netted now, do as a later wave.

**Strangler fallback (for components too coupled to render whole):** extract already-pure, props-only leaf JSX into own files (those render-test in isolation), shrinking the monster without netting the whole coupled body. Note any component that takes this path and why.
**Risk:** MED but *netted* — that is the whole point.

### Phase 6 — Integrate the `.org` Doc System + proper `CLAUDE.md` rewrite
Do this **after** the god files are split (modules stable). Generating `quick_reference.org` / `README.org` earlier
= documenting a structure we're about to demolish. Includes the full `CLAUDE.md` rewrite (Phase 0 only did a
lightweight fact-fix) and fixing `README.md`'s stale file-tree diagram.

### Phase 7+ — Logic Work (OUT OF SCOPE; parked)
See §7. Includes the two suspected bugs found during cleanup — **do not fix mid-structural-work.**

---

## 6. Open Decisions
- **D1 — Safety net:** ✅ tests-first (characterization + golden master + render). TypeScript parked as a Phase 7+ multiplier.
- **D2 — Folder structure:** ✅ function-based (see §2).
- **D3 — Archive vs delete:** ✅ archive first (reversible); delete only once confirmed unreferenced.

---

## 7. Parking Lot (explicitly NOT now)
- Downstream Supabase secret rotation + audit-log review (needs dashboard owner).
- Multi-tenant / d-lab decoupling; AI cost controls, retry coverage, JSON-mode for search prompts.
- Remaining a11y mediums beyond what the creator shipped; TypeScript migration.
- `api.js` → `services/*` split (assessed, low value-per-risk — only if owner wants it).

### Suspected logic bugs found during cleanup (Phase 7 — pinned by tests, do NOT fix now)
- **`funderStrategy` type→structure mapping is dead for unknown funders** (`funderStrategy.js` ~L188):
  `funderHasFullStructure` treats any `sections` list containing `"budget"` as a full structure, but the generic
  default sections already contain `"Budget"`, so the `structures` table is never consulted for funders without
  hand-written intel. The `|| includes("budget")` clause looks accidental. *Pinned by characterization tests in
  `funderStrategy.test.js` (marked CURRENTLY…).*
- **`addD(date, n)` is timezone-sensitive** (`utils.js` ~L297): `new Date("YYYY-MM-DD")` parses as UTC midnight but
  `.setDate()` reads/writes local time → can land a day off behind UTC. Used for follow-up cadence dates.
  Deliberately untested (a TZ assertion would be flaky). Fix via UTC methods in Phase 7, then pin.
