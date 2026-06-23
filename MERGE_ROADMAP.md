# Merge Roadmap — `main` → `johannes-plumbing`

_Last updated: 2026-06-23. Author: Johannes (with Claude Code)._

**Goal:** bring all of `main`'s work onto `johannes-plumbing` so this branch is "in
line" with main, while keeping johannes-plumbing's genuinely-unique tooling.
**`main` must never be edited** — the merge happens on `johannes-plumbing`.

---

## 0. Context you'll want when you come back

Both branches split from the **same commit** `1fed9e8` (2026-06-18 14:19,
"Scraper sources, scout reconciliation...") and then did large, independent work:

| | `main` (Kiyasha) | `johannes-plumbing` (you) |
|---|---|---|
| Commits since split | 29 | 21 |
| Diff vs split | +12,462 / −4,942 (132 files) | +21,076 / −4,090 (90 files) |
| Theme | Extracted **hooks** from `App.jsx`; **email+password auth** overhaul; **security** patches; **components grouped into subfolders** | Extracted **presentational components** (`*Parts.jsx`); render/snapshot **tests**; `.org` **doc system**; components kept **flat** |

### The thing that makes this merge hard
Both sides refactored the **same god-components in incompatible ways**:
- `main` **moved** every component into domain subfolders
  (`src/components/grant/GrantDetail.jsx`, `dashboard/Dashboard.jsx`, `auth/Login.jsx`, …).
- `johannes-plumbing` kept them **flat** (`src/components/GrantDetail.jsx`) **and**
  split out `*Parts.jsx` helpers.

Git's rename-detection mostly pairs the moved files (so we get conflicts, not
duplicates), but your `*Parts.jsx` files land at flat paths with **broken imports**
to components that moved. So a raw `git merge` does **not** produce a building tree
on its own — it needs deliberate resolution + a build/test pass.

---

## 1. Repo health (RESOLVED 2026-06-23)

The local clone's `.git` object store was **corrupt** since 2026-06-18 — a swath of
objects (commits/trees/blobs) were missing, incl. the tree for `johannes-plumbing`
HEAD. This broke `git fetch`, `git status`, `git checkout`. **GitHub's copy was always healthy.**

- Fixed by re-cloning healthy and re-committing the on-disk work.
- **One commit (`ee3cfb5`, the seed-data/DEFERRED docs commit) was never pushed.**
  Its content lived only in the working tree; it was preserved and re-committed
  under a **new SHA** during repair. No work lost.
- Backups kept in the session scratchpad: `refbackup/`, `worktree-backup/`.

---

## 2. What to actually bring over (unique to johannes-plumbing)

Most of johannes-plumbing's **code** work is **superseded by main** (main redid the same
components more recently + has 36 tests to our 17). Only these are genuinely
main-doesn't-have-them **and** cleanly portable:

| Item | Portable? | Notes |
|---|---|---|
| `.claude/workflows/` (doc-sync, audit-macro, audit-micro, WORKFLOW_STUDY_GUIDE) | ✅ clean | main has none |
| `server/migrate-context.js` + `server/README.org` | ✅ clean | main lacks both |
| Module `quick_reference.org` files (hooks/, data/, prompts/, components/, server/*) | ✅ clean | main only has grant/ + pipeline/ |
| `src/prompts/` split into files | ⚠️ competes | main organizes prompts differently — decide later |
| Component refactors, `*Parts.jsx`, our 17 tests, flat layout | ❌ drop | superseded by main's newer refactor |

---

## 3. The 24 files that conflict on merge

**Code (14):** `src/App.jsx`, `src/hooks/useAI.js`, `src/data/funderStrategy.js`,
`src/__tests__/utils.test.js`, `src/components/auth/Login.jsx`,
`src/components/auth/OrgSelector.jsx`, `src/components/dashboard/Dashboard.jsx`,
`src/components/grant/{AutoFillPanel,BudgetBuilder,GrantDetail,ProposalWorkspace,SectionCard}.jsx`,
`src/components/pipeline/{Pipeline,ScoutPanel}.jsx`

**Docs (8):** `AGENT_AUDIT_WORKFLOW.org`, `ARCHITECTURE.org`, `DEFERRED.org`,
`DOCUMENTATION.org`, `PRODUCT_CONTEXT.org`, `README.org`, `SUBAGENT_PLAYBOOK.org`, `README.md`

**Dependencies (2):** `package.json`, `package-lock.json`

> A conflict looks like this — keep the right side(s), delete the markers:
> ```
> <<<<<<< HEAD            (johannes-plumbing's version)
> ...
> =======
> ...
> >>>>>>> origin/main     (main's version)
> ```

---

## 4. The recommended staged merge (do this when you're back)

> Run in a **healthy** clone, on `johannes-plumbing`. Verify before pushing.

1. **Start the merge:**
   `git checkout johannes-plumbing && git merge origin/main`
2. **Resolve conflicts with main as the winner** for the relocated/refactored code
   (main's refactor is newer and is the trunk). For each conflicting `.jsx`/`.js`:
   take main's version → `git checkout --theirs <file>` (then sanity-check).
3. **Docs (`.org`/`README`):** these mostly duplicate each other — take main's
   version unless a johannes doc has content main lacks (e.g. module quick-refs).
4. **`package.json` / lock:** take main's, then `npm install` to regenerate the lock cleanly.
5. **Delete stranded flat duplicates / broken `*Parts.jsx`** that main's grouped
   layout replaced; re-add the **unique** items from §2 on top.
6. **Verify green before committing the merge:** `npm test` && `npm run build`.
7. `git commit` the merge, then `git push origin johannes-plumbing`.

### Open decision (answer when back)
- Confirm **"main's version wins on conflicts"** as the default, OR flag specific
  files (e.g. `App.jsx`) to review line-by-line instead.

---

## 5. Handy verification commands

```bash
# where the branches split
git merge-base origin/main origin/johannes-plumbing
# preview conflicts WITHOUT touching anything (git 2.38+)
git merge-tree --write-tree origin/johannes-plumbing origin/main | grep CONFLICT
# after merge: must both pass before push
npm test && npm run build
```
