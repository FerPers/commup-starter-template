# Plan de salida a producción de CommUp

**Fecha:** 24 de octubre de 2026 · **Base:** commit `14ac137` (backlog anterior cerrado) · **Estado:** propuesta para que Luis decida el orden y las decisiones marcadas. §6 incorpora la revisión y los bocetos de Grok.

Este documento traza el [plan integral del 23-oct](PLAN-INTEGRAL-COMMUP-2026-10-23.md) sobre el código real. Cada una de sus 53 acciones se contrastó con el repositorio actual, en lectura y sin tocar la BD. El resultado indica qué ya existe, qué falta y en qué orden conviene hacerlo para la primera salida a producción: los proyectos menores de Geopark. Las fuentes son la [revisión crítica](REVISION-CRITICA-COMMUP-2026-10-23.md) y el [diagnóstico del núcleo ITR](DIAGNOSTICO-CORE-ITR-2026-10-23.md).

## 1 Resultado del cruce

| Estado verificado | Acciones | Cuántas |
|---|---|---|
| Hecho | A16 (un solo camino de deploy, D1 del 2026-10-19), A21 (menú por rol y barra del teléfono, N1), A24 (marca navy/naranja en tokens) | 3 |
| Parcial | A01, A13, A17, A18, A22, A23, A26, A29, A39, A43, A44, A45, A46, A47, A48, A49, A50, A51, A53; A37 tiene el motor hecho y le falta el contenido | 20 |
| Pendiente | A02–A07, A09–A12, A14, A15, A20, A25, A27, A28, A30, A32–A36, A38, A40–A42, A52 | 27 |
| Decisión de producto antes del código | A08 (contrato de estados), A19 (fases frente a módulos), A31 (cuota de IA: aviso o límite) | 3 |

**Qué cambió desde el 23-oct:** A01 quedó resuelto en su núcleo (`f36a053`); el 12 px y el contraste de G-11 (`818d48f`) cubren parte de A26. Los defectos de A02 a A12 siguen en el código **exactamente en las líneas que cita la revisión**: no se corrigieron por otro camino.

**Lo que el plan repite de trabajo ya hecho:** A21 describe el menú N1 y la barra Mi trabajo · Escanear · Crear · Menú tal como existen. A24 pide conservar la paleta que ya está en tokens. A46 y A47 proponen «bloqueadores del día», «próximos 7 días» y la matriz sistema × fase, que existen desde N2a/N2b. Su brecha real es otra: estados que faltan, responsable por bloqueo y fecha de actualización. A29 no sabía de las pruebas de paridad que ya hay para tablas, política de liberaciones y catálogos.

**Corrección de una nota vieja:** `CLAUDE.md` decía que Cloudflare Workers Builds seguía desplegando aparte. El plan de ejecución del 19-oct registra que Luis lo desconectó (D1); la nota quedó corregida. Falta confirmar la protección de rama de `main` (D3), que no se ve desde el repositorio.

## 2 Criterio de salida a producción

CommUp sale a producción con Geopark cuando las **olas 0, 1 y 2** están cerradas con su evidencia. La ola 3 puede solaparse y no bloquea la salida. La ola 4 es el piloto mismo y la ola 5 viene después del piloto o cuando entre un cliente que lo exija.

En términos concretos, salir significa cuatro cosas:

1. Ninguna captura de campo se pierde ni se duplica.
2. Ningún ITR, plantilla o paquete queda a medias.
3. El catálogo del primer lote está homologado y conserva sus requisitos.
4. Los datos reales tienen respaldo restaurable.

## 3 Olas

### Ola 0 — Preparación (corta)

| Acción | Qué hacer | Por qué primero |
|---|---|---|
| A13 inicial | Pasar las pruebas de BD de la CI (`tests/db`, 420 pruebas que hoy se saltan) a la **Supabase local** que ya usa el E2E, con dos organizaciones y los seis roles. Las pruebas que dependen de actores deben fallar si faltan, no saltarse. | Todas las correcciones de la ola 1 necesitan pruebas que distingan antes y después. Ya existe la infraestructura local (G-17); hoy esas pruebas o escriben en prod o no corren. |
| A50 | Unificar `supabase/seed/e2e.sql` + `review.sql` + las semillas de `scripts/demo-data/` en un **proyecto de demostración restablecible** con casos sanos, bloqueados, regresados, sin información y con capturas pendientes. | Sirve a A13, A45, A46 y a la validación de punta a punta. |
| A16 | Confirmar en GitHub la protección de rama de `main` (D3). | Ya no hay segundo camino de deploy; solo falta este control. |
| Seguridad | Cambiar la contraseña de la cuenta de prod que se compartió con Grok el 24-oct (era débil y quedó en otro chat) y borrar el proyecto «Proyecto Demo LNG» que creó. En adelante, las revisiones externas entran solo a la demo aislada (A50) con una cuenta temporal. | Hubo un acceso externo a producción con una cuenta real. |
| A45 preparación | Convertir en pruebas las sondas del diagnóstico (`docs/diagnostico-itr-2026-10-23-evidencia/sondas.json`): I30C «No» + conforme, I10A 12/99/0, resultado opcional, continuidad de un conductor. | Antes de corregir el núcleo ITR hay que poder reproducirlo. |

**Salida:** las pruebas de BD corren en la CI sin escribir en prod y sin saltos; hay una demo restablecible; las sondas del ITR fallan como se espera.

**Avance (24-oct):**

- **A13 inicial:** hecho. `tests/db` corre en el job `db` contra la Supabase local (`npm run test:db`), con dos orgs y seis roles (`supabase/seed/00_actors.sql`). Una suite sin actores falla, y una que escribe rechaza una URL que no sea local (`tests/db/env.ts`). La deriva de funciones sigue comparando con prod, en solo lectura (job `drift`).
- **A50:** hecha la base. `npm run demo:reset` y [guion](DEMO-LOCAL.md) con casos sano, listo, pendiente de firmas, regresado, bloqueado y sin información. Las capturas pendientes no se pueden sembrar en SQL. Los módulos de `scripts/demo-data/` atados a la org DEMO de prod quedan por traer.
- **A45 preparación:** hecho. Cuatro sondas en TS y tres en SQL corren con `it.fails`, y SQL = TS.
- **A16:** `main` tiene un ruleset (sin borrado ni force push). Desde el 24-oct exige TypeScript, ESLint, Vitest, Pruebas de BD (Supabase local), E2E (Playwright) y Deriva de funciones. El rol administrador del repositorio sigue con bypass, así que un push directo del dueño no espera los checks; el deploy sí los espera (`needs`).
- **Seguridad:** cerrada por Luis el 24-oct. La contraseña que se compartió con Grok era temporal.

### Ola 1 — Integridad del núcleo (bloquea la salida)

| Acción | Qué hacer (verificado en código) |
|---|---|
| A02 | Fotos del ITR con ruta fija por captura e idempotencia, igual que las fotos de punch (`punchPhotoPath`, `outbox.ts:116-126`). Además: `captured_at` = hora del dispositivo y `uploaded_at` aparte, una restricción única por captura, y un fallo de `refresh_itr_status` que no haga reintentar una evidencia ya guardada. |
| A03 | Una RPC transaccional que cree el ITR con sus asignaciones y una clave idempotente. Hoy son dos inserts (`itr-instances.ts:87-112`) y si falla el segundo el ITR queda creado. |
| A04 | Quitar el evento manual de `api/v1/{tags,itrs,punches}`; el trigger ya lo emite. |
| A05 | Esquemas Zod en las rutas de la API v1 (Zod ya está instalado y la API no lo usa) con respuestas 400/422. |
| A10 guard | Un paquete con anexos omitidos no queda `ISSUED`: se marca como parcial y se ve así en la pantalla y en el manifiesto (`generate.ts:128`). |
| A09 parte | `logActivity` debe revisar el `{ error }` de Supabase (`log-activity.ts:15-27`). |
| A01 resto | Exportar las capturas retenidas en «No sincronizado». |
| A40 | Importación de plantillas por la RPC transaccional que ya existe (`clone_itr_template_from_catalog`), extendida para copiar las filas de la matriz. Hoy la pantalla clona sin `required_signatures` ni `requires_test_equipment`, activa un código nuevo antes de tener ítems e ignora errores. Además, la comparación «al día» debe incluir firmas y equipo. |
| A39 código | Congelar `requires_test_equipment` en el ITR al crearlo, como ya se hace con las firmas requeridas. |
| A36 código | Rol de columna «decide la aceptación» en tablas (TS y SQL con paridad); el preset `ce_test` debe tratar «Ejecutó la acción» como resultado; un resultado automático sin desviación calculable se reporta. |
| A44 parte | Guardar el bloque «Datos del tag» en la instancia al firmar; hoy se lee en vivo. |
| A29 | Paridad TS = SQL para lo que falta: `completion.ts` contra `evaluate_itr_capture` y `eligibility.ts` contra `certificate_eligibility`. |
| A30 | Retirar o aislar el código analítico sin consumidores (`src/analytics/*`, `getProjectForecast`, la vista con eventos `itrs.*` viejos). |

**Avance (24-oct):**

- **A02:** hecho (migración `20261217120000`). Cada foto o PDF del ITR lleva un `capture_id` que genera el dispositivo al tomarla, con una ruta fija (`itrEvidencePath`) y un índice único: diez reenvíos dan un objeto y un adjunto (`tests/db/itr-evidence-identity.test.ts`). `captured_at` es la hora del dispositivo, acotada como en las respuestas (`capture_clamped`), y `uploaded_at` es la hora de recepción. `saveItrAttachment` devuelve el adjunto ya guardado aunque el ITR se haya firmado después. Si falla `refresh_itr_status`, informa `progressStale` en vez de error. Las fotos encoladas antes de A02 reciben su id al primer reenvío y lo guardan. Revisión de prod en solo lectura (`scripts/db/itr-evidence-audit.sql`): 0 adjuntos y 1 objeto huérfano, que no se tocó.
- **A03:** hecho (migración `20261218120000`). El alta de ITR pasa por la RPC `create_itr` (SECURITY INVOKER): ITR, firmantes y eventos en una transacción. Cada firmante debe ser miembro activo y no vencido, y el cliente no puede ser ejecutor; si falta una firma requerida, no se crea nada. El `id` lo genera el formulario y es la clave idempotente: un doble clic o un reintento devuelve el mismo ITR sin Rn nueva, también con solicitudes simultáneas. Los lotes de lazos y C&E derivan el id de la solicitud, la plantilla y la fuente (`batchItrId`). Pruebas en `tests/db/itr-create-atomic.test.ts` y doble clic verificado en pantalla. La API v1 crea ITR sin firmantes (un solo insert); su evento duplicado queda para A04.
- **A04:** hecho (migración `20261219120000`, cuerpo canónico `emit_domain_event`). La API v1 ya no inserta eventos: `tag.created`, `itr.created` y `punch.created` salen una sola vez del trigger. La API declara su origen con las cabeceras `x-commup-source` y `x-commup-key-id` (`createAdminClient({ apiKeyId })`), y el evento lo lleva en `payload.context`; solo el service role puede declararlo. `punch.transferred_to_ops`, `punch.ops_updated` y `punch.ops_closed` los emite el trigger al cambiar `post_handover_status`, venga de la app o de la API (antes la app no los emitía). Pruebas en `tests/db/domain-events-producer.test.ts`. Las pruebas de BD reciben la llave de servicio de la Supabase local (`TEST_SUPABASE_SERVICE_ROLE_KEY`).
- **A05:** hecho (sin migración). Toda entrada de la API v1 pasa por esquemas Zod (`src/lib/api/schemas.ts`) y por `readJson` / `readQuery` / `readId` (`src/lib/api/validate.ts`). Respuestas: `400` para JSON ilegible o para un parámetro de consulta o de ruta inválido (los ids son UUID), `413` para un cuerpo de más de 256 KB (2 MB en muestras) o una colección sobre su tope, y `422` para una forma equivocada, con `issues: [{path, message}]`. Las muestras de señales siguen con rechazo parcial en SQL (207). La prueba de fuzz `src/app/api/v1/input-validation.test.ts` cubre 7 rutas de escritura con 14 cuerpos hostiles, 8 de lectura y los ids de ruta: siempre 400/413/422 y nunca llega a la BD. Comprobado también con `curl` contra la app local. OpenAPI documenta el contrato.
- **A10 guard:** hecho (migración `20261220120000`). Un paquete con anexos omitidos (tope de PDF de ITR, tope de bytes o un anexo que falla) queda `PARTIAL`, no `ISSUED`, con `omitted_count` en la fila. El manifiesto firmado lleva `complete`, el índice PDF y el LEEME lo dicen en la portada, y el evento es `handover.partial` en vez de `handover.issued`. `/verify` muestra «Paquete PARCIAL» y la lista de lo omitido; el historial de `/admin/handover`, la API y la ficha del traspaso también lo muestran. La reversión de un traspaso reemplaza también un parcial. Pruebas en `src/lib/handover/generate.test.ts` y `tests/db/handover-partial.test.ts`, y verificado en pantalla. Queda para A10 completo (ola 3/P4): anexos obligatorios por alcance y volúmenes enlazados.
- **A09 parte:** hecho (sin migración). `logActivity` revisa el `{ error }` de Supabase y también una excepción. Si falla, reintenta una vez con la cuenta de servicio, con la misma fila y el mismo autor de la sesión. Si el reintento también falla, deja el registro completo en el log del Worker (`[activity_log] LOST`) y devuelve `{ ok: false }`; nunca lanza, porque el cambio ya ocurrió. Las dos escrituras directas en `activity_log` que tampoco revisaban el error (borrar un ITR, importar una plantilla) pasan por el helper. Prueba en `src/lib/log-activity.test.ts`. El resto de A09 (historial unificado, retención por contrato, decisiones críticas auditadas dentro de su RPC) sigue en la ola 3.
- **A01 resto:** hecho (sin migración). Las capturas que no se pueden enviar se exportan en un ZIP antes de descartarlas, también sin red: `capturas.json` (formato `commup-captures/1`, con ITR, ítem, valores, autor, hora de campo y último error), las fotos, las fotos de punch y las firmas como archivos, y un LEEME. El botón «⤓ Exportar» está en la caja «No sincronizado» del ITR, en el aviso de capturas retenidas (sin autor o de otra persona) y en el diálogo de cerrar sesión, antes de «Descartar y salir». Armado puro en `src/lib/sync/export-captures.ts` con su prueba; verificado en el navegador local con una foto rechazada simulada (ZIP con la foto intacta).
- **A40:** hecho (migración `20261221120000`). La importación de plantillas entre orgs pasa por `clone_itr_template_from_catalog`, extendida, en una sola transacción. Copia firmas requeridas, equipo de prueba, ítems, condiciones y, para un código nuevo, las filas de la matriz equipo × ITR. La plantilla nace inactiva y un código nuevo se activa al final; la auditoría va en la misma transacción. Un código existente solo recibe revisión inactiva si se pide, y si su última revisión cambió desde la comparación, falla con `CU409` en vez de duplicar. «Al día» compara también firmas y equipo (`templateContentHash` con cabecera). La importación masiva desde Excel (`bulkImportCatalog`) ya no activa una plantilla antes de tener ítems y la borra si un paso falla. Pruebas en `tests/db/template-import.test.ts` y `src/lib/itr/clone.test.ts`, y verificado en pantalla: importar, «al día», «actualizable» al cambiar solo el equipo de prueba y revisión v2 inactiva.
- **A39 código:** hecho (migración `20261222120000`). Al crearse, el ITR congela `requires_test_equipment` desde su plantilla (`guard_itr_row`, igual que las firmas requeridas); lo que mande el cliente se ignora y no lo puede cambiar. La firma (`itr_test_equipment_blocker`) lee el valor del ITR, así que cambiar la plantilla —como los 27 códigos de A39 contenido— ya no cambia la regla de ITR creados. Relleno: los 14 ITR de prod toman el valor actual de su plantilla (4 lo exigen). La ficha del ITR muestra el valor congelado. Prueba en `tests/db/itr-test-equipment-frozen.test.ts`. La matriz de autorización detectó y frenó que el bloqueo volviera a ser ejecutable por miembros. Sigue pendiente A39 contenido: la decisión de Luis o metrología sobre los 27 códigos.
- **A36 código:** hecho (migración `20261223120000`; `itr_table_config_valid` y `evaluate_itr_table` pasan a ser canónicas). Las tablas ya distinguen qué columnas deciden la aceptación. Una selección puede asignar a sus opciones `pass` / `fail` / `not_applicable` (`outcomes`, como `option_outcomes` en los ítems); el texto nunca decide. Una columna de resultado puede marcarse `decides`: es siempre obligatoria y hay una por tabla. Un resultado automático sin desviación calculable deja la tabla incompleta con el aviso `auto_result`. El preset `ce_test` trae «Ejecutó la acción» Sí → conforme, No → rechazo, N/A → con justificación, y «Resultado» decide. El editor de plantillas permite configurarlo. 17 casos dan lo mismo en TS y en SQL (`src/lib/itr/table-acceptance.cases.ts`). Las sondas H1 y H3 siguen en `it.fails` porque usan las plantillas reales I30C y E10B, que deben adoptar estas reglas al homologarse (A41); el motor ya las rechaza con la configuración corregida.
- **A44 parte:** hecho (migración `20261224120000`). La primera firma congela en el ITR los datos del tag con los que se probó (`itrs.tag_snapshot` y su fecha, escritos por `sign_itr_atomic` en la misma transacción); nadie más los escribe y una reapertura los renueva en la siguiente primera firma. La ficha del ITR los muestra «como estaban al firmar» y marca lo que el tag cambió después («Hoy en el tag: …»); el PDF imprime los datos firmados. Los 2 ITR que ya estaban firmados en prod quedan sin foto, porque no se sabe con qué datos se firmaron, y siguen en vivo. Pruebas en `tests/db/itr-tag-snapshot.test.ts` y `src/lib/itr/tag-snapshot.test.ts`; la ficha se verificó en pantalla. El resto de A44 (dato observado frente a dato de ingeniería, referencias nativas) va con A37 y A38.
- **A29:** hecho (sin migración). Hay paridad sobre datos reales en la BD local. `evaluateItrCompletion` = `evaluate_itr_capture` en 14 escenarios (`tests/db/itr-completion-parity.test.ts`): texto, número, casilla, sí/no, selección con resultados, medición crítica con límites, fecha, condiciones encadenadas y condiciones inválidas. `evaluateEligibility` = `certificate_eligibility` en 6 subsistemas (`tests/db/certificate-eligibility-parity.test.ts`), con ITR aprobados por el recorrido real de firmas. No apareció ninguna diferencia. Para que la comparación incluyera el rechazo crítico, la app ahora lo calcula en un solo lugar: `hasCriticalFail` y `measurementPassed` en `completion.ts`, que usan `localItrStatus` y `upsertResponse` en vez de tres copias.
- **A30:** hecho (migración `20261225120000`). Se retiran `src/analytics/*` (tres módulos que no importaba nadie), `getProjectForecast`, la función `analytics_project_forecast` (sin consumidores y con una agregación equivocada) y la vista `analytics_subsystem_velocity`. Al revisar las vistas apareció un defecto vivo: `analytics_bottlenecks`, que alimenta «Cuellos de botella» en Calidad de datos, filtraba los eventos viejos `itrs.updated`, así que todo subsistema con ITR pendientes salía «sin avance en 14 días» y los rechazos recientes daban siempre 0. Ahora lee `itr.approved` / `itr.rejected` (`tests/db/analytics-bottlenecks.test.ts`). Los tipos generados se regeneraron desde la BD local. **Con esto la ola 1 queda cerrada en código**; sus partes de contenido (A39 contenido, homologación A41) y el resto de A09, A10 y A44 siguen en las olas 2 y 3.

**Salida:** cada defecto tiene una prueba que falla con el código anterior; diez reenvíos de una foto dan un adjunto; un fallo en cualquier asignación deja cero ITR; una importación interrumpida no deja plantillas activas a medias; las sondas del ITR pasan.

### Ola 2 — Catálogo, datos y operación para Geopark (bloquea la salida)

| Acción | Qué hacer | Quién decide |
|---|---|---|
| A41 | Seis fichas de homologación de referencia: I04A/I06A, I01A, I10A, I29C e I30C, con cobertura por control, cambios y criterios. | Luis o especialista de disciplina |
| A37 | Criterios de calibración por familia: span, tolerancia, puntos y as found/as left. El motor ya existe; faltan los valores. Es la calibración que estaba pendiente desde el 15-oct. | Luis o especialista |
| A38 | Política de alcance de continuidad: qué hacer mientras no exista listado de conductores estructurado. | Luis |
| A39 contenido | Decidir los 27 códigos que pasaron de exigir equipo de prueba a no exigirlo. | Luis o metrología |
| A42 primer lote | Activar solo el lote que necesitan los primeros proyectos de Geopark, con ficha y verificación de matriz. | Luis |
| A14 | Respaldo y restauración ensayados **de la BD y del Storage** (fotos, planos, paquetes), con objetivos de pérdida máxima y tiempo de recuperación. | Luis (plan de Supabase) |
| A15 mínimo | Alerta cuando un cron falla o una cola envejece (avisos push, outbox, webhooks), y una página de salud. | — |
| A17 medición | Medir con el volumen real de los primeros proyectos (tags, ITR, paquete de un sistema). | — |
| Validación | Organización Geopark nueva, datos reales de ingeniería, borrar DEMO y recorrido de punta a punta por rol (incluye la firma del PTC con la cuenta `+smtp2` y la subida de PDF). | Luis |

**Salida:** primer lote homologado y activo; restauración probada; recorrido completo con datos reales aceptado por Luis.

**Avance:**
- **Ficha A37/A38/A39 (24-oct):** `docs/FICHA-A37-A38-A39-2026-10-24.md`; Luis aprobó todas las recomendaciones. Hallazgos principales:
  - Los 27 cambios de A39 no fueron decisiones: el relleno de la marca buscó un texto que las v2 ya no tenían.
  - I10A no exige equipo de prueba en ninguna versión.
  - Del primer lote, solo I10A, I01A e I30C dependen de esta ficha.
- **A39 contenido (24-oct):** hecho (migración `20261226120000`). 34 revisiones de los 27 códigos vuelven a exigir equipo de prueba (los 25 que miden con instrumento, todas las de I10A e I30C); E17B y E42-1B dejan de exigirlo. Se retiran 140 ítems de texto que duplicaban la sección nativa (T.n de 27 borradores, 7.01–7.07 de I10A v3), solo en borradores sin ITR. Los generadores v2 y `sincronizar-catalogo.mjs` copian ahora `requires_test_equipment` y `required_signatures` (H5) y el atajo «T» marca la revisión en vez de crear texto. Ningún ITR existente cambia de regla (A39 código).
- **A38 (24-oct):** hecho (migración `20261227120000`). El alcance de la continuidad (agrupación, cantidad, pantallas) lo fija un líder que no es el ejecutor, por RPC `set_itr_continuity_scope`, y queda congelado en el ITR; cambiarlo exige motivo y queda auditado con el alcance anterior. Sin alcance, o con una captura que no lo cubre exactamente, la continuidad no se completa (TS = SQL; la sonda H6 pasó de `it.fails` a prueba normal). La lectura obligatoria la fija la plantilla (casilla en el editor). I01A v3: fuera D.4 (el alcance es la única cantidad) y lectura no obligatoria. El PDF del ITR imprime el alcance fijado. Sigue abierta 38-4: si Geopark entrega listado de cables con conductores, el alcance se derivará de ahí.
- **A17 medición (24-oct):** informe en `docs/MEDICION-A17-2026-10-24.md`. Proyecto de referencia de 5.000 tags y 10.000 ITR (Luis: 2.000–5.000 tags por proyecto) en local: todas las pantallas responden bajo 85 ms en el servidor, ~0,3 s en prod en caliente y 1–2 s en frío. **Bloqueo:** el paquete de handover de un sistema (550 ITR, 353 aprobados) sale PARTIAL por el tope de 150 PDF; generarlo no es caro (1,9 s por 150 PDF, ZIP de 1,7 MB). Luis aprobó subir el tope a 600: medido de nuevo, el paquete del sistema de referencia sale **ISSUED** (353 ITR, 4,7 s, ZIP 3,85 MB); el de proyecto completo se arma por sistemas hasta A11. El Worker va en 4,73 MB gzip (79 % del presupuesto).
- **A14 (24-oct):** la org de Supabase está en el **plan gratuito, sin copias** (la decisión 5 suponía copias diarias de Supabase) y el Storage nunca entra en ellas. Luis decidió respaldo propio en GitHub, cifrado: workflow `Respaldo` cada noche (BD con historial de migraciones + todos los archivos del Storage con sha256, AES-256, 7 días) y `Ensayo de restauración` mensual en una Supabase en blanco. Primer ensayo local con la copia real de prod: respaldo 2 min 41 s (7,6 MB cifrado), restauración 3 s, 200 tablas y 15/15 archivos idénticos. Recuperación estimada 2 h 20 min (runbook `docs/RUNBOOK-RESPALDO-RESTAURACION.md`). **Falta que Luis cargue `BACKUP_PASSPHRASE` y `SUPABASE_DB_URL`** para que corra en GitHub.
- **A15 mínimo (24-oct):** hecho (migración `20261229120000`). Decisiones de Luis: alerta como aviso en la app + push a los operadores, y página de salud solo para ellos. Los 5 crons HTTP dejan su latido en `cron_heartbeats`; `platform_health_checks()` revisa además los jobs de pg_cron, las colas (eventos sin despachar, push en cola, webhooks atascados), webhooks abandonados, paquetes de handover fallidos o colgados y conflictos de sincronización. pg_cron `platform-health` (cada 5 min, dentro de la BD: avisa aunque el Worker o GitHub Actions estén caídos) avisa al pasar a rojo y al resolverse. Página `/admin/health`. Pendiente del A15 completo: objetivos de servicio y quién responde, y alerta externa por si la BD misma se cae.
- **A37 (decisión 24-oct):** la tolerancia la define el inspector en el ITR al calificar; no se parametriza ni se calcula en el formato. El formato solo avisa (sin bloquear) cuando el error escrito no cuadra con las lecturas o una fila «conforme» supera la tolerancia del propio inspector. Hecho en I10A v3 (migración `20261228120000`): 2.07 «Tolerancia ±» (número) y 2.08 «Base del error» (selección) los llena el inspector; fuente y puntos pasan a 2.09 y 2.10. 4.01 = as found (un «no conforme» queda como evidencia con observación obligatoria y no rechaza, H7), 6.03 = as left (rechaza). Avisos en ámbar en la tabla, en el pie del ITR y en el PDF (`src/lib/itr/calibration-advisory.ts`), nunca bloquean. Las sondas H2 pasan a probar «no rechaza, avisa».

- **Decisiones de Luis (25-oct):**
  - **A15:** las alertas de salud las recibe el **arquitecto**, que es quien administrará CommUp. Se registra en `platform_operators` con su cuenta y su organización.
    - 26-oct: mientras no exista su cuenta, operador interino = luis.perdomo@outlook.com en «CommUp Catálogo» (migración `20270103120000`); al crear la cuenta del arquitecto, otra migración lo agrega y saca la interina.
    - 26-oct: GitHub corría el cron de push (`*/5`) cada 2–3 h y la alerta parpadeaba. **push-dispatch pasa a diario** (13:15 UTC) con ventanas de salud de 26 h (migración `20270104120000`). **Antes de que entre Geopark:** push-dispatch a pg_cron + pg_net cada 2 min (`CRON_SECRET` en el Vault) y volver a las ventanas cortas.
  - **38-4 y validación:** en vez de cargar Geopark sobre lo que hay, se crea una **organización nueva** y se carga toda la ingeniería:
    - listado de líneas;
    - instrumentos;
    - señales;
    - cables de instrumentación;
    - cables eléctricos;
    - equipos eléctricos;
    - equipos mecánicos.
  - Sobre esa base se construyen desde cero los planes de precomisionamiento y comisionamiento. CommUp debe poder leer e incorporar esos listados. El alcance de la continuidad (38-4) saldrá del listado de cables.
  - **Orden:** antes de empezar con la organización nueva se cierra todo lo pendiente.

### Ola 3 — Orientación y lectura (en paralelo, no bloquea la salida)

| Acción | Brecha concreta |
|---|---|
| A08 | Contrato de estados: diligenciado, conforme, aprobado, liberado y entregado. **Decisión de producto**; precede a A25 y A47. |
| A25 | ITR «completado» en verde y «aprobado» en violeta, punch abierto en rojo: ajustar al contrato A08. |
| A47 | La matriz no distingue «sin información» ni «en ejecución» (todo cae en «bloqueado») y no tiene columna de responsable. |
| A46 | «Lo que bloquea hoy» sin responsable ni hora de actualización; con 0 bloqueos el indicador se pone verde, y eso puede leerse como «se puede arrancar». |
| A22 | El chip Cat A del Resumen abre la lista sin filtrar; las regresiones no tienen enlace; la franja solo está en el Resumen. |
| A18 | En el teléfono no se ve el proyecto (las migas se ocultan debajo de 640 px); las pantallas globales no dicen «Todos los proyectos». |
| A20 | Las migas dicen «Tag», «ITR», «Sistema» en vez del código. |
| A23 | Las cifras no dicen cuándo se actualizaron; una página servida sin red no avisa que es vieja. |
| A26 | Quedan tres pares de bajo contraste: gris tenue sobre el navy del menú (~3,5:1), naranja activo sobre la barra blanca (~2,7:1) y blanco sobre `danger-500` (~3,8:1). |
| A43 | El ITR muestra «N pendientes» como salto, no como lista de faltantes y rechazos; no muestra proyecto ni sistema; las tablas anchas no tienen modo por fila en el teléfono; falta el encabezado compacto del teléfono (resto de la maqueta A·A·A). |
| A19 | ITR y Punch cuelgan del grupo de la fase MC en el menú. **Decisión de producto.** |

**Avance (25-oct):** maqueta A08 + A19 hecha; Luis aprobó la paleta A (violeta = espera a otra persona) y el menú C. Plan de implementación de A08, A25, A47 y A19 en `docs/PLAN-A08-A25-A47-A19-2026-10-25.md` (7 etapas, 3 migraciones; D1 y D2 por confirmar).

### Ola 4 — Piloto Geopark

A33 (observar a inspector, líder y representante de la operadora en campo, con línea base de tiempo y errores), A34 (piloto medido: cierre, horas de dossier, capturas recuperadas, aceptación del receptor), A27 (capturas de referencia de pantallas y estados), A21 (validar el menú con usuarios reales) y A42 (siguientes lotes de plantillas según el piloto).

### Ola 5 — Después del piloto o con un cliente que lo exija

A06 membresía por proyecto · A07 políticas de liberación versionadas · A09 historial unificado y retención por contrato · A10/A11 paquete durable, por instantánea y en segundo plano · A12 historial de claves públicas (antes de la primera rotación) · A28 límites de módulos · A31 cuota de IA · A32 configuración por complejidad · A35 alta criticidad · A48 feed de actividad · A49 vista espacial o 3D · A51–A53 landing con capturas reales, casos y oferta (con evidencia del piloto).

## 4 Decisiones que te tocan

| N.º | Decisión | Mi recomendación | Bloquea |
|---|---|---|---|
| 1 | **D2 revisada:** ¿pasar las pruebas de BD de la CI a la Supabase local? Prod seguiría sirviendo para tus pruebas manuales. | Sí. La infraestructura ya existe, cuesta poco y antes de cargar datos reales de Geopark las pruebas no deberían escribir en prod. | Ola 0 |
| 2 | **A06:** para los primeros proyectos de Geopark, ¿basta el acceso por organización? Hoy todo miembro ve todos los proyectos de la org. | Basta si solo entra personal de Geopark y su representante. Si entran contratistas o un cliente que no debe ver otros proyectos, A06 sube a la ola 2. | Ola 2 o 5 |
| 3 | **Primer lote de ITR:** ¿qué familias usan los primeros proyectos? | Empezar por las seis referencias y ampliar solo lo que pidan los proyectos. | Ola 2 |
| 4 | **Criterios de calibración y alcance de continuidad** (A37, A38, los 27 códigos de A39). | Te preparo la ficha de valores y fuentes faltantes por plantilla, y tú decides sobre algo concreto. | Ola 2 |
| 5 | **Respaldo:** pérdida máxima y tiempo de recuperación aceptados; plan de Supabase (copias diarias o recuperación a un punto en el tiempo). | Definirlo antes de cargar datos reales. | Ola 2 |
| 6 | **A08:** contrato de estados. | Te traigo una propuesta con maqueta antes de tocar colores o matriz. | Ola 3 |
| 7 | **A19:** ¿el menú sigue agrupando por fases, o ITR y Punch salen a un acceso estable fuera de las fases? | Propuesta con maqueta junto con A08. | Ola 3 |
| 8 | **A31:** ¿la cuota de IA es un aviso o un límite duro? | Aviso mientras el uso sea interno; límite duro antes de que un cliente use IA. | Ola 5 |

### 4.1 Respuestas de Luis (24-oct)

| N.º | Decisión tomada |
|---|---|
| 1 | **Sí:** las pruebas de BD de la CI pasan a la Supabase local (reemplaza D2 del 19-oct). Prod queda para pruebas manuales. |
| 2 | **Basta el acceso por organización** para los primeros proyectos de Geopark; A06 queda en la ola 5. |
| 3 | **Las seis referencias** (I04A/I06A, I01A, I10A, I29C, I30C); se amplía solo lo que pidan los proyectos. |
| 4 | **Ficha primero:** preparo valores y fuentes faltantes por plantilla (A37, A38, los 27 códigos de A39) y Luis decide sobre ella. |
| 5 | **Copia diaria:** pérdida máxima ≤ 24 h, recuperación ≤ 8 h (copias diarias del plan de Supabase, sin PITR). A14 ensaya la restauración con ese objetivo, BD y Storage. |
| 6 | **Propuesta con maqueta** del contrato de estados antes de tocar colores o matriz (ola 3). |
| 7 | **Se decide con maqueta**, junto con A08. |
| 8 | **Aviso** mientras el uso sea interno; límite duro antes de que un cliente use IA. |

## 5 Orden sugerido de trabajo

1. Ola 0: la acción de seguridad (cambiar la contraseña compartida con Grok y borrar su proyecto), A13 (CI con BD local y todos los roles), A50 (demo restablecible) y A45 (sondas como pruebas).
2. Ola 1 en este orden, del mayor al menor riesgo:
   - **Pérdida o duplicación de evidencia:** A02, el resto de A01 y el guard de A10.
   - **Operaciones a medias:** A03, A40, A39 código y A44 parte.
   - **Contratos:** A04, A05, A36 código y A29.
   - **Limpieza:** A09 parte y A30.
3. Ola 2 contigo: fichas y criterios (A41, A37, A38, A39), A14 y A15, carga real y recorrido de punta a punta.
4. En paralelo, cuando haya espacio: la maqueta interactiva de la Control Tower, la barra superior y el inicio del teléfono (§6), con las decisiones A08 y A19 tomadas sobre ella, y después el resto de la ola 3.

Cada acción se cierra con su prueba en la CI, su verificación en pantalla cuando aplica, commit y CI en verde; las migraciones a prod solo con tu OK y prueba en seco, como hasta ahora.

## 6 Visión de Grok (revisión y bocetos del 24-oct)

Luis compartió la revisión que hizo Grok de la landing y de la app, con 15 bocetos. Sus recomendaciones de texto ya estaban en el plan integral (§14, A46–A53), pero en ese momento faltaban las imágenes. Aquí cada punto queda asignado a una acción y a una ola, y se aclara qué se toma tal cual y qué se ajusta. Al hacerlo se aplican los principios del plan: nada se presenta como hecho o medido sin serlo, y avance físico no equivale a liberación.

### 6.1 Revisión escrita

| Punto de Grok | Qué hay hoy (verificado) | Acción y ola | Ajuste |
|---|---|---|---|
| El dominio y la propuesta de valor están bien (tag → NFC/QR → ITR → certificado con bloqueo Cat A → dossier) | Coincide con el modelo y la guía | — | Se conserva |
| Landing: hero con texto y números de mockup, sin capturas reales ni fotografía industrial | El hero usa mockups; los 17 renders 3D están en secciones (`/icons/3d/`), no en el hero | A51 · ola 5 | Capturas reales de la demo (A50), fotografía con licencia; los mockups se rotulan como tales |
| Cero prueba social | La sección se titula «desafíos comunes»: no hay testimonios inventados | A52 · después del piloto | Grok propone «aunque sea un placeholder al principio»: **no se publica**. Solo casos reales y autorizados (el piloto de Geopark) |
| Precio opaco | «Precios a medida», propuesta en 48 h | A53 · después del piloto | Rangos o ejemplos solo cuando sean defendibles; mientras tanto, explicar de qué depende la cotización |
| About, equipo y trayectoria delgados | No hay sección de equipo | A52 | Experiencia verificable; la del equipo no se presenta como historial del producto |
| Todo apunta a «solicitar demo» | Formulario de leads | A53 | Recorrido grabado o interactivo de la demo aislada |
| NFC + bloqueo duro Cat A como diferenciadores, contrastados con Excel, WhatsApp y carpetas | El bloqueo de certificados es real (S17; Cat B con excepción justificada). El NFC usa Web NFC: **solo Chrome en Android**; en iPhone se escanea QR | A51 | Decir «QR en cualquier teléfono, NFC en Android». «En un segundo» se publica solo si se mide |
| App: funcional pero cruda, mucha densidad, poca jerarquía en los indicadores | El Resumen tiene tablero por fases, «lo que bloquea hoy» y «próximos 7 días», pero con poco peso visual | A46, A27 · ola 3 | Rediseño del Resumen como Control Tower con los mismos datos |
| Menú con muchos niveles | Menú por audiencias y fases plegables (N1) | A21, A19 · ola 3 | Se decide con maqueta (decisión 7) |
| No pudo evaluar ejecución de ITR, firma ni bloqueo de certificado porque el proyecto estaba vacío | Hay semillas por módulo, pero no una demo poblada y restablecible | A50 · ola 0 | Coincide con la prioridad de Grok («poblar un proyecto de demo») |
| Branding discreto, se siente herramienta interna | Marca en tokens y menú navy; el resto es neutro | A24, A49 · ola 3 | Más presencia de marca en la estructura, sin decorar módulos |
| Los activos 3D deberían aparecer en el producto (Digital Twin, fichas de tag) | Los renders solo están en la landing; el Digital Twin son tarjetas | A49 · ola 5 | Como ilustración por **tipo de equipo** en fichas y tarjetas, rotulada; nunca como posición física ni telemetría |
| Control Tower: modo oscuro como base «porque fatiga menos» | Existen los temas claro, oscuro y contraste (C-29) | A24–A26, A46 · ola 3 | Oscuro como presentación de la sala de control; campo sigue en claro o en «contraste» para pleno sol. No se afirma que fatigue menos |
| Saber en 15 segundos si el proyecto está sano | — | A46 · ola 3 | Es una prueba de usabilidad con datos reales, no una promesa |
| Debe tener: bloqueadores del día, progreso por fase con color, matriz de liberación, feeds de ITR y punch, contexto visual, próximos 7 días | Existen todos menos los feeds y la vista espacial de planta; el P&ID por estado ya existe | A22, A46, A47, A48, A49 | Ver 6.2 |
| Grok pidió credenciales y entró a producción | Creó un proyecto en prod | Ola 0 · Seguridad | Revisiones externas solo en la demo aislada |

### 6.2 Bocetos

| Boceto | Qué se toma | Qué se ajusta | Acción |
|---|---|---|---|
| Hero con planta y panel de producto (3 variantes) | Fotografía industrial + producto visible, titular «Commissioning industrial, con trazabilidad total» | Cifras y feed del panel deben salir de la demo real; sin «Live», «Users online» ni nombres de proyectos reales ajenos (Pluto LNG, Ichthys LNG) | A51 |
| Flujo «From Tag to Trusted Handover» (2 variantes) | Los cinco pasos y el estilo isométrico, mejor el segundo (más sobrio) | Quitar «Blockchain seal» y «Powered by Vertex Industrial Suite». Firmamos con Ed25519 + hash y los certificados son **por subsistema** (MC, RFC…), no por ITR. NFC: ver 6.1 | A51 |
| Control Tower oscura (3 variantes) | Tarjetas de fase grandes, banner de Cat A críticos, matriz sistema × fase al centro, feeds de ITR y punch, panel visual a la derecha, hora de actualización | **«Readiness % = ITR completados / ITR totales» no se adopta**: mezcla avance físico con liberación. En CommUp un sistema con 100 % de ITR sigue bloqueado por un Cat A, el PSSR o un line-up. La matriz muestra estado de liberación por gate y, aparte, el avance físico. Nada de «Live» ni «Forecast completion» mientras no exista (A30). El panel derecho usa el **P&ID por estado y los límites del sistema**, que existen; el 3D solo si hay modelo real | A46, A47, A48, A49 |
| Matriz genérica «NextGen Communications» | La idea de «No aplica» por celda | No es de comisionamiento; se descarta como referencia | A47 |
| Menús con ITR, Punch y Certificados dentro de cada fase (3 variantes) | Fases como organizador visible con su estado | Es la decisión A19: repetir módulos por fase frente a un acceso estable con filtro de fase. Se decide con maqueta | A19, A21 |
| Barra superior con selector de proyecto | Proyecto activo siempre visible, búsqueda, avisos, «＋ Crear» y usuario | Ya existen búsqueda, avisos y crear; falta el proyecto visible (brecha A18) | A18 |
| Inicio del teléfono | Proyecto actual, fases, accesos a ITR y Punch, aviso de críticos y escaneo destacado al centro | Coincide con la barra Mi trabajo · Escanear · Crear · Menú; agregar el proyecto y el aviso | A18, A21, A43 |
| Menú de administración aparte con «Volver a la app» | La separación | Hoy la administración está plegada en el mismo menú; se evalúa en la maqueta | A21 |

**Logos:** casi todos los bocetos usan isotipos distintos al de CommUp. Cualquier maqueta o pieza usa los PNG de `public/logos/`.

### 6.3 Orden

La Control Tower, la barra superior y el inicio del teléfono entran en la **ola 3** como una maqueta interactiva con datos y reglas reales. En esa misma maqueta se toman las decisiones 6 (contrato de estados) y 7 (menú). La maqueta puede hacerse en paralelo a las olas 0 y 1 sin frenar la integridad. La landing (hero, flujo, prueba social, oferta) va después del piloto, con capturas reales de la demo aislada.
