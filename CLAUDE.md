# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is CommUp

CommUp is a SaaS Completion & Commissioning Management System for industrial projects (Oil & Gas, renewables, any industry). It rivals ICAPS, WinPCS, bluerithm, Intergraph and OperCom. The platform is multi-tenant: multiple companies, multiple projects, each isolated via Postgres RLS.

**Live domain:** commup.app (Cloudflare Workers)
**Supabase project:** mdyljpgzvigzjpqluket.supabase.co
**GitHub:** https://github.com/FerPers/commup-starter-template

## Commands

```bash
npm run dev          # Local dev server at http://localhost:3000
npm run build        # Next.js production build
npm run lint         # ESLint
npm run deploy       # Build for Cloudflare + deploy to commup.app
npm run preview      # Build for Cloudflare + local Wrangler preview
npm run cf-typegen   # Regenerate env.d.ts from Wrangler bindings
```

## Stack

- **Next.js 16** — App Router, Server Components, React 19
- **TypeScript** — strict mode throughout
- **Tailwind CSS 4** — utility classes; inline styles also used in existing components
- **Supabase** — Postgres (35 tables), Auth, Storage, Realtime, RLS
- **Cloudflare Workers** — deployed via `@opennextjs/cloudflare` (OpenNext)
- **`@supabase/ssr`** — SSR-safe Supabase client with cookie-based sessions

## Route Architecture

```
src/app/
  (auth)/           # Route group — no shared layout, just passthrough
    login/page.tsx  # 'use client' — Supabase signInWithPassword
  (dashboard)/      # Route group — wraps all authenticated pages
    layout.tsx      # Sidebar + main content flex layout
    dashboard/      # Main overview page (Server Component)
  admin/            # Admin panel (currently placeholder)
  layout.tsx        # Root layout — metadata, globals.css
  page.tsx          # Redirects to /dashboard
```

## Key Files

| File | Purpose |
|------|---------|
| `src/proxy.ts` | Route protection (replaces `middleware.ts` — Next.js 16 uses `proxy` convention) |
| `src/lib/supabase/client.ts` | Browser Supabase client (`createBrowserClient`) |
| `src/lib/supabase/server.ts` | Server Supabase client (`createServerClient` with cookies) |
| `src/types/database.ts` | Full TypeScript interfaces for all 35 DB tables + enum types |
| `src/components/layout/sidebar.tsx` | `'use client'` sidebar with nav groups, active state, logout |
| `src/lib/utils.ts` | `cn()`, `formatPercent()`, `formatDate()`, `getPunchCategoryColor()` |
| `supabase-schema.sql` | Canonical Postgres schema — run this in Supabase SQL editor |
| `wrangler.jsonc` | Cloudflare Workers config pointing to `.open-next/worker.js` |

## Next.js 16 — Critical Quirk

**`middleware.ts` is deprecated.** This project uses `src/proxy.ts` with an exported function named `proxy` (not `middleware`). Do not create a `middleware.ts` file — it will conflict.

## Database Modules (35 tables)

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

## Multi-Tenancy & Security

All tables are isolated by `org_id` via **Postgres Row Level Security**. Users only see data for orgs they belong to via `org_members`. Every new page/query must respect this — always filter through an authenticated Supabase client, never the service role key in client code.

## Styling Convention

Existing components use **inline styles** (React `style={{}}`) rather than Tailwind classes. Keep this pattern consistent within existing files. New modules may use either approach, but be consistent within a file.

## Domain Model Terminology

- **Tag** — a physical piece of equipment or instrument (the atomic unit)
- **ITR** — Inspection & Test Record; created from a template, executed per tag
- **Punch** — a deficiency found during inspection; must be resolved before certificates are issued
- **Certificate** — formal completion document (MC = Mechanical Completion, RFPC = Ready for Pre-Commissioning, etc.)
- **Preservation** — scheduled maintenance tasks during idle periods before operations
- **Phase** — configurable per org (default A/B/C/D but can be anything)

## What's Built vs. What's Next

**Done:** Auth flow, dashboard shell (hardcoded 0% KPIs), sidebar navigation, full DB schema in Supabase, all TypeScript types.

**Not yet built:** Organization/project creation wizard, hierarchy import (Excel), ITR template builder, field ITR execution, punch list module, preservation module, certificates, real KPI queries, work plans, user management.
