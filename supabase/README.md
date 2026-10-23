# CommUp — Supabase Schema

Authoritative source for the CommUp Postgres schema running on `mdyljpgzvigzjpqluket.supabase.co`.

## Schema version

- **Baseline:** `migrations/00000000000000_baseline.sql` — `pg_dump --schema-only` of prod, taken 2026-05-15 after closing Sprint G1.
- **Postgres engine:** 17.6 (Supabase release channel `ga`).
- **Object counts in baseline:** 65 tables, 18 enums, 43 functions, 16 triggers, 199 RLS policies, 65 indexes, 7 views.

## Migration layout

```
supabase/
  migrations/                 # Active, ordered migrations. Apply top-to-bottom.
    00000000000000_baseline.sql
    <ts>_<name>.sql           # All future changes
  migrations-archive/         # Historical SQLs that built the baseline. Do NOT replay — already in baseline.
  functions/                  # Edge Functions (deno)
```

### Creating a new migration

```bash
supabase migration new <descriptive_name>     # creates supabase/migrations/<ts>_<name>.sql
# edit the file, then apply locally:
supabase db reset                              # rebuilds local from baseline + migrations
# when ready for prod, apply via MCP apply_migration or supabase db push
```

Never edit `00000000000000_baseline.sql` after this point — additive migrations only. (Exception, 2026-10-22: non-semantic edits so `supabase db push` can run it — see «Reproducibility» below.)

**Every change to prod goes through a file in `migrations/` with the same version it is registered under.** `apply_migration` (MCP) registers its own timestamp and `supabase db query` registers nothing: after applying that way, register the file's version (`supabase migration repair --status applied <version>`). Nothing is created in prod from the SQL editor or the dashboard (extensions, publications, crons, RLS toggles): it goes in a migration.

## Reproducibility (2026-10-22)

Baseline + migrations rebuild prod's `public` schema exactly: verified on an empty project by comparing `scripts/loadtest/schema-ddl.sql` against prod with `scripts/loadtest/compare-ddl.mjs` (0 differences). What it took:

- Three migrations applied in prod without a file were recovered from `supabase_migrations.schema_migrations.statements` (`20260909252000`, `20260909253000`, `20260910110000`); the rest of the manual changes live in `20261204120000_catchup_prod_drift.sql`; `00000000000001_platform_extensions.sql` enables `pg_cron` and `pg_net` (a new project lacks them).
- What `supabase db push` (CLI 2.90) cannot run: psql metacommands (`\restrict`) and `CREATE SCHEMA public` without IF NOT EXISTS in the baseline; `CREATE INDEX CONCURRENTLY` (each migration goes in one pipeline); and an unquoted name ending in `_atomic` (`sign_itr_atomic`, …) in `CREATE FUNCTION`/`GRANT`/`REVOKE`, which its statement splitter mistakes for `BEGIN ATOMIC` — write `public."sign_itr_atomic"(…)` there.
- Prod's migration registry was repaired the same day (158 → 104 rows, one per file: pre-baseline history deleted, MCP timestamps renamed to the file's version, unregistered files registered). `supabase migration list` must show Local = Remote; any row out of line is drift again.

## Applying to a fresh environment

```bash
supabase link --project-ref <ref>
supabase db push                # applies baseline + every later migration in order
```

The baseline targets a clean Postgres database. It assumes the Supabase managed schemas (`auth`, `storage`, `realtime`, `extensions`, `vault`) already exist — which is the case on any provisioned Supabase project. Vault secrets (`edge_function_url`, `webhook_dispatcher_url`, `service_role_key`) are per-environment and not in migrations.

## Marking baseline as applied on an existing prod

Production already has the schema. To register the baseline without re-running it:

```bash
supabase migration repair --status applied 00000000000000
```

This writes a row in `supabase_migrations.schema_migrations` so subsequent `supabase db push` runs skip the baseline.

## Required extensions

Installed on prod (extensions used by app):

- `uuid-ossp` (schema `extensions`) — `uuid_generate_v4()` for PKs.
- `pgcrypto` (schema `extensions`) — `gen_random_uuid()`, HMAC for handover signing, hashes for API keys.
- `pg_stat_statements` — query observability.
- `pg_cron` (schema `pg_catalog`) — currently not used by app code; reserved.
- `pg_net` (schema `extensions`) — async HTTP from triggers (webhook_dispatcher edge function path).
- `supabase_vault` (schema `vault`) — Supabase-managed secrets.
- `plpgsql` — default.

The baseline does NOT include `CREATE EXTENSION` statements (managed by Supabase platform). When provisioning a fresh project, enable these from the dashboard or include explicit `CREATE EXTENSION` in a follow-up migration.

## Storage buckets

All private (`public=false`). RLS via `storage.objects` policies in baseline.

| Bucket | File size limit | Purpose |
|---|---|---|
| `itr-attachments` | 10 MB | Photos/files attached to ITR responses |
| `punch-attachments` | 10 MB | Punch evidence |
| `preservation-attachments` | 10 MB | Preservation record evidence |
| `pid-documents` | 50 MB | P&ID PDFs/images for hotspot module |
| `handover-packages` | — | Generated handover ZIPs |

To recreate on a fresh project, run after baseline:

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit) VALUES
  ('itr-attachments',         'itr-attachments',         false, 10485760),
  ('punch-attachments',       'punch-attachments',       false, 10485760),
  ('preservation-attachments','preservation-attachments',false, 10485760),
  ('pid-documents',           'pid-documents',           false, 52428800),
  ('handover-packages',       'handover-packages',       false, NULL);
```

## RLS model

All `public.*` tables have `rls_enabled=true`. Access is gated through helper functions (in baseline):

- `is_org_member(org_id)` — user belongs to org via `org_members`.
- `is_project_member(project_id)` — user belongs to the project's org.
- `is_project_editor(project_id)` — role is one of `owner`, `admin`, `architect`, `leader`.
- `user_org_ids()` — set of orgs the current user belongs to.

Server actions use the SSR Supabase client so RLS applies. `/api/v1/*` routes use admin client + manual FK ownership checks (see `src/lib/api/access.ts`, added in F2).

## Rollback strategy

Migrations are forward-only. To revert a change:

1. Write a new compensating migration (DROP COLUMN, etc.).
2. Apply it via `supabase db push` (or MCP `apply_migration`).
3. Never delete a previously applied migration file — it stays as history.

For destructive recovery (corrupted DB), restore from Supabase point-in-time backup (Pro plan) — baseline alone cannot reproduce data, only schema.

## Seed data

The app expects each new org to have at least:

- 4 `project_phases` (A/B/C/D) — created via `setup` wizard.
- ~6 `disciplines` (MECH/ELEC/INST/PIPE/HVAC/CIVIL) — created via setup wizard.

Seed templates are in `supabase-schema.sql` (archived) as commented examples. No automated seed script today.

## Historical archive

`migrations-archive/` contains the 25 loose SQL files + the previous `analytics_intelligence_layer` migration that built up the baseline incrementally between 2026-03-27 and 2026-05-15. They are kept for archaeology and git blame, but **must not be replayed** — the baseline already contains everything they produced.

## Audit trail

This consolidation closes **DB-001** from the 2026-05-15 audit. Prior state: 25 SQLs scattered in repo root, 1 in `supabase/migrations/`, `supabase-schema.sql` desynced (41/67 tables). Current state: single ordered baseline + archive.
