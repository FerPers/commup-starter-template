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
- **xlsx** (SheetJS CE 0.20.x, installed from the `https://cdn.sheetjs.com/xlsx-<ver>/xlsx-<ver>.tgz` tarball — the npm registry package is frozen at 0.18.5 with unfixed CVEs; do not `npm i xlsx@latest`) for Excel import/export (with formula-injection guard)
- **next-intl** for i18n; **web-push** for notifications; PWA installable

## Route Architecture

```
src/app/
  (auth)/login/            # 'use client' — Supabase signInWithPassword
  (setup)/setup/           # Org/project creation wizard
  (dashboard)/             # All authenticated pages (auth gate in layout.tsx)
    home/                  # Post-login entry: redirects by role (inspector/leader → /my-work, else /dashboard)
    my-work/               # «Mi trabajo»: personal queues (ITRs to execute/review, punches, plan, signatures, preservation)
    dashboard/             # KPI overview (real queries)
    projects/[id]/         # Project hub: tags, itrs, punches, certificates,
                           #   loops, signals, ce-matrices, work-plans, kpis,
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
| `src/components/layout/sidebar.tsx` | Sidebar in 3 blocks (Mi trabajo · Proyecto · Organización) + collapsible Administración. Uses `next/link`; role filtering is UX only. Project block shows the current project or the last visited one (localStorage) |
| `src/lib/constants/navigation.ts` + `src/lib/my-work/queues.ts` | `homeForRole()` and the pure queue logic behind `/my-work` (badge total via SQL `my_work_counts(p_org_id)`, SECURITY INVOKER) |
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
4. **Assets** — `tags`, `cables`, `signals`, `loops`, `loop_tags` (signals carry the loop-check chain JB → marshalling → I/O → DCS → HMI); C&E matrices `ce_matrices` → `ce_causes` × `ce_effects` → `ce_links` (replaced `interlocks`, fase 4-D)
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
- **All server actions use `withAuth`/`withAuthOnly`** (`src/lib/auth/withAuth.ts`) — 37/40 modules; the 3 exceptions (`alerts`, `locale`, `theme`) are user-scoped preferences with no org data. Keep it that way for every new action.
- Any client-supplied ID (`projectId`, `tagId`, …) must be ownership-verified against the caller's org (`src/lib/auth/access.ts`) before use — especially before any admin-client (service-role) query or `SECURITY DEFINER` RPC.
- New `SECURITY DEFINER` functions must check `is_project_member`/`is_org_member` internally — they bypass RLS. Revoke `EXECUTE` from `anon` on helpers (see migration `20260903150000`).
- **Edge Functions** (`supabase/functions/evaluate-workflow`, `webhook-dispatcher`) are deployed with `verify_jwt=false` because the pg_net trigger sends the Vault-stored service key. Each function authenticates by itself (`requireServiceCaller`: Bearer must equal the runtime service key or pass the Auth Admin API probe). Every executor mutation is scoped to `event.project_id`/`event.org_id`; outbound `fetch` goes through `assertPublicHttpsUrl` (https only, no private/loopback/metadata hosts, `redirect: 'manual'`). Never add an action that takes a free table name or id.
- **Storage multi-tenant** (migración `20261012210000`): en `itr-attachments`, `punch-attachments` y `preservation-attachments` el primer segmento de la ruta es el id de la entidad dueña (`<itr_id>/…`, `<punch_id>/…`, `<record_id>/…`) y las políticas exigen `storage_object_in_my_project(bucket, name)`. `pid-documents` usa `<project_id>/…`; `handover-packages` y `gate-evidence` usan `<org_id>/…`. Toda ruta nueva debe seguir esa convención o la subida será rechazada.
- **Security headers** live in `next.config.ts` (`headers()` + `poweredByHeader: false`): CSP, HSTS, nosniff, frame DENY, Referrer-Policy, Permissions-Policy. CSP has `'unsafe-inline'` for scripts because OpenNext has no per-request nonce (no middleware). If you add an external script/API host, add it to the CSP or it is silently blocked.
- Invitations are email-only (Supabase SMTP). There is no temp-password fallback — do not reintroduce one.

## Readiness gates (hold points) — fase 1 del plan readiness

- Plan completo: `docs/ANALISIS-GUIA-COMISIONAMIENTO-2026-10-12.md`. Migración `20261012180000_readiness_gates_engine.sql`.
- `readiness_gates` (por org; uno por fase sembrado automáticamente por trigger en `project_phases`) + `gate_criteria` (catálogo fijo: `itr_phase_approved`, `certificates_issued`, `pssr_approved`, `critical_tags_ready`, `manual_attestation`) + `requires_previous`.
- Cálculo en SQL: `compute_system_gates` / `compute_project_gates` (reglas de subsistema × fase en `system_phase_level`, igual que `eligibility.ts`). Estados: approved · approved_with_conditions · regressed · ready · ready_with_conditions · not_ready.
- Multifirma (migración `20261012200000`): quien aprueba firma como Comisionamiento y el gate queda `pending_signatures` hasta que firmen Operaciones y HSE (`readiness_gates.required_signatures`, roles en `cosign_roles`), cada firma de una persona distinta (`sign_system_gate`). Un gate pendiente de firmas no habilita al siguiente.
- Escritura SOLO por RPCs SECURITY DEFINER (`approve_system_gate`, `sign_system_gate`, `revoke_system_gate_approval`, `attest_gate_criterion`, `revoke_gate_attestation`): las tablas de aprobaciones/declaraciones no tienen políticas de escritura. Evidencia en bucket `gate-evidence` con ruta `<org>/<system>/…`, inmutable.
- UI: Control Tower = matriz sistema × gate → `/control-tower/[systemId]` (detalle + aprobación); configuración en `/admin/gates`. `tags.criticality` (safety/process/normal) alimenta `critical_tags_ready`.

## Gestión diaria — fase 5 del plan readiness

- Migración `20261017120000_daily_management.sql`; decisiones en el doc del plan §11. Hub `/projects/[id]/daily` (pestañas Acciones · Restricciones · TQ · Decisiones), detalle `/daily/[kind]/[itemId]`, Excel `/daily/export`; lógica pura en `src/lib/daily/catalog.ts`; acciones en `src/app/actions/daily.ts`.
- `actions` (ACC, origen polimórfico; «hecha» exige evidencia salvo método revisión; verifica otra persona), `project_constraints` (RES, escalamiento 1–4 manual con motivo), `technical_queries` (TQ; el rol client puede responder), `decisions` (DEC, inmutables, se reemplazan con `superseded_by`); `mgmt_events` (línea de tiempo) y `mgmt_attachments` + bucket `mgmt-evidence` (`<project_id>/<kind>/<entity_id>/…`, inmutable). Escritura SOLO por RPC SECURITY DEFINER.
- Planificación (sesión 2, migración `20261017150000`): `system_gate_plans` (forecast libre; compromiso solo líderes+, cambiarlo exige motivo) + `system_gate_plan_events`; `readiness_gates.weight`; `compute_system_progress` / `compute_project_progress` = Σ peso × ITR aprobados de la fase del gate (sin ITR = 0 %; proyecto ponderado por cantidad de ITR) — avance físico, separado del readiness. Snapshots `system_progress_snapshots` + `mgmt_kpi_snapshots` vía `take_mgmt_snapshot` (solo service_role; cron `/api/cron/snapshot` y `takeProjectSnapshot`). Look-ahead en `/projects/[id]/daily/lookahead` (lógica pura en `src/lib/readiness/planning.ts`).
- Reporte diario y relevo (sesión 3, migración `20261017180000`): `daily_reports` (RD-<proyecto>-AAAAMMDD[-Rn]; `data` lo arma SIEMPRE la BD con `daily_report_data`, nunca el cliente; 5 secciones; `set_daily_report_ai_draft` solo llena secciones vacías; emitir = inmutable + sha256; corregir = `revise_daily_report`) y `shift_handovers` (REL-0001; `handover_snapshot` al abrir y al entregar; recibe otra persona no-client). IA en `src/app/actions/daily-report.ts` (hechos en texto desde `src/lib/daily/report.ts`, salida zod); PDF en `src/lib/pdf/daily-report.ts`, regenerado desde los datos congelados (sin storage).
- Un ítem PSSR que pasa a «no» crea su acción (trigger `pssr_item_create_action`). `compute_system_gates` suma el criterio implícito `constraints_clear`: restricción no cerrada con gate → condición; abierta en nivel 4 → bloqueo. Cron `/api/cron/constraints-overdue` avisa vencidas.

## Arranque — fase 6 del plan readiness

- Sesión 1 (migración `20261017210000`, decisiones doc §12): hub `/projects/[id]/startup`. `procedures` (PRC-0001) → `procedure_revisions` (15 secciones fijas = `PROCEDURE_SECTIONS` en `src/lib/startup/catalog.ts` = SQL `procedure_section_keys()`; draft → in_review → approved; aprueba un líder+ distinto del autor; «verificado en campo» lo firma alguien distinto de quien aprobó) → `procedure_steps` (hold point con capacidad commissioning/operations/hse = `hold_release_roles()`; criterio de parada). `procedure_runs`/`procedure_run_steps`: pasos en orden, hold point detiene hasta que lo libera OTRA persona habilitada. `lineup_sheets`/`lineup_items`: verificar = otra persona y posición = requerida; `readiness_gates.requires_lineup` + criterio implícito `lineup_verified` (bloqueante; desactualizada si un registro F3 del sistema cambia de estado después). Todo en línea (offline pendiente).

- Sesión 2 (migración `20261018120000`): `startup_events` (EVT-0001; hitos `MILESTONES` uno vigente por sistema con testigo de capacidad fija = `milestone_witness_capacity()`; eventos libres; anular con motivo) + `startup_event_params` (foto IIoT: muestra más cercana ±5 min de `signal_samples`, prefiere calidad 0; `iiot_missing` → manual). `first_startup`/`first_hydrocarbon` exigen `startup_prerequisites()` (gate con `requires_lineup` aprobado con todas las firmas + PSSR más reciente aprobado). Gráfico desde la vista `signal_samples_1min`. Seed DEMO: `scripts/demo-data/seed_startup_samples_demo.sql`.

- Sesión 3 (migración `20261018150000`, decisiones doc §12.20–26): pestaña `/projects/[id]/startup/operations` (sistemas y traspasos, matriz de competencias, personal, repuestos) + `/startup/transfers/[transferId]`. `ops_personnel` (no son usuarios; `user_id` opcional) → `competency_records` (historial; nivel vigente = última evaluación, vencida = 0; nadie se evalúa a sí mismo; evalúa un líder+ o alguien de nivel 4) + `system_competency_targets` (personas por turno, default 2). `critical_spares`. `system_ownership` (una fila por sistema, sembrada por trigger) y `ownership_transfers` (TRF-0001): solo la etapa siguiente o una anterior como reversión con motivo; `ownership_checklist()` (claves en `ops.check.*`) y cada falta exige justificación ≥ 10; dos firmas de personas distintas (Comisionamiento = líder+, Operaciones = `hold_release_roles('operations')`); la 2.ª firma recalcula el checklist y falla si apareció una falta nueva. Al completar un traspaso (no reversión) a `operations`, `signOwnershipTransfer` genera el paquete de handover del sistema (service role) y lo enlaza con `link_transfer_handover` (solo service_role); si falla, la UI ofrece «Generar paquete». Cola `transfers_to_sign` en Mi trabajo y chip de etapa en Control Tower.

## Prueba de desempeño — fase 7 del plan readiness

- Migraciones `20261019120000` (S1) + `20261019150000` (S2) + `20261020120000` (S3, KPIs); decisiones doc §14. Hub `/projects/[id]/startup/performance` → prueba `[testId]` → intento `runs/[runId]` (consola, evaluación, PTC, PDF en `/pdf`). Catálogo puro en `src/lib/performance/catalog.ts`.
- `performance_tests` (PTT-0001) → revisiones con frontera, variables (señal/manual/derivada), criterios y pares de medidores; `performance_runs` (R1…: estabilización → formal → cierre, datos congelados en `performance_run_data`). `evaluate_performance_run` es la única fuente de verdad; resultado en 5 categorías lo registra un líder+ (inmutable). Certificado `performance_certificates` (PTC) con 3 firmas distintas (Comisionamiento, Operaciones, Cliente estricto). Gate: `readiness_gates.requires_performance` + criterio implícito `performance_accepted`. Escritura solo por RPC.
- KPIs en `take_mgmt_snapshot`: `startup` (éxito de primer arranque), `trips` (falla repetida F6), `performance` (aceptadas al primer intento). Seed DEMO: `scripts/demo-data/seed_performance_demo.sql`.
- Las acciones de resultado/PTC usan `window.confirm`: en el navegador integrado se cancela solo (para probar, sobrescribir `window.confirm`).

## Vendors y control documental — fase 8 del plan readiness

- Decisiones doc §15. Sesión 1 (migraciones `20261021120000` + `20261021130000`): `companies` por org (owner/admin; `company_id` en `org_members`, `ops_personnel`, `test_equipment.owner_company_id`); la empresa del firmante se congela por trigger en `itr_signatures`, `system_gate_signatures`/`approvals`, `performance_certificates` y `ownership_transfers`.
- Registro maestro `/projects/[id]/documents`: `documents` → `document_revisions` (draft/ifr/ifa/ifc/as_built/final; vigente = última emitida, `documents.current_revision_id` lo mantiene `document_refresh_current`) + `document_systems`; PDF en bucket `project-documents` (`<project_id>/<document_id>/…`, inmutable) y/o `external_url` https. Control documental = líder+. Lógica pura en `src/lib/documents/catalog.ts`; acciones en `src/app/actions/documents.ts`.
- `document_references` (ITR o revisión de procedimiento → revisión usada). Revisión superada = **bloqueo duro** en `sign_itr_atomic` y `transition_procedure_revision` (`document_references_blocker`); ya firmado/aprobado → criterio implícito `documents_current` (condición, amarillo) hasta revalidar (líder+, motivo ≥ 10) o rehacer. Panel `src/components/documents/DocumentReferences.tsx`.
- Gates nuevos: `seed_default_gate_for_phase` enciende `requires_lineup` en RFSU / fase SU.

## AI (Claude) — matriz ITR híbrida

- `src/lib/ai/claude.ts` crea el cliente (`@anthropic-ai/sdk`, modelo `claude-opus-5-5`). Requiere el secreto `ANTHROPIC_API_KEY` (Wrangler secret en Cloudflare; `.env.local` en dev). Sin clave, las acciones de IA devuelven un error claro y la UI lo muestra.
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

**Built and functional** (real DB reads+writes): auth + setup wizard, dashboard with real KPIs, full project hierarchy, Excel import (hierarchy + signals), ITR template builder, field ITR execution (photos, signatures, autosave), punch list lifecycle, preservation, certificates with punch blocking, PSSR, work plans, loops/signals/C&E matrices, P&ID documents with hotspots, digital twin/explorer views, reports (PDF via pdf-lib + Excel), public API v1, admin suite (users, config, api-keys, webhooks, audit, data-quality, workflows, handover), control tower, inbox, QR scan, PWA + web push, i18n, landing page.

**Known gaps / active backlog:**
- KPI history is project-level only (no per-phase snapshots → no S-curves yet)
- `src/types/supabase.generated.ts` is generated from the schema; `src/types/database.ts` keeps hand-written interfaces on top. Residual `as unknown as` casts remain at some query boundaries
- A handful of 800–1500-line client components pending decomposition (`ItrExecution.tsx`, `TemplateBuilder.tsx`, `TagDetail.tsx`)
- Performance unvalidated at industrial scale (50k+ tags). List pages (tags, ITRs, punches, KPIs, explorer) load full datasets without pagination; Supabase caps at 1000 rows by default → Sprint E (paginación + agregados SQL) pending
- Tests: `npm test` (vitest) — unit tests next to modules (`src/**/*.test.ts`: list params, KPI aggregates, Excel header/normalize, utils, certificate eligibility) + DB tests in `tests/db/` (RLS multi-tenant smoke, `compute_system_readiness` gates, atomic punch numbering) that run only when the `TEST_SUPABASE_URL`/`TEST_USER_A|B_*`/`TEST_PROJECT_A_ID` env vars exist (GitHub secrets pending → skipped in CI for now). Certificate gate rules live in `src/lib/certificates/eligibility.ts` (pure; mirrored by SQL `compute_system_readiness`, migration `20261012120000`, which Control Tower uses: gates = org phases; red = no ITRs / unapproved ITRs / open Cat A / open Cat B above `organizations.settings.max_open_cat_b_per_subsystem` (absent = 3, null = no limit); yellow = Cat B within limit, justified at issuance; Cat C never blocks) — keep action, page and SQL in sync
- Offline: IndexedDB queue covers ITR responses (LWW replay) and, since Sprint O (2026-09-07), photos, punches and signatures captured in the ITR execution page (outbox in `src/lib/offline-queue.ts`, drained by `src/lib/sync/replay.ts` after responses; client helpers in `src/lib/sync/outbox.ts`; retry policy + local ITR status mirror in `src/lib/sync/outbox-utils.ts`). Since F6 (2026-10-16, migración `20261018090000`), procedure runs and line-up sheets also work offline: steps (done/N/A/reaching a hold point), «Detener» and line-up positions queue in the `startup_outbox` store (rules in `src/lib/sync/startup-outbox-utils.ts`; replay in `src/lib/sync/startup-outbox.ts`, drained after the ITR outbox). RPCs take `p_captured_at` (field time, clamped) and line-up uses compare-and-set (`CU409` → conflict the user resolves); a rejected step stays in a visible «No sincronizado» tray and holds later steps. Release/verify/resume/complete/abort still need network. Rest of the app (punch list, certificates, admin) still needs network. Sell "offline ITR + field execution" (installed PWA), not "full offline"
