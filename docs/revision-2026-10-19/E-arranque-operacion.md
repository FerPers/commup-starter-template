# Revisión E — Arranque y readiness de operaciones (F6–F7)

Revisor E · 2026-10-19 · revisión estática, solo lectura (sin BD, sin servidor). Alcance: migraciones `20261017210000`, `20261018090000`, `20261018093000`, `20261018120000`, `20261018150000`, `20261019120000`, `20261019150000`, `20261020120000`; acciones `startup.ts`, `startup-events.ts`, `ops-readiness.ts`, `performance.ts`, `handover.ts`; páginas `/projects/[id]/startup/**`; outbox offline `src/lib/sync/startup-outbox*.ts`; ingesta `api/v1/signals/samples` + `ingest_signal_samples` (baseline); PDFs `procedure.ts`, `performance-report.ts`; generación de handover `src/lib/handover/generate.ts`; seeds DEMO.

Confianza: **alta** = verificado leyendo el código y la ruta completa; **media** = depende de configuración o comportamiento de runtime que no se puede ejecutar aquí (p. ej. `max-rows` de PostgREST, planes de Postgres, hidratación de React).

---

## 1. Resumen (franco)

F6–F7 es la parte más ambiciosa y mejor razonada del producto. El modelo es correcto en lo esencial: todo se escribe por RPC `SECURITY DEFINER`, hay máquinas de estado explícitas y se aplican reglas de «otra persona». La evaluación de la prueba de desempeño vive en SQL como fuente única y deja hashes. El offline de ejecuciones y line-ups (compare-and-set con microsegundos, bandeja «No sincronizado», «Detener» nunca retenido) está por encima de lo que se ve en el mercado. Se nota que las decisiones de §12/§14 se implementaron con disciplina.

Los riesgos reales no están en la lógica de cada RPC. Están en cuatro sitios:

1. **Quién firma de verdad.** Las «capacidades» (Comisionamiento / Operaciones / HSE) son solo etiquetas sobre el rol de la org. Cualquier `leader` libera un hold point de HSE, firma como Operaciones un traspaso y firma como Operaciones un PTC. Al revés, un operador real con rol `inspector` no puede liberar un hold de Operaciones ni atestiguar el primer arranque. Además, la bandeja offline no guarda quién capturó: en una tablet compartida, lo que capturó A se sincroniza a nombre de B, y la regla «otra persona» deja de proteger.
2. **IIoT a escala real.** Los gráficos leen la vista `signal_samples_1min`, que no permite usar el índice por rango de tiempo (el filtro va sobre `date_trunc`) y aplica RLS fila por fila. Con datos a 1 Hz y 90 días de retención, la ficha del evento y la consola de la prueba van a agotar el tiempo. La DEMO no lo muestra porque tiene 1 muestra por minuto. Además, la ingesta resuelve la señal por `signal_tag` en toda la org, con `LIMIT 1`. Si dos proyectos de la misma org tienen `PT-101`, las muestras pueden ir al proyecto equivocado, y esos datos alimentan un certificado PTC.
3. **El paquete de handover que se genera al pasar a Operaciones no contiene nada de F1–F8.** No incluye gates, procedimientos, line-ups, hitos, el checklist del traspaso, competencias, repuestos ni el PTC. Es el paquete de mayo (ITR/punch/tags). El «traspaso formal firmado» entrega un dossier sin la evidencia que lo justifica.
4. **Pérdida de historia en registros operativos.** Liberar un hold point sobrescribe el comentario de quien ejecutó el paso. Una segunda parada de una ejecución borra la primera (motivo, autor y hora). Con 90 días de retención, re-congelar un intento cerrado y no evaluado borra los datos IIoT congelados.

Hay además varias brechas de practicidad para la sala de control y para el gerente de arranque. Faltan PDFs de la ejecución y de la hoja de line-up (no hay respaldo en papel ni registro ejecutado para el dossier). El line-up no deja anotar observaciones, número de candado o de sello. Las paradas y exclusiones se capturan con `window.prompt`. No hay zona horaria del proyecto: el reporte diario corta el día en UTC y la UI mezcla UTC con hora local. Varias listas tienen topes silenciosos de 1000 filas.

**Conteo:** 0 críticos · 5 altos · 21 medios · 11 bajos (37 hallazgos).

---

## 2. Fortalezas

- **Escritura solo por RPC** con `SET search_path TO 'public','pg_temp'`, `REVOKE … FROM PUBLIC, anon` y helpers internos revocados a `authenticated` (`procedure_write_content`, `performance_freeze_run`, `performance_compute_evaluation`, `startup_snapshot_param`, `link_transfer_handover` solo `service_role`). Las tablas tienen solo políticas SELECT por `get_my_project_ids()`. La pertenencia de cada id hijo al proyecto se valida (tags de pasos, señales, procedimientos, sistemas de la frontera).
- **Máquinas de estado claras y bloqueos `FOR UPDATE`** en procedimiento/revisión/ejecución/hoja/traspaso/certificado. La numeración usa `pg_advisory_xact_lock` en `mgmt_next_seq` con lista blanca de tablas (sin SQL dinámico abierto).
- **Reglas de independencia bien aplicadas en BD:** aprueba ≠ autor/remitente; verificación en campo ≠ aprobador; liberación ≠ ejecutor; verificación de line-up ≠ quien fijó; testigo ≠ registrador; dos firmas distintas en el traspaso; tres firmas distintas en el PTC; Cliente estricto (solo `client`).
- **Offline F6 cuidadoso:** `p_captured_at` acotado al orden lógico (`startup_field_time`). El CAS de line-up compara el string original con microsegundos (`expectedSetAt` en `startup-outbox-utils.ts:21-22`). `redundant` no borra una verificación ajena. Un paso rechazado retiene los posteriores. «Detener» nunca se retiene. Las acciones de red exigen bandeja vacía (`networkActionsAllowed`). La lógica pura tiene tests.
- **Evaluación de desempeño en SQL como fuente única:** ventana válida = formal − exclusiones; estadísticos sobre el promedio de cada minuto; las lecturas manuales se sostienen; las derivadas se resuelven por orden de dependencias con detección de ciclos en la definición; los pares de medidores llevan a «no concluyente». La sugerencia frente a la decisión humana exige motivo. La evaluación queda congelada con hash, se crea la acción F5 automática y el PTC lleva un hash que encadena definición → evaluación → firmas.
- **Datos congelados propios** (`performance_run_data`), independientes de la purga de `signal_samples` a 90 días, y con `n_good`/`n_bad`.
- **Gates integrados:** `lineup_verified` con desactualización por eventos F3 y `performance_accepted` con «no aplica». El criterio entra en `compute_system_gates`, en Control Tower y en Mi trabajo.
- **El PDF de desempeño cubre las 14 secciones** (18.46), bilingüe, regenerado desde datos congelados, con huellas y paginación de 30k filas.
- **Copiar procedimiento desde otro proyecto** empareja tags por número. Las nuevas revisiones copian contenido completo, y se exige motivo para R>0.

---

## 3. Hallazgos

Formato: **ID · Severidad · Categoría** — Ubicación — Evidencia — Impacto — Recomendación — Esfuerzo — Confianza.

### ALTA

**E-01 · Alta · Seguridad / Integridad de firmas (offline)**
- **Ubicación:** `src/lib/sync/startup-outbox-utils.ts:17-26` (`StartupOp` sin `userId`); `src/lib/sync/startup-outbox.ts:48-66` (`sendEntry` llama a las server actions con la sesión vigente); `src/components/layout/UserMenu.tsx:104-108` (logout sin vaciar ni bloquear la bandeja).
- **Evidencia:** `{ kind: 'run_step'; projectId; runId; stepId; ord; isHold; na; actual; comment }`. No guarda quién capturó; `handleLogout` solo hace `signOut()` y `push('/login')`.
- **Impacto:** en una tablet o PWA compartida (lo habitual en campo), lo que A capturó sin red se sincroniza con la sesión de B. `done_by`/`set_by` quedan a nombre de B. Después A puede liberar «su propio» hold point o verificar «su propia» válvula crítica, porque la BD compara contra B. La regla central de F6 (verificación independiente) se vuelve evitable sin mala intención. La atribución de un registro de seguridad es falsa.
- **Recomendación:** guardar `userId` (y `orgId`) en cada entrada. En el replay, enviar solo las entradas del usuario en sesión y dejar las demás retenidas con el aviso «capturado por X: inicia sesión como X». Al hacer logout con bandeja no vacía, advertir y bloquear o retener. Aplicar lo mismo al outbox de ITR (Sprint O). Opcional: en el servidor, rechazar si el `capturedBy` declarado ≠ `auth.uid()`.
- **Esfuerzo:** M · **Confianza:** alta.

**E-02 · Alta · Modelo de autorización / Segregación de funciones**
- **Ubicación:** `20261017210000_startup_procedures_lineups.sql:203-213` (`hold_release_roles`); usada en `release_hold_point`, `witness_startup_event`, `sign_ownership_transfer` (`20261018150000:477`) y `sign_performance_certificate` (`20261019150000:593`).
- **Evidencia:** `'commissioning' → owner/admin/architect/leader`; `'operations'` y `'hse'` → los mismos roles más `client`.
- **Impacto:**
  - (a) La «capacidad» del hold point no identifica a nadie. Cualquier líder del contratista libera un hold de **HSE**, atestigua «primer HC» como Operaciones y firma como Operaciones el traspaso y el PTC. Dos líderes del contratista completan un traspaso a Operaciones sin participación de la operadora.
  - (b) Al revés, un supervisor de turno real de la operadora suele tener rol `inspector`, porque ejecuta. Con ese rol no puede liberar un hold de Operaciones ni atestiguar el primer arranque. Para hacerlo hay que subirlo a `leader`, y entonces también aprueba procedimientos, o darle `client`, y entonces no puede ejecutar pasos.
  - El rol es por org, no por proyecto (`register_caller_role`), así que el problema se repite en todos los proyectos.
- **Recomendación:** introducir **capacidades por persona y proyecto** (`project_capacities(user_id, project_id, capacity in {commissioning, operations, hse, client_rep}, valid_from/to)`), administradas por un líder. Las RPC deben comprobar la capacidad en lugar del rol, manteniendo el rol mínimo como piso. En el traspaso y el PTC, exigir que «Operaciones» tenga la capacidad `operations` y, opcionalmente, que pertenezca a la empresa operadora (F8 `companies`).
- **Esfuerzo:** M–L · **Confianza:** alta.

**E-03 · Alta · Rendimiento IIoT a escala**
- **Ubicación:** `src/app/(dashboard)/projects/[id]/startup/events/[eventId]/page.tsx:29`; `…/performance/runs/[runId]/page.tsx:57-62`; vista `signal_samples_1min` en `00000000000000_baseline.sql:3427-3436`; política `signal_samples_select` en `baseline:8113`.
- **Evidencia:** la vista hace `GROUP BY signal_id, date_trunc('minute', sampled_at)`. La consulta filtra `.gte('bucket', …)`. La consola pagina hasta 30 veces (`fetchAll`, `CAP = 30000`).
- **Impacto:** el filtro por `bucket` llega a la vista como `date_trunc('minute', sampled_at) >= X`, que no puede usar la PK `(signal_id, sampled_at)` por rango. Cada consulta agrega **toda la historia retenida** de esas señales: 90 días a 1 Hz son unos 7,8 M filas por señal. Encima, la vista es `security_invoker` y la política hace un `EXISTS` con join por fila (el mismo patrón que en la prueba de carga de 09-03 costó 5–7 s). La consola de la prueba repite esa agregación en cada página (hasta 30 veces) en cada `router.refresh()`. Con un historiador real a 1 Hz, la ficha del evento y la consola de desempeño agotan `statement_timeout`. La DEMO a 1/min no lo muestra.
- **Recomendación:** crear una RPC `signal_series(p_signal_ids uuid[], p_from, p_to, p_bucket_s)` que filtre por `sampled_at BETWEEN` (sargable), compruebe la pertenencia una sola vez (`is_project_member`) y devuelva agregados ya reducidos (p. ej. ≤ 720 puntos, con mín/máx por bucket para no perder picos). Alternativa: una tabla de agregados de 1 minuto mantenida al ingerir. Hacer una prueba de carga con 1 Hz × 20 señales × 90 días.
- **Esfuerzo:** M · **Confianza:** media-alta (por el plan de ejecución esperado de Postgres; no se ejecutó `EXPLAIN`).

**E-04 · Alta · Integridad de datos IIoT (ingesta)**
- **Ubicación:** `00000000000000_baseline.sql:1330-1342` (`ingest_signal_samples`); `src/lib/api/auth.ts:131` (`projectId: null`).
- **Evidencia:** `WHERE sig.signal_tag = (item->>'signal_name') AND p.org_id = p_org_id AND sig.active = TRUE LIMIT 1`.
- **Impacto:** la señal se resuelve por nombre en **toda la org**, sin orden. Con proyectos replicados (dos trenes, Fase 1/Fase 2 con los mismos tags `PT-101`), las muestras caen en una señal arbitraria de otro proyecto. Esas muestras alimentan la foto del hito, la evaluación de desempeño y, por tanto, el PTC firmado por el cliente. Tampoco hay forma de que una API key apunte a un proyecto (`projectId` siempre `null`).
- **Recomendación:** API keys con alcance de proyecto (opcional), y aceptar `project_code` en el lote o `signal_id` en cada muestra. Si un nombre resuelve a más de una señal, rechazar esa muestra con `ambiguous_signal` en lugar de usar `LIMIT 1`. Añadir una restricción de unicidad de `signal_tag` por proyecto si no existe.
- **Esfuerzo:** S–M · **Confianza:** alta (código). El impacto depende de que haya tags repetidos entre proyectos, algo muy probable.

**E-05 · Alta · Funcional / Handover**
- **Ubicación:** `src/app/actions/ops-readiness.ts:136-147` (`generateForTransfer` → `generateHandoverPackage`); RPC `generate_handover_package` definida solo en `00000000000000_baseline.sql` (ninguna migración posterior la redefine).
- **Evidencia:** el payload incluye `project`, sistemas con `tag_count`, `itr_count`, `punch_summary`, `itrs` y `tags`. No hay rastro de gates, procedimientos, line-ups, `startup_events`, `ownership_transfers`, competencias, repuestos ni PTC.
- **Impacto:** §12.23 promete que «al completarse el traspaso a Operaciones se genera el paquete de handover». El paquete que se genera no contiene el checklist ni las excepciones del traspaso, ni los procedimientos verificados, el line-up vigente, los hitos atestiguados, el certificado de desempeño o la matriz de competencias. Para la operadora es el entregable más importante de F6–F7, y llega sin la evidencia de readiness. Además el PDF de handover y su firma HMAC no reflejan las firmas del traspaso.
- **Recomendación:** versionar `generate_handover_package` v2 con secciones nuevas: aprobaciones de gate con firmas; procedimientos (revisión vigente, hash, verificación en campo); última ejecución completada con pasos y holds; line-up vigente con hash; hitos con testigo y parámetros; el traspaso con checklist, excepciones y firmas; competencias por turno; repuestos; PTC con hash. Adjuntar los PDFs de procedimiento y de prueba de desempeño al paquete (ZIP o anexos).
- **Esfuerzo:** M–L · **Confianza:** alta.

### MEDIA

**E-06 · Media · Correctitud UI (consola de desempeño)**
- **Ubicación:** `src/app/(dashboard)/projects/[id]/startup/performance/runs/[runId]/page.tsx:47,57-62`.
- **Evidencia:** `const frozen = run.status === 'closed'` … `if (!frozen && live.length)`, que trae la vista en vivo sin cota superior.
- **Impacto:** en un intento **evaluado** (el estado final, el que más se consulta y el que va al cliente), el gráfico mezcla los puntos congelados con los de la vista en vivo. Resultado: puntos duplicados, datos posteriores al cierre (Recharts amplía el dominio si los datos lo exceden) y diferencias cuando la purga a 90 días ya borró las muestras crudas. Además hace hasta 30 consultas caras sin necesidad (ver E-03).
- **Recomendación:** `const frozen = run.status === 'closed' || run.status === 'evaluated'`, y acotar la consulta en vivo con `lte('bucket', closed_at ?? now)`.
- **Esfuerzo:** S · **Confianza:** alta.

**E-07 · Media · Lógica de prerrequisitos (gate de arranque)**
- **Ubicación:** `20261018120000_startup_event_log.sql:122-123` (`startup_prerequisites`); usada en `record_startup_event` y en el checklist `joint_operation`.
- **Evidencia:** `ORDER BY requires_lineup DESC, order_index DESC, code DESC LIMIT 1`.
- **Impacto:** si ningún gate exige line-up (orgs cuya fase no se llama SU/RFSU, ver F8 §15.8), el «gate de arranque» pasa a ser el **último gate activo**. Con la práctica que F7 introdujo, un gate posterior al arranque como «PA Aceptación de desempeño» (orden 50), el primer arranque y el primer HC quedan bloqueados hasta aprobar PA. PA exige una prueba de desempeño, y esa prueba exige la planta arrancada: es un bloqueo circular. Si dos gates exigen line-up, se elige el de mayor orden, que no es necesariamente el de arranque.
- **Recomendación:** marcar de forma explícita el gate de arranque (`readiness_gates.is_startup_gate`, único por org, editable en `/admin/gates`) y no inferirlo. Validar al configurar que no haya gates con `requires_performance` antes del gate de arranque.
- **Esfuerzo:** S · **Confianza:** alta.

**E-08 · Media · Gates / Line-up**
- **Ubicación:** `20261017210000:968-979` (`compute_system_gates` → `lineup_verified`); `20261018150000:249-252` (checklist).
- **Evidencia:** `FROM lineup_sheets ls WHERE ls.system_id = p_system_id AND ls.status = 'verified'`, sin filtro por `purpose`.
- **Impacto:** una hoja verificada de propósito `test` u `other` (p. ej. un line-up parcial para una prueba hidrostática) cumple el criterio bloqueante del gate de arranque y del traspaso a Operación conjunta.
- **Recomendación:** filtrar `purpose = 'startup'` (o hacerlo configurable por gate).
- **Esfuerzo:** S · **Confianza:** alta.

**E-09 · Media · Pérdida de datos / Auditoría (hold points)**
- **Ubicación:** `20261017210000:548-550` (`release_hold_point`).
- **Evidencia:** `comment = COALESCE(public.mgmt_text(p_comment, 2000), comment)`.
- **Impacto:** el comentario de quien ejecutó el paso que llega al hold point (p. ej. «PT-101 11,8 barg, fuga menor en brida») se **sobrescribe** con el comentario de quien libera. Se pierde evidencia del registro ejecutado.
- **Recomendación:** añadir la columna `release_comment` y no tocar `comment`.
- **Esfuerzo:** S · **Confianza:** alta.

**E-10 · Media · Auditoría (paradas de ejecución)**
- **Ubicación:** `20261018090000_startup_offline.sql:88-95` (`transition_procedure_run`).
- **Evidencia:** `stopped_by = v_uid, stopped_at = …, stop_reason = v_comment`; al reanudar, `stop_reason = stop_reason || ' · Reanudado: ' || v_comment`.
- **Impacto:** una ejecución de arranque con dos paradas (algo común: trip, se corrige, se reanuda, otro trip) **pierde la primera parada**: motivo, autor, hora y la justificación de reanudar. La reanudación no guarda quién ni cuándo. Para la investigación de un incidente de arranque es grave.
- **Recomendación:** crear la tabla `procedure_run_events` (stopped/resumed/aborted/completed/hold_released con usuario, hora de campo, hora de servidor y comentario) y dejar las columnas solo como estado actual. Mostrarla como línea de tiempo en `RunView` y en el PDF de la ejecución (E-23).
- **Esfuerzo:** S–M · **Confianza:** alta.

**E-11 · Media · Lógica de readiness (personal por turno)**
- **Ubicación:** `20261018150000:202-221` (`system_staffing`).
- **Evidencia:** `people` = personal activo **con alguna evaluación en el sistema**; `shifts` se agrupa a partir de esa lista.
- **Impacto:** un turno en el que nadie fue evaluado en el sistema **no aparece** y, por tanto, no se exige. Si hay turnos A/B/C y solo A tiene evaluaciones, A con 2 personas de nivel 3 pasa el umbral «por turno». El turno noche sin nadie entrenado es justo el riesgo que el criterio debía detectar (§12.25).
- **Recomendación:** derivar los turnos esperados del roster activo del proyecto (o de una lista explícita de turnos por sistema) y contar 0 en los turnos sin personas competentes.
- **Esfuerzo:** S · **Confianza:** alta.

**E-12 · Media · Integridad de competencias**
- **Ubicación:** `20261018150000:307-337` (`record_competency`); `person_system_level:190-199`.
- **Evidencia:** `IF pe.user_id = auth.uid() THEN … 'Nadie evalúa su propia competencia'`. El nivel vigente se ordena por `assessed_at DESC`.
- **Impacto:**
  - (a) La regla de autoevaluación solo aplica si la ficha está vinculada a un usuario. Un líder puede crear una ficha suya sin `user_id` y darse nivel 4.
  - (b) No se puede anular ni corregir un registro erróneo. Si la corrección lleva una `assessed_at` anterior a la del registro equivocado, el error sigue siendo el nivel vigente.
  - (c) En la UI, `canAssess` solo permite líderes, aunque la BD también admite a los entrenadores de nivel 4 (`operations/page.tsx`, `canAssess`).
- **Recomendación:** emparejar fichas por email/usuario al vincular. Añadir `void_competency_record` con motivo y ordenar por `created_at` dentro de la misma fecha, o marcar `supersedes_id`. Alinear la UI con la BD.
- **Esfuerzo:** S · **Confianza:** alta.

**E-13 · Media · Gobernanza del traspaso**
- **Ubicación:** `20261018150000:430-440` (`request_ownership_transfer`).
- **Evidencia:** cualquier ítem en falta se vuelve excepción con `length(v_just) >= 10`. Lo puede pedir cualquier rol, incluidos `inspector` y `client`.
- **Impacto:** con «xxxxxxxxxx» se pueden saltar «sin punch Cat A abiertos», «gate de arranque aprobado» o «primer arranque atestiguado» en el paso a Operaciones. El control descansa solo en que las dos firmas lean la justificación.
- **Recomendación:** definir ítems **no dispensables** configurables por org (por defecto `no_open_cat_a` y `startup_gate`). Las excepciones las aprueba explícitamente cada firmante (casilla por excepción) y se listan en el PDF del handover (E-05).
- **Esfuerzo:** S–M · **Confianza:** alta.

**E-14 · Media · Gates / Ciclo de vida de pruebas**
- **Ubicación:** `20261019150000:646-660` (parche `performance_accepted`); `20261019120000:576-593` (`delete_performance_test_draft`).
- **Evidencia:** `FROM performance_tests pt LEFT JOIN performance_certificates pc … WHERE pt.primary_system_id = p_system_id`. No hay estado de prueba anulada o retirada.
- **Impacto:** cualquier prueba con ese sistema principal, incluido un borrador abandonado o una prueba aprobada que dejó de aplicar, deja el gate en rojo para siempre. Solo se borran pruebas nunca aprobadas, y solo su creador u owner/admin. Tampoco se puede marcar una prueba como «no requerida para este gate».
- **Recomendación:** añadir `performance_tests.status` (active/withdrawn, con motivo, líder+) y contar solo las activas con revisión aprobada. Opcionalmente, una relación prueba ↔ gate.
- **Esfuerzo:** S · **Confianza:** alta.

**E-15 · Media · Manejo de tiempo / Zona horaria**
- **Ubicación:** `20261018120000:321` (`v_from := p_date::timestamptz` en `daily_report_data`); parche `performance_today` en `20261019150000:708-721`; `when()` con `toLocaleString()` y `suppressHydrationWarning` en `RunView.tsx`, `RunConsole.tsx:82`, `LineupView.tsx`, `TransferView.tsx:41`, `EventsView.tsx:60`; PDFs con `… UTC` (`performance-report.ts:dt`) o sin zona (`procedure.ts:113-114`).
- **Evidencia:** no hay zona horaria de proyecto en el esquema ni en el código (`grep timezone` sin resultados).
- **Impacto:**
  - (a) El reporte diario corta el día en UTC. Un trip a las 21:00 en Colombia (UTC−5) sale en el reporte del día siguiente.
  - (b) Los textos con fecha se renderizan en el Worker (UTC y locale por defecto). Con `suppressHydrationWarning`, React no está obligado a corregirlos, así que el operador puede ver horas UTC junto a campos `datetime-local` que trabajan en hora local. Eso induce errores al cargar la hora real de inicio del periodo formal o de una perturbación.
  - (c) Los PDFs muestran UTC, o una hora sin zona en la sección de firmas del procedimiento.
  - §13.2 lo trata como cosmético; en arranque no lo es.
- **Recomendación:** `projects.timezone` (IANA). Calcular `daily_report_data` con `(p_date::timestamp AT TIME ZONE tz)`. Crear un componente cliente `<LocalTime iso>` que formatee tras el montaje y muestre la zona. En los PDFs, usar la hora del proyecto con la zona explícita.
- **Esfuerzo:** M · **Confianza:** alta en (a) y (c); media en (b).

**E-16 · Media · Integridad de la bitácora de arranque**
- **Ubicación:** `20261018120000:180, 189-202` (`record_startup_event`).
- **Evidencia:** la única cota es `p_occurred_at > now() + 5 min`. Los prerrequisitos se evalúan **ahora**, no en `occurred_at`.
- **Impacto:** se puede registrar «primer HC» antes de «primer arranque», o «operación estable» sin arranque. Se puede fechar un hito años atrás. Un «primer arranque» con fecha anterior a la aprobación del gate pasa si hoy el gate está aprobado. La regla dura §12.12 queda vacía y los KPI de éxito de primer arranque (F7-S3) se basan en esa secuencia.
- **Recomendación:** validar el orden de los hitos (prerrequisito atestiguado y anterior). Exigir `approved_at` del gate ≤ `occurred_at` y la aprobación del PSSR ≤ `occurred_at`. Fijar una cota inferior (p. ej. 7 días; más atrás solo con motivo y por un líder).
- **Esfuerzo:** S · **Confianza:** alta.

**E-17 · Media · Pérdida de datos (re-congelado tras la purga)**
- **Ubicación:** `20261019120000:670-692` (`performance_freeze_run`), `724-738` (`refreeze_performance_run`); purga a 90 días en `baseline:366-374`.
- **Evidencia:** `DELETE FROM performance_run_data WHERE run_id = r.id AND source = 'iiot'` seguido de un `INSERT … FROM signal_samples …`.
- **Impacto:** si un intento queda cerrado sin resultado registrado y alguien pulsa «Re-congelar» pasados 90 días (o tras purgas antes de tiempo), se **borran** los agregados congelados y se reemplazan por nada. La prueba queda sin evidencia, de forma irreversible.
- **Recomendación:** en el re-congelado, hacer solo `INSERT … ON CONFLICT DO UPDATE` de los buckets con datos nuevos, sin borrar. O bloquear el re-congelado si `closed_at < now() − 85 días`.
- **Esfuerzo:** S · **Confianza:** alta.

**E-18 · Media · Calidad de la evaluación (validación solo informativa)**
- **Ubicación:** `20261019150000:264-293, 373-394`.
- **Evidencia:** `v_spikes`, `v_oor` y `v_bad` solo van a `v_vars`; ni `evaluable` ni `v_reasons` los usan. Los valores fuera del rango del instrumento entran en `avg/min/max`.
- **Impacto:** un intento con 30 % de muestras de calidad mala (basta una buena por minuto para que el minuto «cuente»), con picos o con valores fuera de rango puede salir **«Aceptada»** como sugerencia. Lo decidió Luis (§14.6 «solo informan»), pero la consecuencia práctica es que el líder ve «Aceptada» y el cliente firma un PTC con datos dudosos.
- **Recomendación:** mantener que no corrija, pero que **sugiera «no concluyente»** cuando se superen umbrales configurables por revisión (`max_bad_pct`, `max_spikes`, `oor_excluded`), y excluir del estadístico los minutos fuera del rango del instrumento. Mostrar una alerta en la tarjeta del PTC.
- **Esfuerzo:** S–M · **Confianza:** alta.

**E-19 · Media · Gobernanza de exclusiones**
- **Ubicación:** `20261019120000:789-807` (`set_performance_disturbance_exclusion`).
- **Evidencia:** solo `performance_is_lead`, con motivo de ≥ 3 caracteres. Puede ser el mismo líder que dirige la prueba y registra el resultado.
- **Impacto:** quien dirige la prueba puede excluir ventanas desfavorables hasta que los criterios pasen. No hay reconocimiento independiente. La firma del cliente es el único freno, y el cliente no ve qué cambió entre la evaluación sin exclusiones y la final.
- **Recomendación:** en la evaluación, calcular también el resultado **sin exclusiones** y mostrarlo en el panel, en el PDF y en el PTC. Exigir que la exclusión la confirme otra persona, o que el cliente la reconozca, cuando cambia el resultado sugerido.
- **Esfuerzo:** M · **Confianza:** alta.

**E-20 · Media · Escala / Topes silenciosos de PostgREST**
- **Ubicación:** `events/page.tsx:27` y `performance/[testId]/page.tsx:30` (`signals … .limit(2000)`); `operations/page.tsx:28` (`competency_records … .limit(10000)` **sin** `order`); `events/page.tsx:25`, `startup/page.tsx:22,25`, `operations/page.tsx:26` (`limit(1000)`).
- **Evidencia:** según CLAUDE.md, Supabase corta en 1000 filas por defecto (`max-rows`).
- **Impacto:** en proyectos reales (miles de señales), el selector de señales de la bitácora y de las variables de desempeño muestra solo las primeras 1000 por `signal_tag`; las demás no se pueden elegir. La matriz de competencias con más de 1000 registros toma un subconjunto **arbitrario** (sin `order`) y puede mostrar un nivel vencido o antiguo como vigente.
- **Recomendación:** buscador de señales por servidor filtrado por sistema/tag. Calcular el nivel vigente en SQL (vista o RPC `competency_matrix(project)`) en lugar de traer el historial. Paginar las listas.
- **Esfuerzo:** S–M · **Confianza:** media (depende de `max-rows`).

**E-21 · Media · UX de campo (line-up)**
- **Ubicación:** `LineupView.tsx:72` (`remarks: null` siempre); `20261017210000:142-160` (modelo).
- **Evidencia:** la RPC admite `p_remarks`, pero la UI nunca lo envía. Solo hay `found_position`, que se sobrescribe al re-fijar.
- **Impacto:**
  - El operador no puede anotar «encontrada abierta, cerrada por mí», el n.º de candado o sello de LO/LC, ni un problema (vástago dañado).
  - Se pierde la diferencia entre «encontrada» y «dejada» (as-found / as-left), que es la evidencia típica de un line-up.
  - Las hojas de cientos de válvulas no tienen búsqueda, filtro por estado, agrupación por área o P&ID, ni orden por recorrido.
  - No hay foto por fila.
- **Recomendación:** separar `as_found` y `as_left`. Añadir el campo de observaciones y `lock_number`/`seal_number` (obligatorios para `locked_*`). Añadir filtros («pendientes», «críticas por verificar») y orden por ruta. Foto opcional usando el outbox de ITR.
- **Esfuerzo:** M · **Confianza:** alta.

**E-22 · Media · Registros imprimibles y dossier**
- **Ubicación:** `src/lib/pdf/` (solo `procedure.ts` y `performance-report.ts` para F6–F7); `procedure.ts:92-101`.
- **Evidencia:** no hay PDF de la **ejecución** (pasos con quién/cuándo/valor real/holds/paradas), ni de la **hoja de line-up**, ni de la ficha de un **evento**. El PDF del procedimiento solo pone una línea de firma en los hold points.
- **Impacto:**
  - Sin respaldo en papel para cuando falla la tablet o no hay red (regla habitual en arranque).
  - Sin «registro ejecutado» para el dossier ni para el paquete de handover (E-05).
  - El PDF del procedimiento no sirve como checklist de campo: no tiene casillas por paso ni columnas para iniciales, hora y valor real.
- **Recomendación:** tres PDFs más con el renderer compartido: ejecución (con la línea de tiempo de E-10 y el hash), line-up (con as-found/as-left, verificaciones y hash) y evento (con parámetros y una miniatura del gráfico). Añadir al PDF del procedimiento el modo «checklist de campo» con columnas ✓ / valor / iniciales / hora.
- **Esfuerzo:** M · **Confianza:** alta.

**E-23 · Media · Seguridad de proceso (pasos)**
- **Ubicación:** `20261017210000:62-78` (`procedure_steps.expected_value text`); `RunView.tsx` (campo libre «valor real»).
- **Evidencia:** `expected_value` y `actual_value` son texto. `stop_criteria` es texto y no se evalúa.
- **Impacto:** un paso con valor esperado «11–12 barg» acepta «15» sin aviso. No se sugiere detener aunque el valor cumpla el criterio de parada. Tampoco hay foto ni adjunto por paso, ni lectura automática del valor desde IIoT, aunque las señales ya están en el sistema.
- **Recomendación:** valor esperado estructurado (mín/máx/unidad, opcionalmente `signal_id`). Si queda fuera de rango, pedir confirmación y proponer «Detener» con el criterio prellenado. Lectura IIoT opcional (como `startup_snapshot_param`). Foto por paso usando el outbox existente.
- **Esfuerzo:** M · **Confianza:** alta.

**E-24 · Media · Ingesta IIoT (validación)**
- **Ubicación:** `baseline:1325-1350` (`ingest_signal_samples`); `api/v1/signals/samples/route.ts:62-70,83-85`.
- **Evidencia:** `NULLIF(item->>'value','')::double precision` acepta `"NaN"`/`"Infinity"` como texto. No se valida `sampled_at` futuro. `ON CONFLICT DO NOTHING`. Un `sampled_at` inválido hace fallar todo el lote con un 500 y devuelve `error.message`.
- **Impacto:** un NaN convierte en NaN los promedios de la evaluación y de la foto. Las muestras con fecha futura, por un reloj de PLC mal puesto, contaminan la ventana más cercana. No se puede re-enviar una muestra corregida (calidad 192 → 0). Un solo registro malformado rechaza 5000 y expone mensajes internos.
- **Recomendación:** validar cada muestra (finita, `sampled_at` ≤ now + 5 min y ≥ now − retención) y rechazarla con motivo en `errors[]`. Ofrecer `ON CONFLICT DO UPDATE` opcional (`upsert: true`) para correcciones. Devolver 422 genérico en lugar del mensaje de Postgres. Considerar límite de tasa por key (WAF pendiente en §13.5).
- **Esfuerzo:** S · **Confianza:** alta.

**E-25 · Media · Firma electrónica**
- **Ubicación:** firmas de PTC (`CertificateCard.tsx` → `sign_performance_certificate`), traspaso (`TransferView.tsx:106` con `confirm()`), liberación de hold, testigo de hito y verificación en campo.
- **Evidencia:** todas son un clic con la sesión vigente. No hay reautenticación ni PIN, ni declaración del significado de la firma, ni firma manuscrita (a diferencia de los ITR).
- **Impacto:** para un PTC contractual o un traspaso de custodia, una sesión abierta en un PC de sala de control basta para firmar a nombre de otro. Clientes del sector (Geopark y similares) suelen pedir firma con intención explícita y reautenticación (estilo 21 CFR 11 / buenas prácticas de firma electrónica).
- **Recomendación:** un componente de firma común con declaración de significado («Acepto la prueba como representante del Cliente») y reautenticación (contraseña u OTP, o PIN de firma por usuario con caducidad corta). Guardar el texto firmado y el método.
- **Esfuerzo:** M · **Confianza:** alta.

**E-26 · Media · Mantenibilidad (parches por ancla de texto)**
- **Ubicación:** `20261019150000:637-724`; `20261020120000:12-66` (`pg_get_functiondef` + `replace` de un ancla).
- **Evidencia:** `v_def := replace(v_def, v_anchor, …); EXECUTE v_def;`.
- **Impacto:** el cuerpo real de `compute_system_gates`, `my_work_counts`, `daily_report_data` y `take_mgmt_snapshot` ya **no está escrito en ninguna migración**: se reconstruye encadenando reemplazos de texto. Revisar, hacer diff o reconstruir un entorno nuevo es frágil (un cambio de espacios en un parche anterior rompe el siguiente). `my_work_counts` además crece como un monolito de 20+ subconsultas que se ejecuta en cada carga del sidebar.
- **Recomendación:** al cerrar el plan, una migración «consolidación» que redefina de forma completa y legible estas cuatro funciones. Prohibir nuevos parches por ancla. Para `my_work_counts`, separar por módulo o cachear.
- **Esfuerzo:** S–M · **Confianza:** alta.

### BAJA

**E-27 · Baja · Offline / Tiempo**
- **Ubicación:** `20261018090000:21-28` (`startup_field_time`).
- **Evidencia:** `LEAST(now(), GREATEST(p_captured_at, floor))` sin registrar si hubo recorte.
- **Impacto:** con el reloj del dispositivo atrasado, todos los pasos offline quedan con la hora del paso anterior. Con el reloj adelantado, quedan con la hora de sincronización. Nada lo señala.
- **Recomendación:** guardar el `captured_at` crudo y un flag `time_clamped`, y mostrarlo en la UI y en el PDF de la ejecución.
- **Esfuerzo:** S · **Confianza:** alta.

**E-28 · Baja · Cálculo del estadístico `total`**
- **Ubicación:** `20261019150000:336-337`.
- **Evidencia:** `sum(val) / basis`, sin normalizar por cobertura ni por minutos excluidos.
- **Impacto:** un criterio de «producción total ≥ X» se subestima con cada minuto faltante o excluido. Excluir una perturbación castiga el total.
- **Recomendación:** documentar la semántica o ofrecer `total_extrapolated = avg × duración formal`.
- **Esfuerzo:** S · **Confianza:** alta.

**E-29 · Baja · Generación de line-up acoplada al idioma**
- **Ubicación:** `20261017210000:617-622`.
- **Evidencia:** `lower(et.category) LIKE 'v_lvula%'`; críticas = `et.code IN ('ESDV','XV','SDV','BDV','PSV','HV-ESD')`.
- **Impacto:** una org con categorías en inglés («Valves») o con códigos propios genera hojas vacías o sin marcar las críticas.
- **Recomendación:** marcar en `equipment_types` los flags `lineup_candidate` e `is_critical_valve`, configurables en `/admin/config`.
- **Esfuerzo:** S · **Confianza:** alta.

**E-30 · Baja · Independencia del aprobador**
- **Ubicación:** `20261017210000:356`; `20261019120000:525`.
- **Evidencia:** solo se comprueban `created_by` y `submitted_by`. Cualquier no-cliente (o líder, en desempeño) puede editar el borrador.
- **Impacto:** quien reescribió todo el borrador sin crearlo ni enviarlo puede aprobarlo.
- **Recomendación:** registrar `edited_by[]` (o el último editor) y excluirlos de la aprobación.
- **Esfuerzo:** S · **Confianza:** alta.

**E-31 · Baja · Firma del handover verificable solo por CommUp**
- **Ubicación:** `src/lib/handover/generate.ts:79-84`.
- **Evidencia:** `hmacSha256(HANDOVER_SIGNING_SECRET, json)`.
- **Impacto:** el HMAC es simétrico: la operadora no puede verificar la integridad del paquete por su cuenta y no hay endpoint de verificación.
- **Recomendación:** firma asimétrica (Ed25519) con clave pública publicada, o una página `/verify/<hash>`.
- **Esfuerzo:** M · **Confianza:** alta.

**E-32 · Baja · Ejecución sobre revisión reemplazada**
- **Ubicación:** `runs/[runId]/page.tsx` (no consulta el estado de la revisión).
- **Impacto:** una ejecución en curso sobre R0, cuando ya está aprobada R1, no muestra ningún aviso (la consola de desempeño sí lo hace). `start_procedure_run` no exige un line-up verificado del sistema ni la verificación en campo.
- **Recomendación:** mostrar un aviso de revisión reemplazada. Añadir prerrequisitos opcionales al iniciar: line-up vinculado verificado y revisión verificada en campo.
- **Esfuerzo:** S · **Confianza:** alta.

**E-33 · Baja · Gráficos que esconden picos**
- **Ubicación:** `RunConsole.tsx:42-47`; `performance-report.ts:thinSeries`, `chart()`.
- **Evidencia:** el muestreo toma 1 de cada N puntos. El PDF no tiene eje de tiempo, ni líneas de objetivo o banda, ni sombreado de exclusiones.
- **Impacto:** un trip de 2 minutos puede no verse en el gráfico de 6 h. El gráfico del PDF tiene poco valor como evidencia para el cliente.
- **Recomendación:** reducir con mín/máx por bucket (o LTTB). En el PDF: eje de tiempo con 4–6 marcas, línea del objetivo y banda del criterio, y sombreado de perturbaciones incluidas y excluidas.
- **Esfuerzo:** S–M · **Confianza:** alta.

**E-34 · Baja · UX de acciones críticas con `window.prompt`/`confirm`**
- **Ubicación:** `RunView.tsx` (Detener/Reanudar/Abortar), `RunConsole.tsx:171-173,244` (cerrar/abortar/excluir), `TransferView.tsx:106`.
- **Impacto:** en una PWA móvil o con guantes, `prompt` no permite elegir el criterio de parada definido, se cierra por error y no admite texto largo. En iOS PWA el comportamiento varía.
- **Recomendación:** un diálogo propio con lista de criterios de parada del procedimiento más texto libre, y botón «Detener» confirmable con pulsación larga.
- **Esfuerzo:** S · **Confianza:** alta.

**E-35 · Baja · Seeds DEMO**
- **Ubicación:** `scripts/demo-data/seed_startup_samples_demo.sql:23-24`; `seed_performance_demo.sql:68`.
- **Evidencia:** inserta directamente en `signal_samples` en lugar de pasar por la API v1 (§12.13 decía «como un PLC»). El seed de arranque borra **todos** los lotes `SIMULATOR` de la org, incluido el de desempeño.
- **Impacto:** la DEMO nunca ejercita la ingesta real (E-04, E-24) ni la carga a 1 Hz (E-03). Re-ejecutar un seed rompe el otro.
- **Recomendación:** un pequeño simulador (script Node) que haga POST a `/api/v1/signals/samples` a 1 Hz con una API key de la DEMO. Filtrar los DELETE por `source_system`.
- **Esfuerzo:** S · **Confianza:** alta.

**E-36 · Baja · Inconsistencias menores**
- `verify_lineup_item` permite `client` (`20261017210000:709`), pero `set_lineup_item` no. El regex numérico de `record_startup_event` no acepta coma (`:229`) y `add_startup_event_param` sí (`:254`). `saveProcedureRevision` usa `'operations'` por defecto como capacidad del hold (`startup.ts`) y la SQL usa `'commissioning'`. `update_procedure` acepta `p_kind` NULL y falla con un error de restricción poco claro.
- **Recomendación:** unificar.
- **Esfuerzo:** S · **Confianza:** alta.

**E-37 · Baja · `log_sync_conflict` y multi-org**
- **Ubicación:** `20261018093000:24-28`.
- **Evidencia:** `SELECT org_id FROM org_members WHERE user_id = v_user_id ORDER BY joined_at LIMIT 1`.
- **Impacto:** un usuario en dos orgs registra los descartes offline en la primera org a la que se unió, no en la del proyecto. Se pierde trazabilidad o se filtra metadato a la otra org.
- **Recomendación:** recibir `p_project_id` y derivar la org desde el proyecto, verificando pertenencia.
- **Esfuerzo:** S · **Confianza:** alta.

---

## 4. Propuestas estratégicas

1. **Capacidades de firma por persona y proyecto (E-02, E-25, E-01).** Es la base de credibilidad de F1, F6 y F7. Una tabla de «designaciones» (Comisionamiento, Operaciones, HSE, Representante del cliente, Autoridad de aislamiento) con vigencia, más un componente de firma con intención explícita y reautenticación. Con eso, «otra persona con la capacidad X» pasa a ser auditable y vendible frente a ICAPS u OperCom.
2. **Dossier de arranque vivo (E-05, E-22).** Un «Paquete de readiness del sistema» que reúna gates con firmas, procedimientos (vigente + verificado), ejecución (registro ejecutado), line-up, hitos con gráfico, PTC y el traspaso con excepciones, firmado de forma verificable (E-31). Es el entregable que el cliente paga; hoy está repartido en cinco pantallas.
3. **Capa IIoT seria (E-03, E-04, E-24, E-35).** RPC de series con reducción mín/máx, ingesta con alcance de proyecto y validación, simulador por API y prueba de carga a 1 Hz. Después, la **detección automática de hitos** (aplazada en §12.11): «primera rotación» cuando la velocidad pasa de X, «primer HC» cuando el caudal pasa de Y. Se proponen como borrador para que el testigo los confirme. Diferencia mucho frente a la competencia.
4. **Biblioteca de plantillas de procedimientos a nivel org o plataforma.** Hoy solo existe «copiar desde otro proyecto». Faltan plantillas por tipo de equipo (arranque de compresor, bomba, horno, PSV), con pasos parametrizados por tag (`{TAG}`) y con generación del line-up desde la plantilla. Se encaja con la matriz IA (sugerir procedimiento por tipo de equipo).
5. **SIMOPS y permisos de trabajo.** Durante el arranque conviven comisionamiento, construcción y operación. Un mínimo viable: zonas o sistemas «energizados / con HC» visibles en Control Tower y en el P&ID, y un aviso si hay permisos o registros F3 activos en el mismo sistema al iniciar una ejecución o un hito. Mejor integrar con el PTW del cliente que construir uno.
6. **Gestión de alarmas en arranque.** Registrar inundaciones de alarmas, alarmas inhibidas o shelved y bypasses de ESD (ya existen como registros F3 `bypass`) y mostrarlos en la ficha del hito y en el reporte diario. Como mínimo, permitir enlazar eventos libres de categoría `alarm` con señales y con el registro F3 del bypass.
7. **Zona horaria y hora de campo como dato de primera clase (E-15, E-27).** `projects.timezone`, `<LocalTime>`, y en cada registro de campo: hora de campo, hora de servidor y si hubo recorte.
8. **Paneles para sala de control.** Una vista «modo turno» de solo lectura y pantalla completa: ejecuciones en curso con hold actual, hitos pendientes de testigo, prueba de desempeño en curso con reloj y gráfico, y traspasos pendientes, con refresco por Realtime en lugar de `router.refresh()`. Hoy el operador navega por 4–5 pestañas.
9. **Menos pasos para el gerente de arranque.** Asistente «Preparar arranque del sistema X» que encadene: procedimiento vigente verificado → line-up generado desde el procedimiento → PSSR → gate de arranque → ejecución. Mostrar en cada paso qué falta, reutilizando `startup_prerequisites` y `ownership_checklist`.

---

## 5. Funcionamiento para el manual (paso a paso por rol)

Roles de la org: **owner, admin, architect, leader** (en el texto, «líder+»), **inspector**, **client**. «Otra persona» significa un usuario distinto, comprobado en la BD. Lo marcado con 📴 funciona sin red en la PWA instalada, siempre que la página se haya abierto antes con red.

### 5.1 Procedimientos (Arranque → Procedimientos)

| Paso | Quién | Cómo |
|---|---|---|
| 1. Crear | líder+ o inspector (no client) | «Nuevo procedimiento»: título, tipo (precomisionamiento, comisionamiento, arranque, parada, emergencia, operación normal) y sistema (opcional). Nace como PRC-0001 R0 en borrador. Alternativa: «Copiar desde otro proyecto», que crea una R0 con los tags emparejados por número. |
| 2. Redactar | cualquiera no-client | Llenar las 15 secciones (propósito … registros y anexos). Las vacías no salen en el PDF. En «Secuencia» se agregan pasos: acción, responsable, valor esperado, tag, criterio de parada y, si corresponde, «Hold point» con la capacidad que lo libera (Comisionamiento / Operaciones / HSE). Los pasos se reordenan con ↑/↓. Guardar. |
| 3. Enviar a revisión | cualquiera no-client | «Enviar a revisión». Exige al menos un paso; en R1 o posterior exige el motivo del cambio. |
| 4. Devolver o aprobar | líder+ distinto de quien creó y de quien envió | «Devolver» con motivo (vuelve a borrador) o «Aprobar». Al aprobar se calcula el hash y la revisión anterior queda reemplazada. |
| 5. Verificar en campo | no-client distinto de quien aprobó | Después del walkdown: «Verificado en campo» con descripción del recorrido. Lo exige el traspaso a Shadowing. |
| 6. Nueva revisión | no-client | «Nueva revisión» con motivo: copia la vigente a R+1 en borrador (solo una revisión abierta a la vez). |
| 7. PDF | todos | Botón PDF (por defecto la revisión vigente; también acepta `?rev=`). Los hold points llevan una línea de firma en papel. |

### 5.2 Ejecutar un procedimiento con hold points (Arranque → Ejecuciones)

1. **Iniciar** (no-client): desde el procedimiento aprobado, «Iniciar ejecución» (elegir sistema si el procedimiento no tiene uno). Número `PRC-0001-R1-E1`.
2. **Ejecutar paso a paso** (no-client) 📴: la tarjeta muestra el paso siguiente con tag, responsable, valor esperado y criterio de parada. Cargar el valor real y un comentario, y pulsar «✓ Hecho». Para «N/A» el comentario es obligatorio (no aplica a hold points). Sin red, el paso queda «Pendiente de sincronizar» y se envía en orden al volver la conexión.
3. **Hold point:** al marcar el paso de hold, la ejecución queda «En hold». **Liberar** lo hace *otra persona* con la capacidad del paso: Comisionamiento = líder+; Operaciones/HSE = líder+ o client. Requiere red. Aparece en *Mi trabajo → Hold points por liberar*. Hoy el comentario de quien libera reemplaza el del ejecutor (E-09).
4. **Detener** (no-client) 📴: «⛔ Detener» con el criterio de parada cumplido. Nunca se retiene en la bandeja.
5. **Reanudar** (líder+, con red): con motivo de por qué es seguro. Si había un hold pendiente, vuelve a «En hold».
6. **Completar** (no-client, con red): cuando todos los pasos están hechos, N/A o liberados. **Abortar** (líder+, con motivo).
7. **Bandeja «No sincronizado»:** si el servidor rechaza una captura (p. ej. otra persona detuvo la ejecución), queda en la bandeja con «Reintentar» o «Descartar» (deja rastro). Retiene los pasos posteriores de esa ejecución. ⚠️ Cierra la sesión solo con la bandeja vacía (E-01).

### 5.3 Hojas de line-up (Arranque → Line-ups)

1. **Crear** (no-client): sistema, título, propósito (arranque / prueba / otro), procedimiento vinculado (opcional) y «Generar filas», que agrega los tags de categoría «Válvulas» del sistema y marca como críticas las ESDV/XV/SDV/BDV/PSV.
2. **Borrador:** fijar la posición requerida de cada fila (abierta, cerrada, LO, LC, auto, manual, estrangulada, otra), nota, «crítica»; agregar tags o filas manuales. «Emitir» exige la posición requerida en todas las filas.
3. **Ejecutar en campo** (no-client) 📴: por fila, pulsar la posición encontrada. Volver a fijar una fila borra su verificación. Sin red se encola con compare-and-set: si otra persona cambió la fila, aparece «Conflicto» y el usuario elige «Aplicar la mía» o «Descartar».
4. **Verificación independiente** (otra persona; también puede el client; requiere red): «✓ Verificar» en las filas cuya posición coincide con la requerida. Las críticas lo exigen. Cola en *Mi trabajo → Filas por verificar*.
5. **Completar** (no-client, con red): todas alineadas y críticas verificadas → «Verificada» con hash. Reemplaza las verificadas anteriores del mismo sistema y propósito.
6. **Gate:** si el gate tiene «exige line-up» (/admin/gates), el criterio `lineup_verified` queda en verde con una hoja verificada vigente. Pasa a rojo («desactualizada») si un registro F3 del sistema (ciega, bypass, temporal, energización, restitución) cambia de estado después. Hoy cuenta una hoja de cualquier propósito (E-08).

### 5.4 Bitácora de arranque e hitos (Arranque → Bitácora)

1. **Registrar** (no-client): sistema, tipo (hito o libre) y código. Los hitos son primera energización, primera rotación, primer arranque, primer HC, primera operación estable y primer producto on-spec. Los libres son trip, alarma, desviación, parada y observación. Se cargan hora real (local), título, descripción, tags, ejecución vinculada y señales (sugeridas por el sistema). La BD congela la muestra más cercana dentro de ±5 min, prefiriendo calidad 0. Sin dato queda «IIoT sin dato» y se completa a mano. Se pueden agregar parámetros manuales.
2. **Bloqueo duro:** «primer arranque» y «primer HC» exigen el gate de arranque aprobado con todas sus firmas y el PSSR más reciente del sistema aprobado.
3. **Testigo** (otra persona): la primera energización y la primera rotación las atestigua Comisionamiento (líder+). Los demás hitos los atestigua Operaciones (líder+ o client). Cola en *Mi trabajo → Hitos por atestiguar*.
4. **Ficha:** gráfico de −30 a +30 min de cada señal, parámetros con desfase y calidad. Se pueden agregar parámetros hasta que el hito se atestigua.
5. **Anular** (líder+, con motivo). Un hito anulado se puede volver a registrar.
6. Los eventos del día salen en el **reporte diario**. En Control Tower se ve la franja de 6 hitos por sistema.

### 5.5 Readiness de operaciones y traspaso (Arranque → Operaciones)

1. **Personal** (no-client): alta de personas (nombre, empresa, cargo, turno; usuario opcional). No necesitan cuenta.
2. **Competencias** (líder+, o una persona de nivel 4 en el sistema; nunca uno mismo): en la matriz persona × sistema, «Evaluar»: nivel 0–4 (0 sin entrenamiento · 1 en entrenamiento · 2 con supervisión · 3 autónomo · 4 puede entrenar), tipo de evidencia, fecha y vencimiento. Vigente = la última evaluación; una vencida cuenta como 0.
3. **Umbral** (líder+): personas en nivel ≥ 3 requeridas por turno (por defecto 2).
4. **Repuestos y herramientas** (no-client): ítem, n.º de parte, tag, crítico, cantidades requerida/disponible, estado y ETA.
5. **Pedir traspaso** (cualquier miembro): en «Sistemas», «Pedir traspaso» a la etapa siguiente. La app muestra el checklist calculado:
   - Shadowing: procedimiento de arranque aprobado y verificado en campo, y personal de nivel ≥ 1.
   - Operación conjunta: gate de arranque, line-up verificado, primer arranque atestiguado y nivel ≥ 2.
   - Operaciones: nivel ≥ 3 por turno, repuestos críticos disponibles y sin punch Cat A abiertos.
   - Cada falta exige una justificación de ≥ 10 caracteres (excepción). La **reversión** a una etapa anterior no lleva checklist y exige motivo.
6. **Firmar** (dos personas distintas): Comisionamiento (líder+) y Operaciones (líder+ o client), en *Mi trabajo → Traspasos por firmar*. La segunda firma recalcula el checklist: si apareció una falta nueva sin excepción, falla y hay que cancelar y pedir de nuevo.
7. **Al completar el paso a Operaciones** se genera el paquete de handover del sistema (PDF + JSON con HMAC). Si falla, el detalle del traspaso ofrece «Generar paquete». Una reversión desde Operaciones deja el paquete como SUPERSEDED. ⚠️ El paquete todavía no incluye la evidencia de F6–F7 (E-05).
8. **Cancelar** un traspaso pendiente: quien lo pidió o un líder+, con motivo.

### 5.6 Prueba de desempeño hasta el PTC firmado (Arranque → Desempeño)

1. **Definir** (líder+): «Nueva prueba» con título y sistema principal → PTT-0001 R0. En el borrador:
   - 8 secciones (propósito, frontera, condiciones, método, correcciones, incertidumbre, referencias, responsabilidades).
   - Ajustes: estabilización (min), periodo formal (min), frecuencia de muestreo (s), cobertura mínima (%) y procedimiento de prueba.
   - Frontera de N sistemas.
   - Variables: clave A–Z, de **señal** (con su unidad), **manual** (lectura cada N min) o **derivada** (A op B).
   - Criterios: variable × estadístico (promedio, mín, máx, % del tiempo en banda, total) × condición (≥, ≤, entre) con objetivo e incertidumbre (abs o %).
   - Pares de medidores con diferencia máxima en %.
2. **Revisión:** enviar (≥ 1 criterio) → aprobar un líder+ distinto del autor y del remitente (hash). Un cambio posterior se hace con «Nueva revisión» y motivo.
3. **Intento** (líder+): «Nuevo intento» → PTT-0001/R1 (uno vivo por prueba).
   - «Iniciar estabilización» (hora real opcional: no futura, máximo 48 h atrás).
   - «Iniciar periodo formal»: antes del mínimo exige motivo.
   - Durante la prueba, cualquier no-client registra **perturbaciones** (ventana, tipo, descripción) y **lecturas manuales** (una por minuto por variable).
   - Un líder+ marca perturbaciones como «Excluir del cálculo» con motivo.
   - «Cerrar» (antes de la duración = cierre anticipado con motivo) congela los agregados de 1 minuto.
   - «Re-congelar» trae datos IIoT que llegaron tarde, hasta registrar el resultado. ⚠️ No usar pasados 90 días (E-17).
4. **Evaluación** (en vivo mientras está cerrado): cobertura, calidad, picos y unidad por variable; resultado por criterio (pasa / dentro de la incertidumbre / falla / no evaluable); pares; resultado sugerido.
5. **Registrar resultado** (líder+): aceptado / aceptado con desviación / repetir / falló / no concluyente. Apartarse de la sugerencia exige motivo. El intento queda **inmutable** con hash. «Falló» y «aceptado con desviación» crean una acción F5 automática. Cola en *Mi trabajo → Pruebas por decidir*.
6. **Certificado PTC:**
   - «Emitir PTC» (líder+) sobre un intento aceptado o aceptado con desviación. Quien emite firma como Comisionamiento.
   - Firman después **Operaciones** (líder+ o client) y **Cliente** (solo rol client), tres personas distintas. Cola en *Mi trabajo → PTC por firmar*.
   - Con las tres firmas → «Aceptado» con hash.
   - Revocar: líder+ con motivo.
   - Un intento posterior aceptado reemplaza el PTC anterior.
7. **Gate:** con «exige desempeño» en el gate (p. ej. PA), el criterio `performance_accepted` queda en verde cuando cada prueba cuyo sistema principal es ese sistema tiene un PTC aceptado. Los sistemas sin prueba ven «no aplica».
8. **PDF de 14 secciones** desde la consola del intento (cerrado o evaluado): identificación → aceptación, con gráficos y huellas sha256. Las horas aparecen en UTC.

### 5.7 Resumen por rol

- **owner/admin:** todo lo de líder, más borrar borradores ajenos (procedimientos, hojas, pruebas) y configurar en /admin/gates qué gate exige line-up o desempeño.
- **architect/leader:** aprobar procedimientos y definiciones; reanudar o abortar ejecuciones; liberar holds de cualquier capacidad; atestiguar cualquier hito; anular eventos; evaluar competencias y fijar umbrales; firmar traspasos como Comisionamiento u Operaciones; dirigir pruebas de desempeño, excluir perturbaciones, registrar resultados, emitir y revocar PTC y firmarlos como Operaciones.
- **inspector:** redactar y enviar procedimientos; verificar en campo; iniciar y ejecutar pasos; detener; crear, ejecutar y verificar line-ups; registrar eventos y parámetros; registrar personal y repuestos; pedir traspasos; registrar perturbaciones y lecturas manuales. **No** libera holds, no atestigua hitos y no firma traspasos ni PTC.
- **client:** solo lectura en casi todo. Puede liberar holds de Operaciones/HSE, verificar filas de line-up, atestiguar hitos de Operaciones, firmar traspasos y PTC como Operaciones, y firmar el PTC como **Cliente** (exclusivo). No ejecuta pasos ni registra eventos.
