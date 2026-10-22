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
| `src/lib/supabase/membership.ts` | `getActiveMembership()` — legacy shared auth helper (pre-wrapper actions still use it). S20 (G-07): `getUser` + `org_members` once per request via React `cache()`, shared with `listMemberships`/`listInactiveMemberships`; `getMyWorkCounts(orgId)` for the badge. Do not add new `auth.getUser()` calls in pages/layouts |
| `src/lib/supabase/server.ts` / `client.ts` / `admin.ts` | Server / browser / service-role Supabase clients |
| `src/lib/api/auth.ts` | Public API v1 auth — hashed API keys (SHA-256), scopes, expiry |
| `src/lib/permissions.ts` + `src/lib/constants/` | Centralized role constants & permission checks |
| `src/lib/pdf/renderer.ts` | Shared server-side PDF renderer (pdf-lib) |
| `src/types/database.ts` | Hand-maintained TS interfaces for DB tables (goal: generate from schema) |
| `src/lib/utils.ts` | `cn()`, `formatPercent()`, `formatDate()`, `detectItrPhase()` |
| `src/lib/constants/status-colors.ts` | Shared status palettes (ITR + punch) |
| `src/lib/navigation/crumbs.ts` / `titles.ts` | N0: migas desde la ruta (etiquetas del menú, colecciones sin página no se enlazan) y glosario menú = h1 (test de paridad). Rebotes por rol con `denyAccess(tier)` (`src/lib/auth/denied.ts`), nunca `redirect('/dashboard')` |
| `src/components/layout/sidebar.tsx` + `src/lib/navigation/menu.ts` | N1: el menú sale de `buildMenu(role, projectId)` (puro; test de paridad menú ↔ `denyAccess` de cada página y metas de entradas por rol). Audiencias: inspector=campo, leader=líder, architect=planificación, owner/admin=gerencia (proyecto por fases plegables, abierta la de más actividad vía `getActivePhase`), client. Lo permitido que no es de la audiencia va a «Más…». Selector de proyecto con recientes (`ProjectSwitcher`). Bandeja = campana; preferencias de aviso en el menú de usuario. Ocultar es UX: la seguridad vive en cada page.tsx. Una página nueva del menú = entrada en `menu.ts` con el mismo `tier` que su guard |
| `projects/[id]/punches/[punchId]/` + `src/lib/punches/timeline.ts` | N1b: página propia del punch (los avisos, Mi trabajo y las listas enlazan aquí; no hay modal de detalle). Historia = alta + `punch_comments` (las RPC de transición dejan su comentario con prefijo fijo). La ficha del tag lee `?tab=` (`parseTagTab`): un enlace a una pestaña concreta usa `?tab=itrs|punches|preservation|docs|photos` |
| `src/lib/constants/navigation.ts` + `src/lib/my-work/queues.ts` | `homeForRole()` and the pure queue logic behind `/my-work` (badge total via SQL `my_work_counts(p_org_id)`, SECURITY INVOKER). N1: `CHIP_GROUPS` = columnas Ejecutar · Verificar · Firmar · Decidir de `MyWorkBoard`; `queueApplies` decide qué colas se ven en 0; `?project=` filtra (sin recordar) |
| `supabase/migrations/00000000000000_baseline.sql` | Canonical Postgres schema (pg_dump of prod 2026-05-15). See `supabase/README.md` for migration workflow |
| `supabase/functions-sql/*.sql` | **Canonical bodies** of the central SQL functions (gates, Mi trabajo, daily report, snapshots, ITR signing…), dumped from prod (S03). Change them only via their file + a full `CREATE OR REPLACE` migration (`scripts/sql/canonical-functions.mjs emit/dump`); anchor patches with `pg_get_functiondef` are forbidden by test, and `tests/db/function-drift.test.ts` checks prod = file |
| `public/sw.js` | **Hand-maintained** service worker (the real one — edit the .js directly) |
| `.github/workflows/lint.yml` | CI (TypeScript, ESLint, Vitest incl. tests/db) + job `deploy` con `needs: [typecheck, lint, test]`; el deploy valida las `NEXT_PUBLIC_*` (`scripts/ci/check-public-env.mjs`, G-16) y el tamaño del Worker (`scripts/ci/worker-size.mjs`, falla > 6 MB gzip, G-25): un push con CI roja no despliega por GH Actions (G-01). Cloudflare Workers Builds sigue desplegando aparte hasta desconectarlo (D1) |
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
- **Edge Functions** (`supabase/functions/evaluate-workflow`, `webhook-dispatcher`) are deployed with `verify_jwt=false` because `outbox_dispatch()` (pg_net) sends the Vault-stored service key. Each function authenticates by itself (`requireServiceCaller`: Bearer must equal the runtime service key or pass the Auth Admin API probe). Every executor mutation is scoped to `event.project_id`/`event.org_id`; outbound `fetch` goes through `assertPublicHttpsUrl` (https only, no private/loopback/metadata hosts, `redirect: 'manual'`). Never add an action that takes a free table name or id.
- **Storage multi-tenant** (migración `20261012210000`): en `itr-attachments`, `punch-attachments` y `preservation-attachments` el primer segmento de la ruta es el id de la entidad dueña (`<itr_id>/…`, `<punch_id>/…`, `<record_id>/…`) y las políticas exigen `storage_object_in_my_project(bucket, name)`. `pid-documents` usa `<project_id>/…`; `handover-packages` y `gate-evidence` usan `<org_id>/…`. Toda ruta nueva debe seguir esa convención o la subida será rechazada.
- **Security headers** live in `next.config.ts` (`headers()` + `poweredByHeader: false`): CSP, HSTS, nosniff, frame DENY, Referrer-Policy, Permissions-Policy. CSP has `'unsafe-inline'` for scripts because OpenNext has no per-request nonce (no middleware). If you add an external script/API host, add it to the CSP or it is silently blocked.
- Invitations are email-only (Supabase SMTP). There is no temp-password fallback — do not reintroduce one.

## Bus de eventos (S21)

- `domain_events` es un **outbox**: los triggers solo insertan (`emit_domain_event` para cambios de fila + transiciones de estado; `emit_business_event` para gates y traspasos) y `outbox_dispatch()` (pg_cron `domain-events-outbox`, cada minuto) reparte: entregas de webhook y llamadas a `evaluate-workflow` solo si hay una regla activa. **Nunca agregar un `net.http_post` por fila.**
- Catálogo v1 único en `src/lib/constants/domain-events.ts` (entidades en singular, eventos de negocio); un evento nuevo va en la función SQL y en el catálogo (test de paridad).
- Importaciones masivas: `createAdminClient({ bulk: '<tipo>' })` (sin eventos por fila) + `emitImportSummary`. La cabecera solo vale con service role.
- Webhooks firmados `X-CommUp-Signature: t=<unix>,v1=<hmac>` sobre `<unix>.<body>`; dedupe por `X-CommUp-Event-Id`. Retención diaria `cleanup_event_retention()` (eventos 365 días).

## Avisos y colas (S22, D16)

- **Una obligación nueva para otra persona = un aviso en `notifications`**, creado en SQL (`notify_obligation_trg` por tabla; `gate_status_transition_trg` para gate listo / en regresión) con `notify_users` (nunca al actor; dedupe 24 h por clave). Destinatarios con las mismas reglas que la RPC: `capacity_holders`, `project_role_members`, `gate_approvers`, `gate_cosigners`. Un tipo nuevo va en `src/lib/notifications/topics.ts` (tema de push + etiqueta `Inbox.kinds`, test de paridad).
- Push = `notifications` → `notification_push_outbox` (solo con suscripción activa) → cron `/api/cron/push-dispatch` (`claim_push_notifications`), filtrado por los temas que eligió el usuario.
- Colas de readiness de Mi trabajo en `my_readiness_items` (contador y lista de la misma fuente); el badge suma solo lo personal (`badgeTotal`). pg_cron `gate-status-refresh` mantiene al día el estado de gates.

## Readiness gates (hold points) — fase 1 del plan readiness

- Plan completo: `docs/ANALISIS-GUIA-COMISIONAMIENTO-2026-10-12.md`. Migración `20261012180000_readiness_gates_engine.sql`.
- `readiness_gates` (por org; uno por fase sembrado automáticamente por trigger en `project_phases`) + `gate_criteria` (catálogo fijo: `itr_phase_approved`, `certificates_issued`, `pssr_approved`, `critical_tags_ready`, `manual_attestation`) + `requires_previous`.
- Cálculo en SQL: `compute_system_gates` / `compute_project_gates` (reglas de subsistema × fase en `system_phase_level`, igual que `eligibility.ts`). Estados: approved · approved_with_conditions · regressed · ready · ready_with_conditions · not_ready.
- Multifirma (migración `20261012200000`): quien aprueba firma como Comisionamiento y el gate queda `pending_signatures` hasta que firmen Operaciones y HSE (`readiness_gates.required_signatures`, roles en `cosign_roles`), cada firma de una persona distinta (`sign_system_gate`). Un gate pendiente de firmas no habilita al siguiente.
- Escritura SOLO por RPCs SECURITY DEFINER (`approve_system_gate`, `sign_system_gate`, `revoke_system_gate_approval`, `attest_gate_criterion`, `revoke_gate_attestation`): las tablas de aprobaciones/declaraciones no tienen políticas de escritura. Evidencia en bucket `gate-evidence` con ruta `<org>/<system>/…`, inmutable.
- UI (N2a): Readiness = matriz sistema × gate en `/projects/[id]/readiness` (filtros en la URL que se aplican solos, `?gate=` siguiente gate, `?blocked=1`; Excel en `…/readiness/export`) → **ficha de sistema única** `/projects/[id]/systems/[systemId]` con pestañas `?tab=gates|plan|deps|startup|transfer|vendors|data` (`src/lib/systems/file-tabs.ts`; `?gate=<id>` abre ese gate). `/control-tower` = readiness por proyecto (portafolio, `loadPortfolioReadiness`, también el widget `readiness` del dashboard, D-38); el Resumen del proyecto es el tablero por fases (`src/lib/readiness/phase-board.ts`, N2b); `/control-tower?projectId=`, `/control-tower/export` y `/control-tower/[systemId]` solo redirigen (avisos viejos y SQL `gate_cosign`/`gate_status_transition_trg` siguen apuntando ahí). Enlaces nuevos: nunca a `/control-tower/…`. Configuración en `/admin/gates`. S23: la matriz sale SOLO de `compute_project_gates` (lógica en `src/lib/readiness/matrix.ts`: siguiente gate, bloqueo, filtros, `readinessSummary` = único readiness, igual que `compute_project_progress`); no usar `compute_project_readiness` en pantallas nuevas. Condiciones de un gate = acciones ACC de origen `gate`. `tags.criticality` (safety/process/normal) alimenta `critical_tags_ready`.
- S11 (D13): regresión configurable por org (`organizations.settings.gate_policy` = SQL `org_gate_policy` = TS `gatePolicy`): anterior en regresión bloquea, proveedor en regresión es condición, un punch nuevo no regresa gates aprobados. Gate de arranque explícito (`readiness_gates.is_startup_gate`). Estado `approved_needs_review`. Cambios de configuración auditados por trigger; criterios con declaraciones se archivan (`deleted_at`).

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

- S25a (migración `20261122120000`): `procedure_run_events` = línea de tiempo de cada ejecución (las columnas de `procedure_runs` son solo el estado actual; toda transición nueva registra su evento con `log_procedure_run_event`); `release_comment` aparte del comentario del ejecutor. Traspasos: pide un líder+, ítems no dispensables por org (`transfer_policy.non_dispensable` = `transferNonDispensable`, editable en `/admin/gates`) y cada firmante reconoce cada excepción. Bitácora: prerrequisitos a la hora del hito, estable/on-spec después del primer arranque, > 7 días atrás = líder+ con motivo. Competencias anulables (`void_competency_record`; nivel vigente sin anuladas).
- S25b (migración `20261123120000`): line-up con `as_found_position` (encontrada) y `found_position` (= dejada, la que se verifica), `lock_number`/`seal_number` obligatorio uno si queda LO/LC; pasos con `expected_min/max/unit` y `procedure_run_steps.out_of_range` (fuera de rango exige motivo); el line-up generado toma `equipment_types.lineup_candidate` / `critical_valve` (no el nombre de la categoría).

## Prueba de desempeño — fase 7 del plan readiness

- Migraciones `20261019120000` (S1) + `20261019150000` (S2) + `20261020120000` (S3, KPIs); decisiones doc §14. Hub `/projects/[id]/startup/performance` → prueba `[testId]` → intento `runs/[runId]` (consola, evaluación, PTC, PDF en `/pdf`). Catálogo puro en `src/lib/performance/catalog.ts`.
- `performance_tests` (PTT-0001) → revisiones con frontera, variables (señal/manual/derivada), criterios y pares de medidores; `performance_runs` (R1…: estabilización → formal → cierre, datos congelados en `performance_run_data`). `evaluate_performance_run` es la única fuente de verdad; resultado en 5 categorías lo registra un líder+ (inmutable). Certificado `performance_certificates` (PTC) con 3 firmas distintas (Comisionamiento, Operaciones, Cliente estricto). Gate: `readiness_gates.requires_performance` + criterio implícito `performance_accepted`. Escritura solo por RPC.
- KPIs en `take_mgmt_snapshot`: `startup` (éxito de primer arranque), `trips` (falla repetida F6), `performance` (aceptadas al primer intento).
- IIoT (S12): `signal_samples` está particionada por mes (retención 90 días por `pg_cron` + `cleanup_signal_samples_retention`, que también crea particiones). Para leer series usar la RPC `signal_series` (rango sargable, mín/máx, tope de puntos), no la vista `signal_samples_1min`. La ingesta (`/api/v1/signals/samples`) valida cada muestra y acepta `project_code`/`signal_id`; un nombre repetido entre proyectos es `ambiguous_signal`. Seed DEMO: `scripts/demo-data/seed_performance_demo.sql`.
- S25a (E-19): la evaluación trae `without_exclusions` / `exclusions_change_result`; si las exclusiones cambian el sugerido, registrar el resultado exige `acknowledge_performance_exclusions` del representante del cliente. Re-congelar nunca borra datos congelados.
- S25b (E-34): Arranque y Desempeño ya no usan `window.prompt`/`confirm`: usar `useAskDialog` (`src/components/ui/AskDialog.tsx`) en pantallas nuevas (texto con mínimo, opciones predefinidas, acción alternativa).

## Vendors y control documental — fase 8 del plan readiness

- Decisiones doc §15. Sesión 1 (migraciones `20261021120000` + `20261021130000`): `companies` por org (owner/admin; `company_id` en `org_members`, `ops_personnel`, `test_equipment.owner_company_id`); la empresa del firmante se congela por trigger en `itr_signatures`, `system_gate_signatures`/`approvals`, `performance_certificates` y `ownership_transfers`.
- Registro maestro `/projects/[id]/documents`: `documents` → `document_revisions` (draft/ifr/ifa/ifc/as_built/final; vigente = última emitida, `documents.current_revision_id` lo mantiene `document_refresh_current`) + `document_systems`; PDF en bucket `project-documents` (`<project_id>/<document_id>/…`, inmutable) y/o `external_url` https. Control documental = líder+. Lógica pura en `src/lib/documents/catalog.ts`; acciones en `src/app/actions/documents.ts`.
- `document_references` (ITR o revisión de procedimiento → revisión usada). Revisión superada = **bloqueo duro** en `sign_itr_atomic` y `transition_procedure_revision` (`document_references_blocker`); ya firmado/aprobado → criterio implícito `documents_current` (condición, amarillo) hasta revalidar (líder+, motivo ≥ 10) o rehacer. Panel `src/components/documents/DocumentReferences.tsx`.
- Gates nuevos: `seed_default_gate_for_phase` enciende `requires_lineup` en RFSU / fase SU.
- Sesión 2 (migración `20261022120000`): paquetes de vendor `/projects/[id]/vendors` — `vendor_packages` (VND-0001) + interfaces + checklist fijo (`vendor_checklist_keys`, = `VENDOR_CHECKLIST` en `src/lib/vendors/catalog.ts`); movilizar = gate del sistema aprobado + checklist + interfaces acordadas; FAT/SAT → hallazgo con tag = punch, sin tag = ACC (origen `vendor`); reporte final único requisito de desmovilizar junto con checklist y cero Cat A abiertos del paquete; recomendaciones con MOC por referencia. No afecta gates (solo chip en Control Tower). Acciones en `src/app/actions/vendors.ts`.
- S13 (migración `20261108120000`): vigente = fecha de emisión más reciente; revisiones anuladas (`void`); referencias automáticas al crear un ITR (trigger `itrs_auto_document_refs`) y masivas en la ficha del documento; `organizations.settings.document_policy.below_ifc` (`warn` | `block`) para IFR/IFA; FAT/SAT con re-prueba (`retest_of`); `tags.tag_key` (número normalizado) para C&E y QR; etiquetas QR por tag en `/projects/[id]/tags/labels` (QR con `/tag_360/<uuid>`).
- Sesión 3 (migración `20261023120000`): KPIs `documents` (As-Built/Final sobre documentos ligados a sistemas) y `vendors` (paquetes activos sin bloqueos) en `take_mgmt_snapshot`; trigger `company_link_from_text` enlaza la empresa de `ops_personnel.company` / `test_equipment.owner_company` por nombre. Seed DEMO `scripts/demo-data/seed_documents_vendors_demo.sql`. **Con esto el plan readiness F0–F8 está completo.**

## Paquete de handover (S24, D17)

- `generate_handover_package` (esquema 3.0, solo service_role) devuelve todo F1–F8 por sistema con firmas y hashes; `src/lib/handover/generate.ts` lo empaqueta (JSON + índice PDF + ZIP) vía `bundle.ts`: anexos con los mismos cargadores que las rutas PDF (`src/lib/pdf/load.ts`), topes `MAX_ITR_PDFS` / `MAX_DOCUMENT_BYTES`, lo omitido queda en el manifiesto.
- Firma Ed25519 (`src/lib/handover/sign.ts`, secreto `HANDOVER_ED25519_PRIVATE_KEY` = PKCS#8 base64, en Wrangler y `.env.local`): `manifest.sig` firma los bytes de `manifest.json`. `signature_hash` = sha256 de handover.json = el hash de `/verify/<hash>` (página pública, RPC `verify_handover_package` solo service_role). Clave pública en `/api/v1/handover/public-key`. Rotar la clave = nuevo `key_id`; los paquetes viejos se verifican con la pública de su fecha.
- Un PDF nuevo que deba ir al paquete: cargador en `load.ts` (lo usan la ruta y el ZIP) + tarea en `bundle.ts`.
- Registros de arranque imprimibles (S24b, E-22): `src/lib/pdf/startup-records.ts` (ejecución, line-up, evento); lo pendiente sale en celdas vacías para llenar a mano.

## Miembros y acceso (S15)

- `org_members` **no se escribe por REST**: solo RPC `add_org_member` / `set_member_role` / `remove_org_member` / `set_member_access` / `respond_org_invitation`. Estados `invited` · `active` · `suspended` + `access_expires_at`; todos los helpers de RLS exigen membresía activa y no vencida (`isActiveMembership` en `src/lib/members/catalog.ts`). Invitado o suspendido sin otra org activa → `/access`.
- `activity_log` solo a nombre propio; `notifications` solo service role/DEFINER y `link_url` relativo. API v1 limitada por el binding `API_RATE_LIMITER` (wrangler.jsonc) y errores de BD con `apiDbError`.

## PSSR (S16)

- Estado, firmas y aprobación del PSSR **solo por RPC** (`submit_pssr`, `sign_pssr`, `unsign_pssr`, `approve_pssr` —emite el RFSU—, `reject_pssr`, `update_pssr_meta`); `pssr_reviews` no tiene UPDATE directo y los ítems se bloquean al enviar. Firmas por capacidad (`required_signatures` de la plantilla, defecto operations + hse); aprueba Comisionamiento, distinto de quien envió y de los firmantes.

## Certificados (S17)

- Emitir, firmar, revocar, reabrir y excepciones Cat B **solo por RPC** (`issue_certificate`, `sign_certificate`, `unsign_certificate`, `revoke_certificate`, `reopen_certificate`, `add/remove_certificate_exception`); elegibilidad en SQL `certificate_eligibility` (= `eligibility.ts`, mantener en paridad) + fase anterior `certificate_previous_blocker`. Cada rol firma con su capacidad (`CERT_ROLE_CAPACITY` en `src/lib/constants/capacities.ts` = SQL `certificate_role_capacity`) y una persona por rol. Si la base cambia (punch, ITR, excepción), el trigger `trg_certificate_base_changed` marca `is_blocked` con `block_reason` y lo desbloquea solo cuando vuelve a cumplir; bloqueado no se firma.

## Firmantes designados (S14, D14)

- `project_capacities` (persona × proyecto × `commissioning` | `operations` | `hse` | `client_rep`), solo owner/admin por `assign_project_capacity` / `revoke_project_capacity`; pantalla `/projects/[id]/signatories`. **Quién firma lo decide `has_capacity(proyecto, capacidad)`**, nunca un array de roles: con designados firman solo ellos (cualquier rol); sin designados, `capacity_fallback_roles` (= `CAPACITY_FALLBACK_ROLES` en `src/lib/constants/capacities.ts`). client_rep = empresa tipo `owner` o rol client; commissioning nunca rol client.
- En la UI: `loadMyCapacities` / `loadMyCapacitiesByProject` (`src/lib/capacities/server.ts`, RPC `my_capacities`) y los helpers `canReleaseHold` / `canWitness` / `signableCapacities` / `canSignCertificate` reciben `MyCapacities`, no el rol.
- Niveles de rol: una sola fuente `src/lib/constants/roles.ts` (`ROLE_TIERS`, `tierRoles()` si hace falta el enum); no repetir `['owner', 'admin', …]` en páginas.

## Zona horaria del proyecto (S10, D12)

- `projects.timezone` (IANA, por defecto `America/Bogota`) define «hoy» y el corte del día. En SQL: `project_today(project_id)` / `tz_today(tz)` / `tz_day_start(date, tz)` — **nunca `CURRENT_DATE`** en funciones nuevas. En TS: `src/lib/time/zone.ts` (`todayIn`, `formatInZone`, `latestPossibleToday` para filtrar crons) y `src/lib/time/project-zones.ts`; el Worker corre en UTC, así que `new Date().toISOString().slice(0, 10)` es el día equivocado desde las 19:00 en Colombia.
- Horas en pantallas: con la zona del proyecto y rotuladas (`formatInZone`, sin `suppressHydrationWarning`) o, donde se carga con `datetime-local`, `useLocalTime()` (zona del navegador). Reportes emitidos antes de S10 no traen `data.timezone`: se avisa que su día se cortó en UTC y se corrigen solo con revisión.

## AI (Claude) — matriz ITR híbrida

- `src/lib/ai/claude.ts` crea el cliente (`@anthropic-ai/sdk`). **Toda llamada pasa por `runAi` (`src/lib/ai/run.ts`)**: cuota diaria por org (`organizations.settings.ai.daily_budget_usd`, defecto 20 USD), modelo por tarea (`AI_MODELS` en `src/lib/ai/pricing.ts`: Opus 5.5 matriz ITR e importación C&E, Sonnet 5.5 el resto) y registro en `ai_usage`. Requiere el secreto `ANTHROPIC_API_KEY` (Wrangler secret en Cloudflare; `.env.local` en dev). Sin clave, las acciones de IA devuelven un error claro y la UI lo muestra.
- **Generación masiva (S19):** `/projects/[id]/itrs/generate` crea ITR por alcance × fase desde las filas ACEPTADAS de la matriz (SQL `itr_generation_summary` / `generate_itrs`, SECURITY INVOKER, lotes de 300, idempotente por tag × código); responsables por disciplina en la vista previa. La lista de ITR filtra por área, sistema, subsistema y responsable (`itr_list_v.system_id` / `area_id` / `assignee_ids`; `assignee=me|none|<uuid>`).
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
- The old god components were split (`ItrExecution.tsx` ~660, `TemplateBuilder.tsx` ~420, `TagDetail.tsx` ~360 lines). The largest client components today are 700–900 lines (`PunchListView.tsx`, `CertificateDetail.tsx`, `OrgConfigView.tsx`, `BackupRestoreView.tsx`, `PidViewer.tsx`)
- Scale bench (S20): org LOADTEST in prod (300 systems · 50k tags · 100k ITR), `scripts/loadtest/{seed,bench,teardown}.sql`, target p95 < 1,5 s — met (gates 2 ms, readiness 0,09 s, Mi trabajo 0,19 s). **Gates are materialized** (`system_gate_status`, migración `20261116120000`): statement triggers bump a per-system `version` on every source table of `compute_system_gates_upto`; `compute_project_gates` recomputes only dirty systems (+ dependents). **A new table or column that feeds a gate criterion must be added to the dirty triggers** (and `gate_status_systems`), or Control Tower shows stale gates until the nightly `gate_status_audit` reports drift. **Never add a second FK between two tables already related** (e.g. composite `(x_id, project_id)` next to `x_id`): PostgREST embeds like `subsystems(code)` break with PGRST201 (B-17 attempt, reverted in `20261116130000`); same-project integrity is enforced instead by the trigger `guard_same_project` (migración `20261118120000`). Worker runs with Smart Placement (`wrangler.jsonc`); group independent awaits in `Promise.all`. Previously: performance unvalidated at industrial scale (50k+ tags). List pages (tags, ITRs, punches, KPIs, explorer) load full datasets without pagination; Supabase caps at 1000 rows by default → Sprint E (paginación + agregados SQL) pending
- Tests: `npm test` (vitest) — unit tests next to modules (`src/**/*.test.ts`: list params, KPI aggregates, Excel header/normalize, utils, certificate eligibility) + DB tests in `tests/db/` (RLS multi-tenant smoke, `compute_system_readiness` gates, atomic punch numbering) that run only when the `TEST_SUPABASE_URL`/`TEST_USER_A|B_*`/`TEST_PROJECT_A_ID` env vars exist (the GitHub secrets exist since 2026-09-04, so they DO run in CI — against the production Supabase project, by decision D2 of 2026-10-19; a separate test project stays pending). The role × table × operation authorization matrix lives in `tests/db/authz-matrix.test.ts` (A-17). Certificate gate rules live in `src/lib/certificates/eligibility.ts` (pure; mirrored by SQL `compute_system_readiness`, migration `20261012120000`, which Control Tower uses: gates = org phases; red = no ITRs / unapproved ITRs / open Cat A / open Cat B above `organizations.settings.max_open_cat_b_per_subsystem` (absent = 3, null = no limit); yellow = Cat B within limit, justified at issuance; Cat C never blocks) — keep action, page and SQL in sync
- Offline: IndexedDB queue covers ITR responses (LWW replay) and, since Sprint O (2026-09-07), photos, punches and signatures captured in the ITR execution page (outbox in `src/lib/offline-queue.ts`, drained by `src/lib/sync/replay.ts` after responses; client helpers in `src/lib/sync/outbox.ts`; retry policy + local ITR status mirror in `src/lib/sync/outbox-utils.ts`). Since F6 (2026-10-16, migración `20261018090000`), procedure runs and line-up sheets also work offline: steps (done/N/A/reaching a hold point), «Detener» and line-up positions queue in the `startup_outbox` store (rules in `src/lib/sync/startup-outbox-utils.ts`; replay in `src/lib/sync/startup-outbox.ts`, drained after the ITR outbox). RPCs take `p_captured_at` (field time, clamped) and line-up uses compare-and-set (`CU409` → conflict the user resolves); a rejected step stays in a visible «No sincronizado» tray and holds later steps. Release/verify/resume/complete/abort still need network. Rest of the app (punch list, certificates, admin) still needs network. Sell "offline ITR + field execution" (installed PWA), not "full offline"
- Offline por usuario (S18): cada captura guarda `capturedBy` y el replay envía solo lo del usuario en sesión (`src/lib/sync/ownership.ts`, `owner.ts`); lo ajeno o sin autor queda en el banner `HeldCaptures`. Cerrar sesión con pendientes = «sincronizar o descartar» (`SignOutDialog`) y luego `endDeviceSession()` (IndexedDB + cachés). El SW no cachea nada de Supabase; páginas en `commup-pages-*` (ITR preparados con «Preparar para trabajar sin red» en `commup-pages-prep-*`); fallback estático `public/offline.html`; se registra solo en producción. Toda bandeja nueva debe guardar `capturedBy` y filtrar con `sendableBy`. Respuestas de ITR: `responded_at` lo pone la BD (trigger `itr_response_times`, versión de la fila) y el replay hace compare-and-set con `expectedRespondedAt`; un conflicto lo decide el usuario en el ITR (`ResponseConflicts`); `captured_at` = hora de campo acotada
