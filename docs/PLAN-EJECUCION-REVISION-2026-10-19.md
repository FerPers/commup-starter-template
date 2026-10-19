# Plan de ejecución de la revisión integral — 2026-10-19

Convierte la hoja de ruta de `docs/REVISION-INTEGRAL-2026-10-19.md` §7 y las etapas de `docs/PROPUESTA-NAVEGACION-2026-10-19.md` §12 en **sesiones de trabajo** de 2–4 horas. Cada sesión cierra con commit + push a `main` y **CI en verde** (lección de F7-S3/F8: la CI estuvo roja 18 pushes sin revisarla).

Detalle de cada hallazgo (archivo, línea, escenario, arreglo): anexos `docs/revision-2026-10-19/A–I, Z`.

## Reglas para todas las sesiones

1. **Antes de empezar:** `git pull`, `gh run list --limit 5` (si la CI ya está roja, se arregla primero), leer los hallazgos de la sesión en su anexo y verificar que siguen vigentes en el código o en prod antes de tocar nada.
2. **Migraciones:** se escriben y prueban con `BEGIN … escenario DO/RAISE … ROLLBACK` contra la BD vinculada; **se aplican en prod solo con autorización explícita de Luis** en el chat. Luego `supabase gen types` (conservar las 6 líneas de cabecera).
3. **Paridad:** si cambia una regla que existe en SQL y en TS (`eligibility.ts`, `gates.ts`, `catalog.ts`), se cambian las dos y su test.
4. **Verificar en el navegador** lo que sea visible (dev server, SW desregistrado, `window.confirm` sobrescrito en pruebas).
5. **Cerrar:** `npm run check` + `npm test` en local → commit → push → `gh run list` hasta verde → retirar del `MANUAL-COMMUP-POR-ROL.md` §8 las limitaciones corregidas → actualizar memoria (`project_estado_continuar.md` «RETOMAR AQUÍ»).
6. Nada se marca hecho sin su criterio «Listo cuando» comprobado.

## Mapa de sesiones

| # | Sesión | Hallazgos | Migración | Tamaño |
|---|---|---|---|---|
| S1 | CI confiable + flujo de campo | G-01, C-02, C-03, C-17, C-21, panel docs ITR | sí (C-03) | 3–4 h |
| S2 | Cifras correctas | D-06, B-01, B-02, D-08, F-04, KPI widget, D-02, D-11, E-04/B-18 | sí | 3–4 h |
| S3 | Seguridad menor + navegación N0 | A-12, A-18, F-01, N0 #1–12 (H-01, H-04, H-05, H-07…) | no | 3–4 h |
| S4 | Integridad 1: miembros, punches, ITR | A-02, A-06/C-11, C-10/C-34 | sí | 3–4 h |
| S5 | Integridad 2: PSSR, certificados, preservación | A-04/C-12/C-32, A-05/C-13, C-05/C-06 | sí | 4 h |
| S6 | Firmas configurables | C-01 | sí | 3–4 h |
| S7 | Offline por usuario | A-09/C-08/E-01, C-07, C-09 | no | 3–4 h |
| S8 | Suite de autorización + GRANTs versionados | A-14, A-17 | sí (versionar) | 3 h |
| S9 | Que el sistema avise | D-04/H-02, I-08, I-09, B-03 (1.ª parte) | sí | 4 h |
| S10 | Zona horaria del proyecto | D-05 | sí | 3 h |
| S11 | Navegación N1 | Propuesta §12 N1 | quizá (`my_work_counts`) | 2 sesiones |
| S12 | Readiness v2 + rendimiento | D-01, D-18, D-19, H-12, B-05, G-07 | sí (índices) | 2 sesiones |
| S13 | Navegación N2 + N3 | Propuesta §12 N2–N3 | sí (`search_everything`) | 2–3 sesiones |
| T | Trimestre | Revisión §7 «Trimestre» | sí | a planificar |

Orden: S1 → S2 → S3 son la «Semana 1» (estabilizar; casi todo S y de alto impacto). S4–S8 cierran atajos de integridad (Semanas 2–3). S9–S12 hacen que el sistema avise y se entienda (Semanas 3–5). S13 y T, después.

---

## S1 — CI confiable + flujo de campo  ← **empezar aquí**

**Objetivo:** que nada llegue a producción con CI roja y que el inspector pueda cerrar su trabajo de campo de punta a punta.

| Ítem | Qué hacer | Dónde | Listo cuando |
|---|---|---|---|
| G-01 | `deploy.yml` con `needs:` a lint/typecheck/test (o `workflow_run` sobre CI con `conclusion == success`); arreglar `tests/db/daily-report.test.ts`; proponer a Luis protección de rama en GitHub (lo activa él) | `.github/workflows/*.yml`, `tests/db/` | `gh run list` verde y un push con test roto no despliega |
| C-02 | ITR de lazo/C&E (tabla con filas de origen): `localItrStatus` debe considerar `sourceRows` igual que el servidor | `ItrExecution.tsx`, `src/lib/sync/outbox-utils.ts`, lógica de tabla del ITR | un ITR de loop check completo se firma desde la UI (en línea y sin red) |
| C-03 | El inspector puede levantar punch, comentar y adjuntar fotos (RLS/acción alineadas con el rol) | `src/app/actions/punches.ts`, políticas `punches`/`punch_comments`/`punch_attachments` | con usuario inspector: crear punch con foto y comentario desde el ITR y desde Punch list |
| C-17 | Mi trabajo: el ITR sigue en la cola del ejecutor hasta su firma; el supervisor lo ve solo cuando le toca firmar | `src/lib/my-work/queues.ts` (+ test), `my_work_counts` | test de colas por «siguiente firma pendiente» y badge = lista |
| C-21 | Descripción ES vacía cae a la original, no a blanco | render de ítems del ITR | ítem sin traducción muestra el texto base |
| Panel docs | «Documentos de referencia» del ITR debajo de los ítems o plegado por defecto (regresión F8 en móvil) | `ItrExecution.tsx` (`documentsSlot`) | en 375 px el primer ítem se ve sin desplazar |

**Migración:** probable para C-03 (políticas) y quizá `my_work_counts` (C-17) → pedir autorización.
**Verificación:** `npm test`; navegador en móvil (375×812) con inspector; CI verde tras el push.

## S2 — Cifras correctas

**Objetivo:** ningún número firmado o reportado sale de una lista truncada.

- **D-06** reporte diario: conteos con `count(*)` en `daily_report_data`, no `LIMIT 30` + `.length`; reportes ya emitidos quedan como están (inmutables) — documentar.
- **B-01 / D-08** snapshot KPI: agregados en SQL (`take_mgmt_snapshot`/snapshot de KPIs), sin bajar filas.
- **B-02** certificados del proyecto: elegibilidad desde `compute_system_readiness`, no desde listas truncadas.
- **F-04** reportes (PDF/Excel) con conteos reales — ver anexo F.
- **KpiSummaryWidget.tsx:134** quitar `slice(0,3)`: todas las fases.
- **D-02** regresión de un gate bloquea el siguiente y los sistemas dependientes (en `compute_system_gates`, parche por ancla con `pg_get_functiondef`).
- **D-11** una sola regla PSSR para el criterio del gate y `startup_prerequisites()`.
- **E-04 / B-18** `ingest_signal_samples` resuelve la señal por proyecto (no `LIMIT 1` en la org).

**Listo cuando:** con el proyecto LOADTEST (50k tags) los totales del reporte, KPI y certificados coinciden con `count(*)` directo; test DB de regresión de gate.

## S3 — Seguridad menor + navegación N0

- **A-12** escapar/sanitizar el detalle del certificado (XSS almacenado). **A-18** `/auth/confirm` solo redirige a rutas internas. **F-01** PDF de punch list con saltos de línea.
- **N0 #1–12** de la propuesta de navegación (§12, tabla con archivos y criterio): inicio por rol en raíz/PWA/set-password/cambio de org; borrar `/admin`; `not-found`/`error`/`loading`; «Importar» solo para quien puede; «Sistemas» y «Desempeño (PTC)» en el menú; Control Tower abre el proyecto actual; migas completas en español con `Link`; denegaciones con mensaje; badges muertos; glosario en etiquetas y h1; «Ver todos» filtrado a lo mío; dashboard con todas las fases (si no quedó en S2).

**Listo cuando:** cada fila de N0 cumple su «Listo cuando»; el inspector abre la PWA y cae en Mi trabajo.

## S4 — Integridad 1: miembros, punches, estados de ITR

Patrón común: **RPC SECURITY DEFINER + trigger de guarda**, retirar la escritura directa por RLS.
- **A-02** miembros y roles: nadie se sube a owner ni expulsa owners salvo owner; último owner protegido.
- **A-06 / C-11** punches: cancelar y bajar de categoría exige motivo + rol + evento auditado; cancelar Cat A re-evalúa certificados.
- **C-10 / C-34** estados de ITR solo por transiciones válidas; el cliente no actualiza `itrs`; arreglar «Aprobar seleccionados».

**Listo cuando:** test DB: un `UPDATE` directo por PostgREST con rol inspector/cliente falla; la UI sigue funcionando.

## S5 — Integridad 2: PSSR, certificados, preservación

- **A-04 / C-12 / C-32** PSSR: no se aprueba con ítems «NO» ni en borrador; firmas solo propias y de personas distintas.
- **A-05 / C-13** certificados: firmante = usuario autenticado, roles distintos por persona, el cliente firma lo suyo, reabrir re-evalúa elegibilidad, punch nuevo invalida.
- **C-05 / C-06** preservación: la próxima fecha avanza al **finalizar** el registro, también si lo ejecuta un inspector.

## S6 — Firmas requeridas configurables (C-01)

Firmas por plantilla/fase (ejecutor · supervisor · cliente opcionales), pantalla para completar asignaciones faltantes y migración de ITR existentes sin perder firmas. Sincronizar `eligibility.ts`, colas de Mi trabajo y SQL.

## S7 — Offline por usuario

- **A-09 / C-08 / E-01** cola y cachés separadas por `user_id`; purga al cerrar sesión; una firma encolada se rechaza si el usuario de la sesión cambió.
- **C-07** una respuesta rechazada pasa a la bandeja «No sincronizado», no bloquea la cola.
- **C-09** ITR sin red abre aunque no se haya visitado antes (precarga desde Mi trabajo) y muestra lo encolado al recargar.

Requiere probar en PWA instalada (Chrome) con red cortada.

## S8 — Suite de autorización + GRANTs versionados

- **A-17** test DB rol × tabla × operación (owner/admin/architect/leader/inspector/client) generado desde una matriz; entra a CI cuando estén los secretos `TEST_*` (pedir a Luis que los cargue).
- **A-14** volcar GRANTs y políticas de storage actuales a una migración versionada (sin cambiar comportamiento).

## S9 — Que el sistema avise

- **D-04 / H-02** notificaciones y colas de F1–F8 (gate listo/pendiente de firma, restricción vencida, TQ, traspasos, hold points) + digest diario por correo.
- **I-08** nombres de evento únicos y un solo despacho de webhooks; **B-03** (1.ª parte) eliminar los `net.http_post` duplicados de `domain_events`.
- **I-09** revivir el web push (suscripción, temas, envío desde las colas).

## S10 — Zona horaria del proyecto (D-05)

`projects.timezone` y uso en reporte diario, KPIs, vencimientos y crons; los reportes emitidos no cambian.

## S11 — Navegación N1 (2 sesiones)

Mi trabajo agrupado (Ejecutar · Verificar · Firmar · Decidir) con colas nuevas; menú por fases y por rol con `audience`, fuente única de roles y test de paridad menú↔página; selector de proyecto arriba; preservación por proyecto; tag con `?tab=`; página del punch; ITR adaptado al teléfono y barra inferior. Meta medida por test: inspector ≤ 9 entradas, leader ≤ 17, client ≤ 10.

## S12 — Readiness v2 + rendimiento (2 sesiones)

- **D-01 / D-18** Control Tower con los números del motor nuevo; un solo «avance» definido.
- **D-19 / H-12** filtros, orden, búsqueda, paginación y exportación; Readiness dentro del proyecto con ficha de sistema única.
- **B-05** índices faltantes (FK y filtros calientes); **G-07** `cache()` de auth/membresía por request.

## S13 — Navegación N2 + N3

Resumen del proyecto por fases; fusiones (Explorador+Twin, Señales y lazos, Planificación); listas globales como alcance; P&ID como documento `pid`; ⌘K con `search_everything(q, project)` sobre RLS; ＋Crear con contexto; guía en la app desde el manual.

## T — Trimestre

Readiness materializada + outbox de eventos; designación de firmantes, `project_members`, roles vendor/viewer; generación masiva de ITR; dossier compilado; registro documental único; paquete de campo offline; punch con foto marcada; SSO/MFA; integraciones CMMS/P6/EDMS/historian; migración canónica del SQL central (D-09/B-19).

---

## Pendientes de Luis (no bloquean S1)

- Invitar `+smtp2` como **Cliente** y firmar PTC-0001 (Operaciones `+smtp`, Cliente `+smtp2`).
- Probar subida de PDF en Documentos en commup.app.
- Activar protección de rama `main` en GitHub cuando S1 deje la CI verde.
- Cargar los secretos `TEST_SUPABASE_URL`, `TEST_USER_A|B_*`, `TEST_PROJECT_A_ID` para que los tests DB corran en CI (S8).
