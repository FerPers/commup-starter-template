# CommUp — Plan Estratégico: De CCMS a Execution Digital Backbone

## Contexto

CommUp hoy es un CCMS sólido en fase MVP+ (Stage 9): modelo de datos maduro (35 tablas), 14 módulos funcionales (Tags, ITRs, Punches, Certificates, Preservation, Loops, Signals, Interlocks, PSSR, P&ID, Work Plans, KPIs), multi-tenant con RLS, PWA parcial con offline queue, y stack cloud-native (Next.js 16 + Supabase + Cloudflare Workers). **Técnicamente compite con ICAPS/WinPCS a nivel funcional básico.**

El objetivo de este plan no es "mejorar features", sino **redefinir el posicionamiento del producto**: pasar de *Completion & Commissioning Management System* (commodity) a **Execution Digital Backbone for Industrial Projects** — el sistema operativo del activo desde construcción hasta operación. La ventaja competitiva no está en más checklists, sino en: (1) data model relacional profundo con eventos, (2) workflow engine configurable, (3) Digital Twin lógico como núcleo, (4) AI/analytics operativos, (5) UX de campo consumer-grade.

Este documento sirve como **blueprint arquitectónico + roadmap evolutivo** desde el estado actual hasta el producto de referencia global.

---

## 1. Diagnóstico Crítico (estado actual vs. visión)

### Fortalezas reales
- **Modelo de datos**: 35 tablas con relaciones TAG ↔ ITR ↔ LOOP ↔ SYSTEM ↔ CERT ↔ PUNCH funcionales ([supabase-schema.sql](supabase-schema.sql), [src/types/database.ts](src/types/database.ts))
- **Multi-tenant RLS operativo** con helpers `is_project_member()` / `is_project_editor()`
- **Módulos core CRUD** funcionando: ITR execution con tipos diversos (photo, signature, measurement), punch list A/B/C, certificates con excepciones, preservation con triggers de `next_due_date`, work plans, PSSR
- **Offline queue funcional**: IndexedDB + sync en reconexión ([src/hooks/useOfflineSync.ts](src/hooks/useOfflineSync.ts), [src/lib/offline-queue.ts](src/lib/offline-queue.ts))
- **Cloud-native real**: Cloudflare Workers Edge runtime, no adaptado

### Gaps críticos (bloqueadores para ser "referente")

| # | Gap | Impacto | Ubicación |
|---|-----|---------|-----------|
| 1 | **Sin Workflow Engine real** — `itr_templates.condition_item_id` existe pero sin motor que lo evalúe | No hay "IF Loop OK AND Punch A = 0 THEN Enable Energization" | [src/app/actions/itr-*.ts](src/app/actions/) |
| 2 | **System Readiness hardcoded** — cálculo MC/RFSU/RFC manual, sin regla dinámica | Diferenciador #1 del MVP ausente | — |
| 3 | **Sin Event Bus / Event-driven** — todo polling + refetch; no hay `events` table | Bloquea real-time, auditoría, integraciones | — |
| 4 | **Sin API pública** — solo server actions internas | Imposible integrar P6, SAP, Maximo, AVEVA | [src/app/api/](src/app/api/) |
| 5 | **RLS incompleto** — falta en `certificates`, `signals`, `loops`, `preservation_*`, `work_plans`, `kpi_snapshots` | **Riesgo tenant leakage en producción** | [supabase-schema.sql](supabase-schema.sql) |
| 6 | **Sin versionamiento de documentos / ITR snapshots firmados** | Pérdida de trazabilidad legal | — |
| 7 | **Sin Realtime collaborativo** — Supabase Realtime no instanciado | Varios inspectores en mismo sistema → conflictos | — |
| 8 | **Mobile-first débil** — no hay QR/NFC scan, sin voice input, sin manifest PWA visible | UX de campo es el "mato a ICAPS" y hoy no es diferenciador | — |
| 9 | **Sin AI / analytics operativos** — KPIs son snapshots estáticos | Predicción de retrasos, detección de cuellos de botella, calidad de datos ausentes | — |
| 10 | **Sin Digital Twin lógico** — P&ID hotspots existen pero no hay "estado del activo" agregado navegable | Commodity feature level | [src/app/(dashboard)/projects/[id]/pid-documents/](src/app/(dashboard)/projects/) |
| 11 | **Sin CMMS handover bridge** — certificates emitidos pero sin transferencia estructurada a operación | El "commissioning continuo" post-handover es el ROI real para clientes | — |
| 12 | **Sin IIoT / live data hook** — no hay ingestión de DCS/SCADA/PI | "Auto-commissioning assisted" imposible hoy | — |

**Veredicto**: CommUp es hoy un **CCMS funcional nivel junior**. Para ser referente global necesita evolucionar en 4 ejes: **(A) profundidad de datos/eventos**, **(B) inteligencia de workflow**, **(C) UX de campo radical**, **(D) extensibilidad (API + integraciones)**.

---

## 2. Arquitectura Objetivo (5 capas)

```
┌──────────────────────────────────────────────────────────┐
│  EXPERIENCE LAYER                                         │
│  Web Control Tower · Field PWA · 3D/P&ID Twin Viewer     │
├──────────────────────────────────────────────────────────┤
│  APPLICATION / DOMAIN LAYER                               │
│  Commissioning Core · Tag & Asset · Workflow Engine ·    │
│  Punchlist · Certification · Document · Analytics/AI     │
├──────────────────────────────────────────────────────────┤
│  DATA & DIGITAL TWIN LAYER                                │
│  PostgreSQL (relacional) · Event Log · Snapshots ·       │
│  Object Storage (R2) · TimescaleDB (IIoT, opcional)      │
├──────────────────────────────────────────────────────────┤
│  INTEGRATION LAYER                                        │
│  REST/GraphQL API · Webhooks · Event Bus · Conectores    │
│  (P6, SAP, Maximo, AVEVA, PI, OPC-UA)                    │
├──────────────────────────────────────────────────────────┤
│  CLOUD INFRASTRUCTURE LAYER                               │
│  Cloudflare Workers · Supabase · R2 · Queues · KV        │
└──────────────────────────────────────────────────────────┘
```

### 2.1 Decisiones técnicas fundamentales

1. **Mantener monolito modular** (Next.js + Supabase) hasta >50k tags/proyecto. **No migrar a microservicios** hasta tener tracción. Modular boundary vía `src/modules/<domain>/` en lugar de microservicios.
2. **Event sourcing ligero**: nueva tabla `domain_events` (append-only) como single source of truth para workflow, auditoría, y sync con integraciones. Triggers PG publican eventos; Supabase Realtime + Cloudflare Queues consumen.
3. **Workflow Engine como servicio interno**: JSON-based DSL (BPMN-lite), evaluado en server actions y edge functions. No introducir Temporal/Camunda todavía.
4. **API pública vía Next Route Handlers** (`/api/v1/*`) con API keys por organización (nueva tabla `api_keys`). OpenAPI spec generada.
5. **Digital Twin = vista lógica agregada**, no 3D. Es una "vista 360° del tag" que combina estado ITR + punches + certs + preservation + P&ID hotspot + eventos recientes. 3D real (IFC/Navisworks) es V3.
6. **IIoT es opcional desde el inicio** pero con hook arquitectónico: tabla `signal_values` (Timescale extension en Supabase) para recibir samples vía webhook.

---

## 3. Roadmap Evolutivo (7 fases, desde estado actual)

### Stage 10 — **Cimientos de Diferenciación** (4–6 semanas) 🔥 CRÍTICO
**Objetivo**: Bloquear la ventaja de "System Readiness real" + tapar riesgos de seguridad.

- **10.1 RLS completo** en todas las tablas restantes (`certificates`, `signals`, `loops`, `preservation_*`, `work_plans`, `kpi_snapshots`, `interlocks`, `pid_*`). Migration + tests.
- **10.2 Tabla `domain_events`** append-only (`id, org_id, project_id, aggregate_type, aggregate_id, event_type, payload, actor_id, occurred_at`). Triggers PG para emitir eventos en INSERT/UPDATE/DELETE de entidades core.
- **10.3 System Readiness Engine v1**: función PL/pgSQL `compute_system_readiness(system_id)` que retorna `{itr_pct, open_punches_a, open_punches_b, ready_mc, ready_rfsu, ready_rfc, blockers[]}`. Se expone en dashboard Control Tower.
- **10.4 Audit log UI**: `/admin/audit/` ya existe como stub — cablearlo a `domain_events`.

**Archivos clave**: [supabase-schema.sql](supabase-schema.sql), [src/app/(dashboard)/admin/audit/](src/app/(dashboard)/admin/audit/), nueva [src/lib/readiness.ts](src/lib/readiness.ts)

---

### Stage 11 — **Workflow Engine Configurable** (6–8 semanas)
**Objetivo**: Convertir reglas hardcoded en DSL configurable por organización.

- **11.1 Tabla `workflow_rules`**: `{id, org_id, trigger_event, condition_jsonlogic, action_type, action_payload}`. Uso de [JsonLogic](https://jsonlogic.com/) para expresiones seguras sin eval.
- **11.2 Evaluador**: edge function que escucha `domain_events` y evalúa reglas. Acciones soportadas: `block_certificate`, `notify_user`, `create_punch`, `change_system_state`, `webhook_call`.
- **11.3 UI Rule Builder** en `/admin/workflows/` — visual, sin código.
- **11.4 Condiciones en ITR templates**: cablear los fields `condition_item_id` / `condition_value` ya existentes en `itr_template_items` al runtime en [ItrExecution](src/app/(dashboard)/projects/) — items condicionales se muestran/ocultan dinámicamente.

---

### Stage 12 — **Digital Twin Lógico + Tag 360°** (4–6 semanas)
**Objetivo**: El "asset viewer" que reemplaza el tab-hopping actual.

- **12.1 Vista `tag_360`** (SQL view materializada) que une: tag base + subsystem/system + ITRs (%/status) + punches abiertos + certs emitidos + preservation próxima + última señal (si IIoT) + hotspots P&ID donde aparece.
- **12.2 Página `/projects/[id]/twin`**: navegación System → Subsystem → Tag con tarjetas "semáforo" + drill-down. Reutiliza [TagsView.tsx](src/app/(dashboard)/projects/) como base pero con layout "asset card".
- **12.3 P&ID como entrada al Twin**: clic en hotspot existente → abre vista 360° del tag.

---

### Stage 13 — **API Pública + Webhooks** (4 semanas)
**Objetivo**: Habilitar integraciones P6 / SAP / Maximo. Ecosystem-ready.

- **13.1 Tabla `api_keys`** (org-scoped, scoped permissions) + middleware de autenticación.
- **13.2 REST API v1** en `/api/v1/*`: `GET/POST /tags`, `/itrs`, `/punches`, `/certificates`, `/systems`, `/events`. OpenAPI spec autogenerada.
- **13.3 Webhooks outbound**: tabla `webhook_subscriptions`, edge function que escucha `domain_events` y hace POST con reintentos exponenciales + HMAC signature.
- **13.4 Conector P6 ref**: script de sincronización de `activities → work_plan_items` (POC, no producción).

---

### Stage 14 — **UX de Campo Radical (PWA v2)** (6 semanas)
**Objetivo**: La UX que "mata ICAPS". Mobile-first real.

- **14.1 Service Worker + manifest.json**: PWA instalable real, offline-first (no solo queue).
- **14.2 QR/NFC scan**: librería `html5-qrcode`, deep link a `tag_360`.
- **14.3 Voice input** para campos de texto de ITR (Web Speech API).
- **14.4 Capture flow optimizado**: swipe entre items de ITR, auto-save, geolocation en fotos (ya existe, mejorar UX).
- **14.5 Push notifications** (Web Push API + Cloudflare Workers): "Tu ITR fue devuelto", "Punch Cat A te fue asignado".
- **14.6 Sync conflict resolution**: last-write-wins con log, no silent overwrites.

---

### Stage 15 — **Analytics & AI Operacional** (6–8 semanas)
**Objetivo**: Insights que ningún CCMS hoy tiene.

- **15.1 Predicción de retrasos**: modelo simple (regresión lineal + factores) sobre `domain_events` histórico → forecast de fecha de MC/RFSU por sistema.
- **15.2 Detección de cuellos de botella**: query de grafo sobre `system → dependencies → blockers`. UI: "Top 10 sistemas bloqueados y por qué".
- **15.3 Calidad de datos**: checks automáticos (ITRs inconsistentes, loops sin tags, punches huérfanos) → panel `/admin/data-quality`.
- **15.4 Asistente IA conversacional** (opcional, Claude API): "¿Qué falta para liberar el System-042?" → consulta `tag_360` + readiness + devuelve explicación natural.

---

### Stage 16 — **Handover Bridge + IIoT Hooks** (8 semanas)
**Objetivo**: Ser el puente Proyecto → Operación. Extender el ciclo de vida.

- **16.1 Handover package**: export estructurado (JSON + PDF) con todo el paquete del sistema listo para CMMS. Conectores POC: SAP PM, Maximo.
- **16.2 Post-handover tracking**: punches Cat B transferidos se mantienen vivos post-certificación con ownership transferido.
- **16.3 IIoT webhook ingestion**: endpoint `/api/v1/signals/samples` para recibir valores de PI/OPC-UA (batch). Tabla `signal_values` (Timescale).
- **16.4 Auto-commissioning assisted**: regla de workflow "si señal de loop responde correctamente → sugerir cerrar ITR de loop test".

---

## 4. Criterios de éxito por Stage

| Stage | Verificación E2E |
|-------|------------------|
| 10 | `SELECT compute_system_readiness('<uuid>')` retorna blockers reales; intentar leer cert de otro org vía SQL retorna 0 rows |
| 11 | Crear regla UI "block MC si punch A > 0", provocar evento, certificado se bloquea automáticamente |
| 12 | Navegar P&ID → clic hotspot → ver Tag 360° con todo su estado agregado en <1s |
| 13 | `curl -H "x-api-key: …" /api/v1/tags` retorna JSON; crear webhook, modificar ITR, recibir POST en endpoint externo |
| 14 | Instalar PWA en iOS/Android, escanear QR de tag, capturar ITR offline, cerrar app, reconectar, verificar sync sin pérdida |
| 15 | Dashboard muestra "System-042: forecast MC 2026-05-10 (±3 días), 2 blockers" |
| 16 | Exportar handover package, importarlo a SAP PM de test, todos los tags con historial preservado |

---

## 5. Archivos críticos a tocar (resumen)

- [supabase-schema.sql](supabase-schema.sql) — migraciones para `domain_events`, `workflow_rules`, `api_keys`, `webhook_subscriptions`, `signal_values`, RLS completo
- [src/types/database.ts](src/types/database.ts) — tipos nuevos
- [src/lib/](src/lib/) — nuevos: `readiness.ts`, `workflow-engine.ts`, `event-bus.ts`, `api-auth.ts`
- [src/app/api/v1/](src/app/api/) — nuevos route handlers públicos
- [src/app/(dashboard)/admin/](src/app/(dashboard)/admin/) — `workflows/`, `api-keys/`, `webhooks/`, `data-quality/`
- [src/app/(dashboard)/projects/[id]/twin/](src/app/(dashboard)/projects/) — nueva ruta Digital Twin lógico
- [src/hooks/useOfflineSync.ts](src/hooks/useOfflineSync.ts) — evolucionar a sync v2 con conflict resolution
- nuevo `public/manifest.json` + `public/sw.js` — PWA v2

---

## 6. Recomendación de secuencia

**Empezar por Stage 10 sin excepción** — RLS incompleto es un riesgo de seguridad en producción y `domain_events` es la base sobre la que todo lo demás se apoya. Stage 11 (Workflow Engine) es el siguiente diferenciador de mayor ROI. Stage 12 (Digital Twin lógico) es el "wow factor" visual para demos comerciales. Stages 13–16 pueden paralelizarse según demanda de clientes concretos.

**Regla de oro**: cada Stage debe dejar CommUp **utilizable en producción** — nada de branches de 3 meses. Feature-flag lo que no esté listo.

## 7. Decisiones de Stack & Límites Conocidos

### 7.1 ¿Hay que migrar tecnologías?

**No.** El stack actual (Next.js 16 + Supabase + Cloudflare Workers) cubre Stages 10–16 sin reemplazos mayores. Solo hay que **clarificar dónde vive cada tipo de lógica** para respetar los límites de cada capa.

### 7.2 Supabase — qué hace bien y qué vigilar

**Suficiente para**: event sourcing (triggers PG), workflow engine (Edge Functions Deno), readiness (PL/pgSQL + vistas materializadas), webhooks outbound (`pg_net` extension), IIoT time-series (`timescaledb` en Pro), Realtime colaborativo.

**Límites a vigilar**:
| Límite | Umbral | Mitigación |
|---|---|---|
| PgBouncer transaction pool | Usar "transaction pooler" string | Ya correcto; evitar prepared statements |
| Realtime concurrent connections | 500 (Pro) / 10k (Team) | Canales por sistema, fallback a polling en dashboards grandes |
| Storage total | 100GB (Pro) | Mover adjuntos grandes a R2 (ver 7.5) |
| Edge Function timeout | 400s (Deno) | OK para workflow engine y reports |

### 7.3 Cloudflare Workers — límites que afectan la arquitectura

| Límite | Impacto | Mitigación |
|---|---|---|
| **CPU time 30s máx (paid)** | Readiness engine sobre 10k tags puede hacer timeout | Cómputo pesado → **Supabase Edge Functions o funciones PG**; Workers solo orquesta |
| **No WebSockets persistentes (sin Durable Objects)** | Realtime colaborativo | Cliente se conecta **directo** a Supabase Realtime — Workers no intermedia |
| **Request body 100MB, 50 subrequests/req** | Subir P&IDs o exportar handover packages | **Upload directo cliente → R2** con signed URLs, no vía Worker |
| **No filesystem / Node APIs** | Libs de PDF, Excel, procesamiento imagen pueden fallar | Usar WASM, o mover a Supabase Edge Functions (Deno tiene APIs más amplias) |

**Regla de oro**: Workers = edge render + orquestación ligera. **Todo cómputo async pesado vive en Supabase.**

### 7.4 Qué NO migrar (y por qué)

- ❌ **Kubernetes/EKS** — serverless cubre >95% del caso hasta >1M tags
- ❌ **MongoDB / NoSQL híbrido** — JSONB en Postgres ya cubre ITR responses flexibles
- ❌ **Kafka/RabbitMQ** — `domain_events` + Supabase Realtime + Cloudflare Queues son suficientes
- ❌ **Temporal/Camunda** — JsonLogic DSL propio es más simple y cubre hasta V3
- ❌ **Mobile nativo iOS/Android** — PWA v2 cubre el caso

### 7.5 Estrategia de almacenamiento (archivos, fotos, PDFs)

CommUp tiene cuenta de **Google Workspace** → Drive es parte del stack disponible. Análisis:

| Necesidad | Mejor opción | Por qué |
|---|---|---|
| **Fotos ITR de campo** (alto volumen, acceso rápido, offline) | **Cloudflare R2** | Signed URLs, zero egress, acceso <100ms desde edge, PWA puede cachear directamente |
| **Adjuntos punchlist** (fotos, videos cortos) | **Cloudflare R2** | Igual que arriba |
| **P&IDs y drawings operativos** (frecuentes, versionados) | **Cloudflare R2** | Visor web rápido, signed URLs, versionado vía key prefix |
| **Handover packages (PDF final firmado)** | **R2 primario + sync a Google Drive** | R2 para app; Drive para archivo humano-accesible, compartible con cliente |
| **Certificados emitidos (PDF firmado legal)** | **R2 + copia automática a Drive** | Drive facilita distribución a stakeholders no-CommUp |
| **Reports ejecutivos / KPI exports** | **Export on-demand a Drive del usuario** | Usuario decide dónde guardarlos |

**Por qué Google Drive NO como almacenamiento primario**:
1. **Rate limits de API**: 1000 req/100s por usuario, 10k/100s por proyecto. Un equipo de campo subiendo fotos de ITR puede saturarlos.
2. **Sin signed URLs tipo S3** — no puedes dar acceso público temporal sin proxy via Workers (consume CPU time, rompe PWA caching directo).
3. **Ownership complicado**: files subidos vía service account cuentan contra su cuota; shared drives tienen límite de 400k items por drive.
4. **No optimizado para hotlinking / thumbnails** — cada request pasa por auth de Drive, latencia alta vs CDN edge.
5. **Offline sync PWA** — no puedes cachear Drive directamente en service worker sin proxy.

**Por qué Google Drive SÍ como destino secundario (y muy valioso)**:
1. **El cliente ya lo tiene** — compartir handover packages, certificados, reports con contratistas/auditores externos es trivial.
2. **Preview nativo** — PDFs, fotos, Excel se previsualizan sin descargar.
3. **Costo $0 marginal** — ya pagan Workspace, R2 ya es gratis egress.
4. **Colaboración humana** — comentarios, permisos granulares, shared drives por cliente/proyecto.

**Arquitectura propuesta (patrón "R2 primary, Drive archival")**:

```
Campo (PWA) ──upload──▶ Cloudflare R2 (primary, operational)
                             │
                             ├──▶ App lee/escribe vía signed URLs
                             │
                             └──▶ Sync job (Edge Function) ──▶ Google Drive
                                   Solo cuando:
                                   - Cert MC/RFSU/RFC emitido → copia PDF final
                                   - Handover package aprobado → carpeta del cliente
                                   - Usuario pide "exportar a Drive"
```

**Implementación concreta** (Stage 13 o 16):
- **13.x Drive connector service** (`src/lib/integrations/google-drive.ts`):
  - OAuth 2.0 por organización (tabla `org_integrations` con tokens encriptados)
  - Service account opcional para sync automática
  - Métodos: `syncCertificateToDrive(certId)`, `exportHandoverPackage(systemId, folderId)`, `shareWithClient(fileId, email)`
- **Estructura de carpetas en Drive** por organización:
  ```
  CommUp/
    <Project Name>/
      Certificates/
        MC/ RFSU/ RFC/
      Handover Packages/
      Reports/
  ```
- **Tabla nueva**: `drive_sync_log` (`file_id, r2_key, drive_file_id, synced_at, status`) para idempotencia

**Cuándo agregar Drive al roadmap**: en **Stage 13** (API & Integraciones), como primer conector. Es más simple y de mayor ROI inmediato que P6/SAP para el cliente tipo.

---

## 8. Lo que NO haremos (todavía)

- ❌ Microservicios / Kubernetes (innecesario hasta >50k tags/proyecto)
- ❌ Digital Twin 3D real (IFC/Navisworks) — diferir a V3
- ❌ Motor BPMN completo (Camunda/Temporal) — JsonLogic suficiente
- ❌ ML profundo / deep learning — regresión + heurísticas son suficientes para V1 de analytics
- ❌ Mobile nativo iOS/Android — PWA cubre 95% del caso
