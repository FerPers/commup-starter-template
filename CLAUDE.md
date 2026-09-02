# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is CommUp

CommUp is a SaaS Completion & Commissioning Management System for industrial projects (Oil & Gas, renewables, any industry). It rivals ICAPS, WinPCS, bluerithm, Intergraph and OperCom. The platform is multi-tenant: multiple companies, multiple projects, each isolated via Postgres RLS.

This is a **mature, near-feature-complete product** (~300 source files, ~62k LOC, 53 dashboard pages, 33 server-action modules, a public REST API). It is NOT a scaffold or starter — treat every module as live production code.

**Live domain:** commup.app (Cloudflare Workers)
**Supabase project:** mdyljpgzvigzjpqluket.supabase.co
**GitHub:** https://github.com/FerPers/commup-starter-template

## Commands

```bash
npm run dev          # Local dev server at http://localhost:3000
npm run build        # Next.js production build
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run check        # lint + typecheck + build
npm run deploy       # Build for Cloudflare + deploy to commup.app
npm run preview      # Build for Cloudflare + local Wrangler preview
npm run cf-typegen   # Regenerate env.d.ts from Wrangler bindings
```

## Stack

- **Next.js 16** — App Router, Server Components, React 19
- **TypeScript** — strict mode throughout
- **Tailwind CSS 4** — utility classes; inline styles dominate existing components
- **Supabase** — Postgres (65 tables, RLS on all), Auth, Storage, Realtime
- **Cloudflare Workers** — deployed via `@opennextjs/cloudflare` (OpenNext)
- **`@supabase/ssr`** — SSR-safe Supabase client with cookie-based sessions
- **pdf-lib** for server-side PDFs (NOT @react-pdf/renderer — not Workers-compatible); shared renderer in `src/lib/pdf/renderer.ts`
- **xlsx** for Excel import/export (with formula-injection guard)
- **next-intl** for i18n; **web-push** for notifications; PWA installable

## Route Architecture

```
src/app/
  (auth)/login/            # 'use client' — Supabase signInWithPassword
  (setup)/setup/           # Org/project creation wizard
  (dashboard)/             # All authenticated pages (auth gate in layout.tsx)
    dashboard/             # KPI overview (real queries)
    projects/[id]/         # Project hub: tags, itrs, punches, certificates,
                           #   loops, signals, interlocks, work-plans, kpis,
                           #   pssr, import, import-signals, pid-documents,
                           #   explorer, twin, reports
    projects/[id]/tags/[tagId]/itrs/[itrId]/  # Field ITR execution
    admin/                 # users, config, templates (ITR + PSSR), api-keys,
                           #   webhooks, audit, data-quality, workflows,
                           #   handover, notifications, organizations
    control-tower/ ops/ inbox/ scan/ tag_360/ kpis/
    preservation/ punch-list/ certificates/ work-plans/
  actions/                 # 33 server-action modules (all DB writes)
  api/v1/                  # Public REST API (API-key auth): tags, itrs,
                           #   punches, certificates, systems, signals,
                           #   events, handover, openapi
  api/cron/                # snapshot, preservation-overdue,
                           #   pssr-review-overdue, push-dispatch (CRON_SECRET)
  api/push/                # Web-push subscribe/unsubscribe/topics
  offline/                 # PWA offline fallback
```

## Key Files

| File | Purpose |
|------|---------|
| `src/app/(dashboard)/layout.tsx` | Auth gate for all authenticated pages — redirects to `/login` (no user) or `/setup` (user without org membership) |
| `src/lib/auth/withAuth.ts` | **Server Action security wrapper** (`withAuth`/`withAuthOnly`): auth + active membership + role + declarative FK ownership guards. Use for ALL new/modified actions |
| `src/lib/auth/access.ts` | FK ownership guards (`checkProjectAccess`, etc.) — verify client-supplied IDs belong to the caller's org |
| `src/lib/supabase/membership.ts` | `getActiveMembership()` — legacy shared auth helper (pre-wrapper actions still use it) |
| `src/lib/supabase/server.ts` / `client.ts` / `admin.ts` | Server / browser / service-role Supabase clients |
| `src/lib/api/auth.ts` | Public API v1 auth — hashed API keys (SHA-256), scopes, expiry |
| `src/lib/permissions.ts` + `src/lib/constants/` | Centralized role constants & permission checks |
| `src/lib/pdf/renderer.ts` | Shared server-side PDF renderer (pdf-lib) |
| `src/types/database.ts` | Hand-maintained TS interfaces for DB tables (goal: generate from schema) |
| `src/lib/utils.ts` | `cn()`, `formatPercent()`, `formatDate()`, `detectItrPhase()` |
| `src/lib/constants/status-colors.ts` | Shared status palettes (ITR + punch) |
| `supabase/migrations/00000000000000_baseline.sql` | Canonical Postgres schema (pg_dump of prod 2026-05-15). See `supabase/README.md` for migration workflow |
| `public/sw.js` | **Hand-maintained** service worker (the real one — edit the .js directly) |
| `.github/workflows/cron.yml` | Cron triggers for /api/cron/* (OpenNext doesn't emit `scheduled()` — do NOT use wrangler.jsonc triggers) |
| `wrangler.jsonc` | Cloudflare Workers config pointing to `.open-next/worker.js` |

## Next.js 16 — Critical Quirks

- **No `middleware.ts` and no `proxy.ts`.** Next.js 16 forces `proxy.ts` to Node.js runtime, but OpenNext Cloudflare rejects Node.js middleware — these two are incompatible today. Auth gating lives in route-group layouts (`(auth)/layout.tsx`, `(setup)/layout.tsx`, `(dashboard)/layout.tsx`) instead. Do not reintroduce a middleware/proxy file.
- **`@opennextjs/cloudflare` is pinned to `1.18.1`** (no caret) in `package.json`. 1.19+ has additional checks that break the build. Do not bump without first verifying the build locally.
- **`'use server'` files may only export async functions** — constants live in `src/lib/constants/`.

## Database Modules (65 tables)

1. **Multi-tenancy** — `organizations`, `profiles`, `org_members`
2. **Configuration** — `project_phases`, `disciplines`, `equipment_types` (all org-scoped, nothing hardcoded)
3. **Hierarchy** — `projects` → `areas` → `systems` → `subsystems`
4. **Assets** — `tags`, `cables`, `signals`, `loops`, `loop_tags`, `interlocks`
5. **Preservation** — `procedures`, `plans`, `records`, `attachments` (PG trigger auto-updates `next_due_date`)
6. **ITR Templates** — `itr_templates` → `sections` → `items` (types: checkbox/text/number/measurement/select/photo/signature/date/yes_no)
7. **ITR Instances** — `itrs`, `assignments`, `responses`, `signatures`, `attachments`
8. **Punch List** — `punches`, `comments`, `attachments` (Cat A = hard blocker, Cat B = transferable with exception, Cat C = minor)
9. **Certificates** — `certificates`, `punch_exceptions` (MC, RFPC, RFC, RFSU — auto-blocked until punches cleared)
10. **Work Plans & KPIs** — `work_plans`, `work_plan_items`, `kpi_snapshots`
11. **PSSR** — pre-startup safety review templates + project reviews
12. **Platform** — API keys, webhooks, audit log, notifications/push subscriptions, P&ID documents/hotspots, handover, workflows, data-quality

## Multi-Tenancy & Security

All 65 tables have **Postgres Row Level Security** enabled (199 policies routed through `SECURITY DEFINER` helpers: `is_org_member`, `is_project_member`, etc.). Users only see data for orgs they belong to via `org_members`.

Rules for every new page/query/action:
- Always go through an authenticated Supabase client; never the service-role key in client code.
- **New/modified server actions must use `withAuth`/`withAuthOnly`** (`src/lib/auth/withAuth.ts`). Legacy actions still hand-roll `getActiveMembership()` + role checks — migrate opportunistically (multi-session plan S2-S8 in progress).
- Any client-supplied ID (`projectId`, `tagId`, …) must be ownership-verified against the caller's org (`src/lib/auth/access.ts`) before use — especially before any admin-client (service-role) query or `SECURITY DEFINER` RPC.
- New `SECURITY DEFINER` functions must check `is_project_member`/`is_org_member` internally — they bypass RLS.

## AI (Claude) — matriz ITR híbrida

- `src/lib/ai/claude.ts` crea el cliente (`@anthropic-ai/sdk`, modelo `claude-opus-5`). Requiere el secreto `ANTHROPIC_API_KEY` (Wrangler secret en Cloudflare; `.env.local` en dev). Sin clave, las acciones de IA devuelven un error claro y la UI lo muestra.
- `src/app/actions/itr-matrix.ts`: la IA **propone** filas en `equipment_type_templates` (tipo de equipo × plantilla ITR) con motivo y confianza; un editor acepta/rechaza en `/admin/templates/matrix`. Regenerar nunca pisa decisiones humanas. Respaldo por tag: `suggestItrsForTag` (no persiste). Reglas: la IA nunca asigna; sugiere por fase; puede cruzar disciplinas si lo justifica.

## Styling Convention

Existing components use **inline styles** (React `style={{}}`) rather than Tailwind classes. Keep this pattern consistent within existing files. New modules may use either approach, but be consistent within a file.

## Domain Model Terminology

- **Tag** — a physical piece of equipment or instrument (the atomic unit)
- **ITR** — Inspection & Test Record; created from a template, executed per tag
- **Punch** — a deficiency found during inspection; must be resolved before certificates are issued
- **Certificate** — formal completion document (MC = Mechanical Completion, RFPC = Ready for Pre-Commissioning, etc.)
- **Preservation** — scheduled maintenance tasks during idle periods before operations
- **PSSR** — Pre-Startup Safety Review
- **Phase** — configurable per org (default A/B/C/D but can be anything)

## State of the Product

**Built and functional** (real DB reads+writes): auth + setup wizard, dashboard with real KPIs, full project hierarchy, Excel import (hierarchy + signals), ITR template builder, field ITR execution (photos, signatures, autosave), punch list lifecycle, preservation, certificates with punch blocking, PSSR, work plans, loops/signals/interlocks, P&ID documents with hotspots, digital twin/explorer views, reports (PDF via pdf-lib + Excel), public API v1, admin suite (users, config, api-keys, webhooks, audit, data-quality, workflows, handover), control tower, inbox, QR scan, PWA + web push, i18n, landing page.

**Known gaps / active backlog:**
- KPI history is project-level only (no per-phase snapshots → no S-curves yet)
- `withAuth` wrapper adopted in only ~2 of 33 action files (migration in progress)
- `src/types/database.ts` hand-maintained → ~131 `any`/`as unknown as` casts at query boundaries (goal: generate from schema)
- A handful of 800–1500-line client components pending decomposition (`ItrExecution.tsx`, `TemplateBuilder.tsx`, `TagDetail.tsx`)
- Performance unvalidated at industrial scale (50k+ tags)
