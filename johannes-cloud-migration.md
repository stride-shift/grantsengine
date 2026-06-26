# Grants Engine — Cloud Migration Handover (Johannes)

> Working doc. Captures Kiyasha's handover, the verified state of the GCP
> deployment, and the Supabase → Cloud SQL data-migration.
> **Created:** 2026-06-25 · **Updated:** 2026-06-26 · **Owner:** Johannes · **Co-driver:** Kiyasha

---

## 0. STATUS — ✅ MIGRATION COMPLETE (2026-06-26)

The Supabase → Cloud SQL data migration is **done and verified**. The live Cloud
SQL DB (`grants-engine-db`) now holds the real d-lab data; the app no longer runs
on the seed.

**Loaded — 3,187 rows, every migrated table matches source exactly:**
orgs 2, org_profiles 2, org_config 2, org_auth 1, pipeline_config 1,
team_members 11, grants 157, uploads 15, kv 33, **agent_runs 2,963**.
**Deliberately dropped:** `activity_log` (21,696 rows — audit log, not carried over).
**Skipped (ephemeral):** `sessions`, `password_reset_tokens` (users just re-login).

**Integrity verified:** bcrypt login hashes intact (real logins work), `ai_data`
round-tripped as valid JSON, timestamps preserved (grants span 2026-02-28 → 06-22),
real team present (Alison / Barbara / David / Nolan / Kiyasha …).

### Where the credentials live (nothing secret is in this repo)
| What | Where | Notes |
|---|---|---|
| Supabase migration token (PAT `sbp_…`) | Secret Manager `grants-engine-supabase-migration-pat` | account-wide; **revoke when migration work is fully closed** |
| Cloud SQL app connection | Secret Manager `grants-engine-database-url` | unix-socket form, used by the app |
| Cloud SQL `postgres` admin pw | temporary dev pw — **ask Johannes**, or reset via `gcloud sql users set-password postgres --instance=grants-engine-pg --project=project-dump-ss --prompt-for-password` | rotate before it matters; not written here (public-IP instance) |
| `run/load.sql`, `run/dest-seed-backup.sql` | **scratchpad only** (outside repo & iCloud) | contain real password hashes — never commit |

### For the colleague picking this up
1. **Verify the live app** — hit the Cloud Run URL (§2) and log in (see account below);
   confirm grants/team load. The app auto-seeds **only an empty DB**, so there is no
   reseed risk now.
2. **Connect to the DB** if needed:
   `gcloud auth application-default login` →
   `cloud-sql-proxy project-dump-ss:us-central1:grants-engine-pg --port 5434` →
   `psql 'postgresql://postgres:<admin-pw>@127.0.0.1:5434/grants-engine-db'`.
   (`postgres` was granted the app role so it can see the tables — see §4 gotchas.)
3. **Pull the PAT** (only if re-running the export):
   `gcloud secrets versions access latest --secret=grants-engine-supabase-migration-pat --project=project-dump-ss`
4. **Re-run the migration** (idempotent — wipes & reloads):
   `SUPABASE_PAT=<pat> DEST_URL=<above> python3 migration/migrate_via_api.py --export --load --verify`

### Dev login provisioned (Johannes)
`johannes.backer@strideshift.ai` — director in **d-lab** (password held by Johannes).
Login is email + password (resolves org by email). ⚠️ Remove from d-lab's roster when done.

### Cleanup still open
- [ ] Revoke the Supabase PAT once migration work is fully closed.
- [ ] Delete scratchpad `run/load.sql` + `run/dest-seed-backup.sql`.
- [ ] Rotate the temporary Cloud SQL `postgres` password.
- [ ] Remove the temporary Johannes dev account from d-lab.

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

### Secret Manager (17 secrets, names only)
`anthropic-api-key`, `app-url`, `cors-origin`, `cron-secret`, `database-url`,
`email-from`, `google-client-id`, `google-client-secret`, `google-redirect-uri`,
`iati-api-key`, `openai-api-key`, `playwright-secret`, `playwright-service-url`,
`resend-api-key`, `supabase-service-key`, `supabase-url`,
**`supabase-migration-pat`** (added 2026-06-26 — the migration PAT)
(all prefixed `grants-engine-`)

⚠️ **Missing:** `super-admin-key`. The app's `SUPER_ADMIN_KEY` gates org
creation/deletion (the `?superadmin` route). Not needed for the data migration
(we write to the DB directly), but required if we ever create/delete orgs in
prod. Confirm with Kiyasha whether this was intentional.

### Source — Supabase project `ymqejaufpoiaedgjwohe` (name "Grantsengine", eu-west-1)
(authoritative: from the live `grants-engine-supabase-url` secret)
- Holds all **real** orgs / members / grants (source of truth).
- ✅ **`ACTIVE_HEALTHY`, NOT paused** — confirmed via the Supabase Management API
  (`GET /v1/projects`), not just the REST edge.
- ✅ **Real data confirmed (counted 2026-06-25 via API):** orgs **2**
  (`dlab` id `08d23855c7ae36cd` created 2026-02-28 + `test-org`), team_members **11**,
  grants **157**, activity_log **21,696**, agent_runs **2,963**, uploads **15**,
  kv **33**, org_profiles/org_config **2/2**, pipeline_config/org_auth **1/1**.
  Ephemeral: sessions **1**, password_reset_tokens **26** (skip). Empty: approvals,
  autofill_jobs, compliance_docs, funder_strategies.
- ⚠️ **The pooler is unreachable FROM JOHANNES'S MACHINE** (`aws-1-eu-west-1.pooler.supabase.com`,
  ports 5432 *and* 6543): TCP connects but the Postgres/TLS handshake times out.
  Real vs wrong password behave identically → **network/MTU issue, not auth, not paused.**
  So `pg_dump` over the pooler is OUT from here.
- ✅ **Working read path: the PAT / Management-API SQL route** (`POST
  /v1/projects/<ref>/database/query`) — same channel the Supabase MCP uses, reaches
  the DB over a different network path. This is what the migration now uses.
  (Token = a Supabase **Personal Access Token** `sbp_…` from dashboard → Account →
  Access Tokens; account-wide, revoke after use.)
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

**Mechanism (decided — revised 2026-06-25):** the Supabase **pooler is unreachable
from Johannes's machine** (TCP connects, Postgres/TLS handshake times out — network/MTU,
not auth/paused), so `pg_dump` over the pooler is out. Instead we migrate via the
**Supabase Management-API SQL route** (the MCP channel), which reaches the DB over a
different, working path:
- **Export:** per table, `SELECT json_agg(row)` via `POST /v1/projects/<ref>/database/query`,
  chunked 1000 rows (big tables: activity_log 21,696; agent_runs 2,963).
- **Load:** `INSERT INTO <t> SELECT * FROM json_populate_recordset(null::<t>, <json>)` —
  Postgres casts JSON straight back into each table's row type, so timestamps / json
  columns / arrays / nulls round-trip faithfully (no hand-built INSERTs).

Script: `migration/migrate_via_api.py` (isolated; modes `--export/--backup/--load/--verify`).
**Export already run & validated 2026-06-25: 24,883 rows across 15 tables → `run/load.sql`
(9.6 MB), wrapped in one atomic transaction.** Nothing permanent added to the app.

### Decisions locked
- ✅ Mechanism: Management-API export + `json_populate_recordset` load (isolated script).
- ✅ Approach: wipe seed → load real data (vs. merge/upsert).
- ✅ **Skip ephemeral tables** `sessions` + `password_reset_tokens` (users re-login).
- 🔲 Timing: migrate with Kiyasha available. Priority = robustness.

### Runbook — ✅ executed 2026-06-26
1. ✅ Confirmed source data via API (counts in §2).
2. ✅ Destination access: `gcloud auth application-default login` →
   `cloud-sql-proxy …:grants-engine-pg --port 5434` →
   `gcloud sql users set-password postgres …` (temp dev pw) →
   `DEST_URL=postgresql://postgres:<admin-pw>@127.0.0.1:5434/grants-engine-db`.
3. ✅ Schema-parity check: **185 columns each end, identical** (zero drift).
4. ✅ Backup: local `pg_dump` of the dest seed → `run/dest-seed-backup.sql`
   (the gcloud Admin-API backup was skipped — only disposable seed to protect).
5. ✅ Load: one atomic transaction — `TRUNCATE orgs CASCADE` (clears seed incl.
   colliding `slug='dlab'`) → load all tables parent→child → `COMMIT`.
6. ✅ Verify: counts match source; real orgs present; a real login confirmed.

### ⚠️ Gotchas hit (matter for any re-run)
- **Stale ADC** → proxy accepts TCP then drops it ("server closed connection
  unexpectedly"). Fix: `gcloud auth application-default login`.
- **Docker also binds 5433** → ran the proxy on **5434**.
- **Tables owned by `grants-engine-app`**, invisible to `postgres` in
  `information_schema`. Fix: `GRANT "grants-engine-app" TO postgres;` (left in place).
- **Cloud SQL forbids `session_replication_role`** even for `cloudsqlsuperuser`, so the
  FK-trigger-deferral trick is OUT. The script now loads in **topological parent→child
  order** instead (the table list is topo-sorted; FK graph verified acyclic).

⚠️ `run/load.sql` + `run/dest-seed-backup.sql` contain real password hashes — they live
in the throwaway scratchpad (outside the repo & iCloud) and must **never** be committed.

### FK-safe load order (used by the script — no trigger deferral)
1. `orgs`
2. `org_profiles`, `org_config`, `org_auth`, `pipeline_config`
3. `team_members`
4. `grants`, `funder_strategies`, `uploads`, `kv`, `agent_runs`
5. `approvals` (needs grants), `compliance_docs` (needs uploads), `autofill_jobs`
   *(skip: `sessions`, `password_reset_tokens`, `activity_log`)*

---

## 5. Risks / blockers / loose ends

### ✅ RESOLVED — no source connection string was needed
The original blocker (the Supabase Postgres pooler URI) turned out to be unnecessary:
the pooler was unreachable from Johannes's machine anyway, so we migrated entirely over
the **Management-API SQL route** using a Supabase **Personal Access Token**. That PAT now
lives in Secret Manager as **`grants-engine-supabase-migration-pat`** — no raw credential
is pasted in this repo or doc. (Source was confirmed alive throughout; the earlier
"paused" call was the misconfigured `supabase-tr` MCP pointing at a dead project.)

### Other loose ends
- ⚠️ **`super-admin-key` secret missing** — NOT needed for migration (we write to
  Cloud SQL directly). Only matters if the in-app superadmin org-create/delete
  route must work in prod. Confirm intent with Kiyasha.
- ⚠️ **Ephemeral tables** — confirm we skip `sessions` + `password_reset_tokens`.
- ⚠️ **Cloud SQL access** — migration needs the DB password (in `grants-engine-database-url`)
  + either cloud-sql-proxy or our IP in authorised networks.
- 🔁 **Scheduler cadence** differs from old `vercel.json` (reminders */30 vs hourly;
  scout 00:00 JHB vs 22:00). Cosmetic; confirm intended.

## 6. Stress-test checklist (post-migration — for the colleague)
- [ ] Health endpoint green.
- [ ] Login as a real org (e.g. `johannes.backer@strideshift.ai`, d-lab — pw from Johannes).
- [ ] Pipeline loads the 157 real grants; create/edit a grant.
- [ ] AI proxy works (OpenAI key configured).
- [ ] File upload reads/writes against Supabase storage (storage stayed on Supabase).
- [ ] Cloud Run logs clean under load (`gcloud run services logs read grants-engine`).
- [ ] Scout + reminder scheduler jobs fire without error.

---
*Last updated: 2026-06-26 — migration complete.*
