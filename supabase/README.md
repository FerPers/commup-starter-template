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

Never edit `00000000000000_baseline.sql` after this point — additive migrations only.

## Applying to a fresh environment

```bash
supabase link --project-ref <ref>
supabase db push                # applies baseline + every later migration in order
```

The baseline targets a clean Postgres database. It assumes the Supabase managed schemas (`auth`, `storage`, `realtime`, `extensions`, `vault`) already exist — which is the case on any provisioned Supabase project.

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
