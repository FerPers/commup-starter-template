# Plan de ejecución de la revisión integral — VERSIÓN DEFINITIVA (2026-10-19)

Este es el **único documento de trabajo** para corregir los 293 hallazgos de la revisión integral. Reemplaza la v1 (`7cd36e9`) y la v2 (`d030a33`). Dice qué hacer, en qué orden, qué decisiones hacen falta y cuándo se da por terminada cada sesión.

| Documento | Para qué |
|---|---|
| **Este plan** | Orden, estado, decisiones y brief de cada sesión |
| [`PLAN-EJECUCION-COBERTURA-2026-10-19.md`](PLAN-EJECUCION-COBERTURA-2026-10-19.md) | Los 293 hallazgos, cada uno con su sesión (generado desde los anexos) |
| [`revision-2026-10-19/A–I`](revision-2026-10-19/) | Detalle de cada hallazgo: archivo:línea, evidencia, recomendación |
| [`PROPUESTA-NAVEGACION-2026-10-19.md`](PROPUESTA-NAVEGACION-2026-10-19.md) | Diseño de menús para N1–N3 |
| [`REVISION-INTEGRAL-2026-10-19.md`](REVISION-INTEGRAL-2026-10-19.md) | Diagnóstico y top 20 (contexto; su §7 quedó reemplazado por este plan) |

---

## 1. Cómo arrancar una sesión nueva

Abre una sesión y escribe: **«Sigue el plan definitivo: `docs/PLAN-EJECUCION-REVISION-2026-10-19.md`»**. La sesión hace esto:

1. Lee este documento entero y el `CLAUDE.md`.
2. `git pull` y `gh run list --limit 5`. Si la CI está roja, la arregla antes que nada.
3. Elige la **primera sesión de la tabla §2 con estado «Pendiente»** cuyas dependencias estén «Hecha» y cuyas decisiones estén respondidas. Si falta una decisión, te la pregunta con la recomendación del §4.
4. Lee en su anexo los hallazgos de esa sesión y **verifica que siguen vigentes** en el código o en prod antes de tocar nada.
5. Ejecuta el brief (§6) con las reglas del §5.
6. Al cerrar, actualiza en este documento la tabla §2 (estado, commit, fecha), marca los hallazgos en la tabla de cobertura y actualiza la memoria (`RETOMAR AQUÍ`).

Una sesión de las de este plan dura unas 3–4 horas de trabajo.

---

## 2. Estado

| Sesión | Tema | Depende de | Decisiones | Estado |
|---|---|---|---|---|
| S1-v1 | Sesión arrancada con el brief v1: CI + flujo de campo | — | (D8 aplicada según recomendación) | ✅ **Hecha** 2026-10-19 (5dbde43 + 350b17f; migración 20261025120000 en prod; CI verde) — ver §3 |
| S01 | Red de seguridad: CI, deploy único y base de pruebas | S1-v1 | D1, D2, D3 | ✅ **Hecha** 2026-10-19 (f5fb4f7, 1532c46 + migración 20261026120000 en prod; CI verde con deploy) — quedan D1 y D3 (Luis). Detalle en la cobertura |
| S02 | Seguridad rápida | S01 | — | ✅ **Hecha** 2026-10-19 (649c2a5, 5999391; migración 20261027120000 en prod; edge `evaluate-workflow` desplegada) — A-02 adelantado (guarda), S01-N1 cerrado. Detalle en la cobertura |
| S03 | SQL canónico | S01 | — | ✅ **Hecha** 2026-10-19 (6827c09; migración 20261028120000 en prod; 13 funciones en `supabase/functions-sql/`, test de deriva en CI) — B-28 cerrado. Detalle en la cobertura |
| S04 | ITR: firmas requeridas e independencia | S03 | D4, D5, D6 | ✅ **Hecha** 2026-10-19 (ed0e4c6; migración 20261029120000 en prod, 17 escenarios con ROLLBACK) — D5 aprobó 0 ITR. Detalle en la cobertura |
| S05 | ITR: contenido, estados y numeración | S04 | D7 | ✅ **Hecha** 2026-10-19 (ae789f0; migración 20261103120000 en prod, 10 escenarios con ROLLBACK). Detalle en la cobertura |
| S06 | Punch: permisos de campo y escritura por RPC | S03 | D8 | ✅ **Hecha** 2026-10-19 (037a15a + 3204f08; migración 20261030120000 en prod, 22 escenarios con ROLLBACK). Detalle en la cobertura |
| S07 | Importaciones sin pérdida de datos | S03 | D9 | ✅ **Hecha** 2026-10-19 (6d3c75f; migración 20261031120000 en prod, 7 escenarios con ROLLBACK). Detalle en la cobertura |
| S08 | Preservación | S03 | D10 | ✅ **Hecha** 2026-10-19 (68498e6; migración 20261102120000 en prod, 10+1 escenarios con ROLLBACK). Detalle en la cobertura |
| S09 | Índices y «cero filas para contar» | S03 | D11 | ✅ Hecha (fc36e63) |
| S10 | Reporte diario y zona horaria | S03 | D12 | ✅ **Hecha** 2026-10-20 (migración 20261105120000 en prod, 8 escenarios con ROLLBACK; 24 funciones con «hoy» del proyecto). Detalle en la cobertura |
| S11 | Lógica de gates | S03 | D13 | ✅ **Hecha** 2026-10-20 (migración 20261106120000 en prod, 13 escenarios con ROLLBACK). Detalle en la cobertura |
| S12 | IIoT confiable | S03 | — | ✅ **Hecha** 2026-10-20 (migración 20261107120000 en prod, 9 escenarios con ROLLBACK; `signal_samples` particionada). Detalle en la cobertura |
| S13 | Correcciones de F8 (documentos y vendors) | S03 | — | ✅ **Hecha** 2026-10-20 (migración 20261108120000 en prod, 28 comprobaciones con ROLLBACK). Decisiones de Luis: referencias automáticas + masivas; IFR/IFA = aviso con bloqueo opcional por org; QR completo. Detalle en la cobertura |
| S14 | Firmantes designados (capacidades) y roles | S03 | D14 | ✅ **Hecha** 2026-10-20 (migración 20261109120000 en prod, 17 comprobaciones con ROLLBACK incl. los dos «Listo cuando»). Detalle en la cobertura |
| S15 | Miembros, auditoría y cuotas | S03 | — | ✅ **Hecha** 2026-10-20 (migración 20261110120000 en prod, 14 comprobaciones con ROLLBACK). Decisiones de Luis: invitación pendiente para cuentas existentes; suspensión y vencimiento de acceso; cuota de IA con modelo por tarea. Detalle en la cobertura |
| S16 | PSSR por RPC | S14 | — | ✅ **Hecha** 2026-10-20 (migración 20261111120000 en prod, 11 comprobaciones con ROLLBACK). Decisiones de Luis: firmas Operaciones + HSE por defecto (por plantilla); al rechazar se anulan. Detalle en la cobertura |
| S17 | Certificados por RPC | S14 | D6, D15 | ✅ **Hecha** 2026-10-20 (migración 20261112120000 en prod, 12 comprobaciones con ROLLBACK). Decisiones de Luis: Cliente = `client_rep`, Autoridad = Operaciones, invalidación = bloqueado con motivo (se desbloquea solo), fase anterior obligatoria. Detalle en la cobertura |
| S18 | Offline por usuario (2 sesiones) | S06 | — | ✅ **Hecha** 2026-10-20 (sesión 1 sin migración; sesión 2 migración 20261113120000 en prod). Decisiones de Luis: al salir «sincronizar o descartar»; capturas de antes con confirmación; conflicto de respuesta = decide el usuario; «preparar sin red» = mis ITR pendientes (hasta 30). E-27 en pasos de arranque → S25. Detalle en la cobertura |
| S19 | Generación masiva de ITR | S05 | — | ✅ **Hecha** 2026-10-20 (migración 20261114120000 en prod, 9 comprobaciones con ROLLBACK). Decisión de Luis: responsables por disciplina en la vista previa (vacío = sin asignar). Detalle en la cobertura |
| S20 | Readiness a escala (2 sesiones) | S09 | — | ✅ **Hecha** 2026-10-20 (migraciones 20261115120000, 20261116120000 y 20261116130000 en prod). LOADTEST con RLS: gates 9,4 s → 2 ms (estado materializado), readiness 18,2 s → 0,09 s, avance 0,76 → 0,05 s, Mi trabajo 0,19 s. B-17 revertido (rompía embeds de PostgREST) → pendiente. Detalle en la cobertura |
| S21 | Bus de eventos (outbox) | S03 | — | ✅ **Hecha** 2026-10-20 (migración 20261117120000 en prod + webhook-dispatcher y evaluate-workflow desplegados). Outbox con pg_cron por minuto, 0 HTTP sin suscriptores, catálogo v1 en singular + eventos de negocio, push con cola, retención. Detalle en la cobertura |
| S22 | Avisos y colas | S04, S20, S21 | D16 | 🟡 **Hecha salvo el correo** 2026-10-20 (migración 20261119120000 en prod): colas de readiness en Mi trabajo, avisos por cada obligación nueva y por transiciones de gates, push desde la bandeja con temas por usuario, badge personal y chips agrupados. Falta el resumen diario por correo (D16): no hay proveedor de correo transaccional, decisión pendiente de Luis. Detalle en la cobertura |
| S23 | Readiness v2 (pantallas) | S20 | — | ✅ **Hecha** 2026-10-20 (migración 20261120120000 en prod): Control Tower desde el motor de gates (siguiente gate y qué lo frena), un solo readiness en todas las pantallas, filtros en la URL, Excel, diálogo con impacto al aprobar/revocar, condiciones = acciones ACC, look-ahead con bloqueo y ventana diaria, registros validados en la RPC con aviso de vencidos. Detalle en la cobertura |
| S24 | Paquete de handover v2 (2 sesiones) | S14 | D17 | ✅ **Hecha** 2026-10-21 (migración 20261121120000 en prod). S24a: RPC esquema 3.0 con todo F1–F8 por sistema y firmas, ZIP con anexos PDF reales, manifest.json firmado con Ed25519 y verificable con OpenSSL, página pública `/verify/<hash>`. S24b: PDF de ejecución de procedimiento, hoja de line-up y ficha de evento (con celdas en blanco para llenar a mano), también como anexos del ZIP. Detalle en la cobertura |
| S25 | Correcciones de F6–F7 (2 sesiones) | S14 | — | ✅ **Hecha** 2026-10-21. S25a (migración 20261122120000): auditoría y gobernanza — línea de tiempo de ejecuciones, competencias anulables, traspaso con no dispensables y reconocimiento por firmante, orden y fecha de hitos, re-congelado sin borrar, exclusiones reconocidas por el cliente. S25b (migración 20261123120000): UX de campo — line-up con encontrada/dejada, candado/sello, observaciones y filtros; pasos con rango esperado y aviso de detener; flags de tipos de equipo; aviso de revisión reemplazada; diálogos propios en todo Arranque. Detalle en la cobertura |
| N0 | Navegación: arreglos rápidos | S01 | D18 | ✅ **Hecha** 2026-10-21 (sin migración): inicio por rol (raíz, PWA, set-password, cambio de org), fuera el prototipo `/admin`, 404/error/carga propios, Sistemas y Desempeño en el menú, migas completas con `Link`, rebotes por rol con aviso, sin badges ni consultas muertas, glosario aplicado (menú = título), «Ver todos» de Mi trabajo filtrado a lo mío. Detalle en la cobertura |
| N1 | Navegación: Mi trabajo y menú por fase y rol | S14, S22 | D18 | 🟡 **Hecha la parte de las maquetas** 2026-10-21 (sin migración): menú por fase y rol (`src/lib/navigation/menu.ts` + test de paridad menú ↔ guard de página y metas por rol), selector de proyecto con recientes, fase abierta = la de más actividad (`getActivePhase`), «Más…» recordado, Administración por grupos, Bandeja a la campana y preferencias al menú de usuario; Mi trabajo en columnas con pestañas por grupo, colas en 0 en gris y filtro `?project=`; punch del cliente por categoría. ✅ **N1b hecho** 2026-10-21 (migración `20261124120000`): tag con `?tab=`, página propia del punch con historia y ejecución ITR en teléfono (C-29). Quedan de paso H-18, H-20 (resto de `<a>` internos y Resumen) y D-38 |
| N2 | Navegación: Readiness y fusiones | N1, S23 | D18 | 🟡 Maquetas aprobadas por Luis 2026-10-21 (lienzo «Maquetas N2», https://claude.ai/artifact/NRdbPYQdgTWoq14JeHBZDh), opción A en Documentos. ✅ **N2a hecho** (sin migración): Readiness en el proyecto + ficha de sistema única. ✅ **N2b hecho** (sin migración): Resumen por fases + widget Readiness (D-38). ✅ **N2c hecho** (sin migración): Tags con modos, hubs Señales y lazos y Planificación, listas con alcance. ✅ **N2d hecho** (migración `20261125120000`): P&ID = documento tipo `pid`, visor por revisión y pines copiados «por revisar». **N2 completo.** Propuesta: N2a Readiness + ficha de sistema · N2b Resumen por fases (+ D-38) · N2c Tags/Señales/Planificación/alcance · N2d Documentos + visor P&ID |
| N3 | Navegación: buscar sin navegar | N2 | D18 | 🟡 Maquetas listas 2026-10-22 (lienzo «Maquetas N3», https://claude.ai/artifact/1sVqQk986idYHtf9QhwgVB), esperando decisiones de Luis. Propuesta: N3a ⌘K + `search_everything` + recientes · N3b ＋ Crear + alta de punch propia + ＋ en el teléfono + /ayuda desde el manual |
| Q | Calidad transversal | — | — | Continua (de paso en cada sesión) |
| T | Trimestre | — | — | Después del Hito F |

**Orden recomendado:** S01 → S02 → S03 → S04 → S06 → S07 → S08 → S05 → S09 → S10 → S11 → S12 → S13 → S14 → S15 → S16 → S17 → S18 → S19 → S20 → S21 → S22 → S23 → S24 → S25 → N1 → N2 → N3, con N0 en paralelo desde que termine S01. Las sesiones sin dependencia entre sí pueden cambiar de orden si conviene (por ejemplo, adelantar S07 antes de una importación grande de Geopark).

---

## 3. Lo que ya está en marcha (S1-v1)

Luis arrancó la sesión S1 con el brief de la v1. Va por buen camino y **no se interrumpe**: lo que está haciendo coincide con las recomendaciones de este plan. Cuando termine, la siguiente sesión verifica su commit y reparte el avance así:

| Lo que hace S1-v1 | Cuenta en | Qué queda pendiente después |
|---|---|---|
| Deploy dentro de `lint.yml` con `needs: [typecheck, lint, test]`; timeout del test de reporte diario | S01 (G-01) | Borrar `deploy.yml` si sigue, desconectar Workers Builds (D1), base de pruebas (D2), protección de rama (D3), suite de autorización, GRANTs |
| `localItrStatus` con `sourceRows` (ITR de lazo y C&E) | S04 (C-02) | Nada, si queda con su test |
| Colas de Mi trabajo por turno de firma (`queues.ts`, `my_work_counts`) | S04 (C-17) | **Provisional:** se ajusta en S04 cuando cambien las firmas requeridas (C-01) |
| El inspector levanta, comenta y adjunta punch (`PUNCH_RAISE_ROLES`, migración `20261025120000`) | S06 (C-03/A-15/I-02) | Escritura sensible por RPC, cancelar y recategorizar con motivo (A-06/C-11), bandeja sin descarte silencioso si no lo cubrió |
| Descripción ES vacía; panel de documentos del ITR | S05 (C-21; regresión F8) | Nada, si queda verificado en 375 px |

La migración `20261025120000` de S1-v1 te pedirá autorización en esa sesión.

---

## 4. Decisiones que necesito de ti

Cada una trae mi recomendación. Se responden antes de la sesión que la necesita; la respuesta se anota aquí.

| # | Decisión | Mi recomendación | Sesión | Respuesta |
|---|---|---|---|---|
| D1 | Un solo camino de deploy | GitHub Actions con la CI como requisito (ya lo hace S1-v1). Tú desconectas Cloudflare Workers Builds en el panel de Cloudflare. | S01 | ✅ **Hecha** 2026-10-19: Luis desconectó Cloudflare Workers Builds; el único deploy es el job de `lint.yml` con `needs`. Web Analytics usa la configuración automática de Cloudflare (sin token: no crear `NEXT_PUBLIC_CF_BEACON_TOKEN`, contaría doble). |
| D2 | Dónde corren los tests de BD | Hoy corren **contra producción**. Recomiendo un proyecto Supabase de pruebas separado (el plan gratuito permite 2), con las migraciones aplicadas y usuarios por rol creados por el propio test. | S01 | 2026-10-19: **seguir en prod por ahora**. La suite se escribe igual; mover a proyecto de pruebas queda pendiente. |
| D3 | Protección de la rama `main` | Activarla con la CI como check obligatorio (la activas tú en GitHub). | S01 | ✅ **Hecha** 2026-10-19: ruleset `main` activo (restringe borrado, bloquea force push, exige TypeScript/ESLint/Vitest; bypass Repository admin para los push directos). |
| D4 | Firmas requeridas del ITR por defecto | `{ejecutor, supervisor}`; cliente solo donde lo pida la plantilla o la fase. | S04 | ✅ 2026-10-19: según recomendación (`itr_templates.required_signatures` + `project_phases.itr_client_signature`, congeladas en `itrs.required_signatures`). |
| D5 | ITR atascados en «completado» que ya cumplen las firmas nuevas | Listártelos primero y luego aprobarlos en la migración, con un evento de auditoría «aprobado por regla de firmas v2». | S04 | ✅ 2026-10-19: según recomendación. Lista = 0 (los 14 ITR de prod son DEMO; los 9 con cliente lo conservan como requerido). |
| D6 | Independencia de firmas | Una persona no firma dos capacidades del mismo ITR o certificado. | S04, S17 | ✅ 2026-10-19: según recomendación. ITR hecho en S04 (firma y asignación); certificado hecho en S17 (`sign_certificate`). |
| D7 | Cambio masivo de estado de ITR | Eliminarlo (el estado sale del contenido y las firmas) y dar a cambio reasignar, reprogramar y agregar a un plan. | S05 | ✅ 2026-10-19: según recomendación (sin cambio masivo ni aprobación masiva; reprogramar, reasignar y agregar a plan). |
| D8 | ¿El inspector levanta punch? | Sí, y también comenta y adjunta. Recategorizar y cancelar: supervisor+, con motivo; cancelar lo hace otra persona. *(S1-v1 ya aplicó la primera parte.)* | S06 | ✅ 2026-10-19: según recomendación (`cancel_punch`; recategorizar ya era `review_punch_category`). |
| D9 | Reimportación | Una columna que no viene en el archivo no se toca; mover de subsistema un tag con ITR o punch exige un flujo explícito. | S07 | ✅ 2026-10-19: según recomendación (la celda vacía tampoco borra; la importación no mueve un tag con ITR o punch y lo informa). |
| D10 | Preservación: cuándo avanza la próxima fecha | Al **finalizar** el registro, con cualquier resultado; un NOK genera punch o acción. | S08 | ✅ 2026-10-19: según recomendación; el NOK genera **punch** obligatorio (la variante «acción» queda para cuando se pida). |
| D11 | Snapshots históricos calculados con datos truncados | Marcarlos «sospechosos» (no se pueden recalcular hacia atrás). | S09 | ✅ 2026-10-19: según recomendación. `kpi_snapshots.suspect` (contador ≥ 1000 o fecha ≥ el día en que el proyecto pasó 1000 ITR/punches/planes); hoy marca 0 filas (prod solo tiene DEMO, 14 ITR). La curva S los dibuja huecos y el Excel los rotula. |
| D12 | Zona horaria y reportes ya emitidos | `projects.timezone` (por defecto `America/Bogota`). Los reportes emitidos quedan inmutables con una nota; solo se corrigen si alguien emite una revisión. | S10 | ✅ Recomendada (2026-10-20) |
| D13 | Regresión de un gate | El gate anterior en regresión **bloquea** el siguiente; una dependencia entre sistemas en regresión es **condición** (amarillo). Configurable por org. | S11 | ✅ Recomendada (2026-10-20) |
| D14 | Modelo de firmantes | Capacidades por persona y proyecto (`commissioning`, `operations`, `hse`, `client_rep`) asignadas por un líder, opcionalmente atadas a la empresa de F8; el rol queda como piso. La membresía por proyecto (que el cliente vea solo sus proyectos) va al trimestre, salvo que ya tengas un cliente con varios proyectos en la misma org. | S14 || ✅ Con ajustes (2026-10-20): sin designados rige el rol de antes con aviso; **designan solo owner/admin**; client_rep = empresa operadora o rol client |
| D15 | Quién firma «Cliente» en el certificado | Quien tenga la capacidad `client_rep` (rol `client` o empresa owner). | S17 | ✅ 2026-10-20: según recomendación. Además: «Autoridad» = capacidad Operaciones, «Completación» = Comisionamiento. |
| D16 | Canales de aviso | En la app + push + resumen diario por correo; cada usuario elige temas. | S22 | |
| D17 | Contenido del handover v2 | Todo F1–F8 con hashes, más los PDF de procedimientos y del PTC, en un ZIP. | S24 | |
| D18 | Propuesta de navegación | Aprobar N0 ya (son arreglos). N1–N3 se revisan contigo sobre maquetas antes de construir. | N0–N3 | |

---

## 5. Reglas de cada sesión

1. **Verificar antes de cambiar.** Cada hallazgo se comprueba en el código o en prod antes de tocarlo; si ya no aplica, se anota en la cobertura como «no aplica» con la razón.
2. **Migraciones:** se prueban con `BEGIN … escenario DO/RAISE … ROLLBACK` (`supabase db query --linked -f`). Se aplican en prod **solo con tu autorización explícita** en el chat. Después se regeneran los tipos, conservando las 6 líneas de cabecera. Desde S03, una función central se edita en su archivo canónico (`supabase/functions-sql/`), nunca por ancla.
3. **Paridad:** si cambia una regla que existe en SQL y en TS (`eligibility.ts`, `gates.ts`, `queues.ts`, catálogos), cambian las dos y su test.
4. **Test primero:** cada hallazgo de permisos entra a la suite rol × tabla como caso que hoy falla; la sesión lo pone en verde.
5. **Un módulo se toca una vez:** lo bajo del mismo módulo se arregla en la misma sesión («de paso»).
6. **Verificar en el navegador** lo que se ve (dev server, SW desregistrado, `window.confirm` sobrescrito en las pruebas, móvil 375×812 para el campo).
7. **Cierre:** `npm run check` + `npm test` → commit → push → **CI verde** (no se cierra con la CI roja) → manual §8 sin las limitaciones corregidas → tabla §2 y cobertura actualizadas → memoria.
8. **No hacer** fuera de lo pedido: crear cuentas, escribir contraseñas, cambiar ajustes de GitHub o de Cloudflare (eso lo haces tú).

---

## 6. Briefs por sesión

Formato: **Objetivo** · **Hallazgos** · **Archivos clave** (puntos de partida; la lista completa está en el anexo) · **Migración** · **Listo cuando**. Tamaño: S ≈ media sesión · M ≈ una · L ≈ dos o más.

### Hito A — Seguro para seguir trabajando

#### S01 — Red de seguridad: CI, deploy único y base de pruebas · M · D1–D3
- **Objetivo:** que nada llegue a producción con la CI roja y que los tests no escriban en producción.
- **Hallazgos:** G-01 (lo que no haya cerrado S1-v1), G-16 (dos pipelines de deploy y un script que falle si falta alguna `NEXT_PUBLIC_*`), A-17 (esqueleto de la suite rol × tabla × operación para owner/admin/architect/leader/inspector/client, con los casos que hoy fallan marcados pendientes), A-14 (volcar a una migración los GRANT y las políticas de storage vigentes, sin cambiar comportamiento). De paso: G-24, G-25, G-26, D-37, E-35.
- **Archivos clave:** `.github/workflows/lint.yml`, `.github/workflows/deploy.yml`, `tests/db/*`, `vitest.config.mts`, `tests/db/rls-smoke.test.ts`.
- **Migración:** solo la de GRANTs/storage (necesita lectura de prod autorizada).
- **Listo cuando:** un push con un test roto **no despliega**; Workers Builds desconectado; los tests de BD corren contra la base de pruebas; la suite de autorización existe y corre en CI.

#### S02 — Seguridad rápida · M
- **Objetivo:** cerrar los huecos de seguridad pequeños que quedan abiertos.
- **Hallazgos:** A-12 (XSS en el detalle de certificado), A-18 (redirección abierta en `/auth/confirm`), I-10 (bucle infinito de workflows: ignorar `created_via='workflow'` y limitar la profundidad), I-11 (headers de workflows legibles por cualquier miembro), G-05 (`microphone=(self)`: hoy está bloqueado el dictado por voz), D-32 (aprobar y firmar un gate no verifica la pertenencia al proyecto), A-19 (DEFINER del baseline ejecutables por `anon`), A-23 (SSRF ciego en el endpoint de push), C-25/A-24 (filtros `.or()` sin escapar), F-09/A-29 (inyección de fórmulas en exportaciones), I-22, A-20, A-26, A-27, F-27.
- **Archivos clave:** `next.config.ts`, `supabase/functions/evaluate-workflow/index.ts`, `WorkflowsView.tsx`, `src/app/auth/confirm/`, detalle de certificado, `src/app/api/push/`.
- **Migración:** sí (I-11, D-32, A-19).
- **Listo cuando:** cada hallazgo tiene un test que antes fallaba.

#### S03 — SQL canónico · M
- **Objetivo:** que las funciones centrales vivan en archivos versionados y no como parches de texto.
- **Hallazgos:** D-09/B-19/E-26. Una migración con el `CREATE OR REPLACE` completo, tal como están hoy en prod, de `compute_system_gates`, `compute_project_gates`, `my_work_counts`, `daily_report_data` y `take_mgmt_snapshot`; los mismos cuerpos en `supabase/functions-sql/*.sql`; un test de deriva que compare `pg_get_functiondef` con esos archivos. Sin cambiar comportamiento. De paso: B-28 (tabla de respaldo vieja en prod), F-35.
- **Migración:** sí (sin cambio funcional).
- **Listo cuando:** el test de deriva pasa en CI.

### Hito B — Que el campo funcione

#### S04 — ITR: firmas requeridas e independencia · M–L · D4–D6
- **Objetivo:** que todo ITR se pueda aprobar con las firmas que de verdad corresponden, por personas distintas.
- **Hallazgos:** C-01/I-05 (`required_signatures` por plantilla o fase; `sign_itr_atomic` aprueba cuando están todas; pantalla para completar asignaciones; migrar los ITR existentes según D5), A-08 (personas distintas), C-17 (recalibrar las colas de S1-v1 sobre las firmas requeridas), C-02 (confirmar lo de S1-v1). De paso: C-36, C-38, I-24.
- **Archivos clave:** `src/app/actions/itr-instances.ts`, `source-itrs.ts`, `itr-assign.ts`, `…/itrs/[itrId]/types.ts`, `20261016150000_test_equipment.sql` (`count(DISTINCT role)=3`), `src/lib/my-work/queues.ts`, `my_work_counts`.
- **Migración:** sí, de comportamiento sobre ITR vivos: primero listar qué registros cambian.
- **Listo cuando:** un ITR de lazo sin cliente se aprueba con ejecutor y supervisor distintos, en línea y sin red; el badge de Mi trabajo coincide con la lista.

#### S05 — ITR: contenido, estados y numeración · M · D7
- **Hallazgos:** C-10 (quitar el cambio masivo de estado y `bulkApproveItrs`), C-34 (`itrs_update` sin el cliente), C-26, C-20 (casilla desmarcada cuenta como respondida), C-23 (devolver con observaciones), C-15 (número atómico por código de plantilla). C-21 y el panel de documentos los confirma si ya los hizo S1-v1. De paso: A-28, C-40.
- **Archivos clave:** `src/app/actions/bulk.ts`, `ItrListView.tsx`, `ItrListGlobal.tsx`, `itr-instances.ts`, `ItemRow.tsx`.
- **Migración:** sí (C-34, C-15).

#### S06 — Punch: permisos de campo y escritura por RPC · M–L · D8
- **Objetivo:** que el punch funcione para quien está en campo y que sus estados sensibles no se cambien por la API REST.
- **Hallazgos:** C-03/A-15/I-02 (confirmar lo de S1-v1; la bandeja no descarta en silencio un error de permiso, lo deja en «No sincronizado»), A-06/I-04/C-11 (cancelar y bajar de categoría solo por RPC, con motivo, rol y otra persona, auditado; un Cat A cancelado re-evalúa los certificados), C-04/A-03 (lo que no cubrió el hotfix: máquina de estados de Ops; `closed_final` solo desde `verified_ops` y por otra persona), C-22 (punch desde el ITR con foto, ítem y responsable), B-10 (contador de numeración), F-01 (PDF de punch list con saltos de línea). De paso: C-41, C-44.
- **Archivos clave:** `src/app/actions/punches.ts`, `20260903200000_rls_set_based_policies.sql`, `20261016120000_punch_evidence.sql`, `src/lib/sync/outbox.ts`, `outbox-utils.ts`, `src/lib/pdf/renderer.ts`.
- **Migración:** sí.
- **Listo cuando:** con un usuario inspector, crear un punch con foto desde el ITR, en línea y sin red; un `UPDATE` directo por REST a `cancelled` falla.

#### S07 — Importaciones sin pérdida de datos · M · D9
- **Hallazgos:** C-16 (reimportar tags borra datos maestros y mueve tags con ITR), F-06 (reimportar señales borra la cadena del loop check), C-24/F-23 (el archivo entero viaja en una sola action), F-16 (corregir una JB sin reimportar), C-28 (setup no transaccional); vista previa del diff por campo antes de aplicar. De paso: F-32, F-36.
- **Archivos clave:** `ImportWizard.tsx`, `src/app/actions/import.ts`, `import-signals.ts`, `setup.ts`, `SignalsView.tsx`.
- **Listo cuando:** reimportar un Excel sin columnas de fabricante o de cadena no cambia esos campos (test).

#### S08 — Preservación · M · D10
- **Hallazgos:** C-05/I-03 (el inspector finaliza y no se guarda nada), C-06 (la fecha avanza al primer toque): RPC `finalize_preservation_record`. H-08 (vista por proyecto), I-14, C-27. De paso: C-39, C-42 (el borrado en cascada del historial pasa a `RESTRICT` o a archivado).
- **Archivos clave:** `src/app/actions/preservation.ts`, `PreservationExecution.tsx`, baseline (trigger `next_due_date`).
- **Migración:** sí.

### Hito C — Números verdaderos

#### S09 — Índices y «cero filas para contar» · M–L · D11
- **Hallazgos:** B-05 + B-09 (índices con `CONCURRENTLY`, fuera de transacción: procedimiento aparte, autorizado aparte), B-01/D-08/B-25 (snapshot KPI en SQL con clave única), B-02 (elegibilidad de certificados agregada), F-04, B-07, B-08 (`fetchAllRows` con orden único y marca «truncado»), B-24 (una sola definición de «abierto» y «vencido»), F-07, F-08, E-20, D-24, B-22, `KpiSummaryWidget` con todas las fases; una regla de CI contra `.from()` sin límite. De paso: B-27, F-29.
- **Archivos clave:** `src/app/actions/kpi-snapshots.ts`, `src/app/api/cron/snapshot/route.ts`, `src/lib/list/fetch-all.ts`, `KpiSummaryWidget.tsx`, `projects/[id]/certificates/page.tsx`.
- **Listo cuando:** en LOADTEST (50k tags) los totales de KPI, certificados y reporte imprimible coinciden con `count(*)`.

#### S10 — Reporte diario y zona horaria · M · D12
- **Hallazgos:** D-06 (`{count, items}` por bloque), D-05/E-15/G-13 (`projects.timezone` en reporte, vencimientos, relevos, snapshots y PDF), D-27, B-20 (rendimiento de `daily_report_data`: el timeout del test vuelve a 5 s), B-26. De paso: B-29, D-28, D-29, D-30.
- **Archivos clave:** `functions-sql/daily_report_data.sql` (desde S03), `src/lib/daily/report.ts`, `api/cron/constraints-overdue/route.ts`, `src/lib/pdf/daily-report.ts`.

#### S11 — Lógica de gates · M · D13
- **Hallazgos:** D-02 (la regresión propaga), D-13 (un Cat A nuevo no regresa todos los gates), D-11 (una sola regla PSSR), E-07, E-08, E-14, D-10 (mi `documents_current` incumple la decisión §15.4), D-14, D-15, D-17, D-20 (cambiar la configuración reescribe el pasado), D-21. De paso: D-31, D-33, D-34, D-35, F-28.
- **Archivos clave:** `functions-sql/compute_system_gates.sql`, `src/lib/readiness/gates.ts`, `src/lib/systems/dependencies.ts`, `src/app/actions/gates.ts`, `gates-admin.ts`.
- **Listo cuando:** tests de BD de regresión, PSSR y dependencias en verde, con paridad TS ↔ SQL.

#### S12 — IIoT confiable · M
- **Hallazgos:** E-04/B-18 (señal por proyecto; `ambiguous_signal` en lugar de `LIMIT 1`), E-24 (NaN y fechas futuras), E-03/B-12 (RPC `signal_series` sargable y reducida; partición), E-18, E-06 (la consola mezcla datos congelados y en vivo). De paso: E-28, E-33.
- **Archivos clave:** `ingest_signal_samples` (baseline), `src/lib/api/auth.ts`, `startup/events/[eventId]/page.tsx`, `startup/performance/runs/[runId]/page.tsx`.

#### S13 — Correcciones de F8 (documentos y vendors) · M
- **Hallazgos:** F-03 (la vigente es la de fecha de emisión más reciente), F-05 (KPI de vendors con re-pruebas), F-02 (referencias automáticas y revalidación masiva), F-12, F-20, F-11, F-10 (unidad MΩ en el PDF), F-15, F-18/C-31 (QR), F-19. De paso: F-24, F-25, F-30, F-31, F-33, F-34.
- **Archivos clave:** `DocumentReferences.tsx`, `DocumentDetail.tsx`, `20261021120000`, `20261022120000`, `20261023120000`, `QRNFCScanner.tsx`, `tag_360/[tagId]/page.tsx`.

### Hito D — Firmas que prueban algo

#### S14 — Firmantes designados (capacidades) y roles · L · D14
- **Objetivo:** que «Operaciones», «HSE» y «Cliente» sean personas designadas, no cualquier líder.
- **Hallazgos:** D-03/E-02/I-25/F-14 (tabla de capacidades por persona × proyecto, pantalla para que el líder las asigne y una función `has_capacity()` usada por gates, hold points, testigos, traspasos y PTC; compatible desde el inicio, replicando el rol actual), I-15 (una sola fuente de constantes de rol). De paso: E-30.
- **Archivos clave:** `20261012200000_gate_cosignatures.sql`, `20261017210000` (`hold_release_roles`), `src/lib/permissions.ts`, `src/lib/constants/`.
- **Listo cuando:** dos líderes del contratista **no pueden** completar un traspaso a Operaciones sin la persona designada; un operador con rol inspector y capacidad `operations` sí puede liberar su hold point.

#### S15 — Miembros, auditoría y cuotas · M
- **Hallazgos:** A-02/I-12 (miembros por RPC; nunca 0 owners), A-11/I-16 (audit log y notificaciones no falsificables), A-13/I-19 (rate limit en API v1, IA y push), I-21 (ciclo de vida de usuarios), D-16/I-27 (DEC a nombre de otro). De paso: A-21, A-22, A-25, A-30, C-43, E-37.
- **Archivos clave:** `src/app/actions/users.ts`, `InboxList.tsx`, `src/lib/api/auth.ts`, `api/v1/*`, `daily-report.ts`.

#### S16 — PSSR por RPC · M
- **Hallazgos:** A-04, C-12, C-32: aprobar solo desde `pending_approval` con todo en sí/NA, firmas propias y aprobador distinto de quien envió, con capacidades.
- **Archivos clave:** `src/app/actions/pssr.ts`, políticas de `pssr_reviews`/`pssr_signatures`.

#### S17 — Certificados por RPC · M · D6, D15
- **Hallazgos:** A-05, C-13, I-06, B-14, C-33: emitir y firmar por RPC con la elegibilidad en SQL, número atómico y firmantes distintos por capacidad; reabrir re-evalúa; el certificado se invalida si cambia la base.
- **Archivos clave:** `src/app/actions/certificates.ts`, `src/lib/certificates/eligibility.ts`, `CertificateCard.tsx`.

#### S18 — Offline por usuario · L (2 sesiones)
- **Hallazgos:** C-08/A-09/E-01/G-02/G-03 (`userId`/`orgId` en cada entrada; replay solo de lo propio; logout con «sincronizar o descartar» y purga de cachés; no cachear `/auth/v1/`), C-07 (una respuesta rechazada no bloquea la cola), C-35/B-16 (hora de captura acotada en lugar de comparar relojes), C-09 (preparar ITR para trabajar sin red; mostrar lo encolado al recargar). De paso: C-37, E-27, G-20, G-23.
- **Archivos clave:** `public/sw.js`, `UserMenu.tsx`, `src/lib/offline-queue.ts`, `src/lib/sync/replay.ts`, `startup-outbox.ts`, `outbox-utils.ts`, `useItrAutosave.ts`.
- **Listo cuando:** en una PWA instalada y con la red cortada, A captura, cierra sesión y entra B: nada de A se envía a nombre de B.

### Hito E — Escala y avisos

#### S19 — Generación masiva de ITR · M–L
- **Hallazgos:** C-14 (generar por alcance × fase desde la matriz aprobada, con vista previa, asignación por disciplina y RPC idempotente por lotes, usando la numeración de S05 y las firmas de S04), C-30 (filtros por sistema, subsistema, área y responsable).
- **Archivos clave:** `itr-matrix.ts`, `TagItrTab.tsx`, `src/lib/list/itr-types.ts`.

#### S20 — Readiness a escala · L (2 sesiones)
- **Hallazgos:** B-04 (motor set-based, `SECURITY DEFINER` con una sola verificación de pertenencia), D-07 (estado materializado `system_gate_status` con «sistema sucio» + recálculo), B-06 (políticas set-based), B-13 (`my_work_counts` cacheado), G-07 (`cache()` de membresía), B-23, B-17 (FK compuestas), B-21.
- **Archivos clave:** `functions-sql/compute_*`, `control-tower/page.tsx`, `(dashboard)/layout.tsx`, `src/lib/supabase/membership.ts`.
- **Listo cuando:** Control Tower de LOADTEST carga por debajo del presupuesto acordado (p. ej. p95 < 1,5 s) y la prueba de carga queda como banco reproducible.

#### S21 — Bus de eventos (outbox) · M
- **Hallazgos:** B-03/I-08/I-17/B-11: un trigger en lugar de tres, `dispatched_at` + cursor, catálogo versionado con nombres consistentes, `UNIQUE(subscription, event)`, HMAC con `event_id` y fecha, retry versionado en el repo, modo masivo para importaciones. De paso: B-30 (retención), F-26.
- **Archivos clave:** baseline (`emit_domain_event` y triggers), `supabase/functions/webhook-dispatcher/index.ts`, `src/lib/constants/webhook-events.ts`, `api/cron/push-dispatch/route.ts`, `.github/workflows/cron.yml`.

#### S22 — Avisos y colas · M–L · D16
- **Hallazgos:** D-04/H-02 (colas `gates_to_approve`, `gates_to_cosign`, `gates_regressed`, `registers_to_authorize/verify`, `daily_reports_to_issue`, `tq_answered`; una notificación desde cada RPC que crea una obligación para otra persona y desde las transiciones de S20), I-09 (push desde `notifications`), D-23 (colas por proyecto, no por org), resumen diario por correo. De paso: G-22, D-36, I-28.
- **Archivos clave:** `src/lib/my-work/queues.ts`, `functions-sql/my_work_counts.sql`, `src/app/actions/gates.ts`, `daily.ts`, `registers.ts`, `InboxList.tsx`.

#### S23 — Readiness v2 (pantallas) · M–L
- **Hallazgos:** D-01/D-18 (Control Tower con los números del motor; un solo «avance»), D-19 (filtros, orden, búsqueda y exportación), H-12 (dentro del proyecto), D-12 (seguimiento de «aprobado con condiciones»), D-25, D-26, D-22.
- **Archivos clave:** `control-tower/page.tsx`, `SystemGatesView.tsx`, `projects/[id]/kpis/page.tsx`, `daily/lookahead/page.tsx`.

### Hito F — Entregable y cierre

#### S24 — Paquete de handover v2 · M–L · D17
- **Decisiones de Luis (2026-10-21):** firma Ed25519 con clave pública publicada + página `/verify/<hash>`; ZIP generado en línea, un sistema por paquete, con topes; E-22 dentro de S24 → dos sesiones (S24a paquete y firma, S24b PDF nuevos).
- **Hallazgos:** E-05/F-22/E-22: gates con firmas, procedimientos, ejecuciones, line-ups, hitos, traspaso, competencias, repuestos, PTC, documentos y vendors, con hashes, PDFs adjuntos y respaldo imprimible. De paso: E-31 (firma verificable por la operadora).
- **Archivos clave:** `generate_handover_package`, `src/app/actions/ops-readiness.ts`, `src/lib/handover/types.ts`, `src/lib/pdf/procedure.ts`, `performance-report.ts`.

#### S25 — Correcciones de F6–F7 · M
- **Decisiones de Luis (2026-10-21):** dos sesiones (S25a auditoría y gobernanza; S25b UX de campo); E-13 ítems no dispensables configurables por org (por defecto Cat A y gate de arranque); E-19 las exclusiones que cambian el resultado las reconoce el representante del cliente; E-16 tope de 7 días hacia atrás sin motivo.
- **Hallazgos:** E-09, E-10, E-11, E-12, E-13 (justificaciones de relleno en el traspaso), E-16, E-17, E-19 (exclusiones sin reconocimiento), E-21, E-23 (valor fuera de rango en un paso). De paso: E-29, E-32, E-34, E-36.
- **Archivos clave:** `20261018090000_startup_offline.sql`, `RunView.tsx`, `LineupView.tsx`, `TransferView.tsx`.

### Navegación (D18)

#### N0 — Arreglos rápidos · M · en paralelo desde que termine S01, en su propio worktree
Hallazgos: H-01, H-04, H-05/G-04, H-07, H-11, H-06, H-13, H-14, H-16. De paso: G-21, H-19, H-22, H-23, H-24.

| # | Cambio | Archivos | Listo cuando |
|---|---|---|---|
| 1 | Inicio por rol en la raíz, la PWA, set-password y el cambio de organización | `src/app/page.tsx`, `public/manifest.json` (`start_url`, `shortcuts`), `src/app/auth/set-password/page.tsx`, `UserMenu.tsx` | el inspector abre la app y cae en Mi trabajo |
| 2 | Borrar el prototipo `/admin` | `src/app/admin/page.tsx`, `src/app/robots.ts` | `/admin` da el 404 propio |
| 3 | Páginas propias de error, 404 y carga | `(dashboard)/not-found.tsx`, `error.tsx`, `loading.tsx`, `projects/[id]/loading.tsx` | un ID inválido muestra el menú y «Ir a Mi trabajo» |
| 4 | «Importar» solo para quien puede | `sidebar.tsx` | el leader no lo ve |
| 5 | «Sistemas» y «Desempeño (PTC)» en el menú del proyecto | `sidebar.tsx`, `es/en.json` | visibles |
| 6 | Control Tower abre el proyecto actual | `sidebar.tsx`, `control-tower/page.tsx` | estando en B, abre B |
| 7 | Migas completas, en español y con `Link` | `Breadcrumbs.tsx` | ninguna miga en inglés en la UI en español |
| 8 | Denegaciones con mensaje | `redirect('/home?denied=…')` + aviso | el leader ve qué rol le falta |
| 9 | Badges muertos | `layout.tsx`, `sidebar.tsx` | ninguna consulta sin uso en el layout |
| 10 | Glosario aplicado a etiquetas y títulos | `es.json`, `en.json`, h1 de las páginas | menú = h1 |
| 11 | «Ver todos» de Mi trabajo filtrado a lo mío | `my-work/page.tsx`, listas globales | abre solo lo mío |
| 12 | Dashboard con todas las fases (si no quedó en S09) | `KpiSummaryWidget.tsx` | se ven todas las fases |

#### N1 — Mi trabajo y menú por fase y rol · L · después de S14 y S22
- **Maquetas revisadas con Luis (2026-10-21)** — lienzo «Maquetas N1» (https://claude.ai/artifact/VXTpUEgosRNYYASQVqz8Vf). Decisiones:
  - Mi trabajo: columnas Ejecutar · Verificar · Firmar · Decidir en «Todo» (pestaña por grupo = lista con acción por fila); colas en 0 visibles en gris (no se ocultan ni se despliegan); «ITR por firmar» pasa de Verificar a Firmar; el filtro de proyecto NO se recuerda (siempre «Todos»; oculto si la org tiene un solo proyecto). «Recientes» tipo SAP (últimos objetos abiertos) va en N3 con ⌘K.
  - Menú: la vista de planificación es la del rol **arquitecto**; owner/admin = gerencia (todas las fases, plegadas) + Administración; fase abierta por defecto = la de más actividad del proyecto; «Más…» recuerda si quedó abierto; la Bandeja sale del menú (queda en la campana) y Preferencias de notificación pasa al menú de usuario; el cliente ve Punch list como resumen por categoría (A/B/C) y elige una para ver el detalle.
- **Construido (2026-10-21):** `buildMenu(role, projectId)` decide qué se ve (permiso = `denyAccess` de la página, audiencia del rol; lo demás en «Más…»); owner/admin ven el proyecto por fases plegables (Preparación · MC · Comisionamiento · Arranque · Gestión) con la de más actividad abierta (`src/app/actions/navigation.ts`, 14 días, caché por sesión); el arquitecto empieza por Planificación. Mi trabajo = `MyWorkBoard` (columnas, 3 filas por cola, pestaña = lista completa, «Sin pendientes: …»); las colas del rol se ven en 0 (`queueApplies`), las ajenas solo con algo; la categoría de punch por revisar pasó a Decidir (maqueta). Con `?project=` las consultas van solo a ese proyecto y los contadores salen de las filas («20+»). El cliente entra al punch list del proyecto por el resumen A/B/C (`ClientPunchSummary`).
- **N1b construido (2026-10-21, migración `20261124120000_punch_page_links_n1b`):**
  - Ficha del tag con `?tab=overview|itrs|punches|photos|docs|preservation` (alias `punch`, `documents`; `parseTagTab` en `tag-detail-shared.ts`); cambiar de pestaña reescribe la URL sin recargar; anterior/siguiente conservan la pestaña. Preservación vencida (Mi trabajo, lista global, fin de ejecución) abre `?tab=preservation`; volver del ITR abre `?tab=itrs`.
  - Página `/projects/[id]/punches/[punchId]` (`PunchDetail.tsx`): encabezado, tag, ITR e ítem de origen, sistema › subsistema, qué hacer ahora (resolver/verificar, en curso, cancelar, reasignar), clasificación, fotos e **historia** (`src/lib/punches/timeline.ts`: alta + `punch_comments`, cuyos prefijos dejan las RPC; reasignaciones de `activity_log` solo para owner/admin por RLS). Reemplaza los dos modales duplicados (lista del proyecto y ficha del tag). Enlazan aquí: Mi trabajo, lista global, vendors (hallazgo FAT/SAT), PSSR, fotos de punch del tag, avisos `punch_assigned` y `punch_cat_a` (SQL `notify_obligation_trg`); la migración corrige los 21 avisos ya enviados.
  - C-29: el pie fijo del ITR sube por encima de la barra inferior móvil (antes la tapaba), botones de 44 px, «↓ N pendientes» salta al siguiente obligatorio sin llenar (`nextPendingItemId`), PDF/Revocar en «⋯» bajo 640 px; ítems con ⚑/Sí/No/casilla de 44 px, `inputMode="decimal"` y 16 px (sin zoom en iOS), medición con `step="any"`; listas de ITR y punch con desplazamiento horizontal y relleno adaptable.
  - No hecho: modo de alto contraste para exteriores (C-29), H-18, D-38, H-20 salvo los `<a>` de los archivos tocados. Sin verificar en pantalla (sin sesión en el navegador integrado).
Mi trabajo agrupado (Ejecutar · Verificar · Firmar · Decidir) con las colas de S22; menú por fase y rol con `audience` y un test de paridad menú ↔ página (meta: inspector ≤ 9 entradas, leader ≤ 17, client ≤ 10); selector de proyecto arriba; tag con `?tab=`; página propia del punch. Hallazgos: H-03, H-09, C-29 (ejecución en teléfono). De paso: H-18, H-20, D-38. **Primero se revisan las maquetas contigo.**

#### N2 — Readiness y fusiones · L · después de N1 y S23
- **Decisiones de Luis (2026-10-21):** maquetas aprobadas tal cual (respuestas = lo propuesto en cada nota): una fila por gate en el Resumen con avance ponderado; Twin pasa a modo de Tags; `/control-tower` = portafolio que abre el proyecto; filtros sin «Cargar»; menú «Readiness»; ficha de sistema con las 7 pestañas, Gates por defecto, `/control-tower/[id]` redirige; Explorer/Twin = modos Árbol/Tarjetas con Lista por defecto; **Documentos opción A** (P&ID = documento tipo `pid`, con migración); Señales y lazos como hub; Look-ahead pasa a Planificación; listas con alcance «Este proyecto / Todos los proyectos»; certificados en «Todos» = lista simple. Orden: N2a → N2b → N2c → N2d.
- **N2a construido (2026-10-21):** `/projects/[id]/readiness` (la matriz de S23 movida, sin selector de proyecto; `ReadinessFilters` con `useUrlFilters`, chips de siguiente gate y «Solo con bloqueo»; Excel en `…/readiness/export`); `/control-tower` = Readiness por proyecto (una fila por proyecto: readiness, avance, estados del siguiente gate); redirecciones de `?projectId=`, `/export` y `/[systemId]` (conserva `?gate=`). Ficha única `/projects/[id]/systems/[systemId]` (`SystemFileShell` + pestañas por URL; `SystemGatesView` solo gates con `?gate=` enfocado; `GatePlanPanel` en «Avance y plan» con la gestión diaria; `SystemDetailView` = «Dependencias» y «Datos del sistema»; Arranque, Traspaso y Vendors en `SystemFileTabs.tsx`); se cargan solo los datos de la pestaña abierta y las 7 lecturas sin tope salieron del baseline. Menú: «Readiness» (proyecto) y «Readiness por proyecto» (portafolio, gerencia). Mi trabajo, look-ahead, vendors, acciones de gate y Sistemas enlazan a la ficha nueva. Sin verificar en pantalla (sin sesión en el navegador integrado).
- **N2b construido (2026-10-22):** el Resumen del proyecto (`projects/[id]/page.tsx`) es el tablero por fases: los dos números canónicos y «Hoy» (sistemas que no avanzan, por firmar, en regresión); una fila por gate (`buildPhaseBoard` en `src/lib/readiness/phase-board.ts`: sistemas aprobados, por aprobar/firmar/en regresión, ITR de la fase, criterio que más bloquea, compromiso más próximo con forecast) que abre `readiness?gate=`; fila de custodia; «Lo que bloquea hoy» (`blockedToday`) y «Próximos 7 días» (`upcomingWindow`: compromisos/forecast de gates, acciones, restricciones, actividades de vendor); franja de completamiento e ingeniería (sin banner del Twin). Todo en i18n (`ProjectOverview`), grillas `auto-fit` y `Link` (H-20 en esa página). `loadMatrix` trae también forecast. D-38: widget «Readiness por proyecto» en el dashboard (owner/admin primero; arquitecto, líder y cliente también) y columnas N4 / compromisos ≤ 7 días en `/control-tower`, ambos desde `loadPortfolioReadiness` (`src/lib/readiness/portfolio-server.ts`). Sin verificar en pantalla.
- **N2c construido (2026-10-22, eb4992a + siguiente):** «Tags y equipos» = `/tags?view=list|tree|cards` (Árbol = Explorador, Tarjetas = Twin filtrado en el servidor por sistema/subsistema; se conservan búsqueda, sistema y subsistema al cambiar de modo; `/explorer` y `/twin` redirigen). Hubs con pestañas por ruta (`HubTabs`, h1 = menú, subpáginas h2; ítem de menú con `also`): «Señales y lazos» (Señales · Lazos · Matrices C&E · Importar señales) y «Planificación» (look-ahead movido a `/planning/lookahead` + planes de trabajo; `/daily/lookahead` redirige y Gestión diaria conserva el enlace). Listas con alcance (`ScopeToggle`, `src/lib/list/scope.ts`): ITR, punch, certificados, planes de trabajo y preservación del proyecto con «Este proyecto / Todos los proyectos»; «Todos» = `?scope=all` en la ruta del proyecto (los componentes globales de siempre); `/itrs`, `/punch-list`, `/certificates`, `/work-plans`, `/preservation` redirigen (con `?project=` o al último proyecto del menú) y salieron de «Más…»; el badge de preservación pasó al ítem del proyecto. Paridad de acciones: CSV de ITR en el proyecto (`src/lib/list/itr-csv.ts`, compartido) y cambio de estado masivo de punch en el proyecto. **No hecho:** asignar masivo y «agregar a un plan» en «Todos» (son por proyecto), y la unificación de componentes (G-14: siguen ItrListGlobal/ItrListView, PunchListGlobal/PunchListView, WorkPlansGlobal/WorkPlansView). Sin verificar en pantalla.
- **N2d construido (2026-10-22, migración `20261125120000_pid_as_document_n2d`, aplicada en prod):** un P&ID es un documento del registro (`doc_type = 'pid'`, número normalizado como `tags.pid_drawing`); `pid_documents` eliminada (estaba vacía: 0 planos, 0 pines; la migración aborta si hubiera datos) y el bucket `pid-documents` sin políticas. Pines por revisión (`pid_hotspots.revision_id`, `needs_review`; guard de proyecto y tipo); trigger `pid_carry_hotspots` copia los pines a la revisión nueva vigente marcados «por revisar» (solo hacia adelante). Visor en `/documents/[id]/viewer?rev=` con selector de revisiones, aviso de revisión superada, borde punteado en los pines por revisar, «Confirmar posición» y «Confirmar todos». Documentos: botón «P&ID (con visor)», enlace al visor y conteo de pines por P&ID, planos citados por tags sin documento (crear con un clic); ficha del documento con «Abrir visor» y pines por revisión. Tag, lista de tags y Resumen resuelven el plano por el documento (`loadPidDrawings`). `/pid-documents` redirige; salió del menú. Probada en transacción revertida antes de aplicar (pin → revisión nueva → copia por revisar; guard rechaza documentos no P&ID). Sin verificar en pantalla.
- **Maquetas (2026-10-21):** lienzo «Maquetas N2» (https://claude.ai/artifact/NRdbPYQdgTWoq14JeHBZDh) con 6 pantallas y las preguntas en notas: Resumen por fases, Readiness en el proyecto, ficha de sistema única, Tags y equipos (Lista · Árbol · Tarjetas), Documentos con visor P&ID (opción A vincular con migración / B solo navegación), Señales y lazos · Planificación · listas con alcance. Inventario: Señales/Lazos/C&E son 3 páginas sueltas; P&ID y Documentos sin vínculo (resubir deja el PDF viejo huérfano); el look-ahead ya es pestaña de Gestión diaria; `/certificates`, `/work-plans` y `/preservation` globales no leen `?project=`.
Readiness dentro del proyecto con ficha de sistema única; Resumen del proyecto por fases; fusiones (Explorador + Twin, Señales y lazos, Planificación); listas globales como alcance; Documentos con el visor P&ID. Hallazgos: H-10, H-15/F-13, G-14.

#### N3 — Buscar sin navegar · M
- **Maquetas (2026-10-22):** lienzo «Maquetas N3» (https://claude.ai/artifact/1sVqQk986idYHtf9QhwgVB): paleta ⌘K con alcance «Este proyecto / Todos», resultados por tipo y recientes del dispositivo; ＋ Crear con el contexto (proyecto, sistema, tag) y alta de punch con el tag precargado; ＋ en la barra del teléfono; /ayuda con índice por rol y buscador desde el manual actualizado. Preguntas en las notas del lienzo.
⌘K con la RPC `search_everything(q, project)` sobre RLS; ＋Crear con el contexto precargado; guía en la app regenerada desde el manual. Hallazgos: H-17. De paso: H-21.

### Calidad transversal (Q) — de paso en cada sesión, con sesiones propias si se acumula
G-06 (i18n de 52 componentes y de los errores del servidor), G-08/E-34 (`ConfirmDialog` en lugar de 56 `window.confirm`, primero en firmas y emisiones), G-09 a G-12 (design system, modo oscuro, contraste y accesibilidad), G-15, G-17 (Playwright en CI para los recorridos de campo), G-18, G-19, C-18, C-19, B-15.

### Trimestre (T)
A-16/I-07 (membresía por proyecto), I-18 (API v1), I-20/E-25 (SSO, MFA y reautenticación al firmar), I-23 (P6), F-17 (EDMS), F-21 (red-line de campo), I-26 (observabilidad), readiness por proyecto (D-34, si D14 lo pide).

---

## 7. Calendario

Unas **35 sesiones** (S01–S25, con S14, S18, S20 y S22 dobles, más N0–N3). A una por día hábil son **7–8 semanas**, con N0 en paralelo.

| Hito | Sesiones | Qué cambia para el usuario |
|---|---|---|
| A — Seguro para seguir | S1-v1, S01–S03 (+N0) | Nada se despliega roto; huecos de seguridad cerrados; la app abre en Mi trabajo |
| B — Campo funciona | S04–S08 | Se firman todos los ITR; el inspector levanta punch; reimportar no borra; la preservación es real |
| C — Números verdaderos | S09–S13 | KPIs, certificados y reporte diario con cifras reales y en hora local |
| D — Firmas que prueban algo | S14–S18 | Operaciones, HSE y Cliente son personas designadas; PSSR y certificados blindados; tablet compartida segura |
| E — Escala y avisos | S19–S23 | ITR masivos, Control Tower rápido, cada persona recibe sus tareas |
| F — Entregable | S24–S25, N1–N3 | Handover completo; navegación por fase y rol |

## 8. Riesgos

- **Migraciones de comportamiento** (S04, S06, S16, S17) cambian reglas sobre datos vivos de Geopark. Cada una lista antes qué registros afecta y se aplica fuera de horario.
- **Índices `CONCURRENTLY`** (S09) no van dentro de la transacción habitual: procedimiento aparte, autorización aparte.
- **S14 es la decisión más grande.** Si D14 se pospone, se pospone el Hito D completo: S16 y S17 no deben hacerse con reglas de rol que luego cambiarían.
- **Base de pruebas (D2):** sin ella, cada test de permisos escribe en producción.
- **Pendientes tuyos que no bloquean:** invitar `+smtp2` como Cliente y firmar PTC-0001; probar la subida de PDF en Documentos.

## 9. Por qué este plan reemplaza a la v1

La v1 cubría unos 60 de los 293 hallazgos y dejaba fuera 4 del top 20 (capacidades de firma, Control Tower a escala, generación masiva de ITR, handover). Además tocaba módulos dos veces (punch, colas antes que firmas), dejaba las fundaciones para el final (SQL canónico, índices, capacidades), no cortaba el segundo camino de deploy (Workers Builds), suponía que los tests de BD no corrían en CI (corren, y contra producción) y daba por resueltas decisiones que son tuyas. Este plan corrige todo eso: la cobertura se generó desde los anexos y cada hallazgo tiene su sesión.
