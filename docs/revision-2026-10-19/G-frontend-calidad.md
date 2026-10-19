# Revisión G — Arquitectura frontend, calidad de código y práctica de ingeniería

Revisor: G · Fecha: 2026-10-19 · Commit base: `922b861` (main, limpio) · Modo: solo lectura (grep/wc/find/cat + `gh run`/`gh secret list` de solo lectura).

---

## 1. Resumen (franco)

El frontend está **mejor estructurado de lo que su tamaño haría temer**: las páginas son Server Components que delegan en vistas cliente (solo 4 `page.tsx` son `'use client'`, todas de auth/offline), 71 de 105 páginas paralelizan sus consultas con `Promise.all`, las claves i18n es/en tienen paridad perfecta (3 879/3 879), TypeScript está limpio (0 `@ts-ignore`, 3 `any`) y el lint de CI es estricto (`--max-warnings=0`, `no-floating-promises`). Los "god components" que CLAUDE.md da por pendientes **ya se descompusieron** (ItrExecution 656 líneas, TemplateBuilder 419, TagDetail 359).

Pero hay cuatro problemas serios que un cliente industrial notaría:

1. **La CI lleva 18 pushes seguidos en rojo (desde 2026-10-16) y el deploy a producción sale igual**, porque `deploy.yml` no depende del workflow de tests. La red de seguridad existe pero no protege nada.
2. **El modo offline no está ligado al usuario**: una firma, foto o punch encolado sin red por el usuario A se sube con la sesión de quien esté logueado cuando vuelva la red. En tabletas de campo compartidas, eso termina en firmas atribuidas a la persona equivocada. Además, el Service Worker guarda HTML autenticado y respuestas REST de Supabase que el logout no borra.
3. **No hay ni un `error.tsx`, `not-found.tsx` ni `loading.tsx` en toda la app**, y 422 lecturas de Supabase en páginas descartan `error`. Un timeout o un rechazo de RLS se ve como "no hay datos", y una excepción muestra la pantalla genérica de Next, en inglés.
4. **La i18n está a medias en la práctica**: 52 componentes cliente no usan traducciones (admin de plantillas, webhooks, API keys, workflows, importadores, wizard de setup, gemelo digital, asignación de ITR), y los 421 mensajes de error de las server actions están escritos solo en español. Un usuario en inglés ve una interfaz mezclada.

El sistema de diseño está **declarado pero no adoptado**. `src/components/ui` (15 componentes con README) convive con `daily-ui.tsx`/`register-ui.tsx`, que funcionan como segunda librería en la práctica, y con 74 redefiniciones locales de `btn`/`card`/`input`/`label`/`Chip`. A eso se suman 6 414 `style={{}}` y 2 842 colores hex literales. El modo oscuro y el contraste (chips ámbar/verde por debajo de 2.5:1) son las consecuencias visibles.

**Conteo de hallazgos:** 1 Crítica · 6 Altas · 12 Medias · 7 Bajas (26 en total).

---

## 2. Fortalezas

- **Límite servidor/cliente bien trazado.** Las páginas son RSC que consultan y pasan props a una vista `'use client'` (198 archivos cliente de 609). Ningún `layout.tsx` es cliente. `DashboardShell` es cliente pero recibe sidebar/topbar como `ReactNode` (patrón correcto de composición).
- **Paralelización de consultas.** 71/105 páginas usan `Promise.all`. `my-work/page.tsx` lanza 18 consultas en paralelo con límites (`QUEUE_LIMIT + 1`). Solo encontré una página con ≥ 6 awaits secuenciales (`daily/[kind]/[itemId]/page.tsx`, y parcialmente justificada).
- **Paridad i18n perfecta**: 3 879 claves en `es.json` y en `en.json`, 46 namespaces, 0 claves faltantes. Solo 27 cadenas largas son idénticas en ambos idiomas, y casi todas son nombres propios o códigos.
- **TypeScript estricto y limpio**: `strict: true`, 0 `@ts-ignore`/`@ts-expect-error`/`@ts-nocheck`, 3 `any` (todos en `NotificationsBell.tsx:65,73` y `tag-photos.ts:30`, con `eslint-disable` justificado).
- **Lint serio**: flat config nativo, `consistent-type-imports`, `no-floating-promises`, `prefer-nullish-coalescing` y `--max-warnings=0` en CI. Los 51 `eslint-disable` son puntuales (27 son `no-img-element`).
- **Lógica pura testeada**: 50 archivos de test unitario junto a los módulos (`eligibility`, `queues`, `outbox-utils`, `startup-outbox-utils`, `useItrAutosave`, `itr/table`…) y 13 suites de BD (RLS, readiness, startup…). En CI corren 372 tests.
- **Accesibilidad base**: `:focus-visible` global en `globals.css` (sobrevive a los `outline: none` inline), `Modal` compartido con trap de foco y Escape, 380 atributos `aria-*`, y los 69 `<table>` tienen su contenedor con `overflow: auto`.
- **Móvil**: `MobileTabBar` para roles de campo, drawer, `viewport-fit=cover`, `DataTable` con modo responsive y `Pagination` en las listas grandes.
- **Offline de ITR y arranque** con bandejas IndexedDB, reglas de reintento testeadas y bandeja visible de "No sincronizado".
- **Higiene de dependencias razonable**: xlsx CE 0.20.3 desde el CDN oficial (evita la 0.18.5 con CVEs), OpenNext fijado, React fijado y CSP con cabeceras de seguridad.
- **Librerías pesadas cargadas por ruta**: en el último build disponible, SheetJS (474 KB), pdf.js (438 KB), html5-qrcode (370 KB) y recharts (367 KB) quedan cada una en su propio chunk y no van en el bundle común.

---

## 3. Hallazgos

Formato: **ID · Severidad · Categoría** — Ubicación — Evidencia — Impacto — Recomendación — Esfuerzo — Confianza.

### 3.1 Métricas de referencia

| Métrica | Valor |
|---|---|
| Archivos TS/TSX en `src` | 609 (330 `.tsx`) · 113 111 LOC (13 095 son `supabase.generated.ts`) |
| `.tsx` > 600 líneas | 15 · `.tsx` > 400 líneas: 44 |
| Archivos `'use client'` | 198 |
| `style={{` / `className=` | 6 414 / 135 |
| Literales hex en `.tsx` | 2 842 en 187 archivos |
| `var(--…)` en `.tsx` | 4 870 |
| `as unknown as` (sin generados) | 157 |
| `any` | 3 |
| `eslint-disable` | 51 |
| `confirm(` | 56 |
| `router.refresh()` / `revalidatePath` (actions) / `useOptimistic` | 124 / 304 / 0 |
| `loading.tsx` / `error.tsx` / `not-found.tsx` | 0 / 0 / 0 |
| `{ data }` sin `error` en `page.tsx` | 422 (frente a 5 que capturan `error`) |
| Componentes cliente sin `useTranslations` (sin landing) | 52 |
| Errores literales en `src/app/actions` | 421 (todos en español; 0 `getTranslations`) |
| `toLocale*String(` / sin argumentos / con locale fijo | 77 / 39 / 15 |
| `suppressHydrationWarning` | 67 |
| Tests | 50 archivos unitarios + 13 de BD = 63 archivos, 372 tests en CI; 0 `.test.tsx`; 0 e2e en CI |
| Bundle del Worker (último build local, 2026-09-09, desactualizado) | `handler.mjs` 12.8 MB crudo / 2.98 MB gzip |

**Archivos `.tsx` más grandes:** PunchListView 889 · CertificateDetail 839 · OrgConfigView 814 · BackupRestoreView 734 · PidViewer 730 · WorkPlansGlobal 681 · SwipeCaptureFlow 668 · WorkPlansView 658 · ItrExecution 656 · PunchListGlobal 649 · SystemGatesView 626 · my-work/page 623 · UsersView 619 · QRNFCScanner 618 · PreservationExecution 601. (En `.ts`: itr-templates 855, templates-backup 774, preservation 764, DataQualityChecker 669, pssr 652.)

**Hotspots de `as unknown as`:** `my-work/page.tsx` 17 · `startup/performance/runs/[runId]/pdf/route.ts` 6 · `control-tower/[systemId]/page.tsx` 6 · `startup/runs/[runId]/page.tsx` 5 · `startup/lineups/[sheetId]/page.tsx` 5 · `lib/documents/refs-server.ts` 4 · `actions/vendors.ts` 4 · `actions/itr-templates.ts` 4.

**Adopción de `src/components/ui`** (archivos que importan cada componente): Card 13 · Button 10 · Modal 8 · EmptyState 7 · Input 6 · Table 6 · Pagination 6 · Select 5 · DataTable 2 · Toast 2 · Badge 1 · Textarea 0 · Skeleton 0 · Tooltip 0.

---

### CRÍTICA

#### G-01 · Crítica · CI/CD — CI en rojo desde hace 18 pushes y el deploy a producción no depende de ella
- **Ubicación:** `.github/workflows/deploy.yml` (job `deploy` sin `needs`, workflow independiente de `lint.yml`); `tests/db/daily-report.test.ts:35-36` y `:39`.
- **Evidencia:** `gh run list --workflow lint.yml` da **18 `failure` consecutivos** desde `2026-10-16T19:45` ("offline de ejecuciones de procedimiento…") hasta `922b861`. En cada uno de esos pushes, "Deploy to Cloudflare Workers" terminó en `success`. El último run falla en Vitest:
  - `arma los datos del día en SQL`: `daily_report_data` devuelve 14 claves y el test espera 12 (deriva entre migración y test).
  - `el borrador es único por fecha…`: `Test timed out in 5000ms` (el `it` no lleva el timeout de 30 s que sí tienen `beforeAll`/`afterAll`).
  - `gh secret list` muestra que los `TEST_*` existen desde 2026-09-04, así que **los tests de BD sí corren en CI**. CLAUDE.md ("GitHub secrets pending → skipped in CI") está desactualizado.
- **Impacto:** ninguna regresión detectada por tests frena producción. Con la CI siempre roja, una falla real nueva (RLS, readiness) pasa desapercibida entre las conocidas. Para un SaaS multi-tenant con firmas y gates, es el agujero de proceso más grave.
- **Recomendación:** (1) arreglar ya los dos tests (actualizar las claves esperadas y añadir `30_000` al `it`); (2) unir deploy y CI en un solo workflow con `needs: [typecheck, lint, test]`, o usar `workflow_run` con `conclusion == success`; (3) proteger `main` con status checks obligatorios; (4) corregir CLAUDE.md.
- **Esfuerzo:** S · **Confianza:** alta.

---

### ALTAS

#### G-02 · Alta · Offline/Integridad — La bandeja offline no guarda quién capturó; el replay usa la sesión actual
- **Ubicación:** `src/lib/offline-queue.ts:31-84` (tipos `OutboxPhoto`/`OutboxPunch`/`OutboxSignature`/`QueuedResponse` sin `userId`/`orgId`); `src/lib/sync/replay.ts` y `src/lib/sync/startup-outbox.ts` (sin `getUser()` ni comparación); `src/components/layout/UserMenu.tsx:104-108` (logout = `signOut()` + `router.push('/login')`, sin limpiar IndexedDB).
- **Evidencia:** `grep "user|session|getUser"` sobre `replay.ts` y `startup-outbox.ts` no devuelve nada. La base `commup-offline` es una sola por navegador, con stores `itr_responses`, `outbox` y `startup_outbox`.
- **Impacto:** en una tableta compartida (lo normal en campo), si el inspector A firma o fotografía sin red, cierra sesión y entra B, el replay sube la **firma de A con la identidad de B** (o falla por RLS y queda en "No sincronizado" a nombre de B). Lo mismo pasa con los pasos de procedimiento y las posiciones de line-up (F6). Compromete la trazabilidad de firmas, que es la base del producto.
- **Recomendación:** guardar `userId`+`orgId` en cada entrada al encolar. En el replay, descartar o retener las entradas cuyo `userId` no coincide con la sesión. En logout, si hay pendientes, advertir ("Tienes N registros sin sincronizar: sincroniza o descártalos") y luego borrar los stores. Añadir tests en `outbox-utils`.
- **Esfuerzo:** M · **Confianza:** alta (el código no tiene ligadura; el escenario multi-usuario lo deduzco del diseño).

#### G-03 · Alta · PWA/Privacidad — El Service Worker cachea HTML autenticado y respuestas REST/Auth de Supabase y no las purga nunca
- **Ubicación:** `public/sw.js:62-66` y `112-124` (`navigateFirst` guarda cada navegación en `CACHE_STATIC`); `:24-28` y `128-146` (`API_PATTERNS` incluye `/rest/v1/` y `/auth/v1/`; `networkWithStaleFallback` guarda toda respuesta GET OK en `CACHE_API`); `:10` (`SW_VERSION` manual).
- **Evidencia:** el TTL de 5 minutos solo se mira **al leer**; las entradas nunca se borran. El logout no envía mensaje al SW (0 coincidencias de `caches.delete` en `src`). Las cachés tampoco tienen límite de entradas.
- **Impacto:** datos de tenant (tags, punches, nombres) y HTML renderizado del usuario anterior quedan en Cache Storage. Sin red, un segundo usuario del mismo dispositivo ve las páginas cacheadas del anterior. Además, el almacenamiento crece sin control en dispositivos de campo con poco espacio.
- **Recomendación:** no cachear `/auth/v1/`. Cachear REST solo si de verdad se usa (hoy el offline real va por IndexedDB). Al hacer logout, `postMessage({type:'LOGOUT'})` → `caches.delete` de las cachés de API y HTML. Limitar entradas (LRU) y versionar `SW_VERSION` en el build.
- **Esfuerzo:** S–M · **Confianza:** alta.

#### G-04 · Alta · Robustez/UX — Sin `error.tsx`/`not-found.tsx`/`loading.tsx`, y los errores de Supabase se descartan en las páginas
- **Ubicación:** todo `src/app` (`find -name 'error.tsx' -o -name 'loading.tsx' -o -name 'not-found.tsx'` → 0); sobre las 105 `page.tsx`: 422 destructuraciones `{ data }` frente a 5 que capturan `error`, y 0 `throw`.
- **Evidencia:** p. ej. `daily/[kind]/[itemId]/page.tsx:23-31`, `my-work/page.tsx:59-140` (18 consultas, solo `data`). `notFound()` se llama en 60 archivos y cae en el 404 por defecto de Next, sin marca ni idioma.
- **Impacto:** (a) un `statement timeout`, un rechazo de RLS o una caída de Supabase se ven como "no tienes punches" o "0 ITR". El usuario toma decisiones con datos vacíos que parecen reales. (b) Una excepción no capturada muestra "Application error: a server-side exception has occurred", en inglés, sin botón de reintento. (c) Sin `loading.tsx`, navegar a páginas pesadas (my-work, control tower) en 3G/4G de campo no da ningún feedback durante varios segundos, y se generan dobles clics.
- **Recomendación:** `app/(dashboard)/error.tsx` y `global-error.tsx` con reintento (`reset()`), i18n y envío a observabilidad. `not-found.tsx` con la marca de la app. `loading.tsx` con `Skeleton` (hoy sin uso) al menos en `(dashboard)`, `projects/[id]` y `my-work`. Un helper `must(data, error)` que lance en las páginas para que el boundary lo muestre.
- **Esfuerzo:** M · **Confianza:** alta.

#### G-05 · Alta · Funcional/PWA — `Permissions-Policy: microphone=()` desactiva el dictado por voz de la ejecución de ITR
- **Ubicación:** `next.config.ts` (`securityHeaders`: `camera=(self), microphone=(), …`); consumidores: `src/app/(dashboard)/projects/[id]/tags/[tagId]/itrs/[itrId]/MicAppend.tsx:38-52`, `src/components/VoiceInput.tsx:39-53`, `src/components/SwipeCaptureFlow.tsx`, `ItemRow.tsx`.
- **Evidencia:** `microphone=()` niega el permiso a todo origen, incluido el propio. Chrome exige el permiso `microphone` para `webkitSpeechRecognition`, que termina con el error `not-allowed`.
- **Impacto:** la función de dictado que se vende para campo (manos ocupadas, guantes) no funciona en producción, o falla sin aviso visible.
- **Recomendación:** `microphone=(self)`. Verificarlo en Chrome Android e iOS Safari como PWA instalada. Si el reconocimiento falla, mostrar un mensaje claro en la UI.
- **Esfuerzo:** S · **Confianza:** media-alta (el header está verificado; el bloqueo efectivo depende del navegador, aunque está documentado para Chromium).

#### G-06 · Alta · i18n — Interfaz mezclada para usuarios en inglés: 52 componentes sin traducir y errores de servidor solo en español
- **Ubicación:**
  - Componentes cliente sin `useTranslations` (52; los más grandes): `admin/templates/backup/BackupRestoreView.tsx` (734), `admin/webhooks/WebhooksView.tsx` (594), `admin/templates/preservation/[procedureId]/ProcedureItemEditor.tsx` (584), `projects/[id]/twin/TwinView.tsx` (571), `components/templates/BackupDocumentView.tsx` (570), `admin/templates/[templateId]/preview/TemplatePreview.tsx` (561), `(setup)/setup/SetupWizard.tsx` (550), `projects/[id]/import/ImportWizard.tsx` (540), `admin/workflows/WorkflowsView.tsx` (536), `import-signals/ImportSignalsWizard.tsx` (514), `tags/[tagId]/TagItrTab.tsx` (484), `admin/api-keys/ApiKeysView.tsx` (450), `ProjectHeader.tsx` (332), `inbox/InboxList.tsx` (315), `layout/NotificationsBell.tsx` (298), `ce-matrices/[matrixId]/CeMatrixEditor.tsx` (292), y también `ui/Modal.tsx`, `ui/Toast.tsx` y `ui/DataTable.tsx`.
  - Ejemplos: `TagItrTab.tsx:172-415` ("Cerrar", "Asignar ITR", "Seleccionar inspector...", "Sin asignar"); `ProjectHeader.tsx:257-262` ("Eliminar proyecto…", "Esta acción eliminará…"); `TwinView.tsx:155` ("Todos los tipos").
  - Server actions: 421 `error: '…'` literales en español en `src/app/actions/*`, 0 `getTranslations`. `withAuth.ts:164-190` mezcla idiomas ("Field X debe ser string id").
  - Otros textos fijos: `app/offline/page.tsx` (todo en español), `public/sw.js:231-247` (acciones de push "Ver ITR", "Cerrar", "Completar"), 22 de los 56 `confirm()` con texto literal.
- **Impacto:** el producto se vende en inglés al mercado O&G internacional (el fallback de `request.ts` es `en`), pero el administrador en inglés ve en español el setup, las plantillas, los webhooks, las API keys y todos los mensajes de error. Da imagen de producto inacabado ante evaluaciones de cliente.
- **Recomendación:** (1) las actions devuelven `{ error: code, params }` (por ejemplo `'errors.nameRequired'`) y la UI traduce con `t()`, o se usa `getTranslations` en el servidor; (2) migrar los 52 componentes por orden de visibilidad (setup → admin → importadores); (3) añadir una regla de lint (`eslint-plugin-i18next/no-literal-string` en modo warn, o un script de CI que detecte JSX con letras).
- **Esfuerzo:** L · **Confianza:** alta.

#### G-07 · Alta · Rendimiento — Autenticación y membresía repetidas varias veces por request y en cada `router.refresh()`
- **Ubicación:** `src/lib/supabase/membership.ts:21-46` y `48-70` (sin `React.cache`); `src/app/(dashboard)/layout.tsx:14-93`; 124 `router.refresh()` en componentes.
- **Evidencia:** en una sola navegación, el layout llama a `getActiveMembership()` (un `auth.getUser()`, que es un round-trip HTTP a Supabase Auth, más una consulta a `org_members`), luego a `listMemberships()` (otro `getUser()` y otra consulta a `org_members`) y además lanza 7 consultas propias (contadores de punch, preservación, notificaciones, org, `my_work_counts`, perfil). La página vuelve a llamar a `getActiveMembership()`. Resultado: **≥ 3 `getUser()` + 3 consultas de membresía + 7 consultas de layout** antes de los datos de la página. `my_work_counts` se ejecuta dos veces en `/my-work` (layout y página). Cada `router.refresh()` repite todo.
- **Impacto:** latencia añadida de varios cientos de ms por pantalla y por acción, más carga en Supabase Auth, que tiene rate limits. Se nota sobre todo en móvil y con redes de campo.
- **Recomendación:** envolver `getActiveMembership`/`listMemberships` en `cache()` de React (memoización por request) y que la segunda reutilice el `user` de la primera. Evaluar `getClaims()` (verificación local del JWT) en lugar de `getUser()` para lecturas. Mover los contadores del layout a un componente con `Suspense` para que no bloqueen el render.
- **Esfuerzo:** S · **Confianza:** alta.

---

### MEDIAS

#### G-08 · Media · UX/Testabilidad — 56 `window.confirm()`, incluidas firmas y emisiones irreversibles
- **Ubicación (críticas):** `startup/performance/runs/[runId]/CertificateCard.tsx:70` (emitir certificado PTC) y `:90` (firmar); `startup/transfers/[transferId]/TransferView.tsx:106` (firmar traspaso); `startup/procedures/[procedureId]/ProcedureEditor.tsx:84` (aprobar procedimiento); `daily/reports/[reportId]/ReportEditor.tsx:85` (emitir reporte inmutable); `startup/performance/runs/[runId]/RunConsole.tsx:171` (cerrar corrida); `admin/gates/GatesAdminView.tsx:107` (borrar gate); `projects/[id]/punches/PunchListView.tsx:166` (borrado masivo).
- **Evidencia:** 56 coincidencias. 22 tienen texto literal en español (p. ej. `CeMatrixEditor.tsx:70`, `ApiKeysView.tsx:60`, `WebhooksView.tsx:112`).
- **Impacto:** los diálogos nativos no se pueden estilizar ni traducir de forma consistente, bloquean el hilo, en algunos WebViews o PWAs se suprimen, y los tests E2E tienen que interceptarlos. Para firmas, el diálogo no muestra qué se firma ni con qué capacidad de forma legible.
- **Recomendación:** `ConfirmDialog` sobre `ui/Modal` (variante `danger`, resumen de lo que se firma, opción de escribir el código para acciones destructivas) y un hook `useConfirm()` que devuelva una promesa. Migrar primero las firmas y emisiones.
- **Esfuerzo:** M · **Confianza:** alta.

#### G-09 · Media · Design system — Librería `ui` declarada pero poco adoptada; primitivas duplicadas en tres capas
- **Ubicación:** `src/components/ui/*` (15 componentes, `README.md`); `projects/[id]/daily/daily-ui.tsx` (246 líneas: `Chip`, `StatusChip`, `Field`, `grid`, evidencia) que reexporta `btn/card/input/label` de `registers/register-ui.tsx`; 74 definiciones locales (`const input` ×12, `inputStyle` ×11, `labelStyle` ×10, `btn` ×10+2, `card` ×8, `cardStyle` ×3, más `Chip`, `Pill`, `Badge` y `Field` locales, p. ej. `my-work/page.tsx:563-620`).
- **Evidencia:** `daily-ui` lo importan 38 archivos, incluidos módulos que no son de gestión diaria (vendors, documents, startup, control-tower, admin/companies). `register-ui` lo importan 9. `Badge` de `ui` se usa en 1 archivo y `Textarea`, `Skeleton` y `Tooltip` en ninguno. `useToast` en 2.
- **Impacto:** cada módulo nuevo inventa su botón. Un cambio de marca o de dark mode exige tocar cientos de sitios. La a11y del `Modal` compartido no llega a los 35 modales ad hoc (G-12). Crece el coste de incorporar a otros desarrolladores.
- **Recomendación:** decidir una sola librería: promover `Chip`/`Field`/`StatusChip` de `daily-ui` a `src/components/ui`, con tonos por token. Añadir una regla de lint que prohíba `const btn|input|card =` en vistas (por ejemplo con `no-restricted-syntax`). Migrar por módulo cuando se toque.
- **Esfuerzo:** L (incremental) · **Confianza:** alta.

#### G-10 · Media · Theming — Dark mode inconsistente: 2 842 hex literales y tokens de estado sin variante oscura
- **Ubicación:** `src/app/globals.css:144-190` (en dark solo se redefinen `--gray-50/100/200` y los aliases; `--success-50`, `--danger-50`, `--warning-50` y `--primary-50` siguen claros); `daily-ui.tsx:20-28` (`TONE` con `#eff6ff`, `#fffbeb`, `#f5f3ff`, `#a7f3d0`…); 213 fondos pastel (`var(--*-50)` o hex). Archivos con más hex: BackupDocumentView 74, SetupWizard 54, ReportPrint 54, ImportWizard 43, OrgConfigView 43, CertificatesView 42, TwinView 38.
- **Evidencia:** p. ej. `PssrReviewForm.tsx:201-215` y `ProjectHeader.tsx:260` (`#fef2f2` + `#991b1b`): con el tema oscuro quedan como cajas claras dentro de una página oscura.
- **Impacto:** el modo oscuro, que es una opción visible en el menú de usuario, se ve parcheado. No es ilegible en general, pero es incoherente, y en algunos casos (texto heredado `--foreground` sobre un pastel) baja el contraste.
- **Recomendación:** tokens semánticos de estado (`--status-success-bg/fg/border`…) con valores dark. Sustituir los hex por tokens con un codemod. Añadir una regla de lint que impida hex en `style` fuera de `landing/` y de los PDF.
- **Esfuerzo:** M–L · **Confianza:** alta.

#### G-11 · Media · Accesibilidad — Contraste insuficiente en chips y texto secundario, y tipografía muy pequeña
- **Ubicación:** 283 usos de tonos 500 como color de texto (`#f59e0b`, `#10b981`, `#ef4444`, `#3b82f6` o `var(--*-500)`); 213 `color: var(--gray-400)`; 599 `fontSize` ≤ 11px. Ejemplo: `projects/[id]/twin/TwinView.tsx:372-376` (chips "A:N"/"B:N").
- **Evidencia (contraste calculado):** `#f59e0b` sobre `#fffbeb` = **2.07:1**; `#10b981`/`#ecfdf5` = 2.41:1; `#ef4444`/`#fef2f2` = 3.44:1; `#94a3b8`/blanco = 2.56:1. WCAG AA pide 4.5:1 para texto normal. La paleta de `daily-ui` (`#b45309` sobre `#fffbeb` = 4.84:1) sí cumple.
- **Impacto:** usuarios de campo con tablet al sol, con guantes o con más edad no distinguen el estado Cat B/A. Es un riesgo en auditorías de accesibilidad de clientes grandes.
- **Recomendación:** usar tonos 700 para el texto de los chips (como ya hace `daily-ui` en parte), mínimo 12px para texto informativo y 14px en las vistas de campo, y `--text-muted` con un contraste ≥ 4.5.
- **Esfuerzo:** M · **Confianza:** alta.

#### G-12 · Media · Accesibilidad — Modales ad hoc sin semántica de diálogo, labels sin asociar y celdas clicables
- **Ubicación:** 39 overlays `position: 'fixed', inset: 0`, de los cuales **35 no tienen `role="dialog"`/`aria-modal`** ni trap de foco (p. ej. `admin/templates/matrix/ImportMatrixModal.tsx:110-111`, `components/AddToWorkPlanModal.tsx`, `TagItrTab.tsx:~328`). 91 `<label>` cerrados en la misma línea sin `htmlFor` (p. ej. `TagItrTab.tsx:381,398,415`), y solo 10 `htmlFor` en todo `src`. 11 `div`/`td` con `onClick` sin `role` ni teclado (`TagsView.tsx:284`, `PunchListView.tsx:387`, `ImportCeWizard.tsx:227`).
- **Impacto:** los lectores de pantalla no anuncian los diálogos, el foco se escapa detrás del overlay y los campos no tienen nombre accesible. El uso con teclado o con teclado Bluetooth en tablet se degrada.
- **Recomendación:** usar `ui/Modal` en todos los diálogos, `Field` (que envuelve el input) o `useId()` + `htmlFor`, y botones nativos en las celdas de selección. Añadir `eslint-plugin-jsx-a11y` en modo `recommended`, que hoy solo entra parcialmente vía `core-web-vitals`.
- **Esfuerzo:** M · **Confianza:** alta (los conteos son heurísticos; los ejemplos están verificados).

#### G-13 · Media · Fechas/i18n — "Hoy" calculado en UTC en el servidor y formatos de fecha con locale fijo
- **Ubicación:** `my-work/page.tsx:61` (`today = new Date().toISOString().slice(0, 10)` alimenta las colas de vencidos), `:266-268`; `(dashboard)/layout.tsx:33` (`threeDaysAgo`); 17 usos de `toISOString().slice(0,10)`/`split('T')[0]` en `.tsx`; `src/lib/utils.ts:20-27` (`formatDate` siempre `'es-CO'`, 14 usos); 15 `toLocale*` con locale fijo (`projects/[id]/page.tsx:72`, `kpis/report/*`, `TwinView`, `SuggestionsBar`, `BackupDocumentView` `'es-ES'`); 39 `toLocale*()` sin argumentos; `src/i18n/request.ts` sin `timeZone`; 67 `suppressHydrationWarning`.
- **Evidencia:** el propio equipo documentó el problema en `src/lib/use-local-today.ts` ("el servidor corre en UTC… en Colombia, desde las 19:00"), pero el hook solo se usa en cliente. Las páginas servidor siguen en UTC.
- **Impacto:** en América, a partir de las 19:00 locales, "Mi trabajo" marca como vencidas cosas que vencen mañana y la etiqueta del día muestra la fecha siguiente. El usuario en inglés ve fechas en formato colombiano. Las 67 supresiones de hidratación esconden discrepancias reales.
- **Recomendación:** zona horaria por organización (`organizations.settings.timezone`) aplicada en `getRequestConfig({ timeZone })` y en el cálculo de "hoy" en SQL o en el servidor. Unificar en `useFormatter`/`getFormatter` de next-intl. Quitar `formatDate('es-CO')`.
- **Esfuerzo:** M · **Confianza:** alta.

#### G-14 · Media · Duplicación — Vistas "proyecto" y "global" casi idénticas
- **Ubicación:** `projects/[id]/work-plans/WorkPlansView.tsx` (658) frente a `work-plans/WorkPlansGlobal.tsx` (681); `projects/[id]/punches/PunchListView.tsx` (889) frente a `punch-list/PunchListGlobal.tsx` (649).
- **Evidencia:** de las 479 líneas únicas (normalizadas) de WorkPlansView, **415 (87 %)** están también en WorkPlansGlobal. En punch, 156 líneas son comunes: confirm, bulk delete, filtros.
- **Impacto:** cada bug o cambio de UX se arregla dos veces (ya hay divergencias: textos, estados). Es la principal fuente de líneas en los archivos más grandes.
- **Recomendación:** un componente `WorkPlansBoard` con prop `scope: {projectId} | 'org'` y lo mismo para punches. Extraer `useBulkSelection`.
- **Esfuerzo:** M · **Confianza:** alta.

#### G-15 · Media · Rendimiento — Todo el diccionario i18n (~190 KB) viaja en cada página
- **Ubicación:** `src/app/layout.tsx:56-66` (`getMessages()` → `<NextIntlClientProvider messages={messages}>` sin filtrar).
- **Evidencia:** `es.json` pesa 192 295 bytes y `en.json` 182 677, con 46 namespaces. Se serializan en el payload RSC de la primera carga de cada documento, también en la landing pública y en `/login`.
- **Impacto:** ~190 KB de JSON (sin comprimir) en cada carga dura. Penaliza el LCP de la landing (SEO y conversión) y la primera carga en campo.
- **Recomendación:** pasar al provider solo los namespaces cliente necesarios por route group (`pick(messages, [...])`) y traducir en servidor donde se pueda. Separar el provider de la landing con su propio subconjunto.
- **Esfuerzo:** S–M · **Confianza:** alta.

#### G-16 · Media · CI/CD — Dos pipelines de deploy en paralelo con variables distintas
- **Ubicación:** `.github/workflows/deploy.yml` (pasa solo `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`) y Cloudflare Workers Builds conectado al repo (memoria `feedback_cloudflare_builds.md`, que registra además `NEXT_PUBLIC_VAPID_PUBLIC_KEY`). El código usa también `NEXT_PUBLIC_CF_BEACON_TOKEN` y `NEXT_PUBLIC_SITE_URL`, ausentes en `deploy.yml`.
- **Impacto:** el bundle que queda en producción depende de qué pipeline termine último: puede quedar sin beacon de analytics, con la URL del sitio por defecto o con la clave VAPID de fallback hardcodeada (`PushNotificationManager.tsx:49`). Los deploys no son reproducibles y es difícil saber qué build está vivo.
- **Recomendación:** un solo camino de deploy (preferentemente GH Actions con gating de G-01) y desconectar Workers Builds, o al revés. Validar al inicio del build que estén todas las `NEXT_PUBLIC_*` (script que falle si falta alguna).
- **Esfuerzo:** S · **Confianza:** media (no pude verificar desde el repo que Workers Builds siga conectado).

#### G-17 · Media · Testing — Pirámide sin capa de componentes ni e2e en CI, y sin cobertura medida
- **Ubicación:** `vitest.config.ts` (`environment: 'node'`, solo `*.test.ts`); 0 `.test.tsx`; `testsprite_tests/` (59 scripts Python generados, fuera de CI); sin `coverage` ni Playwright.
- **Impacto:** los flujos de campo más críticos (ejecución de ITR, firma, offline, replay) no tienen test de UI ni e2e reproducible. Las regresiones de UI se detectan en producción.
- **Recomendación:** ver §4.3: Testing Library + jsdom para componentes clave, Playwright con 5-8 recorridos contra un Supabase de prueba y cobertura con umbral sobre `src/lib/**`.
- **Esfuerzo:** M–L · **Confianza:** alta.

#### G-18 · Media · Type safety — 157 `as unknown as` en las fronteras de consulta
- **Ubicación:** ver los hotspots en §3.1 (`my-work/page.tsx:208-212` ×17, `control-tower/[systemId]/page.tsx` ×6, startup ×15, vendors ×7…).
- **Evidencia:** casi todos son selects con relaciones embebidas (`projects(code)`, `tags(tag_number)`) convertidos a tipos de fila escritos a mano (`PunchRow`, `PlanItemRow`…).
- **Impacto:** si cambia una columna o relación, TypeScript no lo detecta y el error sale en runtime (como "undefined" en la UI). Es deuda creciente: cada fase F5–F8 añadió más.
- **Recomendación:** derivar los tipos con `QueryData<typeof query>` de supabase-js (las consultas ya están tipadas con `Database`), o definir `Relationships` en los tipos generados para que los embebidos se infieran. Fijar un presupuesto en CI (`grep -c` ≤ N y que no suba).
- **Esfuerzo:** M · **Confianza:** alta.

#### G-19 · Media · Estado/refresh — Doble invalidación y ninguna UI optimista
- **Ubicación:** 124 `router.refresh()` en componentes, 304 `revalidatePath` en actions (16 con `'layout'`) y 0 `useOptimistic`.
- **Impacto:** cada clic (marcar ítem, cambiar estado) espera el round-trip, la re-renderización del layout entero (G-07) y la de la página. En campo, la app se siente lenta y se producen dobles envíos.
- **Recomendación:** elegir un mecanismo: `revalidatePath` en la action (Next refresca solo) o `router.refresh()`, no ambos. Usar `useOptimistic` en checklists, estados de punch y work-plan items.
- **Esfuerzo:** M · **Confianza:** media (no medí el tiempo real; el patrón está verificado).

---

### BAJAS

#### G-20 · Baja · PWA/DX — El SW se registra también en desarrollo, con scripts en cache-first
- **Ubicación:** `src/components/ServiceWorkerRegistration.tsx:9-13` (sin chequear `NODE_ENV`); `public/sw.js:59-62` y `85-92` (cache-first para `/_next/static/*` y para scripts/estilos same-origin).
- **Impacto:** en `next dev` los chunks no son inmutables → se sirven chunks viejos (el problema conocido). Hace perder tiempo de desarrollo y puede ocultar bugs.
- **Recomendación:** registrar solo en producción, o desregistrar en dev. Cache-first solo para `/_next/static/` y network-first para el resto de scripts.
- **Esfuerzo:** S · **Confianza:** alta.

#### G-21 · Baja · PWA — El manifest anuncia funciones inexistentes y `start_url` no respeta el rol
- **Ubicación:** `public/manifest.json`: `share_target` → `POST /share` y `protocol_handlers` → `/handle?url=%s`. Ninguna ruta existe (`find src/app -path '*share*'` → solo archivos `*-shared.ts`). `start_url: "/"` → `src/app/page.tsx` redirige a `/dashboard` y no a `/home` (que sí enruta por rol).
- **Impacto:** "Compartir con CommUp" desde la galería de Android da 404/405. Un inspector que abre la PWA instalada cae en el dashboard de KPIs en lugar de "Mi trabajo".
- **Recomendación:** quitar `share_target`/`protocol_handlers` o implementarlos. `start_url: "/home"` (o que `/` redirija a `/home`).
- **Esfuerzo:** S · **Confianza:** alta.

#### G-22 · Baja · PWA — Lógica de clic en notificaciones con rama muerta y etiquetas engañosas
- **Ubicación:** `public/sw.js:213-215` (la acción `complete` con `type === 'ITR'` navega a `/itrs/<id>/capture`, que no existe, y además nunca se alcanza porque `complete` solo se ofrece para tipos `PUNCH_*`); `:236-240` (el botón "Completar" de un punch solo abre la URL).
- **Recomendación:** eliminar la rama, renombrar la acción a "Abrir" y traducir los títulos (enviarlos en el payload ya localizado).
- **Esfuerzo:** S · **Confianza:** alta.

#### G-23 · Baja · PWA — La página offline promete más de lo que hace
- **Ubicación:** `src/app/offline/page.tsx` (cliente, solo español: "Ver ITRs que ya abriste", "Revisar punches cacheados"); `public/sw.js:57` (las peticiones `_rsc`, es decir las navegaciones suaves, se excluyen del SW).
- **Impacto:** sin red, navegar con los `Link` de la app falla (RSC no cacheado). Solo funcionan las recargas completas de URLs visitadas antes. El botón "Reintentar" necesita que el JS de la página offline esté hidratado, y sus chunks no se precachean (`public/offline.html` existe pero no se usa en el precache).
- **Recomendación:** precachear `/offline.html` estático (bilingüe) como fallback. Ajustar el texto a lo que funciona de verdad: la ejecución de ITR ya abierta y los procedimientos o line-up abiertos.
- **Esfuerzo:** S · **Confianza:** media-alta.

#### G-24 · Baja · Dependencias — Higiene menor
- `@anthropic-ai/sdk` está en **devDependencies** pero se usa en runtime (`src/lib/ai/claude.ts` + 5 actions). Hoy funciona porque OpenNext empaqueta tras `npm ci` con dev deps, pero fallaría con `--omit=dev`. → moverlo a `dependencies`.
- Sin uso en `src`/`scripts`: `class-variance-authority`, `date-fns`, `@eslint/eslintrc` (el flat config es nativo). → eliminarlos.
- `html5-qrcode@2.3.8` no se publica desde 2023 (370 KB). → evaluar `BarcodeDetector` nativo con fallback a `@zxing/browser`.
- `public/pdf.worker.min.mjs` está copiado a mano (5.4.296, que hoy coincide con `pdfjs-dist`). Al actualizar `react-pdf` se rompe el visor P&ID con "API version does not match Worker version". → copiarlo en `postinstall` o importarlo con `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)`.
- `next: ^16.3.4` y `next-intl: ^4.9.0` con caret, mientras OpenNext está fijado: el lockfile protege, pero conviene fijar `next` igual que OpenNext, por la fragilidad conocida.
- **Esfuerzo:** S · **Confianza:** alta.

#### G-25 · Baja · Rendimiento/Workers — Sin presupuesto de tamaño del Worker
- **Ubicación:** el último build local (`.open-next/server-functions/default/handler.mjs`, 2026-09-09, anterior a F5–F8) pesa 12.8 MB crudo / **2.98 MB gzip**. No hay un paso de CI que lo mida.
- **Impacto:** el límite del plan pago es 10 MB comprimido, y el del free 3 MB, que ya estaría superado. El crecimiento por fase no se ve hasta que el deploy falla.
- **Recomendación:** en CI, después de `opennextjs-cloudflare build`, medir gzip del handler y de los chunks cliente más grandes; fallar por encima de un umbral (p. ej. 6 MB gzip) y avisar si sube más de 5 % (ver §4.4).
- **Esfuerzo:** S · **Confianza:** media (el build está desactualizado).

#### G-26 · Baja · Documentación/i18n — CLAUDE.md desactualizado y el idioma del perfil no se usa
- CLAUDE.md dice que ItrExecution, TemplateBuilder y TagDetail tienen 800–1500 líneas (hoy 656/419/359) y que los tests de BD se saltan en CI (corren, ver G-01). Confunde a los agentes y a nuevos desarrolladores.
- `src/app/actions/locale.ts` guarda `profiles.locale`, pero `src/i18n/request.ts` solo lee la cookie y `Accept-Language`, así que el idioma elegido no sigue al usuario a otro dispositivo o a la PWA instalada.
- **Recomendación:** actualizar CLAUDE.md. En `getRequestConfig`, si no hay cookie y hay sesión, usar `profiles.locale`.
- **Esfuerzo:** S · **Confianza:** alta.

---

## 4. Propuestas estratégicas

### 4.1 Design system "CommUp UI" (de verdad)
1. **Tokens primero**: completar `globals.css` con tokens semánticos de estado (`--status-{ok,warn,danger,info,neutral}-{bg,fg,border}`) con variantes light/dark que cumplan AA, y una escala tipográfica con mínimo 12px (14px en vistas de campo).
2. **Una sola librería** en `src/components/ui`: absorber `Chip`/`StatusChip`/`Field`/`grid` de `daily-ui.tsx` y `btn`/`card`/`input` de `register-ui.tsx` como `Button`/`Card`/`Input`. Añadir `ConfirmDialog` + `useConfirm`, `Alert`/`Callout`, `FormField` (label + error + hint asociados con `useId`) y `PageState` (loading/empty/error).
3. **Guardarraíles de lint**: `no-restricted-syntax` contra `const (btn|card|input|label)\w* =` en `src/app/**`, contra hex en `style` fuera de `landing/` y de los PDF, `eslint-plugin-jsx-a11y/recommended` y `i18next/no-literal-string` (warn al principio, error después).
4. **Catálogo visual**: una ruta interna `/admin/ui` (o Storybook ligero) con cada componente en light/dark, que sirve también de base para tests visuales.
5. **Migración incremental**: regla de "si tocas un archivo, migras sus primitivas". Métrica semanal: número de `style={{`, hex y definiciones locales, con tendencia a la baja.

### 4.2 Arquitectura de páginas
- `error.tsx`/`loading.tsx`/`not-found.tsx` por route group. Helper `must()` para errores de Supabase. `cache()` en membresía.
- Contadores del layout dentro de `Suspense` con streaming. Un solo mecanismo de invalidación por action. `useOptimistic` en las interacciones de campo.
- Vistas parametrizadas por `scope` (proyecto u org) para eliminar los pares duplicados.
- Tipos derivados de las consultas (`QueryData`) y presupuesto de `as unknown as` en CI.

### 4.3 Pirámide de testing
| Capa | Hoy | Objetivo |
|---|---|---|
| Unit (lógica pura) | 50 archivos ✔ | Mantener + cobertura ≥ 80 % en `src/lib/**` (v8 coverage con umbral) |
| BD/RLS (tests/db) | 13 suites, **rotas en CI** | Arreglar (G-01), timeout global de 30 s para el proyecto `db`, aplicar migraciones a la BD de prueba en CI antes de correr |
| Componentes | 0 | Testing Library + jsdom: `ItemRow`, `SignModal`, `PunchVerification`, `ConfirmDialog`, `OfflineSync`, bandeja "No sincronizado" |
| E2E | TestSprite manual | Playwright en CI (nightly + pre-deploy): login → my-work → ejecutar ITR → firmar; punch A bloquea certificado; offline (context.setOffline) → encolar → reconectar → replay; cambio de idioma; móvil (viewport 390×844) |
| A11y | 0 | `@axe-core/playwright` en los recorridos E2E con umbral de cero violaciones serias |
| Gating | Deploy sin gating | `needs:` + branch protection |

### 4.4 Presupuesto de rendimiento
- **Worker**: handler ≤ 6 MB gzip (alerta a +5 % por PR).
- **Cliente**: JS de primera carga ≤ 250 KB gzip en `/my-work` y en la ejecución de ITR. Las libs pesadas (xlsx, pdf.js, recharts, html5-qrcode) siempre con `dynamic(() => import())` y nunca en el chunk común. Hoy ya están separadas: mantenerlo con un check en CI (`next build` + análisis de `.next/static/chunks`).
- **Mensajes i18n**: ≤ 40 KB por route group.
- **Servidor**: ≤ 1 `getUser()` por request, ≤ 10 consultas por navegación en páginas de campo y p95 TTFB < 800 ms medido con Cloudflare observability (ya activo en `wrangler.jsonc`).
- **Campo**: una prueba Lighthouse móvil (throttling 4G lento) en `/my-work` y en la ejecución de ITR dentro de CI nightly.

### 4.5 Offline seguro
- Entradas con `userId`/`orgId`, replay condicionado, logout que vacía cachés e IndexedDB tras confirmar.
- SW: no cachear Auth, cachear REST solo si se usa, HTML solo para rutas de campo whitelisteadas, límite LRU y versión inyectada en el build.

---

## 5. Funcionamiento para el manual (usuario final)

### 5.1 Instalar CommUp como aplicación (PWA)
- **Android (Chrome/Edge):** abre `https://commup.app`, inicia sesión y acepta el aviso "Instalar CommUp", o usa menú ⋮ → "Instalar aplicación". El ícono aparece en el escritorio y la app abre a pantalla completa. (La tarjeta de instalación también está en Administración → Notificaciones.)
- **iPhone/iPad (Safari):** botón Compartir → "Agregar a pantalla de inicio". En iOS **solo la app instalada** recibe notificaciones push.
- **Escritorio (Chrome/Edge):** ícono de instalación en la barra de direcciones.
- **Brave en macOS** desactiva las notificaciones push por defecto: actívalas en la configuración del navegador.
- Al abrir la app instalada se entra al tablero (Dashboard). Inspectores y líderes encuentran sus tareas en **Mi trabajo** (pestaña inferior en el móvil).

### 5.2 Trabajo sin conexión (qué funciona y qué no)
- **Funciona sin red** (con la app instalada y la pantalla **abierta antes de perder la conexión**):
  - Responder ítems de un ITR, tomar fotos, registrar punches y firmar desde la pantalla de ejecución del ITR.
  - En arranque: marcar pasos de procedimiento (hecho/N.A., llegar a un hold point, "Detener") y registrar posiciones de line-up.
- Todo eso queda en una **bandeja de salida** del dispositivo y se envía solo al volver la conexión. Si el servidor rechaza un registro (por ejemplo, otra persona cambió la misma posición), aparece en la bandeja **"No sincronizado"** para que lo revises.
- **Necesita conexión:** liberar hold points, verificar, reanudar, completar o abortar ejecuciones; punch list general, certificados, administración, reportes, importaciones y la navegación entre pantallas.
- **Recomendación importante:** **no cierres sesión con registros pendientes** ni prestes el dispositivo a otra persona hasta que la bandeja esté vacía. Hoy los registros pendientes se envían con la sesión de quien esté conectado en ese momento.
- Si ves la pantalla "Sin conexión", vuelve a intentarlo cuando tengas señal. Solo las páginas que ya visitaste pueden verse desde la memoria del dispositivo.

### 5.3 Cambiar el idioma
- En el menú de usuario (arriba a la derecha) → selector **ES / EN**. También se puede cambiar en la pantalla de inicio de sesión.
- La preferencia se guarda en el navegador. En un dispositivo nuevo, la app usa el idioma del navegador (español si el navegador está en español, y si no, inglés), así que hay que elegirlo otra vez.
- Algunas pantallas de administración (plantillas, webhooks, API keys, flujos), importadores y mensajes de error todavía aparecen en español aunque se elija inglés.

### 5.4 Tema claro/oscuro
- Menú de usuario → interruptor de tema. Algunas tarjetas de estado se siguen viendo en colores claros en el modo oscuro.

### 5.5 Uso en móvil y tablet
- En roles de campo aparece una **barra inferior** (Mi trabajo, Bandeja…). El menú completo se abre con el botón ☰.
- Las tablas anchas se desplazan horizontalmente con el dedo.
- **Escaneo QR/NFC:** menú "Escanear". Permite la cámara cuando el navegador lo pida.
- **Dictado por voz** en los comentarios del ITR (ícono de micrófono): depende del navegador. Si no responde, escribe el texto (ver G-05: hoy puede estar bloqueado por configuración del servidor).
- Para trabajar al sol conviene subir el brillo. Los chips de estado ámbar y verde tienen poco contraste.
- Las fechas de vencimiento en "Mi trabajo" pueden adelantarse un día por la noche (hora de América) hasta que se corrija la zona horaria (G-13).
