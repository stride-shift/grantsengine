# d-lab Grant Engine — Evaluation & Reconciliation Report

> **Reconciled 2026-06-19.** This began as a 25-agent evaluation (7 dimensions, 55 confirmed
> findings). It has since been **re-validated against the current code** by a 6-dimension read-only
> verification pass plus direct spot-checks. The original report predates **(a)** a security/correctness
> hardening pass (≈Jun 17 — e.g. `server/lib/ssrfGuard.js`, `requireDirector`, the gcal/`refProposals`
> fixes) and **(b)** the Phases 0–6 structural cleanup (which shifted every line number and moved code into
> new files). **The bulk of the original report is therefore resolved.** This document now leads with the
> *verified current state*; the original findings are preserved with per-item status in §4. The full
> original prose is recoverable from git history (pre-`johannes-plumbing` reconciliation commit).

---

## 1. Reconciliation Summary (2026-06-19)

Of 55 original findings: **the 1 Critical and all 8 High findings are resolved** (Critical remediated
*in-repo*; live-side residual noted), and most Medium/Low findings are fixed. A small, well-bounded set
remains live — catalogued as the punch-list in §2.

| Original severity tier | Count | Now resolved | Still live | Needs live env to confirm |
|---|---|---|---|---|
| Critical | 1 | 1 (in-repo) | 0 in-repo · 1 live-side (token rotation) | 1 |
| High | 8 | 8 | 0 | 0 |
| Medium / Low | 46 | ~36 | ~8 | ~2 |

**Why so much changed:** `server/lib/ssrfGuard.js` is dated Jun 17 — *before* this cleanup effort and
*outside* its move-only scope. A prior security/correctness hardening pass (creator or earlier session)
fixed the Critical and every High; the structural cleanup then moved code and renamed files. The 25-agent
report describes a state that no longer exists.

---

## 2. What Remains LIVE — Current Punch-List

The remaining work splits two ways (the "plumber vs. pioneer" axis): **Track A** = defects against the
code's own evident intent — unambiguous, netted, mostly verifiable here. **Track B** = behaviour/intent or
infrastructure decisions only the owner/creator can make — recorded as questions, never silently resolved
(per the north star). A third axis cuts across both: items needing the **live environment** (API keys,
Supabase dashboard) can be fixed + unit-netted here but only *confirmed* by the owner.

### Track A — Plumber-grade (fix to evident intent; pin with a test first)

| # | Item | Current location | Note / fix | Verifiable here? |
|---|------|------------------|-----------|------------------|
| A1 | **Broken scout import — crashes nightly scout on import** | `server/jobs/scout.js:9` imports `{ scoutPrompt }` from `'../../src/prompts.js'` (gone; now `src/prompts/scout.js`) | Update path to `'../../src/prompts/scout.js'`. *Owner confirms whether server should depend on a `src/` module at all.* | Yes (import resolves) |
| A2 | Dashboard cards + section headers are clickable `<div>`s, not keyboard-operable | `src/components/Dashboard.jsx:356`; `DashboardParts.jsx:60` | Add `role="button"` / `tabIndex=0` / `onKeyDown`, or use a `<button>` | Yes (render test) |
| A3 | Add-grant wizard inputs are placeholder-only (no associated label) | `src/components/AddGrantWizard.jsx:121,123,157` | Add `aria-label`/`<label>` | Yes (render test) |
| A4 | `callClaude` ignores `stop_reason: "max_tokens"` → silent truncation surfaces as "0 usable" | `server/routes/ai.js:~241` | Detect `max_tokens` and warn/raise the token ceiling for the scraper | Yes (unit) |
| A5 | `addD(date, n)` timezone-sensitive (UTC-parse + local `setDate`) → follow-up dates off by a day | `src/utils.js:~297` | Switch to UTC methods, then pin with a test *(cleanup-surfaced; currently untested by design)* | Yes (unit) |
| A6 | `playwright-service/` has no own `.gitignore` | `playwright-service/` | Add a `.gitignore` (node_modules) — currently spared only by the root pattern | Yes |
| A7 | Multi-file upload shows no N-of-M progress counter | `src/components/Pipeline.jsx:~337` | Surface an N-of-M counter (Score-All already has one) | Yes (render test) |
| A8 | `package-lock.json` may be out of sync with `package.json` | repo root | **Owner runs** `npm install` then verifies `npm ci` / `npm audit` — not checkable here | No (needs npm) |

### Track B — Owner/Creator decisions (behaviour, intent, or infra — parked as questions)

| # | Question | Location | Why it needs the owner |
|---|----------|----------|------------------------|
| B1 | Should the nightly scout's **funder-level dedupe** suppress *returning-funder* opportunities? It currently blocks every future opportunity from any funder already in a non-closed stage — including the renewals the org most cares about (GIDF is a returning funder). | `server/jobs/scout.js:~170` | Looks like a bug given the domain, but the fix changes scout *behaviour* — owner adjudicates |
| B2 | Deadline reminders are permanently dropped if a 30-min cron run misses the narrow window. Add a catch-up / wider window? | `server/jobs/deadlineReminders.js:~36` | Reliability *design* change |
| B3 | Search-grounded prompts demand strict JSON but the OpenAI Responses API path can't enable JSON mode; a stray bracket → scout silently logs "no results". | `server/routes/ai.js:71-101`; `src/prompts/research.js` | Design/cost call (fall back to Chat Completions? lenient parse?) |
| B4 | Scraper interpolates raw page text + funder names into prompts verbatim (prompt-injection surface; rated Low, mitigated by guardrails). | `server/scraper/scrapeGrants.js:365,389` | Hardening decision (fence/escape injected fields) |
| B5 | Postgres TLS uses `rejectUnauthorized:false` (encrypted but unverified). | `server/db.js:37` | Needs the Supabase CA cert wired — infra/keys (owner) |
| B6 | Public `calendar.ics` feed (anyone with the org slug sees the whole pipeline). | `server/routes/data.js:318` | **Documented intentional** ("used by external calendar apps") — confirm & close, or gate it |
| B7 | Seeded default org password `dlab2026` is weak/predictable (no longer logged at startup). | `server/seed-fn.js:70` | Seed-credential policy — owner decides |
| B8 | `funderStrategy` type→structure mapping is dead for unknown funders (`\|\| includes("budget")` clause looks accidental). | `src/data/funderStrategy.js:~188` | Behaviour call; *pinned by `funderStrategy.test.js` characterization tests* |
| B9 | **Supabase access-token rotation + audit-log review.** The once-leaked PAT must be revoked/rotated regardless of in-repo removal. | Supabase dashboard | Needs dashboard owner — the live-side half of the Critical finding |

---

## 3. Per-Dimension Current Status

| Dimension | Status | Detail |
|-----------|--------|--------|
| **Security** | Critical + 3 Highs fixed | Account-takeover, org-authz, SSRF, SVG-upload all fixed. Live: public ICS feed (B6, intentional), scraper prompt-injection (B4), TLS verify (B5), seed password (B7). Token rotation (B9) is owner. |
| **Backend correctness** | High fixed | gcal exclusive-end-date, base32hex IDs, manual-grant nudge fallback, scout cron time, vision `response.ok`, ICS/reminder SAST offset — all fixed. Live: scout import (A1), missed-cron drop (B2), funder dedupe (B1). |
| **Frontend correctness** | All fixed | Avatar fields, hygiene-snapshot accumulation, `isAIError` guards, AutoFill deps, scout glyphs, view-log deps — all resolved. |
| **AI / prompt eng.** | High fixed | `refProposals` fixed; server retry now via `fetchWithRetry`; "Google Search" language removed. Live: JSON-mode (B3), scraper injection (B4), `stop_reason` (A4). |
| **Deps / deploy** | High fixed | `.env.example`, deploy-config dedupe, `crons` array, dead `framer-motion`/`motion` removed, port consistency, `cross-env` + `engines` — all fixed. Live: lockfile (A8, owner-run), `playwright-service/.gitignore` (A6). |
| **UX / a11y** | High fixed | `C.t4` contrast, toast `role`/`aria-live`, dialog `role`/focus-trap/Esc, destructive-op confirms, decorative-glyph `aria-hidden` — all fixed. Live: clickable-div keyboard ops (A2), wizard labels (A3), batch feedback (A7). |
| **Architecture** | Resolved by cleanup | `useAI.js` 1457→278 (prompts extracted), monolith archived, `_DEAD_findApplyUrl_legacy` removed, hygiene → `useHygiene.js`, CLAUDE.md rewritten, 186 tests (vs "near-zero"). God-files reduced (GrantDetail still largest at 2852). |

---

## 4. Original 25-Agent Findings — Reconciled Status

Preserved for audit lineage. **STATUS** reflects the 2026-06-19 re-validation. Line numbers in the
"Original cite" column are pre-cleanup and mostly stale — see §2 for current locations of live items.

### Critical & High

| Severity | Dimension | Issue | Original cite | STATUS |
|----------|-----------|-------|---------------|--------|
| Critical | Security | Live Supabase PAT committed to git + history | `mcp.json:17` | **FIXED in-repo** (gitignored, absent, no history hit) · live rotation = B9 |
| High | Security | Unauthenticated account takeover | `auth.js:139-176` | **FIXED** (legacy endpoint removed; reset-token flow) |
| High | Security | Org settings writable by any member | `orgs.js:92,108,126,178` | **FIXED** (`requireDirector` on all writes) |
| High | Security | SSRF — arbitrary user-URL fetches | `playwright server.js`; `autofill.js`; `ai.js`; `orgs.js` | **FIXED** (`server/lib/ssrfGuard.js` → `assertSafeUrl`) |
| High | Backend | Google Calendar all-day sync broken | `gcal.js:111-126` | **FIXED** (`nextDay()` exclusive end) |
| High | AI/Prompt | `refProposals` ReferenceError kills ref injection | `useAI.js:234` | **FIXED** (`proposalLibraryCache.current.proposals`) |
| High | Deps/Deploy | `.env.example` wrong/missing vars | `.env.example:19-21` | **FIXED** (matches code) |
| High | Deps/Deploy | Three conflicting deploy configs | `vercel.json`,`railway.json`,`Procfile` | **FIXED** (only `vercel.json`; `crons` wired) |
| High | UX/A11y | `C.t4` ≈2.5:1 contrast | `theme.js:42` | **FIXED** (`#6B7280` ≈5.8:1) |

### Medium / Low — rollup

| Dimension | Resolved | Still live (→ §2 id) |
|-----------|----------|----------------------|
| Security | seeded-pw-not-logged (partial), SVG-upload (AND filter), token-in-query | ICS feed →B6, prompt-injection →B4, TLS verify →B5, seed pw →B7 |
| Backend | base32hex IDs, manual-grant nudge, scout cron time, vision `response.ok`, SAST offsets | missed-cron drop →B2, funder dedupe →B1, scout import →A1 |
| Frontend | avatar fields, hygiene snapshot, `isAIError` guards, AutoFill deps, scout glyphs, view-log deps | *(none)* |
| AI/Prompt | server retry, "Google Search" language, word-budget comment | JSON-mode →B3, scraper injection →B4, `stop_reason` →A4 |
| Deps/Deploy | dead deps, ports, start script, `engines`, crons | lockfile →A8, playwright `.gitignore` →A6 |
| UX/A11y | toasts, dialogs/focus, destructive confirms, aria-hidden glyphs | clickable divs →A2, wizard labels →A3, batch feedback →A7 |

---

## 5. Top Recommended Actions (current)

1. **Fix the scout import (A1).** One line; restores the nightly scout (currently crashes on import). Pin with an import/smoke test.
2. **Owner: rotate the Supabase token (B9)** and verify the lockfile (A8) in the live environment — the two things that genuinely need keys/dashboard.
3. **Clear the small a11y live set (A2/A3/A7)** behind the render net — contained, client-visible polish.
4. **Adjudicate the Track-B behaviour questions (B1–B4)** — especially the scout funder-dedupe (B1), which may be silently suppressing the renewals the org depends on.
5. **`callClaude` `stop_reason` (A4)** + `addD` UTC fix (A5) — small correctness fixes, each pinned by a unit test.
