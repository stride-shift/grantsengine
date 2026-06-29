# Login Screen Change — Forgot-Password as Primary Recovery (Working Doc)

> Status: **BUILT (2026-06-28)** — approved decisions: 4A extract & reuse, remove link
> only (picker left dormant). Implemented; pending deploy + live test. See §8 below.
> Created: 2026-06-28 · Owner: Kiyasha · Drafted with Claude Code
> Scope: login screen recovery flow + end-to-end verification on the deployed app.

---

## 1. Goal (as requested)

1. **Remove** the "Trouble signing in? Use member sign-in" link entirely.
2. Make **"Forgot password?"** the primary recovery path. Clicking it takes the user
   to the existing **"Check your email — if an account exists, we've sent a reset link"**
   screen.
3. The emailed **reset link** leads to the existing **choose-new-password** screen.
4. The whole **forgot-password → email → reset** flow must work **end-to-end on the
   deployed app** (Cloud Run), with **Resend** actually sending the email.

---

## 2. Key finding — most of this already exists

The backend reset flow and both target screens are **already built and wired**. The
only real UI gap is that EmailLogin's "Forgot password?" shows a small inline message
instead of taking the user to the existing "Check your email" screen.

| Piece | State | Where |
|---|---|---|
| "Forgot password?" button (primary login) | EXISTS | `src/components/auth/EmailLogin.jsx:53-57` |
| Forgot → request-reset API call | EXISTS | `api.js` `requestPasswordResetByEmail` → `POST /api/auth/request-reset` |
| Backend reset-request (token + email) | EXISTS | `server/routes/auth.js:144-177` |
| Token gen / validate / expire (1 hr, 256-bit) | EXISTS | `server/db.js:498-520`, `schema.sql:243-251` |
| Resend email send (`sendResetEmail`) | EXISTS | `server/email.js:475-494` (via `sendViaResend` :18-39) |
| Reset link format `?reset=<token>&slug=<org>` | EXISTS | `auth.js:157-158` |
| Email link detected, app opens reset screen | EXISTS | `hooks/useSession.js:16-29` + `hooks/useLoginFlow.js:40-50` |
| **"Check your email" screen** | EXISTS | `Login.jsx:258-270` (step `sent`) |
| **"Choose new password" screen** | EXISTS | `Login.jsx:272-305` (step `reset`) |
| Reset-confirm API + auto-login | EXISTS | `auth.js:317-352` → `api.js` `resetPasswordWithToken` |
| "Trouble signing in? Use member sign-in" link | EXISTS (to remove) | `EmailLogin.jsx:75-81` (`onUsePicker` → `goToPicker`) |

**Implication:** items 3 (reset link → choose-new-password) already works today via the
deep-link path. The actual code work is small: remove one link, and route "Forgot
password?" to the existing "Check your email" screen instead of the inline message.

---

## 3. Current vs. target flow

**Current (primary email login):**
- `EmailLogin` → "Forgot password?" → POSTs request-reset → shows inline green text
  "If an account exists … check your inbox" (`EmailLogin.jsx:62-66`). No screen change.
- Separately: clicking the emailed link (`?reset=…&slug=…`) → `useSession`/`useLoginFlow`
  mount `Login.jsx` straight at the `reset` step (choose new password) → submit →
  auto-login. **This already works.**
- "Trouble signing in? Use member sign-in" → `goToPicker()` → `OrgSelector` → member
  picker (`Login.jsx` steps `pick`/`password`).

**Target:**
- `EmailLogin` → "Forgot password?" → POSTs request-reset → **navigates to the existing
  "Check your email" screen**.
- Emailed link → choose-new-password screen (unchanged — already works).
- No member sign-in link at all.

---

## 4. Proposed code changes

> Two open decisions (§5) affect exactly which files change. The wave plan below is the
> **recommended** option (4A + 5A).

### Change 1 — remove the member sign-in link
- Delete the link JSX at `EmailLogin.jsx:75-81`.
- Stop passing `onUsePicker` to `EmailLogin` in `App.jsx:428`.
- Trace and remove now-dead wiring: `goToPicker` in `useSession.js:73` and the
  `selectingOrg` entry path **only if** nothing else needs it. `OrgSelector` stays
  reachable via the hidden `?superadmin` route, so it is not deleted.
- **Do NOT** delete `Login.jsx` — it still hosts the `sent` and `reset` screens used by
  the recovery flow. After this change its `pick`/`password`/`setup`/`forgot` steps
  become unreachable as a *login* entry point (see §5, decision B).

### Change 2 — "Forgot password?" → existing "Check your email" screen
Recommended approach **4A (extract & reuse)** — truly reuses the existing screen:
- Extract the "Check your email" card (`Login.jsx:258-270`) into a small shared
  component, e.g. `src/components/auth/CheckEmailScreen.jsx`.
- Render it from `EmailLogin` after a successful request-reset (local `sent` view state),
  with a **"Back to sign in"** action that returns to the EmailLogin form.
- Point `Login.jsx`'s `sent` step at the same shared component (no behaviour change there).

Alternative **4B (self-contained)**: add a `sent` view inside `EmailLogin` that renders a
copy of the same card markup. Simpler, no `Login.jsx` edit, but duplicates the screen.

### ⚠️ Bug to fix as part of this change
The existing "Check your email" screen's **"Back to sign in"** button calls `goBack()`
→ `setStep("pick")` (`Login.jsx`/`useLoginFlow.js`), which lands on the **member
picker**. Once member sign-in is removed, that back action must return to the **EmailLogin**
form instead. The shared component must take the back target as a prop.

### Recommended wave plan
| Wave | Agent | Model | Files | Task |
|---|---|---|---|---|
| 1 | A | Sonnet | `src/components/auth/CheckEmailScreen.jsx` (new), `src/components/auth/Login.jsx` | Extract the check-your-email card into a shared component; make "Back" target a prop; repoint Login's `sent` step to it |
| 2 | B | Sonnet | `src/components/auth/EmailLogin.jsx`, `src/App.jsx` | Remove member-sign-in link + `onUsePicker` wiring; route "Forgot password?" to the shared CheckEmailScreen with back→EmailLogin |
| 2 | C | Sonnet | `src/hooks/useSession.js` | Remove now-dead `goToPicker`/`selectingOrg` entry **iff** unused (verify first) |
| 3 | — | — | `npm test`, `npm run build` | Verify build + tests green between/after waves |

(Waves 2B and 2C touch different files; safe in parallel. If decision 4B is chosen,
Wave 1 collapses into EmailLogin and Login.jsx is untouched.)

---

## 5. Decisions needed before I build the plan out

**A. Confirmation screen approach** — 4A extract & reuse the existing card (DRY, touches
`Login.jsx`) vs. 4B self-contained copy inside EmailLogin (simpler, duplicates markup).
→ *Recommend 4A* (matches "the existing screen").

**B. How far to remove member sign-in** — (i) remove only the link now, leave the
member-picker UI + `member-login` backend route dormant (minimal, reversible), vs.
(ii) also rip out the now-dead member-picker steps and route. → *Recommend (i)* — the
request was "remove the link"; `Login.jsx` must stay for the reset screens anyway.

**C. Deployed end-to-end test** — verifying "Resend actually sends the email" means
triggering a **real** reset email on the live app. I need (1) a recipient inbox you can
check, and (2) confirmation of the deployed `EMAIL_FROM` domain (see §6 risk). The
endpoint is rate-limited to **5 requests/hour** per the limiter.

---

## 6. Deployed end-to-end verification plan (after approval + deploy)

1. **Pre-flight config check** (read-only): confirm Cloud Run has `RESEND_API_KEY`,
   `EMAIL_FROM`, `CORS_ORIGIN` (= the Cloud Run URL), `DATABASE_URL` set from the
   `grants-engine-*` secrets.
2. **Trigger** "Forgot password?" on the live app for a known test account (decision C).
3. **Confirm** the "Check your email" screen shows.
4. **Confirm email arrives** via Resend; open it; verify the link is
   `https://<cloud-run-url>?reset=<token>&slug=<org>` (not localhost).
5. **Click** the link → choose-new-password screen → set a password → confirm auto-login.
6. **Re-login** with the new password to confirm persistence.
7. Check Cloud Run logs for `[email] … sent` (success) vs. the warning paths in `auth.js`.

### Top risks for the deployed flow
- **`EMAIL_FROM` must be a Resend-verified domain.** The code default is the Resend
  sandbox `onboarding@resend.dev`, which only delivers to the Resend account owner's own
  address — reset emails to real d-lab inboxes would silently fail. This is the most
  likely real-world blocker; verify the deployed value + Resend domain status first.
- **`RESEND_API_KEY` missing** → endpoint still returns `{ok:true}` (anti-enumeration)
  but no email is sent. Only the logs reveal it.
- **`CORS_ORIGIN`** must equal the Cloud Run URL or the browser request is blocked.
- **Origin header**: reset link is built from the request `origin`; confirm Cloud Run
  preserves it so links aren't malformed.

---

## 8. What was built (2026-06-28)

- **New** `src/components/auth/CheckEmailScreen.jsx` — shared "Check your email — if an
  account exists, we've sent a reset link" confirmation (inner content + optional back
  link via props).
- `Login.jsx` — `sent` step now renders the shared `CheckEmailScreen` (no behaviour
  change to the member-picker flow).
- `EmailLogin.jsx` — **removed** the "Trouble signing in? Use member sign-in" link and
  the `onUsePicker` prop. "Forgot password?" now shows the shared `CheckEmailScreen`
  (full screen, not the old inline message); its "Back to sign in" returns to the form.
- `useEmailLogin.js` — added `resetForgot()` to return from the confirmation to the form.
- `App.jsx` — drops `onUsePicker`/`goToPicker` wiring; comment updated.
- `useSession.js` — removed the now-dead `goToPicker`; picker stays reachable via
  logout / `?superadmin` and still hosts the reset deep-link.
- Tests: updated `useSession.test.js` (goToPicker → goBackToOrgSelect), added a
  `resetForgot` test. **All 339 tests pass; `npm run build` clean.**
- Docs: `PRODUCT_CONTEXT.org` + `DEFERRED.org` updated to record the link removal and
  the now-dormant member-picker (with its reactivation path).

**No backend change** — reset request/token/Resend send/reset-confirm already existed.

### Redeploy + live test
See §6 for the full end-to-end checklist. Pre-flight: confirm the live `EMAIL_FROM`
is `grants@strideshift.ai` (Resend-verified `strideshift.ai` domain) before testing.

## 7. Out of scope / notes
- No backend endpoint changes needed — reset request, token handling, Resend send, and
  reset-confirm all already exist and are wired.
- Storage stays on Supabase; this change is DB-agnostic (reads/writes `team_members` +
  `password_reset_tokens` via the app's existing DB connection).
- File/line references above are from a read-only code map (2026-06-28) and should be
  re-confirmed by the implementing agents before editing.
