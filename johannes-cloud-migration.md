# Grants Engine — Cloud Migration Handover (Johannes)

> Working doc. Captures Kiyasha's handover, the verified state of the GCP
> deployment, and the Supabase → Cloud SQL data-migration plan.
> **Created:** 2026-06-25 · **Owner:** Johannes · **Co-driver:** Kiyasha

---

## 1. Kiyasha's handover message (verbatim)

> Hi J
>
> Grants Engine is live on Google Cloud Run
> Quick summary of where it landed:
> - Deployed as a Cloud Run service in **project-dump-ss** (prefixed `grants-engine-`), since we couldn't free a separate billing project
> - **Cloud SQL Postgres (db-f1-micro)** is the database, secrets are all in **Secret Manager**, storage **stayed on Supabase** as planned
> - Nightly **scout + deadline reminders** run via **Cloud Scheduler**
> - URL: https://grants-engine-34770965604.us-central1.run.app
> - Health check passes: `{"ok":true,"apiKeyConfigured":true,"dbConnected":true}`
>
> One thing I want to do with you rather than alone: the Cloud SQL database is currently **empty except for the auto-seeded d-lab org** — none of our real orgs, members, or grants are in it yet. That data is all still safe in Supabase. I didn't want to run a migration into a non-empty DB (with the seed org already there) without your eyes on it, since that's the step that can actually break data if it goes wrong.
>
> Could we do the **Supabase → Cloud SQL data migration** tomorrow? Everything else is ready for you to start poking at / stress-testing.

---

## 2. Verified current state (recon 2026-06-25)

### GCP — project `project-dump-ss`, region `us-central1`
(Note: gcloud default project is `ss-leads-sleuth`; we target `project-dump-ss` explicitly with `--project`.)

| Resource | Detail |
|---|---|
| **Cloud Run** | service `grants-engine` · https://grants-engine-34770965604.us-central1.run.app · last deployed by kiyasha.singh@strideshift.ai, 2026-06-24 |
| **Cloud SQL** | instance `grants-engine-pg` · POSTGRES_16 · db-f1-micro · `us-central1-a` · public IP `35.253.144.240` · RUNNABLE |
| **Scheduler** | `grants-engine-reminders` (`*/30 * * * *`) · `grants-engine-scout` (`0 0 * * *`) · both TZ **Africa/Johannesburg**, ENABLED |
| **Health** | `{"ok":true,"apiKeyConfigured":true,"dbConnected":true}` (per Kiyasha) |

### Secret Manager (16 secrets, names only)
`anthropic-api-key`, `app-url`, `cors-origin`, `cron-secret`, `database-url`,
`email-from`, `google-client-id`, `google-client-secret`, `google-redirect-uri`,
`iati-api-key`, `openai-api-key`, `playwright-secret`, `playwright-service-url`,
`resend-api-key`, `supabase-service-key`, `supabase-url`
(all prefixed `grants-engine-`)

⚠️ **Missing:** `super-admin-key`. The app's `SUPER_ADMIN_KEY` gates org
creation/deletion (the `?superadmin` route). Not needed for the data migration
(we write to the DB directly), but required if we ever create/delete orgs in
prod. Confirm with Kiyasha whether this was intentional.

### Source — Supabase project `ymqejaufpoiaedgjwohe`
(authoritative: from the live `grants-engine-supabase-url` secret)
- Holds all **real** orgs / members / grants (source of truth).
- ✅ **Alive & reachable** — `/auth/v1/health` returns HTTP 401 "No API key found",
  i.e. a running project. **NOT paused.**
- **File storage stays here** — Cloud Run reads files via the `supabase-url` +
  `supabase-service-key` secrets. We migrate the DB rows only, not the files.
- ⚠️ **Do NOT use the `supabase-tr` MCP for this.** It is pointed at a *different,
  dead* project (`wlrsnvcmislmfvuaqtha`, NXDOMAIN) — that's the only reason its
  SQL queries timed out during recon; unrelated to our real data.

### Did we already have the source DB connection? (checked 2026-06-25)
We read the actual secret **values** to settle this — answer: **no, it is not in
Secret Manager, and we cannot construct it.**

| Secret | Value (passwords masked) | Is it the Supabase DB connection? |
|---|---|---|
| `grants-engine-database-url` | `postgresql://grants-engine-app:****@/grants-engine-db?host=/cloudsql/project-dump-ss:us-central1:grants-engine-pg` | ❌ **Cloud SQL** (destination), via unix socket |
| `grants-engine-supabase-url` | `https://ymqejaufpoiaedgjwohe.supabase.co` | ❌ REST API URL only |
| `grants-engine-supabase-service-key` | *(JWT — not read)* | ❌ PostgREST API token, **not** the Postgres role password |

**Can we build it ourselves?** Only partly:
- user `postgres.ymqejaufpoiaedgjwohe` ✅ derivable · db `postgres` ✅
- host `aws-0-<region>.pooler.supabase.com` — ❌ **region unknown** (dashboard only)
- **password** — ❌ not derivable from anything we hold (the service key is an API
  JWT, *not* the Postgres password). It lives only in the Supabase dashboard.

**Fallback that needs nothing new:** we *do* hold the REST URL + service key, so we
could pull every table via PostgREST (`GET /rest/v1/<table>?select=*`) instead of
`pg_dump`. It works but is fiddlier (pagination, JSON→SQL) and less faithful — keep
it as plan B only.

---

## 3. Schema & the collision risk

**17 tables**, all foreign-key-chained to `orgs` via `org_id ON DELETE CASCADE`.
All primary keys are **app-generated `TEXT`** (no serial sequences) → a faithful
row-copy preserves ids/FKs/passwords cleanly, no sequence resets needed.

Tables: `orgs`, `org_profiles`, `org_config`, `org_auth`, `team_members`,
`sessions`, `grants`, `funder_strategies`, `approvals`, `uploads`,
`compliance_docs`, `pipeline_config`, `agent_runs`, `kv`, `activity_log`,
`password_reset_tokens`, `autofill_jobs`.

### Why the destination isn't truly empty
`server/index.js` auto-seeds **only when the DB has zero orgs** (`server/seed-fn.js`).
The seed creates:
- org **`slug='dlab'`**, name `d-lab NPC`, login password **`dlab2026`**
- team members with ids `alison`, `david`, `barbara`, `nolan`, `ayanda`, `team`
- a `pipeline_config`, an `org_profile`, demo grants `g1`–`g5`

The **real** d-lab org in Supabase will share `slug='dlab'` (UNIQUE constraint)
and likely reuse those member ids → a naive insert **collides on the unique slug
and on primary keys**. This is exactly the breakage Kiyasha wanted eyes on.

---

## 4. Migration plan

**Strategy: empty the destination, then copy Supabase verbatim.**
The destination holds only throwaway demo data, so wiping it loses nothing, and a
faithful copy preserves ids/FKs/passwords so logins keep working.

**Mechanism (decided):** `pg_dump --data-only` from Supabase → load into Cloud SQL
via `psql`, run as an **isolated one-off script/transaction** (nothing permanent
added to the app). Atomic: it either fully succeeds or rolls back.

### Decisions locked
- ✅ Mechanism: `pg_dump --data-only` + `psql` (isolated temp script).
- ✅ Approach: wipe seed → load real data (vs. merge/upsert).
- 🔲 **Skip ephemeral tables** `sessions` + `password_reset_tokens` (tied to old
  domain/login; users simply re-login). *Recommended — confirm with Kiyasha.*
- 🔲 Timing: migrate today/tomorrow with Kiyasha on the call. Priority = robustness.

### Runbook
1. **Wake Supabase**, confirm connectivity, snapshot **source row counts per table**.
2. **Back up Cloud SQL first**: `gcloud sql backups create --instance=grants-engine-pg --project=project-dump-ss` → instant rollback.
3. **Verify schema parity** (source vs Cloud SQL) before loading.
4. `pg_dump --data-only --no-owner --no-acl --schema=public` from Supabase
   (use the **direct 5432 connection, not the pooler**).
5. Load into Cloud SQL inside **one transaction** with
   `SET session_replication_role = replica;` (defers FK checks → any order, atomic).
6. In that same transaction: `TRUNCATE … CASCADE` the seed, then load the dump
   (excluding `sessions`, `password_reset_tokens`).
7. **Verify**: counts match source; spot-check the d-lab org + 2 real orgs; test a
   real login; then `COMMIT`.

### FK-safe load order (if we ever load without `replication_role=replica`)
1. `orgs`
2. `org_profiles`, `org_config`, `org_auth`, `pipeline_config`
3. `team_members`
4. `grants`, `funder_strategies`, `uploads`, `kv`, `agent_runs`, `activity_log`
5. `approvals` (needs grants), `compliance_docs` (needs uploads), `autofill_jobs`
   *(skip: `sessions`, `password_reset_tokens`)*

---

## 5. Risks / blockers / loose ends

### ⭐ The one thing needed from Kiyasha (the only blocker)
We need the **source Supabase Postgres connection string** for project
`ymqejaufpoiaedgjwohe`. It is **not** in Secret Manager (verified) and can't be
constructed (password isn't derivable). To get it:

1. Supabase dashboard → project `ymqejaufpoiaedgjwohe` → **Project Settings →
   Database → Connection string → "Session pooler"** → copy the **URI** (it
   includes host, region, and password).
2. Put it in Secret Manager as a new secret so Johannes can access it without the
   raw value being pasted around:
   ```
   printf '%s' '<the pooler URI>' | gcloud secrets create grants-engine-supabase-db-url \
     --project=project-dump-ss --data-file=-
   ```
   (or just send it to Johannes directly if that's easier).

That URI is the *only* missing credential. Everything else for the migration is in
place. (Source confirmed **alive**, not paused — earlier "paused" call was wrong; it
was the misconfigured `supabase-tr` MCP pointing at a dead project.)

### Other loose ends
- ⚠️ **`super-admin-key` secret missing** — NOT needed for migration (we write to
  Cloud SQL directly). Only matters if the in-app superadmin org-create/delete
  route must work in prod. Confirm intent with Kiyasha.
- ⚠️ **Ephemeral tables** — confirm we skip `sessions` + `password_reset_tokens`.
- ⚠️ **Cloud SQL access** — migration needs the DB password (in `grants-engine-database-url`)
  + either cloud-sql-proxy or our IP in authorised networks.
- 🔁 **Scheduler cadence** differs from old `vercel.json` (reminders */30 vs hourly;
  scout 00:00 JHB vs 22:00). Cosmetic; confirm intended.

## 6. Stress-test checklist (post- or pre-migration)
- [ ] Health endpoint green.
- [ ] Login as seed d-lab (`dlab` / `dlab2026`) — pre-migration only.
- [ ] Login as a real org — post-migration.
- [ ] Pipeline loads grants; create/edit a grant.
- [ ] AI proxy works (OpenAI key configured).
- [ ] File upload reads/writes against Supabase storage.
- [ ] Cloud Run logs clean under load (`gcloud run services logs read grants-engine`).
- [ ] Scout + reminder scheduler jobs fire without error.

---
*Last updated: 2026-06-25*
