# H — Menús, navegación y arquitectura de información (CommUp)

Revisión estática, solo lectura, 2026-10-19 (HEAD `922b861`). Fuentes principales: `src/components/layout/sidebar.tsx`, `DashboardShell.tsx`, `MobileTabBar.tsx`, `Topbar.tsx`, `Breadcrumbs.tsx`, `UserMenu.tsx`, `src/lib/constants/navigation.ts`, `src/app/(dashboard)/layout.tsx`, `home/page.tsx`, `my-work/page.tsx`, `src/lib/my-work/queues.ts`, las 104 `page.tsx` y `src/i18n/messages/{es,en}.json`.

Abreviaturas de roles: Ow=owner, Ad=admin, Ar=architect, Le=leader, In=inspector, Cl=client. Grupos: **TODOS**; **EDIT** = Ow/Ad/Ar/Le; **PRIV** = Ow/Ad/Ar; **ADM** = Ow/Ad.

---

## 1. Resumen (franco)

La navegación de CommUp ya pasó por una buena reorganización (Sprint N: Mi trabajo · Proyecto · Organización · Administración, barra inferior para campo, «último proyecto» recordado). La base es sólida. El problema es que las fases F1–F8 del plan readiness agregaron módulos (Sistemas, Registros, Gestión diaria, Arranque, Documentos, Vendors, Gates) **encima** de esa estructura sin rediseñarla. Hoy el sidebar es una **lista larga ordenada por objeto**, con **33 a 49 entradas según el rol**. Mezcla vistas globales y de proyecto con el mismo ícono y casi el mismo nombre. No sigue el flujo de fases que tiene en la cabeza un gerente de comisionamiento (MC → Pre-com → Com → Arranque → Desempeño → Handover).

Hay cinco problemas que pesan de verdad en la adopción:

1. **La app instalada (PWA) no abre en «Mi trabajo»**: `start_url: "/"` lleva a `/dashboard` para todos los roles. Lo mismo pasa con la aceptación de la invitación (`set-password` → `/dashboard`). La regla `homeForRole` solo se aplica después de un login manual.
2. **Las tareas nuevas de F1–F8 no llegan a la persona.** No hay cola en Mi trabajo para aprobar o co-firmar gates, aunque `cosign_roles` incluye por defecto a `client`. Tampoco se encontraron notificaciones in-app para gates, holds, traspasos, PTC ni TQ. Solo generan notificación los ITR, los punches, los certificados y los crons de vencidos.
3. **El menú es largo y ruidoso** para inspector y cliente: ven Ingeniería, Twin, Explorer, Vendors, Documentos y 10 vistas de organización que no usan.
4. **No hay red de seguridad en la navegación.** No existe `not-found.tsx`, `error.tsx` ni `loading.tsx` en todo `src/app`. Cualquier `notFound()` (más de 60 páginas lo llaman) deja al usuario en el 404 genérico de Next, sin sidebar.
5. **Hay una página legacy pública en `/admin`** (`src/app/admin/page.tsx`): está fuera del gate de autenticación, muestra «Admin: Luis Fernando Perdomo» y trae un importador CSV de juguete.

Además: las migas de pan están incompletas y caen al inglés («Daily», «Startup», «Vendors»). Varios nombres chocan entre sí («Handover» / «Relevo» / «Traspasos»; tres «Registro(s)»; «Notificaciones» frente a «Bandeja»). Preservación no tiene vista por proyecto. Sistemas, la base del readiness, no está en el menú. Y no hay búsqueda global ni creación rápida.

---

## 2. Fortalezas

- **El sidebar tiene bloques con intención** y comentarios que explican el diseño. «Administración» es colapsable y se abre sola si estás dentro (`inAdmin`); la preferencia se recuerda en `localStorage` con manejo seguro de errores (`readStorage`/`writeStorage`).
- **El contexto de proyecto se infiere de la URL** y, si no hay, del «último proyecto» validado contra los proyectos de la org activa (`projectNames[lastProjectId]`). Así no se filtra contexto de otra org.
- **`homeForRole` y la ruta `/home`** separan correctamente el inicio de campo (inspector/leader → `/my-work`) del de gestión.
- **Mi trabajo** es potente: 18 colas personales (ejecutar/revisar ITR, punches, verificar, acciones, holds, hitos, traspasos, desempeño, line-up, relevos, restricciones, plan, firmas, preservación). El badge se calcula en SQL (`my_work_counts`) y la regla de qué cuenta está en código puro y testeable (`badgeTotal`).
- **La barra inferior móvil** para roles de campo (Mi trabajo · Escanear · Bandeja · Menú) tiene un indicador de sincronización offline. El drawer cierra con ESC, con el backdrop y al cambiar de ruta, y bloquea el scroll del body.
- **Resolvers de QR limpios**: `/r/[id]` (registros) y `/tag_360/[tagId]` (tags) resuelven y redirigen al detalle del proyecto correcto. `/projects/[id]/interlocks` redirige a C&E (compatibilidad hacia atrás).
- **El menú de usuario agrupa bien** cambio de org, idioma, tema, guía y salir.
- **Los hubs de F5/F6** (Gestión diaria, Arranque) tienen pestañas, con contadores en las de estado local.
- **El enlazado transversal es rico**: Control Tower detalle → line-ups, procedimientos, PSSR, desempeño, traspasos, look-ahead, ficha de sistema; Vendors → Control Tower; TQ/Restricción → nueva acción o decisión con el origen precargado.

---

## 3. Mapa del sitio (104 `page.tsx`)

Leyenda de «Cómo se llega»: **SB** = enlace en el sidebar; **TB** = barra inferior móvil; **Hub** = pestaña o botón dentro de un hub; **Lista** = desde la fila de una lista; **MW** = cola de Mi trabajo; **CT** = desde el detalle de Control Tower; **URL** = solo escribiendo la ruta o desde un redirect.

### 3.1 Fuera del shell autenticado

| Ruta | Cómo se llega | Menú | Página permite | Observación |
|---|---|---|---|---|
| `/login` | Landing, logout, redirects | — | Público (con sesión → `/home`) | OK |
| `/forgot-password` | Enlace en login | — | Público | OK |
| `/auth/set-password` | Email de invitación | — | Token | Al terminar → `/dashboard`, no `/home` (H-01) |
| `/auth/link-error` | Callback con error | — | Público | OK |
| `/setup` | Redirect si no hay membresía | — | Autenticado sin org | OK |
| `/offline` | Fallback del SW | — | Público | OK |
| `/privacy`, `/terms` | Footer de la landing | — | Público | OK (2 páginas) |
| **`/admin`** (`src/app/admin/page.tsx`) | **Solo URL** | — | **Público, sin auth** | **Legacy**: «Panel de Control» CSV con el nombre del fundador (H-04) |

### 3.2 Bloque «Mi trabajo» y utilidades personales

| Ruta | Cómo se llega | Menú | Página permite | Observación |
|---|---|---|---|---|
| `/home` | Login, layouts auth/setup | — | TODOS | Solo redirige (`homeForRole`). La landing y la PWA no pasan por aquí (H-01) |
| `/my-work` | SB, TB | TODOS | TODOS | Sin cola de gates ni de reporte diario (H-02) |
| `/inbox` | SB, TB, campana «ver todo» | TODOS | TODOS | Duplica la campana; la etiqueta «Bandeja» convive con «Notificaciones» (H-13) |
| `/scan` | SB, TB | TODOS | TODOS (solo `getUser`) | OK. Redirige vía `/tag_360` o `/r` |
| `/admin/notifications` | SB («Notificaciones», en Mi trabajo) | TODOS | TODOS | Son **preferencias push**, no notificaciones. La URL está bajo `/admin` (H-13, H-22) |
| `/tag_360/[tagId]` | Escáner QR/NFC | — | TODOS (RLS) | Resolver; no es legacy. Renombrar a `/t/[id]` (H-24) |
| `/r/[id]` | QR de registro | — | TODOS (RLS) | Resolver. OK |

### 3.3 Bloque «Organización»

| Ruta | Cómo se llega | Menú | Página permite | Observación |
|---|---|---|---|---|
| `/dashboard` | SB, raíz `/`, PWA, redirect «no autorizado» | TODOS | TODOS (widgets por rol) | Inicio de facto de todos en la PWA (H-01). Sus widgets «mis ITR/punches» duplican Mi trabajo |
| `/projects` | SB, migas | TODOS | TODOS (crear: PRIV) | Única forma de cambiar de proyecto (H-17) |
| `/control-tower` | SB, Sistemas, CT detalle | TODOS | TODOS | Abre por defecto el primer proyecto por código, no el actual (H-12). Badge `blockers` nunca se calcula (H-16) |
| `/control-tower/[systemId]` | Filas de CT, Look-ahead, Vendors | — | TODOS (aprobar: EDIT; firmar: cosign) | Es de proyecto pero vive en URL de org: pierde contexto en sidebar y migas (H-12) |
| `/kpis` | SB | TODOS | TODOS | Mismo nombre «KPIs» que el de proyecto (H-09) |
| `/itrs` | SB («Todos los ITRs»), MW «ver todos» | TODOS | TODOS | El h1 dice «ITRs», igual que el de proyecto. «Ver todos» de MW no filtra «míos» (H-19) |
| `/punch-list` | SB, MW | TODOS | TODOS | Ídem |
| `/certificates` | SB, MW | TODOS | TODOS | Las filas no abren el certificado (solo el chip del proyecto). Badge `certsPending` nunca se calcula (H-16) |
| `/preservation` | SB, MW | TODOS | TODOS | No existe vista por proyecto; las filas no enlazan ni al plan ni al tag (H-08) |
| `/work-plans` | SB, MW | TODOS | TODOS (edita EDIT) | La fila lleva al Resumen del proyecto |
| `/ops/punches` | SB («Tracking de Ops») | TODOS | TODOS | El h1 dice «Tracking de Punches en Operaciones» (H-13) |
| `/admin/handover` | SB («Handover», en Organización) | PRIV | PRIV | URL `/admin` pero está en Organización. Colisiona con «Relevo/Handover» (H-13) |

### 3.4 Bloque «Proyecto» (contextual: `/projects/[id]/…`)

| Ruta | Cómo se llega | Menú | Página permite | Observación |
|---|---|---|---|---|
| `/projects/[id]` | SB «Resumen», `/projects`, migas | TODOS | TODOS (editar PRIV, borrar Ow) | Textos fijos en ES, fecha `es-CO`, grid `1fr 1fr` no responsive. El Twin aparece como «hero». Es la única entrada a Sistemas y a Importar señales (H-11, H-20) |
| `…/tags` | SB | TODOS | TODOS (edita PRIV) | OK |
| `…/tags/[tagId]` | Lista, escáner, Twin, MW (preservación) | — | TODOS (edita PRIV) | Las pestañas son estado local, sin URL: no se puede enlazar a «Punches» o «Preservación» (H-08) |
| `…/tags/[tagId]/itrs/[itrId]` | MW, lista de ITR, tag | — | TODOS (ejecuta EDIT+In) | Las migas muestran «Tags» como página actual (H-06) |
| `…/tags/[tagId]/preservation/[planId]` | Pestaña Preservación del tag | — | TODOS (RLS) | 4 niveles de profundidad, sin entrada directa (H-08) |
| `…/itrs` | SB, Resumen | TODOS | TODOS | OK |
| `…/punches` | SB, Resumen, MW | TODOS | TODOS | No hay página de detalle de punch: MW enlaza a la lista (con `?q=` solo en algunas colas) |
| `…/registers` | SB («Registros»), Resumen | TODOS | TODOS (crea ≠Cl) | El h1 dice «Registros controlados», igual que en admin (H-13) |
| `…/registers/new` | Botón del hub, detalle | — | ≠Cl (Cl → redirect) | OK |
| `…/registers/[itemId]` | Lista, `/r/[id]` | — | TODOS | OK |
| `…/registers/test-packs` | Botón del hub | — | TODOS (edita ≠Cl) | Sub-hub escondido (H-18) |
| `…/daily` | SB («Gestión diaria»), Resumen | TODOS | TODOS (crea ≠Cl) | 4 pestañas de estado y 3 que son Links a rutas (H-18) |
| `…/daily/new` | Botón del hub, TQ/Restricción/Decisión | — | ≠Cl | OK |
| `…/daily/[kind]/[itemId]` | Lista, MW | — | TODOS | OK |
| `…/daily/lookahead` | Pestaña Daily, KPIs, CT | — | TODOS (edita ≠Cl; compromete EDIT) | El forecast (planner) está escondido en «Gestión diaria» y no en «Planificación» (H-18) |
| `…/daily/reports` | Pestaña «Reporte» | — | TODOS | No hay cola en MW ni widget para el gerente (H-02) |
| `…/daily/reports/[reportId]` | Lista de reportes | — | TODOS (emite EDIT) | OK |
| `…/daily/handovers` | Pestaña «Relevo», MW | — | TODOS | En EN se llama «Handover», igual que los paquetes (H-13) |
| `…/daily/handovers/[handoverId]` | Lista, MW | — | TODOS (recibe ≠Cl, ≠autor) | OK |
| `…/startup` | SB («Arranque»), Resumen, MW | TODOS | TODOS (edita ≠Cl) | Procedimientos y Line-ups van con `?tab=` |
| `…/startup/procedures/[procedureId]` | Hub, CT, documentos, line-up | — | TODOS (edita ≠Cl) | OK |
| `…/startup/runs/[runId]` | Hub, MW (holds) | — | TODOS | OK |
| `…/startup/lineups/[sheetId]` | Hub `?tab=lineups`, MW, CT | — | TODOS | OK |
| `…/startup/events` | Pestaña «Bitácora», MW, CT | — | TODOS (registra ≠Cl) | El h1 de todas las subpáginas es «Arranque» |
| `…/startup/events/[eventId]` | Lista, MW, CT | — | TODOS | OK |
| `…/startup/operations` | Pestaña «Operaciones», MW, CT | — | TODOS (evalúa EDIT) | Personal, competencias y repuestos quedan enterrados en Arranque |
| `…/startup/transfers/[transferId]` | MW, CT, Operaciones | — | TODOS (firma por capacidad) | «Traspaso»: tercer concepto de handover (H-13) |
| `…/startup/performance` | Pestaña «Desempeño», MW | — | TODOS (lidera EDIT) | La fase F7 completa vive como pestaña de Arranque |
| `…/startup/performance/[testId]` | Lista, CT | — | TODOS | OK |
| `…/startup/performance/runs/[runId]` | MW (decidir / firmar PTC) | — | TODOS (firma por capacidad) | OK |
| `…/documents` | SB («Documentos») | TODOS | TODOS (edita doc controller) | El h1 dice «Registro de documentos»; tiene tipo `pid` sin vínculo con P&IDs (H-15) |
| `…/documents/[documentId]` | Lista, referencias ITR/procedimiento | — | TODOS | OK |
| `…/vendors` | SB («Vendors») | TODOS | TODOS (edita vendor lead) | El h1 dice «Paquetes de vendor» (anglicismo) |
| `…/vendors/[packageId]` | Lista | — | TODOS | OK |
| `…/certificates` | SB, Resumen | TODOS | TODOS (edita EDIT) | OK |
| `…/certificates/[certId]` | Lista, MW, PSSR | — | TODOS | OK |
| `…/kpis` | SB, Resumen | TODOS | TODOS | OK |
| `…/kpis/report` | Botón de KPIs | — | TODOS | Vista para imprimir. OK |
| `…/signals` | SB (Ingeniería), Resumen | TODOS | TODOS | OK |
| `…/import-signals` | Resumen, Señales | **— (no está en SB)** | PRIV (si no → `/projects/[id]`) | Solo desde páginas |
| `…/loops` | SB (Ingeniería), Resumen, ITR | TODOS | TODOS (edita EDIT) | OK |
| `…/ce-matrices` | SB (Ingeniería), Resumen | TODOS | TODOS | El h1 está fijo en ES |
| `…/ce-matrices/import` | Botón del hub | — | EDIT | OK |
| `…/ce-matrices/[matrixId]` | Lista, ITR | — | TODOS | OK |
| `…/interlocks` | Solo URL | — | — | **Legacy** → redirect a C&E. Mantener como alias |
| `…/pid-documents` | SB («P&IDs»), Resumen | TODOS | TODOS (edita PRIV) | Duplica en concepto a Documentos (H-15) |
| `…/pid-documents/[docId]/viewer` | Lista, pestaña Docs del tag | — | TODOS | OK |
| `…/explorer` | SB, Twin, Calidad de datos | TODOS | TODOS | Árbol Área›Sistema›Subsistema; casi igual que el Twin (H-10) |
| `…/twin` | SB, «hero» del Resumen, modal de tag | TODOS | TODOS | Sistema›Subsistema›asset; duplica Explorer (H-10) |
| `…/systems` | **Solo Resumen y CT detalle** | **— (no está en SB)** | TODOS (edita EDIT) | Base del readiness (F2), huérfana del menú (H-11) |
| `…/systems/[systemId]` | Lista de sistemas, CT detalle | — | TODOS | Hay dos «fichas de sistema»: esta y `/control-tower/[systemId]` |
| `…/work-plans` | SB, MW | TODOS | TODOS (edita EDIT) | Concepto paralelo al Look-ahead (H-18) |
| `…/pssr` | SB («Vistas y planificación») | TODOS | TODOS (edita EDIT) | PSSR es pre-arranque, no «vistas y planificación» |
| `…/pssr/[reviewId]` | Lista, CT, acción de origen | — | TODOS (aprueba EDIT) | OK |
| `…/import` | SB («Importar») | **EDIT** | **PRIV** | **Desfase**: el leader ve el enlace y lo rebota (H-07) |

### 3.5 Bloque «Administración» (colapsable)

| Ruta | Cómo se llega | Menú | Página permite | Observación |
|---|---|---|---|---|
| `/admin/templates` | SB | EDIT | TODOS (edita EDIT) | In/Cl entran por URL en solo lectura. OK |
| `/admin/templates/[templateId]` | Lista | — | TODOS (edita EDIT) | OK |
| `/admin/templates/[templateId]/preview` | Header del builder | — | TODOS | OK |
| `/admin/templates/[templateId]/translations` | Builder | — | EDIT | h1 fijo en ES |
| `/admin/templates/backup` | Botón de la lista | — | EDIT | OK |
| `/admin/templates/matrix` | Botón de la lista | — | EDIT | Matriz IA escondida tras un botón |
| `/admin/templates/preservation` | SB | EDIT | TODOS | OK |
| `/admin/templates/preservation/[procedureId]` | Lista | — | TODOS | OK |
| `/admin/templates/pssr` | SB | EDIT | TODOS | OK |
| `/admin/templates/pssr/[templateId]` | Lista | — | TODOS | OK |
| `/admin/config` | SB | ADM | ADM | OK |
| `/admin/gates` | SB | ADM | ADM | Migas → «Gates» (titleize) |
| `/admin/registers` | SB («Registros controlados») | PRIV | PRIV | Mismo título que la página del proyecto (H-13) |
| `/admin/test-equipment` | SB, sección del ITR | EDIT | EDIT | Migas «Test Equipment» en inglés |
| `/admin/users` | SB | ADM | ADM | OK |
| `/admin/companies` | SB, aviso en Vendors | EDIT | EDIT (edita ADM) | Migas «Companies» |
| `/admin/workflows` | SB | PRIV | PRIV | OK |
| `/admin/api-keys` | SB | PRIV | PRIV | OK |
| `/admin/webhooks` | SB | PRIV | PRIV | OK |
| `/admin/data-quality` | SB | PRIV | PRIV | Badge `dataQuality` declarado pero nunca calculado |
| `/admin/audit` | SB | ADM | ADM | OK |

**Resumen del mapa:**
- **Huérfanas del menú pero alcanzables:** Sistemas, Importar señales, Test packs, Look-ahead, Reporte diario, Relevo, la matriz ITR y toda la fase F7 (Desempeño). Esta última, como pestaña de Arranque.
- **Solo por URL:** `/admin` (legacy pública) y `/projects/[id]/interlocks` (alias).
- **Resolvers:** `/home`, `/tag_360/[tagId]`, `/r/[id]`.

---

## 4. Hallazgos

### H-01 · Alta · Entrada/inicio · La PWA y la raíz abren en Dashboard, no en Mi trabajo
- **Ubicación:** `public/manifest.json` (`"start_url": "/"`), `src/app/page.tsx:46` (`if (hasSession) redirect('/dashboard')`), `src/app/auth/set-password/page.tsx:53` (`router.push('/dashboard')`). En cambio `(auth)/login/page.tsx:34` y `(auth)/layout.tsx` sí van a `/home`.
- **Evidencia:** `homeForRole` solo se aplica en `/home`. Un inspector con la PWA instalada (el caso de venta: «offline ITR + field execution») abre siempre la app en el Dashboard de la org. Lo mismo pasa con un invitado recién llegado.
- **Impacto:** se pierde el beneficio de Sprint N justo en el canal de campo; hay un toque extra cada vez y el mensaje es confuso («¿dónde está mi trabajo?»).
- **Recomendación:** `redirect('/home')` en `src/app/page.tsx` y en set-password; `start_url: "/home"`. Añadir `shortcuts` al manifest (Mi trabajo, Escanear).
- **Esfuerzo:** S (≤1 h). **Confianza:** alta.

### H-02 · Alta · Flujo de trabajo · Las tareas de F1–F8 no llegan a la persona (sin cola de gates y sin notificaciones)
- **Ubicación:** `src/app/(dashboard)/my-work/page.tsx` (18 colas; ninguna sobre `system_gate_approvals` ni `readiness_gates`); `src/lib/my-work/queues.ts` (`MyWorkCounts` sin gates); migración `20261012200000_gate_cosignatures.sql:14` (`cosign_roles DEFAULT ARRAY['owner','admin','architect','leader','client']`).
- **Evidencia:** `grep "gate"` en my-work y queues no da resultados. Solo hay inserciones en `notifications` en `actions/itr-instances.ts`, `punches.ts`, `certificates.ts` y el cron `constraints-overdue`. No se encontró ninguna en SQL (`INSERT INTO notifications` = 0) ni en las acciones de gates, holds, traspasos, PTC o TQ.
- **Impacto:** el representante del cliente, Operaciones o HSE que debe **co-firmar un gate** no tiene cola, badge ni notificación. Tiene que adivinar: Control Tower → proyecto → sistema. El gerente no tiene «reporte diario por revisar/emitir». Un gate se queda en `pending_signatures` sin que nadie se entere, y eso bloquea el siguiente.
- **Recomendación:** añadir colas `gates_to_approve` (estado `ready*`, solo EDIT) y `gates_to_cosign` (pending_signatures y mi rol en `cosign_roles`, sin haber firmado) a `my_work_counts` y a Mi trabajo. Añadir `daily_reports_to_issue` para EDIT. Emitir `notifications` desde los RPC de gates, traspasos, PTC, holds y TQ, o centralizarlo con un trigger sobre `domain_events`.
- **Esfuerzo:** M (2–3 días). **Confianza:** alta (cola); media (notificaciones: puede haber push vía `domain_events`, pero no llegan a la Bandeja).

### H-03 · Alta · Arquitectura de información · Sidebar demasiado largo y organizado por objeto, no por tarea ni fase
- **Ubicación:** `src/components/layout/sidebar.tsx` (`PERSONAL_ITEMS` 4, `projectSections` 20, `ORG_GROUP` 11, `ADMIN_GROUP` 14).
- **Evidencia (dentro de un proyecto):**

| Rol | Mi trabajo | Proyecto | Organización | Admin | **Total** |
|---|---|---|---|---|---|
| Ow / Ad | 4 | 20 | 11 | 14 | **49** |
| Ar | 4 | 20 | 11 | 10 | **45** |
| Le | 4 | 20 (Importar aparece pero rebota) | 10 | 5 | **39** |
| In | 4 | 19 | 10 | 0 | **33** |
| Cl | 4 | 19 | 10 | 0 | **33** |

  El bloque Proyecto tiene 11 ítems planos más «Ingeniería» (4) y «Vistas y planificación» (5). Este último mezcla Explorer, Twin, Planes, PSSR e Importar. No se ordena por fase: Arranque aparece antes que Certificados, y PSSR, que es pre-arranque, cae en «Vistas».
- **Impacto:** el inspector ve 33 entradas para usar 3–4 (Mi trabajo, Escanear, Tags/ITRs/Punch del proyecto). El drawer móvil de 280 px obliga a hacer scroll. El cliente no encuentra «lo que firma».
- **Recomendación:** ver §6. Sidebar por rol de 8–14 entradas; proyecto organizado por fases con hubs; las vistas globales se colapsan en una sola entrada con selector de alcance.
- **Esfuerzo:** M–L. **Confianza:** alta.

### H-04 · Alta · Página legacy/huérfana · `/admin` pública con nombre del fundador
- **Ubicación:** `src/app/admin/page.tsx` (fuera de `(dashboard)`; `'use client'`, sin auth). `src/app/robots.ts:12` hace `disallow '/admin'`, lo que de hecho publicita la ruta.
- **Evidencia:** muestra «CommUp - Panel de Control» y `<strong>Admin:</strong> Luis Fernando Perdomo`, con un importador CSV que hace `alert("¡Instrument Index procesado correctamente!")`. Último cambio: `fb58493` (lint sweep).
- **Impacto:** credibilidad (un prospecto o pentester que entre a commup.app/admin ve un prototipo), exposición de un nombre personal y confusión con `/admin/*`, que sí es real.
- **Recomendación:** borrar el archivo. Si se quiere un índice de admin, crear `(dashboard)/admin/page.tsx` que redirija al primer ítem permitido.
- **Esfuerzo:** XS. **Confianza:** alta.

### H-05 · Alta · Resiliencia de navegación · No hay `not-found.tsx`, `error.tsx` ni `loading.tsx`
- **Ubicación:** `git ls-files src/app | grep -E "not-found|error\.tsx|loading\.tsx"` no devuelve nada.
- **Evidencia:** más de 60 páginas llaman `notFound()` (proyecto de otra org, ID inválido, ítem borrado). Sin boundary propio, Next muestra su 404 por defecto, fuera del shell del dashboard. No hay boundary de error ni skeletons de carga en páginas con muchas RPC (Control Tower, Mi trabajo con ~20 consultas).
- **Impacto:** callejón sin salida: sin sidebar ni migas, el usuario cree que la app se cayó. Pasa a menudo con el cambio de org (H-14) y con enlaces viejos de notificaciones. La falta de `loading.tsx` hace que los clics «no respondan» en tablet con 4G.
- **Recomendación:** `src/app/(dashboard)/not-found.tsx` con shell, el mensaje «No existe o no tienes acceso» y botones «Ir a Mi trabajo» / «Proyectos». También `(dashboard)/error.tsx` con reintento y `loading.tsx` en `(dashboard)` y en `projects/[id]`.
- **Esfuerzo:** S. **Confianza:** media-alta (comportamiento estándar de Next; no verificado en ejecución).

### H-06 · Media · Migas de pan · Incompletas, en inglés, poco profundas y con recarga completa
- **Ubicación:** `src/components/layout/Breadcrumbs.tsx`.
- **Evidencia:**
  - `PROJECT_SUBLABELS` no tiene `registers, daily, startup, documents, vendors, systems, import, import-signals`, y `ADMIN_LABELS` no tiene `gates, registers, test-equipment, companies`. Esos casos caen en `titleize()` y en una UI en español aparecen «Daily», «Startup», «Vendors», «Systems», «Import Signals», «Test Equipment», «Companies». Tampoco están `ops`, `tag_360` ni `r` en el nivel superior.
  - Las migas se cortan en el nivel 3 (`segments[2]`). Dentro de un ITR (`/projects/X/tags/T/itrs/I`) muestran «Proyectos › X › **Tags**», con «Tags» como página actual y sin enlace al tag.
  - `/control-tower/[systemId]` muestra solo «Control Tower», sin proyecto ni sistema.
  - Admin no tiene un nivel «Administración».
  - Usan `<a href>`, no `next/link`: cada clic recarga la página entera y vuelve a ejecutar el layout (7 consultas).
- **Impacto:** el usuario pierde la orientación en las rutas profundas (ITR, run, PTC, traspaso), justo donde más se trabaja en campo.
- **Recomendación:** que cada página declare sus migas (un `<PageHeader crumbs=[…]>` o una config de rutas con resolvers de nombre para tag, ITR o sistema), con `Link`. Mientras tanto, completar los diccionarios y quitar `titleize` como fallback visible.
- **Esfuerzo:** S (diccionarios) / M (migas declarativas). **Confianza:** alta.

### H-07 · Media · Permisos menú/página · «Importar» visible para leader y rebotado; roles duplicados en línea
- **Ubicación:** `sidebar.tsx` (`import` con `roles: EDITOR_ROLES`) frente a `projects/[id]/import/page.tsx:19` (`['owner','admin','architect']` → si no, `redirect(/projects/${id})`). El Resumen del proyecto usa `canEdit` = PRIV (es coherente con la página, no con el sidebar).
- **Evidencia:** el sidebar duplica los tiers «client-safe» y unas 30 páginas usan arrays literales (`['owner','admin','architect','leader'].includes(...)`) en vez de `EDITOR_ROLES` o `isEditor`.
- **Impacto:** el leader hace clic, aterriza en el Resumen sin explicación y cree que es un bug. Con el tiempo los menús y las páginas se desalinean más.
- **Recomendación:** una sola fuente, `src/lib/constants/roles.ts` (client-safe), importada por sidebar, páginas y `permissions.ts`. Añadir un test que recorra la config del sidebar y verifique que cada `href` usa el mismo guard que su `page.tsx` (por ejemplo, exportar `requiredRoles` por ruta). Las redirecciones por falta de permiso deberían ir a `/home?denied=...` con un toast.
- **Esfuerzo:** S–M. **Confianza:** alta.

### H-08 · Media · Módulo sin hogar · Preservación sin vista por proyecto ni enlaces útiles
- **Ubicación:** `sidebar.tsx` (Preservación solo en Organización), `preservation/PreservationGlobal.tsx:208` (la fila solo enlaza al Resumen del proyecto; el tag y el plan no son clicables), `my-work/page.tsx:538` (enlaza al tag, no al plan), `TagDetail.tsx:64` (`useState<Tab>('overview')`, la pestaña no va en la URL).
- **Evidencia:** para ejecutar un plan vencido desde la lista global hay que ir al Resumen (que no tiene sección de preservación), luego Tags, buscar el tag, abrir la pestaña Preservación y abrir el plan: 5 o más clics. Desde Mi trabajo, el tag se abre en «Resumen».
- **Impacto:** preservación es una tarea recurrente y auditada; esta fricción provoca vencimientos.
- **Recomendación:** filas → `/projects/[p]/tags/[t]/preservation/[plan]`. Que `TagDetail` lea `?tab=`. Añadir «Preservación» al hub de proyecto (fase MC/Pre-com).
- **Esfuerzo:** S. **Confianza:** alta.

### H-09 · Media · Duplicación global/proyecto · Seis pares de listas con el mismo ícono y nombre casi igual a la vez
- **Ubicación:** `sidebar.tsx`. ITRs/«Todos los ITRs», Punch List/«Todos los punches», Certificados/«Todos los certificados», **KPIs/KPIs** (nombre idéntico), Planes/«Todos los planes»; los íconos se repiten (`ClipboardCheck`, `Flag`, `Award`, `TrendingUp`, `CalendarDays`). Los h1 de `/itrs` y `…/itrs` son ambos «ITRs».
- **Evidencia:** dentro de un proyecto, el sidebar muestra dos «KPIs». Los componentes son distintos (`ItrListGlobal` frente a `ItrListView`, etc.): doble mantenimiento.
- **Impacto:** carga cognitiva y errores del tipo «filtré el global creyendo que era mi proyecto».
- **Recomendación:** una sola entrada por objeto, con un selector de alcance (Proyecto actual / Todos los proyectos) en la propia lista (`?project=` ya existe en `/itrs` y `/punch-list`). En el sidebar de organización, dejar solo «Portafolio» (Dashboard + KPIs) y «Control Tower».
- **Esfuerzo:** M. **Confianza:** alta.

### H-10 · Media · Vistas redundantes · 5 «resúmenes» y 4 vistas de jerarquía
- **Ubicación:** `/dashboard`, `/control-tower`, `/kpis`, `/projects/[id]`, `/projects/[id]/kpis`; jerarquía en `…/explorer` («Área › Sistema › Subsistema»), `…/twin` («Sistema › Subsistema › Asset card · semáforo»), `…/systems` (lista + matriz de dependencias) y la matriz de Control Tower.
- **Evidencia:** el Twin se enlaza como hero en el Resumen y a la vez enlaza al Explorer. Hay dos «fichas de sistema»: `/projects/[id]/systems/[systemId]` y `/control-tower/[systemId]`.
- **Impacto:** el usuario no sabe dónde mirar el avance del sistema: cuatro lugares con números parecidos pero calculados distinto (readiness, avance ponderado, % de ITR).
- **Recomendación:** fusionar Explorer y Twin en un solo «Explorador» con modos (árbol / tarjetas / P&ID). Fusionar las dos fichas de sistema en `/projects/[id]/systems/[systemId]` con pestañas (Gates · Avance · Dependencias · Arranque · Traspaso). El Resumen del proyecto debería ser el tablero de fases (ver §6).
- **Esfuerzo:** L. **Confianza:** alta (sobre la duplicación); media (sobre qué fusionar sin perder funciones).

### H-11 · Media · Huérfana del menú · «Sistemas» (F2, base del readiness) no está en el sidebar
- **Ubicación:** `projects/[id]/page.tsx:217` («Ver sistemas →») y `SystemGatesView.tsx:436`. Ninguna entrada en `projectSections`.
- **Impacto:** la sistematización (tipo, prioridad, límites, dependencias) es el primer paso del plan readiness y solo se descubre leyendo el Resumen.
- **Recomendación:** «Sistemas» como primera entrada del bloque «Preparación» del proyecto (§6).
- **Esfuerzo:** XS. **Confianza:** alta.

### H-12 · Media · Contexto · Control Tower es de organización pero opera sobre un proyecto
- **Ubicación:** `control-tower/page.tsx:101` (`params.projectId ?? projects?.[0]?.id`), `sidebar.tsx` (`/control-tower` sin `projectId`), ruta `/control-tower/[systemId]`.
- **Evidencia:** estando en el proyecto B, «Control Tower» abre el proyecto A (el primero por código). En el detalle, el sidebar muestra el «último proyecto» (puede ser otro) y las migas dicen solo «Control Tower».
- **Impacto:** el leader que va a aprobar un gate empieza en el proyecto equivocado; hay riesgo de aprobar en otro proyecto y siempre se paga un clic de más.
- **Recomendación:** mover a `/projects/[id]/readiness` (matriz) y `/projects/[id]/systems/[systemId]` (detalle). Dejar `/control-tower` como portafolio multi-proyecto, que por defecto use `lastProject`. Como mínimo: `href=/control-tower?projectId=${projectId}` cuando hay contexto, y que CT escriba `NAV_STORAGE.lastProject`.
- **Esfuerzo:** S (mínimo) / M (mover). **Confianza:** alta.

### H-13 · Media · Nomenclatura · Choques de nombres y spanglish
- **Evidencia (`es.json`/`en.json`):**
  - **Handover:** «Handover» (paquetes, `/admin/handover`) frente a Daily `tab.handovers` = «Relevo» (ES) / **«Handover»** (EN) frente a «Traspasos» (`ownership_transfers`). En EN hay dos «Handover» distintos.
  - **Registro(s):** sidebar «Registros» → h1 «Registros controlados»; admin «Registros controlados» (tipos) → h1 «Registros controlados»: el mismo título para dos páginas distintas. Además, «Documentos» → h1 «Registro de documentos».
  - **Notificaciones:** sidebar «Notificaciones» = preferencias push (`/admin/notifications`), mientras «Bandeja» = la lista de notificaciones y la campana = lo mismo.
  - **Etiqueta frente a título:** «Control Tower» / «Torre de Control»; «Tracking de Ops» / «Tracking de Punches en Operaciones»; «Vendors» / «Paquetes de vendor»; «Templates Preserv.» (abreviado); «Gates (hold points)».
  - **Spanglish en la UI en ES:** Dashboard, Tags, Punch List, Control Tower, Templates, Workflows, Webhooks, API Keys, Handover, Vendors, Digital Twin, Look-ahead, «CMS Platform».
- **Impacto:** la gente de campo y de cliente piensa con la jerga de la industria (a veces en inglés: ITR, punch, MC, RFSU, PTC, handover). La mezcla sin regla confunde y dificulta escribir el manual.
- **Recomendación:** un glosario de producto con la regla «término de industria en inglés solo si es estándar (ITR, Punch, MC, RFSU, PTC, P&ID, C&E, Look-ahead); el resto en ES» y aplicarlo a etiquetas y h1 (la etiqueta del menú debe ser igual al h1). Renombres: «Paquetes de entrega (Handover)», «Relevo de turno», «Traspaso de custodia», «Registros de campo» (temporales, ciegas, bypass), «Tipos de registro» (admin), «Preferencias de notificación» (movido al menú de usuario), «Torre de control».
- **Esfuerzo:** S. **Confianza:** alta.

### H-14 · Media · Cambio de organización · Te deja en una URL de otra org (404)
- **Ubicación:** `UserMenu.tsx:90-101` (`switchOrg(orgId)` y luego `router.refresh()`).
- **Evidencia:** si estás en `/projects/<id de la org A>/…` y cambias a la org B, el refresh vuelve a renderizar la misma URL; la página hace `notFound()` y con H-05 el usuario cae al 404 genérico. El rol también puede cambiar (por ejemplo, de admin a inspector) sin llevarte a su inicio.
- **Recomendación:** después de `switchOrg`, `router.push('/home')`; además, limpiar `NAV_STORAGE.lastProject`, que ya se valida, pero conviene.
- **Esfuerzo:** XS. **Confianza:** alta.

### H-15 · Media · Conceptos duplicados · Documentos (registro) frente a P&IDs
- **Ubicación:** `src/lib/documents/catalog.ts:7` (`DOC_TYPES` incluye `'pid'`), `projects/[id]/documents/*` y `projects/[id]/pid-documents/*`. No hay referencias cruzadas (`grep pid-documents` en documents = 0).
- **Impacto:** un P&ID puede existir dos veces con revisiones independientes. El bloqueo por «revisión superada» (F8) no protege los planos con hotspots que usan los inspectores. En el menú aparecen en dos bloques distintos.
- **Recomendación:** que `pid_documents` cuelgue de un `document` de tipo `pid` (revisión vigente = PDF del visor). En navegación: «Documentos» con un filtro o pestaña «P&ID (visor)».
- **Esfuerzo:** M–L (modelo). **Confianza:** alta (sobre la falta de vínculo).

### H-16 · Media · Señales muertas · Badges declarados que nunca se calculan y una consulta desperdiciada
- **Ubicación:** `sidebar.tsx` (`badge: 'blockers'` en Control Tower, `'certsPending'` en Certificados; `NotifCounts.dataQuality`) frente a `(dashboard)/layout.tsx` (`notifCounts = { punches, preservation, myWork, inbox }`). El conteo `punches` (Cat A abiertos) se calcula en cada request y ningún ítem lo usa.
- **Impacto:** se pierde la señal más útil para el gerente (bloqueos y certificados pendientes) y se paga una consulta inútil por navegación completa.
- **Recomendación:** calcular `blockers` (gates `not_ready` con criterio bloqueante o Cat A abiertos) y `certsPending` en una RPC agregada (`nav_counts(p_org_id)`), o quitar los badges y la consulta de punches.
- **Esfuerzo:** S. **Confianza:** alta.

### H-17 · Media · Búsqueda y acceso rápido · Sin búsqueda global, command palette, creación rápida ni selector de proyecto
- **Evidencia:** no hay `cmdk`, ⌘K ni `GlobalSearch` en `src`. Para cambiar de proyecto hay que ir a Organización › Proyectos; el encabezado del bloque Proyecto no es un selector. No hay «+ Nuevo» global (punch, acción, TQ, restricción).
- **Impacto:** encontrar «320-PT-1201A» o «TQ-0042» exige saber en qué módulo y proyecto vive. Con 50k tags, el escáner QR es la única vía rápida.
- **Recomendación:** (a) selector de proyecto en el encabezado del bloque Proyecto (dropdown con búsqueda y recientes). (b) ⌘K / botón de búsqueda en la topbar: tags, ITR, punches, sistemas y todos los números con prefijo (TMP-, CIE-, ACC-, RES-, TQ-, DEC-, PRC-, EVT-, TRF-, RD-, REL-, PTC-) con una RPC `search_everything(q, project?)` sobre RLS. (c) Botón «+» en la topbar y en la barra móvil: Punch, Acción, Restricción, TQ, Evento, con el contexto actual (proyecto, tag, sistema) precargado.
- **Esfuerzo:** M (selector + creación rápida) / M–L (búsqueda). **Confianza:** alta.

### H-18 · Baja · Hubs · Pestañas mixtas y funciones escondidas
- **Evidencia:**
  - Daily: 4 pestañas `role="tab"` con estado local más 3 `Link` (Look-ahead, Reporte, Relevo) a rutas propias, con el mismo estilo visual pero otro comportamiento (cambian la URL y recargan los datos).
  - Startup: Procedimientos y Line-ups usan `?tab=`; el resto son rutas; el h1 de todas es «Arranque».
  - Registros: el sub-hub «Test packs» está detrás de un botón.
  - El **forecast** (Look-ahead, `system_gate_plans`) vive en Gestión diaria, mientras «Planes de trabajo» (otro mecanismo de planificación) está en «Vistas y planificación».
- **Impacto:** el planner busca el forecast en «planificación» y no lo encuentra. Desempeño (F7 completa) no se ve desde el menú.
- **Recomendación:** pestañas homogéneas basadas en ruta (`/daily/actions`, `/daily/constraints`…) para que se puedan enlazar. Un h1 por subpágina («Arranque · Bitácora»). Un hub «Planificación» que reúna Look-ahead y Planes de trabajo.
- **Esfuerzo:** S–M. **Confianza:** alta.

### H-19 · Baja · Mi trabajo · «Ver todos» y filas que no llevan al objeto
- **Ubicación:** `my-work/page.tsx:315,334,350` (`moreHref="/itrs"`, `"/punch-list"`, sin filtro «asignado a mí»), `:355` (punch → `/projects/x/punches`, sin `?q=`), `:511` (ítem del plan → lista de planes).
- **Impacto:** «Ver mis 37 ITR» abre los miles de ITR de la org.
- **Recomendación:** añadir `?assignee=me` a `/itrs` y `/punch-list`; punches con `?q=` o una página de detalle `…/punches/[punchId]`, que tampoco existe hoy y que hace falta para enlaces desde notificaciones.
- **Esfuerzo:** S. **Confianza:** alta.

### H-20 · Baja · Resumen del proyecto y enlaces · Textos fijos, poco responsive, `<a>` internos
- **Ubicación:** `projects/[id]/page.tsx` (textos fijos en ES: «Ver sistemas →», «Disciplinas», «Punch List Abiertos»; `toLocaleDateString('es-CO')`; `gridTemplateColumns: '1fr 1fr'`; tira de info de 5 columnas en flex). Hay unos 41 `<a href="/…">` internos en `(dashboard)` y componentes (Breadcrumbs, ProjectCard, TagDetail prev/next, ItrExecution «← tag», listas).
- **Impacto:** en EN la página clave se ve en español; en tablet vertical las dos columnas se aprietan; cada `<a>` recarga la app entera (lento en 4G y vuelve a pedir el layout).
- **Recomendación:** pasar el Resumen a i18n con grid `auto-fit`; regla de lint `@next/next/no-html-link-for-pages`, o una propia, para `<a href="/`.
- **Esfuerzo:** S. **Confianza:** alta.

### H-21 · Baja · Ayuda · La guía está desactualizada respecto a la IA actual
- **Ubicación:** `public/guia.html` (último commit 2026-09-02, antes de F1–F8); enlace `/guia` en `UserMenu.tsx:228`.
- **Evidencia:** la sección «Arquitectura de información» describe la jerarquía de seis niveles, pero no el sidebar actual, ni Gestión diaria, Arranque, Gates, Documentos o Vendors. Que `/guia` sirva `guia.html` depende del `html_handling` por defecto de Workers Assets; en `next dev` podría dar 404.
- **Recomendación:** regenerar la guía desde §7 de este informe. Enlazar `/guia.html` explícitamente, o crear la ruta.
- **Esfuerzo:** S. **Confianza:** media (servido de `/guia`); alta (desactualización).

### H-22 · Baja · URL frente a ubicación · `/admin/notifications` en Mi trabajo y `/admin/handover` en Organización
- **Impacto:** las migas y la intuición («admin = no es para mí») no cuadran; el inspector duda en abrir algo bajo `/admin`.
- **Recomendación:** `/settings/notifications` (desde el menú de usuario) y `/projects/[id]/handover`.
- **Esfuerzo:** S. **Confianza:** alta.

### H-23 · Baja · Accesos denegados silenciosos
- **Ubicación:** todas las `admin/*/page.tsx` (`redirect('/dashboard')`), `import`/`import-signals` (`redirect(/projects/${id})`).
- **Impacto:** el inspector rebotado llega al Dashboard (que no es su inicio) sin mensaje.
- **Recomendación:** `redirect('/home?denied=<ruta>')` y un toast «Necesitas rol X».
- **Esfuerzo:** XS. **Confianza:** alta.

### H-24 · Info · Rutas legacy o resolvers
- `/projects/[id]/interlocks` → redirect a `ce-matrices`. Mantener como alias.
- `/tag_360/[tagId]`: no es legacy, es el resolver del escáner (`QRNFCScanner.tsx:287,564`); el nombre está en snake_case y refleja la vista SQL. Sugerencia: `/t/[id]`, simétrico con `/r/[id]`, conservando el alias.
- **Confianza:** alta.

**Conteo por severidad:** Alta 5 · Media 12 · Baja 6 · Info 1 (total 24).

---

## 5. Conteo de clics de tareas clave (estado actual)

«Clic» = toque o clic de navegación o acción; no se cuentan los campos de formulario.

| # | Tarea | Ruta actual | Clics | Fricciones |
|---|---|---|---|---|
| 1 | **Inspector ejecuta un ITR asignado** (PWA en tablet) | Abrir app → `/` → `/dashboard` → **TB «Mi trabajo»** → fila del ITR → ejecución | **2** (+ abrir app) | H-01: la PWA abre en Dashboard. Si el ITR no está entre los primeros `QUEUE_LIMIT`, «Ver todos» lleva a `/itrs` de toda la org (H-19). Ideal: 1 |
| 2a | **Inspector levanta un punch durante un ITR** | Ejecución → ítem «Crear punch» → modal → Guardar | **2** | Bien resuelto (funciona offline) |
| 2b | **Punch con el equipo delante** (QR) | TB «Escanear» → escaneo (`/tag_360` → tag) → pestaña «Punches» → «Nuevo» → Guardar | **4** (+ 2 redirects) | La pestaña no es enlazable. Sin «+» rápido |
| 2c | **Punch sin QR** | Menú → (proyecto) Punch List → «Nuevo» → buscar tag en el formulario → Guardar | **4–6** | Si no hay «último proyecto»: +2 (Organización › Proyectos › proyecto) |
| 3 | **Leader aprueba un gate** | SB Organización › Control Tower → (cambiar proyecto: select + enviar, porque abre el primero) → código del sistema → tarjeta del gate: condiciones/notas → «Aprobar» | **3–5** | H-12 (proyecto por defecto equivocado); no hay cola «gates listos» (H-02) |
| 3b | **Operaciones/HSE/cliente co-firma el gate** | Igual que 3 + «Firmar como…» | **4–6** y **sin aviso** | H-02: ni cola, ni badge, ni notificación |
| 4 | **Planner actualiza el forecast** | SB Proyecto › Gestión diaria → pestaña «Look-ahead» → Editar → cambiar fecha → Guardar | **4** | Escondido en «Gestión diaria»; «Vistas y planificación» lleva a Planes de trabajo, otro mecanismo (H-18). Alternativa: CT → sistema → sección plan (4–5) |
| 5 | **Gerente revisa el reporte diario** | (Dashboard) → SB Proyecto › Gestión diaria → pestaña «Reporte» → fila RD-… → (PDF) | **3–4** (+2 si no hay último proyecto) | No hay cola ni widget «reporte de hoy por emitir/revisar» (H-02) |
| 6a | **Cliente firma un PTC** | Login → `/home` → **`/dashboard`** (el cliente no es rol de campo) → SB «Mi trabajo» → cola «PTC por firmar» → fila → Firmar → confirmar | **4** | El cliente aterriza en Dashboard, donde el widget de firmas solo cubre certificados |
| 6b | **Cliente firma un certificado** | Dashboard → widget de firmas / Mi trabajo → certificado → Firmar | **3** | `SIGNER_ROLES` para la cola de firmas = Ow/Ad/Ar (el cliente usa el widget) |
| 6c | **Cliente co-firma un gate** | Organización › Control Tower → proyecto → sistema → Firmar | **4–5**, **sin aviso** | H-02 |
| 7 | **Admin invita a un usuario** | SB «Administración» (colapsado por defecto) → Usuarios → «Invitar» → email/rol → Enviar | **4** | Aceptable; Administración tiene 14 ítems y empieza cerrada |

**Lectura:** las tareas de campo (1, 2a) están bien una vez dentro. Las tareas de **firma y decisión de F1–F8** (3, 3b, 6c, 5) son las que más fallan: no por la cantidad de clics, sino porque **nada te dice que te toca**.

---

## 6. Propuesta de nueva arquitectura de navegación

### 6.1 Principios
1. **Inicio por rol, siempre.** `/`, la PWA, la invitación y el cambio de org pasan todos por `/home`.
2. **Tareas antes que objetos.** «Mi trabajo» es la puerta principal de todos, incluidos cliente y gerente, y cubre **todas** las firmas y decisiones (gates incluidos).
3. **Un proyecto a la vez, por fases.** El proyecto es el contexto principal (selector en el encabezado del bloque) y su menú sigue el ciclo de C&C.
4. **Una entrada por objeto.** Las vistas globales se vuelven un **alcance** («Todos los proyectos») dentro de la misma lista, no ítems de menú aparte.
5. **Etiqueta = h1 = miga.** Un glosario único.
6. **Encontrar sin navegar.** ⌘K / búsqueda, creación rápida «+» y escáner.

### 6.2 Estructura propuesta

**Topbar (todos):** [☰ móvil] · Migas declarativas · 🔍 Buscar (⌘K) · **＋ Crear** (Punch · Acción · Restricción · TQ · Evento; contextual) · 🔔 Bandeja (campana con «Ver todo») · Menú de usuario (Org ▸, Preferencias de notificación, Idioma, Tema, Guía, Salir).

**Sidebar:**

```
MI TRABAJO
  Mi trabajo            (badge: todo lo que me toca, incluidos gates por aprobar/co-firmar y reporte por emitir)
  Escanear QR/NFC
  [Bandeja → pasa a la campana; se quita del sidebar en desktop]

PROYECTO ▾ [selector: CO-LLA-JAC · Jacana]      (dropdown con búsqueda + recientes)
  Resumen               (tablero por fases: readiness, avance, bloqueos, próximos hitos)
  Readiness             (= matriz de Control Tower de este proyecto; detalle = ficha de sistema)
  ── Preparación
     Sistemas           (sistematización, dependencias, límites)
     Tags y equipos     (incluye Explorador/Twin como modos de vista)
     Documentos         (registro + visor P&ID como pestaña)
     Vendors            (paquetes de vendor)
  ── Completamiento mecánico (MC)
     ITRs
     Punch list
     Preservación       (nuevo: vista por proyecto)
     Registros de campo (temporales, ciegas, bypass, test packs)
  ── Pre-comisionamiento / Comisionamiento
     Señales y lazos    (señales + loops + matrices C&E en pestañas)
     Certificados       (MC/RFPC/RFC/RFSU)
     PSSR
  ── Arranque y desempeño
     Arranque           (procedimientos, line-ups, bitácora)
     Desempeño (PTC)    (sale de la pestaña: es una fase)
     Operación y traspaso (personal, competencias, repuestos, traspasos de custodia, paquetes handover)
  ── Gestión
     Gestión diaria     (acciones, restricciones, TQ, decisiones, reporte diario, relevo)
     Planificación      (look-ahead/forecast + planes de trabajo)
     KPIs
  [Importar → botón dentro de Tags/Sistemas/Señales, no ítem de menú]

PORTAFOLIO  (solo si la org tiene >1 proyecto o el rol es gestor)
  Proyectos
  Panorama              (Dashboard + KPIs de org + Control Tower multi-proyecto)
  Post-handover         (Tracking de Ops)

ADMINISTRACIÓN ▸  (colapsable; solo EDIT+)
  Organización: Usuarios · Empresas · Configuración · Gates
  Plantillas:   ITR (+ matriz IA) · Preservación · PSSR · Tipos de registro
  Recursos:     Equipos de prueba
  Integración:  Workflows · API Keys · Webhooks
  Control:      Calidad de datos · Auditoría
```

Las secciones de fase pueden mostrarse colapsadas, con la «fase activa» del proyecto expandida (derivada de `project_phases` o de la fase con más actividad). Así el bloque Proyecto se ve como 6 encabezados más una fase abierta, no como 20 líneas.

### 6.3 Sidebar por rol (dentro de un proyecto)

| Rol | Visible por defecto | Total aprox. |
|---|---|---|
| **Inspector** | Mi trabajo, Escanear · Proyecto: Resumen, Tags, ITRs, Punch list, Preservación, Registros de campo, Arranque (si tiene holds o line-ups) · sin Portafolio ni Admin | **9** |
| **Leader (disciplina)** | Lo del inspector + Readiness, Certificados, PSSR, Gestión diaria, Planificación, KPIs · Admin: Plantillas, Equipos de prueba | **15–17** |
| **Planner** (hoy sin rol propio; equivale a leader/architect) | Mi trabajo · Proyecto: Resumen, Readiness, Sistemas, Planificación (primero), Gestión diaria, KPIs · Portafolio: Panorama | **10–12** |
| **Commissioning manager (architect/admin)** | Todo el bloque Proyecto por fases (colapsado) + Portafolio + Admin | **~20 visibles** (colapsado) |
| **Cliente / Operador** | Mi trabajo (firmas, PTC, gates, TQ), Bandeja · Proyecto: Resumen, Readiness, Certificados, PSSR, Desempeño, Operación y traspaso, Gestión diaria (TQ/decisiones), Documentos | **10** |
| **Owner/Admin** | Igual que el manager + Administración completa | **~25** (colapsado) |

Implementación: cada `NavItem` declara `roles` (permiso, desde la fuente única de roles) y `audience` (relevancia: `field`, `lead`, `mgmt`, `client`). Lo permitido pero poco relevante va a un «Más…» colapsado, para que nada quede inaccesible. Un test verifica que `roles` del ítem es igual al guard de su `page.tsx`.

### 6.4 Hub del proyecto (Resumen) por fases
`/projects/[id]` como **tablero de fases**, con una fila por gate o fase (MC → RFPC → RFC → RFSU → Desempeño → Handover). Cada fila muestra: % readiness · avance ponderado · bloqueos (Cat A, restricciones nivel 4, documentos superados) · próximos compromisos (look-ahead) · enlace «Ver sistemas en esta fase» que abre Readiness filtrado. Debajo: «Lo que bloquea hoy» (top 10) y «Hitos próximos». El Twin pasa a ser un modo del Explorador, no el hero.

### 6.5 Mi trabajo como centro de notificaciones
- Colas nuevas: **Gates por aprobar** (EDIT, gates `ready*`), **Gates por co-firmar** (mi rol está en `cosign_roles`), **Reporte diario por emitir** (EDIT), **TQ por responder** (cliente), **Decisiones por revisar**.
- Filtros arriba: «Todo · Firmas · Ejecutar · Verificar · Gestión» y selector de proyecto.
- Cada cola enlaza al **objeto**, con deep link a la pestaña (`?tab=`), nunca a una lista sin filtro.
- La Bandeja (campana) solo avisa de **eventos**; Mi trabajo muestra el **estado**. Todo RPC de F1–F8 que crea una obligación para otra persona inserta en `notifications`.

### 6.6 Móvil y tablet
- Barra inferior para **todos los roles**, con contenido por rol: campo = Mi trabajo · Escanear · **＋** · Proyecto · Menú; cliente/gerente = Mi trabajo · Proyecto · Readiness · Menú.
- Drawer con el sidebar por rol (9–17 ítems): sin scroll en un iPad vertical.
- Manifest: `start_url: "/home"` + `shortcuts` (Mi trabajo, Escanear, Nuevo punch).

### 6.7 Fusiones y bajas concretas
| Acción | De | A |
|---|---|---|
| Borrar | `src/app/admin/page.tsx` | — |
| Fusionar | `/itrs`, `/punch-list`, `/certificates`, `/work-plans`, `/preservation` (globales) | Listas de proyecto con alcance «Todos los proyectos» (rutas antiguas redirigen con `?scope=all`) |
| Fusionar | `/dashboard` + `/kpis` | «Panorama» (portafolio) |
| Mover | `/control-tower` (matriz por proyecto) y `/control-tower/[systemId]` | `/projects/[id]/readiness` y `/projects/[id]/systems/[systemId]` (pestaña Gates); `/control-tower` queda multi-proyecto |
| Fusionar | `…/explorer` + `…/twin` | «Tags y equipos» con modos Árbol / Tarjetas 360 |
| Fusionar | `…/signals` + `…/loops` + `…/ce-matrices` | «Señales y lazos» (3 pestañas) |
| Vincular | `…/pid-documents` | Pestaña «Visor P&ID» de Documentos |
| Mover | `/admin/handover` | `/projects/[id]/handover` dentro de «Operación y traspaso» |
| Mover | `/admin/notifications` | `/settings/notifications` (menú de usuario) |
| Promover | `…/startup/performance` | Ítem propio «Desempeño (PTC)» |
| Agrupar | `…/daily/lookahead` + `…/work-plans` | «Planificación» |
| Renombrar | `/tag_360/[id]` | `/t/[id]` (con alias) |
| Añadir | — | `(dashboard)/not-found.tsx`, `error.tsx`, `loading.tsx`; `…/punches/[punchId]` |

### 6.8 Orden sugerido (impacto / esfuerzo)
1. **Quick wins (≤1 día):** H-01, H-04, H-05, H-07, H-11, H-14, H-16, H-23, los diccionarios de migas (H-06) y los renombres del glosario (H-13).
2. **Sprint 1 (1 semana):** colas de gates y reporte en Mi trabajo + notificaciones de F1–F8 (H-02); selector de proyecto; CT con contexto de proyecto (H-12); preservación por proyecto y deep links (H-08, H-19).
3. **Sprint 2 (1–2 semanas):** sidebar por fases y por rol (§6.2–6.3), con las listas globales como alcance (H-09).
4. **Sprint 3:** ⌘K + «＋ Crear» (H-17); fusiones Explorer/Twin, fichas de sistema y Documentos/P&ID (H-10, H-15); Resumen por fases (§6.4).

---

## 7. Funcionamiento para el manual — cómo navegar CommUp (estado actual)

### 7.1 Elementos de pantalla
- **Barra superior:** migas de pan (dónde estás); 🔔 **campana** (avisos recientes; «Ver todo» abre la Bandeja); **menú de usuario** (tu nombre): cambiar de organización si perteneces a varias, idioma, tema claro/oscuro, Guía de arranque y Cerrar sesión. En pantallas de menos de 1024 px, el botón ☰ abre el menú lateral.
- **Menú lateral**, en cuatro bloques:
  1. **Mi trabajo:** *Mi trabajo* (todo lo que te toca, con un número rojo de pendientes), *Bandeja* (historial de avisos), *Escanear QR/NFC*, *Notificaciones* (activar avisos push en este dispositivo).
  2. **Proyecto · nombre:** aparece en cuanto entras a un proyecto. Si estás en una vista general, muestra el **último proyecto** que visitaste. Contiene *Resumen, Tags, ITRs, Punch List, Registros* (temporales, ciegas, bypass, test packs), *Gestión diaria* (acciones, restricciones, TQ, decisiones, look-ahead, reporte diario, relevo), *Arranque* (procedimientos, line-ups, bitácora, operaciones y traspasos, desempeño/PTC), *Documentos, Vendors, Certificados, KPIs*. Debajo, **Ingeniería** (Señales, Loops, Matrices C&E, P&IDs) y **Vistas y planificación** (Explorador, Digital Twin, Planes de trabajo, PSSR, Importar).
  3. **Organización:** vistas de todos los proyectos: *Dashboard, Proyectos, Control Tower* (matriz sistema × gate; elige el proyecto arriba), *KPIs, Todos los ITRs/punches/certificados, Preservación, Todos los planes, Tracking de Ops* (punches después del handover) y *Handover* (paquetes de entrega; solo owner/admin/architect).
  4. **Administración** (pulsa para desplegar): plantillas, configuración, gates, tipos de registro, equipos de prueba, usuarios, empresas, integraciones, calidad de datos y auditoría. Cada persona ve solo lo que su rol permite.
- **En el móvil o la tablet** (inspector y leader): barra inferior con **Mi trabajo · Escanear · Bandeja · Menú**. El punto ámbar o rojo sobre «Menú» indica registros pendientes de sincronizar o que no hay conexión.

### 7.2 Por rol: por dónde empezar

**Inspector de campo**
1. Entra con tu usuario: llegas a **Mi trabajo**. *Si abres la app instalada y ves el Dashboard, toca «Mi trabajo» en la barra inferior.*
2. En «ITRs por ejecutar», toca un ITR para abrirlo. Completa los ítems: el avance se guarda solo y funciona sin red.
3. ¿Encontraste un defecto? Dentro del ITR usa **Crear punch**. Si tienes el equipo delante, usa **Escanear**: el QR te lleva a la ficha del tag; ve a la pestaña *Punches* → *Nuevo*.
4. Revisa también «Punches asignados», «Por verificar», «Holds por liberar» y «Line-ups» en Mi trabajo.

**Leader de disciplina**
1. Llegas a **Mi trabajo**: ITR por revisar, punches por clasificar, acciones y restricciones tuyas.
2. Para el estado del sistema: *Organización › Control Tower* → elige el proyecto → toca el sistema → verás cada gate con sus criterios. Si está «listo», agrega condiciones o notas y pulsa **Aprobar**.
3. La gestión del día está en *Proyecto › Gestión diaria* (acciones, restricciones, TQ, decisiones) y el forecast en su pestaña **Look-ahead**.

**Planner**
1. *Proyecto › Gestión diaria › Look-ahead*: forecast y compromisos por sistema y gate. *Editar* para cambiar fechas; el compromiso lo fija un leader o superior, y cambiarlo exige motivo.
2. *Proyecto › KPIs* para el avance y *Organización › Control Tower* para el readiness.
3. *Vistas y planificación › Planes de trabajo* para las listas de trabajo semanales.

**Gerente de comisionamiento (architect/admin)**
1. Llegas al **Dashboard**. *Control Tower* muestra la matriz sistema × gate y los bloqueos.
2. Reporte diario: *Proyecto › Gestión diaria › Reporte* → abre o crea el RD del día → *Emitir* (queda inmutable) → PDF.
3. Preparación del proyecto: *Proyecto › Resumen › Sistemas y dependencias*, *Importar* (tags) e *Importar señales* (desde Resumen o Señales).
4. Entrega: *Proyecto › Arranque › Operaciones* (traspasos) y *Organización › Handover* (paquetes).

**Cliente / representante del operador**
1. Llegas al **Dashboard**: el widget de firmas muestra los certificados por firmar.
2. Abre **Mi trabajo** para PTC por firmar, traspasos y relevos.
3. Si te toca co-firmar un **gate**: *Organización › Control Tower* → proyecto → sistema → *Firmar como…*. *Hoy no aparece en Mi trabajo; consulta con tu gerente.*
4. Las TQ dirigidas a ti están en *Proyecto › Gestión diaria › TQ*.

**Administrador**
1. *Administración* (despliégala) › **Usuarios** → *Invitar* → email y rol → la persona recibe un correo para definir su contraseña.
2. *Configuración* (fases, disciplinas, tipos de equipo), *Gates* (hold points, firmas requeridas), *Plantillas ITR / Preservación / PSSR*, *Empresas* (contratistas y vendors).
3. *Integración* (API Keys, Webhooks, Workflows) y *Auditoría* para la trazabilidad.

### 7.3 Consejos de navegación
- **Cambiar de proyecto:** *Organización › Proyectos* → elige uno. El menú lateral lo recordará como «Último proyecto».
- **Cambiar de organización:** menú de usuario → *Cambiar organización*. *Hazlo desde Mi trabajo o el Dashboard; si estás dentro de un proyecto podrías ver «página no encontrada».*
- **Buscar un tag:** escanea su QR, o *Proyecto › Tags* y escribe en el buscador.
- **Imprimir o exportar:** los PDF están en cada certificado, PSSR, reporte diario, ITR y en *KPIs › Reporte*; los Excel están en *Gestión diaria › Exportar* y en las listas de punches.
