# Super-Admin + Subscriptions + Resources + Nav — Working Plan

> Status: **ALL 4 PHASES BUILT (2026-06-29)** — committed locally, unpushed.
> Decisions: ZAR pricing (R950/mo · R7,600/yr), super-admin real accounts, manual
> billing, banner+optional read-only lock, auto-detected org type. Commits:
> acaf120 (P1) · d4b8bf0 (P2) · 84052c4 (P3) · 9140c2c (P4).
> Created: 2026-06-29 · Drafted with Claude Code
> Source: user request + 2 screenshots (login screen, sidebar) + read-only code investigation.

## Decisions (locked with the user)
- **Super-admin = real accounts** (email+password login, cross-org access) — not the shared key.
- **Billing = manual flags** first: super-admins set each org's plan/status by hand; trial + renewal dates tracked; **no Stripe** yet.
- **Trial expiry = banner + flag by default**, plus a **per-org super-admin toggle** to enforce a **read-only lock** when they choose.
- **Resources = auto-detect org type** from org details (industry / mission / programmes / name) with a **manual override** in Settings; Claude drafts per-type resource sets with real links.

## ⚠️ Open items to confirm
- **Currency:** spec says **$50/mo, $400/yr**, but the whole app is **ZAR/South-African**. Implementing as USD constants (configurable). Confirm USD vs a ZAR equivalent.
- **Deploy gap:** the login change (remove member sign-in → Forgot password) is already committed (`38b14ef`) but **not live** — the screenshot still shows the old link. Needs a redeploy (separate from this plan).
- **Prod secret:** `SUPER_ADMIN_KEY` is **not set in prod**; the new super-admin login will need its own seeding too.
- **Privacy note:** super-admins will see per-member activity across orgs — acceptable for the product owner, but worth being explicit since it's cross-tenant data.

---

## PHASE 1 — Nav quick wins  (small, low-risk)
- Rename sidebar **"Switch Organisation" → "Log out"** and rewire `onClick` from `handleSwitchOrg` (just returns to picker, no server logout) to the existing `handleLogout` (`logout()` → `POST /auth/logout` + clears token). Swap the ⇄ icon for a logout glyph. `src/App.jsx:590-602`.
- (The member-sign-in removal is already done in `38b14ef`; this phase pairs with a **redeploy** to make both live.)

| Wave | Files | Task |
|---|---|---|
| 1 | `src/App.jsx` | Rename + rewire the logout button; icon swap |

---

## PHASE 2 — Resources tab restructure
- New `src/components/resources/ResourcesHub.jsx` — a sub-tab strip (reusing the ProposalWorkspace toggle pattern + `theme.js` tokens) hosting **Calendar / Documents / Funders / Archive / Freebies** as sub-tabs.
- Remove `calendar`, `docs`, `funders`, `archive` from `SIDEBAR_ITEMS` (`App.jsx:280-290`); route `view==="resources"` → `ResourcesHub`, passing through the props each child currently receives.
- **Org-type detection:** add `org_type` to the `orgs` table; new `src/data/orgType.js` `deriveOrgType(org)` (keyword-infer from `industry`/name/mission: NGO/NPO, Corporate, Government, Social enterprise), with a **manual override** dropdown in `Settings.jsx`. Detection is the default; override wins.
- **Tailored content:** extend `src/data/freebies.js` entries with an `orgTypes` array, add **Corporate / Government** resource entries with real links, and filter what shows by the resolved org type (unknown type → show all).

| Wave | Files | Task |
|---|---|---|
| 1 | `server/schema.sql`, `server/db.js`, `server/routes/orgs.js` | Add `org_type` column + read/write |
| 1 | `src/data/orgType.js` (new), `src/data/freebies.js` | Derive helper + tag/extend resource data with real links |
| 2 | `src/components/resources/ResourcesHub.jsx` (new) | Sub-tab host for the 5 sub-tabs |
| 2 | `src/components/settings/Settings.jsx` | org-type override control |
| 3 | `src/App.jsx` | Remove 4 tabs from sidebar; route Resources → ResourcesHub |

---

## PHASE 3 — Subscription model (manual)
- **Schema** (`orgs`): `subscription_plan` (`free_week`|`monthly`|`yearly`), `subscription_status` (`trial`|`active`|`expired`|`cancelled`), `trial_started_at`, `trial_expires_at`, `period_start`, `period_end`, `readonly_lock` (bool), `subscription_updated_at`. On org creation / first sign-in: set `trial_started_at`=now, `trial_expires_at`=now+7d, status `trial`.
- **Pricing constants** (configurable): monthly **$50**, yearly **$400** (currency pending confirmation).
- **Status is derived**: if `trial_expires_at < now` and no paid plan → `expired`.
- **Frontend:** non-blocking **"trial ended / upgrade" banner** for expired orgs; if `readonly_lock` is on, gate edit/generate actions (extends the existing `isLocked` read-only pattern already used in ProposalWorkspace — applied app-wide is the invasive part; scope carefully).

| Wave | Files | Task |
|---|---|---|
| 1 | `server/schema.sql`, `server/db.js` | Subscription columns + helpers + trial init + derived status |
| 2 | `src/api.js`, `src/App.jsx` | Expiry banner + read-only gating hook |

---

## PHASE 4 — Super-admin dashboard (real accounts + cross-org)
- **Auth:** new `super_admins` table (email, `password_hash`, name); `POST /api/superadmin/login` → super-admin session token (separate from org sessions, **cross-org scope**); `requireSuperAdmin` middleware. Seed the first super-admin.
- **Cross-org APIs** (NOT `resolveOrg`-scoped, super-admin-gated): `GET /api/superadmin/orgs` (list + subscription + usage summary), `GET …/orgs/:id/activity`, `…/sessions`, `…/usage`, `PUT …/orgs/:id/subscription`, `PUT …/orgs/:id/readonly-lock`.
- **UI:** super-admin **login screen** + redesigned dashboard at `?superadmin`, with **mini-tabs per org**: **Org details · Members · Actions** (activity feed) **· Usage** (agent_runs tokens/cost, grants count, exports) **· Subscription** (plan controls + read-only toggle). Reuses `Admin.jsx` helpers (`EVENT_CONFIG`, `ago`, `Card`).
- **Data is ready:** `activity_log` (login/grant/stage/ai_call/export…) and `agent_runs` (tokens_in/out, cost_usd, duration) already capture "what they're doing / usage".

| Wave | Files | Task |
|---|---|---|
| 1 | `server/schema.sql`, `server/db.js`, `server/middleware/*`, `server/routes/superadmin.js` (new) | super_admins table, auth, cross-org + subscription APIs |
| 2 | `src/api.js` | super-admin API client |
| 2 | `src/components/superadmin/*` (new) | login screen + dashboard with mini-tabs |
| 3 | `src/App.jsx` | wire `?superadmin` → super-admin login/dashboard |

---

## Sequencing recommendation
**1 → 2 → 3 → 4.** Phase 1 ships immediately (and forces the pending redeploy). Phases 2–4 each end on green tests + a build before the next. Phase 3 depends on Phase 4's super-admin controls to be *managed*, but the schema/banner can land first; Phase 4 exposes the controls. Each phase is presented as its own wave set; no two agents touch the same file in a wave.

## Docs to update on build (per project rules)
`PRODUCT_CONTEXT.org` (super-admin accounts, subscription model, resources tailoring, nav change) and `DEFERRED.org` (Stripe billing deferred; read-only-lock enforcement scope).
