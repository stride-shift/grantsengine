# Grant Engine — Codebase Cleanup Working Document

> **Status:** Living plan, executing phase by phase. · **Owner:** Johannes (D-Lab)
> **Last updated:** 2026-06-19 · **Suite:** 186 tests green, build passing. History tracked on branch `johannes-plumbing` (Phases 0–4.6e committed + pushed to `stride-shift/grantsengine`).

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

**Move-only vs. parameterized splits — the net must scale to the risk (added 2026-06-18):**
The leaf lifts (4.5c/e/g) were *move-only*: already-pure code relocated verbatim, so a DOM snapshot that
**matches** is near-total proof. The next tier — **stateful-body extraction** — is NOT move-only: pulling a
body out means converting every closed-over variable (`g`, `onUpdate`, local `useState`, derived/memoized
values) into an explicit **prop**. A static DOM snapshot guards *output shape* but **cannot** see the new
failure modes that transformation introduces: a missed/stale prop, an effect firing at a different time, or a
changed child **identity** that makes React remount the subtree and wipe its local state (the `SectionWrap`
hazard, generalized). **Rule:** before extracting any stateful body, *first* add **targeted interaction tests**
that exercise the handlers that body owns (toggles, edits, the callbacks it fires) — commit them with the
snapshot net, against the un-split code — so the net guards *behaviour*, not just HTML. Snapshot-only is
sufficient for move-only; behaviour tests are mandatory for parameterized.

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
| 4.5f | **3rd component net (the big one):** `GrantDetail.render.test.jsx` — 3 golden-master DOM snapshots (early/scouted, middle/drafting, closed/won) + interaction test (back-control → `onBack`). Mocks `../api` (`getUploads`/`kvGet`/`kvSet` fire in mount effects), stubs the heavy stateful children (`ProposalWorkspace`/`BudgetBuilder`/`AutoFillPanel`/`UploadZone`), clock pinned. The 3s auto-brief `setTimeout` never fires in a sync test (we fake only `Date`); `_pendingAI` left unset. Recorded against UN-split GrantDetail. | render | 169→174 | `test: characterize GrantDetail render (render net)` |
| 4.5g | **3rd netted split (move-only):** lifted the 4 pure leaves (`Card`,`Hd`,`Field`,`ActivityRow`) → new `components/GrantDetailParts.jsx` (59 ln); **GrantDetail.jsx 3092→3047**. `SectionWrap` deliberately kept in-file (needs a stable module identity, or React remounts its children & wipes their state). No imports orphaned (`C`/`FONT`/`MONO` still used throughout). All 3 snapshots **matched** → behaviour-neutral. | render (held) | 174 | `refactor: extract GrantDetail presentational leaves to GrantDetailParts` |
| 4.6a | **Net strengthening (Phase 4.6 step 2):** added 2 scroll-anchor interaction tests to `GrantDetail.render.test.jsx` — the context-sidebar "Jump to" anchor and the status-strip readiness button each resolve a `data-tour` target and call `scrollIntoView` (stubbed; jsdom has no layout). Behaviour-survival guard for the next split. Recorded against UN-split bodies. | render | 174→176 | `test: strengthen GrantDetail net with scroll-anchor handler tests` |
| 4.6b | **Selective stateful-body extraction (step 3):** lifted 3 presentational BODIES → `GrantDetailParts.jsx` (`ContextSidebar`/`StatusStrip`/`StageBanner`, now 270 ln); **GrantDetail.jsx 3047→2852**. All own *no local state, no parent-mutating handler, no stateful children* — every free var became an explicit prop (`g`/`team`/`stg`/`stages`/`complianceDocs`); only behaviour is self-contained `scrollIntoView`. Module-scoped (stable identity). Snapshots **matched** + scroll tests green → behaviour-neutral. Engagement-mode body (closes over `onUpdate`) **parked** for a dedicated stateful wave. | render+interaction (held) | 176 | `refactor: extract GrantDetail context sidebar / status strip / stage banner` |
| 4.6c | **Net strengthening (Dashboard, step 2):** added 3 Funder Intelligence interaction tests to `Dashboard.render.test.jsx` — expand-toggle (`setExpandedFunder`), show-all toggle (`setShowFullIntel`), and grant-row select with `stopPropagation` (`onSelectGrant`). Disambiguated repeated funder-name text by DOM order (`.at(-1)`). Recorded against UN-split Dashboard. | render | 176→179 | `test: strengthen Dashboard net with Funder Intelligence interaction tests` |
| 4.6d | **Selective stateful-body extraction (step 3):** lifted the ~230-line Funder Intelligence cards body → `FunderIntelCards` in `DashboardParts.jsx` (147→398 ln); **Dashboard.jsx 1115→885**. Its two UI state vars (`expandedFunder`/`showFullIntel`) were used *only* in this block, so they moved with it; module-scoped → stable identity → state survives. Props-only interface (`funders`/`stages`/`onSelectGrant`). `REL_COLORS` promoted to a shared export. Snapshots **matched** + interaction tests green → behaviour-neutral. AI-Tools/Insights/Strategy bodies (share `*Busy`/`*Result` state + `runAI`) **parked** (tangled). | render+interaction (held) | 179 | `refactor: extract Dashboard Funder Intelligence cards to DashboardParts` |
| 4.6e | **Net strengthening (Pipeline, step 2):** added 7 add-grant-wizard interaction tests + an open-wizard snapshot to `Pipeline.render.test.jsx` — open/close, 3-step nav, the create-grant payload (`onAddGrant`), the auto-AI select path (`onSelectGrant`), and the pre-existing quirk that `newName`/`newFunder` survive `resetWizard`. The persist-across-+Add-toggle test **locks the extraction shape**. The net caught a wrong assumption of mine (intuitive "Cancel clears all fields" — it doesn't) → recorded real behaviour, not the fix. Recorded against UN-split Pipeline. | render | 179→186 | `test: strengthen Pipeline net with Add Grant wizard interaction tests` |
| 4.6f | **Selective stateful-body extraction (step 3):** lifted the ~390-line 3-step add-grant wizard (its JSX + 18 form-state hooks + `resetWizard`/`addGrantEnhanced`) → new `components/AddGrantWizard.jsx`; **Pipeline.jsx 1423→961** (−462, the biggest single split yet). Wizard state was never read by the rest of Pipeline (filters/views/batch don't touch it) → behaviour-neutral move. Shape: rendered **unconditionally** with an `open` prop (early-returns null when closed) so a half-filled form survives a +Add toggle exactly as before; `onClose` replaces parent `setShowAdd(false)`. Wizard-only consts `COMMON_FOCUS`/`GRANT_SOURCES` moved with it; now-unused imports (`calcTotalAsk`/`buildPtypeNotes`/`uploadFile`/`PTYPES`) dropped from Pipeline. Open-wizard snapshot **matched** + all 13 tests green → behaviour-neutral. | render+interaction (held) | 186 | `refactor: extract Add Grant wizard to AddGrantWizard.jsx` |

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
**Done:** ✅ harness (4.5a) · ✅ Dashboard net + primitive split → `DashboardParts.jsx` (4.5b/c) · ✅ Pipeline net + kanban-leaf split → `PipelineParts.jsx` (4.5d/e) · ✅ GrantDetail net + leaf split → `GrantDetailParts.jsx` (4.5f/g). The full loop *net → split → snapshots still match* is proven on **three** god components — including the largest (GrantDetail, 3092).

**Established pattern (reuse for every target):**
1. Profile the component's mount surface (props, top-level hooks, mount-time I/O, riskiest handlers) — an Explore agent is good here.
2. Write the net against the **un-split** component: a `*.render.test.jsx` with golden-master DOM snapshot(s) for representative states + a few interaction/assert tests on the riskiest handlers. **Pin the clock** (`vi.useFakeTimers({toFake:['Date']})`) for any date-relative rendering, mock `../api`/`useAI` as needed. Commit the net on its own.
3. Split move-only behind the net; confirm snapshots **match** (not rewrite). Trim only the imports *that split* orphaned. Commit the split on its own.
4. **Verify by line-number Python edits with boundary asserts, not 100-line Edit matches** — the 4.5c slice bug (accidentally dropped the `CLOSED`/`PRE_SUB` consts that sat just above the moved block) was caught instantly by the net, but assert the lines above *and* below the block before slicing.

**▶ NEXT — fan out, one component per wave, verify between:**
- ✅ ~~Pipeline (1468)~~ — netted + leaf split (4.5d/e) **+ add-grant-wizard body split (4.6e/f)**; now **961**. The ~390-line 3-step wizard is lifted to `AddGrantWizard.jsx` (its state was fully isolated → clean move). Remaining bodies (batch toolbar, the three view renders) close over `selectedIds`/`dragId`/`pSort` — a later coupled wave if pursued; the URL-extract tool also closes over async state. Cherry-pick only behind mutation interaction tests.
- ✅ ~~GrantDetail (3092)~~ — netted + leaf split (4.5f/g) **+ selective body split (4.6a/b)**; now **2852**. The strangler net is live (`GrantDetail.render.test.jsx`, 3 stage snapshots + child stubs + 2 scroll-anchor interaction tests). Pure leaves AND the three clean presentational bodies (context sidebar / status strip / stage banner) are lifted to `GrantDetailParts`. **Still the largest remaining file.** Remaining lifts behind the net are the `onUpdate`-coupled bodies (engagement-mode / clone-cycle IIFEs) — a careful stateful wave with `onUpdate`-mutation interaction tests, or park per "selective."
- **Deeper Dashboard** — `DashboardParts` was the cheap primitive lift; the section bodies (AI Tools, Funder Intelligence, Pipeline Intelligence) close over state, so extracting them threads props — netted now, do as a later wave.

**Checkpoint reached 2026-06-19 (Phase 4.6 COMPLETE):** all three god components have a render net + leaf split + their clean stateful-body tier extracted (**4.6a–f: GrantDetail 3047→2852, Dashboard 1115→885, Pipeline 1423→961**) per the owner's "finish 4.6 with the decoupling, then docs." Each file's standout self-contained body is lifted; the `onUpdate`-/busy-state-/selection-coupled bodies are deliberately parked (higher-risk optional tail — only attempt with the relevant mutation interaction tests added to the net first). **Next per owner: Phase 6 docs.**

**Strangler fallback (for components too coupled to render whole):** extract already-pure, props-only leaf JSX into own files (those render-test in isolation), shrinking the monster without netting the whole coupled body. Note any component that takes this path and why.
**Risk:** MED but *netted* — that is the whole point.

### Phase 4.6 — Selective stateful-body extraction  *(owner-decided 2026-06-18; NEXT to execute)*
**Owner decision (verbatim intent):** *"Selective, then docs."* Extract **only** the stateful bodies that
parameterize cleanly into props; **stop at any that tangle state/identity and park them** — do NOT
systematically dismantle every body (that edges into "reimagining," which the north star forbids). Biggest
respectability win for least risk, then pivot to Phase 6. This is the first tier of work that is **not
behaviour-verbatim**, so it is held to the stronger net (see §3 "Move-only vs. parameterized splits").

**Per-target protocol (do this for each body, one at a time, verify between):**
1. **Profile** the body: what state/props/callbacks it closes over (an Explore agent is good for the big files).
   If it can't be made props-only without dragging half the parent's state with it → **park it, note why, move on.**
2. **Strengthen the net FIRST:** add targeted **interaction tests** for the handlers that body owns (not just a
   snapshot) against the **un-split** component. Commit the net alone.
3. **Extract** the body into a props-only sub-component; thread the closed-over vars in as explicit props.
   Watch child **identity** (define at module scope or stable ref — never inline in render — or React remounts
   it and wipes local state). Confirm snapshots **match** AND interaction tests stay green. Commit alone.
4. If anything about behaviour is ambiguous, **preserve it exactly and park the logic question** (north star).

**Candidate bodies (start with the cleanest, props-only-ish; the rest may park):**
- *GrantDetail:* ✅ **DONE (4.6a/b)** — the fixed status strip, context sidebar, and stage banner were the
  three cleanest (props-only, no state, no `onUpdate`, only self-contained `scrollIntoView`); lifted to
  `GrantDetailParts` behind a strengthened net (3047→2852). **Parked:** the **engagement-mode** IIFE (L~598)
  and the **clone-cycle** IIFE both close over `onUpdate` + non-deterministic `Math.random()`/`new Date()` —
  genuinely stateful, need a dedicated wave (strengthen net with `onUpdate`-mutation interaction tests first,
  watch the activity-log write). **Submit modal** closes over lots of state → likely park.
- *Dashboard (1115→885):* ✅ **DONE (4.6c/d)** — the **Funder Intelligence cards** (~230 ln, self-contained,
  state used only in-block) lifted to `FunderIntelCards` behind a strengthened net. **Parked:** the **AI Tools**
  section + the bottom **Insights/Strategy** AIBlocks all share the `reportBusy`/`insightsBusy`/`strategyBusy`
  + `*Result` state and the `runAI` helper → extracting tangles half the remaining Dashboard state (park per
  "selective"). The Pipeline-summary / In-Play / Timeline / Follow-up rows are pure-ish reads of `pipe`/`ana`
  but many-small + medium-coupled → diminishing value-per-risk; left in place.
- *Pipeline (1423→961):* ✅ **DONE (4.6e/f)** — the **3-step add-grant wizard** (~390 ln, fully state-isolated)
  was the one standout self-contained body; lifted to `AddGrantWizard.jsx`. Remaining bodies (the three view
  renders + batch toolbar + URL-extract tool) close over `selectedIds`/`dragId`/`pSort`/async state → **parked**
  (coupled tier).

**Phase 4.6 progress (2026-06-19):** all three god components' clean stateful-body tiers are now extracted
(4.6a–f: GrantDetail 3047→2852, Dashboard 1115→885, **Pipeline 1423→961**). Each god file's standout
self-contained body is lifted; what remains everywhere is `onUpdate`-/busy-state-/selection-coupled (parked).
Per the owner's "finish 4.6 with the decoupling, **then docs**," **Phase 4.6 is complete** — the selective wave
has reached its clean stopping point. **Next: Phase 6 docs.** The coupled bodies (GrantDetail
engagement-mode/clone-cycle, Dashboard AI-tools) are the higher-risk optional tail.

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
