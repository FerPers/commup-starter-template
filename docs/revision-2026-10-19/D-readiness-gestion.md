# Revisión D — Motor de readiness y gestión diaria

**Revisor:** D (gates/hold points, dependencias, registros, Mi trabajo, gestión diaria, planificación, reporte diario, relevo, KPIs, crons)
**Fecha:** 2026-10-19 · **Método:** solo lectura estática de migraciones, RPC, server actions, páginas y libs. Sin BD ni servidor. Cada hallazgo indica su confianza (alta = verificado en el código; media = inferido del código sin medir).

---

## 1. Resumen (franco)

El motor de readiness es la parte más ambiciosa y mejor pensada del producto: la lógica vive en SQL, la escritura va solo por RPC `SECURITY DEFINER` con reglas de «otra persona», hay evidencia inmutable, snapshot de criterios al aprobar, multifirma y criterios implícitos que cruzan F2–F8. Como modelo conceptual está por encima de lo que ofrecen ICAPS o WinPCS.

Hay tres problemas de fondo que hoy le restan credibilidad frente a un gerente de comisionamiento real:

1. **La pantalla principal no cuenta la misma historia que el motor.** En Control Tower, la columna «bloqueo principal» y la barra de avance salen del motor viejo (`compute_system_readiness`, todas las fases mezcladas), no de los gates. Al lado hay tres cifras de avance que no cuadran entre sí ni con la página de KPIs. Es justo el «dashboard que engaña» del que advierte el libro.
2. **El motor es pasivo.** No avisa cuando un gate queda listo para aprobar, cuando falta una co-firma, cuando un gate regresa, ni cuando hay un registro por autorizar o verificar. Tampoco hay colas para eso en Mi trabajo. Quien no abra cada sistema no se entera. Las firmas de Operaciones y HSE las puede dar cualquier líder (la capacidad la declara quien firma), así que la independencia que exige el libro existe solo en papel.
3. **Hay errores de corrección silenciosos en datos que se firman o se reportan:** el día del reporte diario va en UTC (en Colombia el corte cae a las 19:00), el reporte inmutable cuenta «30 ITR aprobados» cuando fueron 200 (LIMIT 30 + `.length`), el snapshot KPI se corta en 1000 filas, y una regresión de un sistema proveedor (por ejemplo, aire de instrumentos) no bloquea a sus dependientes.

Además, la definición vigente de `compute_system_gates`, `my_work_counts`, `daily_report_data` y `take_mgmt_snapshot` **ya no existe completa en el repo**: se armó con parches `replace()` sobre `pg_get_functiondef`. Revisarla o compararla con el TS exige reconstruirla a mano.

El rendimiento a escala industrial (300+ sistemas, 50k tags) no está resuelto: la matriz recalcula todo en cada carga, en tres RPC que se solapan.

**Veredicto:** sirve para la demo de Geopark tal como está. Para un proyecto real de 6–12 meses con 20+ usuarios faltan cuatro cosas: notificaciones con colas, designación de firmantes, zona horaria y un Control Tower coherente y con filtros.

**Conteo:** 0 críticas · 9 altas · 18 medias · 11 bajas (38 hallazgos).

---

## 2. Fortalezas

- **Una sola fuente de verdad en SQL** para gates (`compute_system_gates`), avance ponderado (`compute_system_progress`) y datos del reporte (`daily_report_data`). La IA solo redacta sobre datos congelados: es correcto y defendible ante el cliente.
- **Escritura solo por RPC** con `FOR UPDATE`, numeración atómica (`mgmt_next_seq` con advisory lock), «otra persona» en acciones, registros, relevos, co-firmas, hold points y line-up. Todo con línea de tiempo (`mgmt_events`, `register_events`, `system_gate_plan_events`).
- **Snapshot de evidencia al aprobar** (`system_gate_approvals.evidence` guarda los criterios evaluados) y estado `regressed` cuando un gate aprobado vuelve a rojo: aplica literalmente «progress by evidence».
- **Criterios implícitos componibles:** dependencias, registros, restricciones, line-up, desempeño y documentos se agregan sin que la org tenga que configurarlos. Es la arquitectura «motor + bloqueos» del §3 del plan.
- **Evidencia inmutable** (`gate-evidence`, `mgmt-evidence` sin UPDATE/DELETE) con rutas validadas en servidor (`attest_gate_criterion` comprueba prefijo y existencia del objeto).
- **Dependencias sin ciclos** con advisory lock por proyecto (`guard_system_dependency`) y límites congelados con auditoría.
- **Planificación forecast vs compromiso** con historial y motivo obligatorio al cambiar el compromiso: es exactamente 7.62.
- **Reporte diario** con emisión inmutable, hash sha256, revisiones R1… y PDF regenerado desde datos congelados.
- **Lógica pura con tests** (`gates.ts`, `planning.ts`, `queues.ts`, `report.ts`, `catalog.ts`) y tests de BD escritos (aunque no corren en CI).

---

## 3. Hallazgos

Formato: **ID · Severidad · Categoría** — Ubicación — Evidencia — Impacto — Recomendación — Esfuerzo — Confianza.

### ALTA

**D-01 · Alta · Coherencia SQL↔UI / UX** — Control Tower: «bloqueo principal» y barra de ITR vienen del motor viejo
- **Ubicación:** `src/app/(dashboard)/control-tower/page.tsx:110,258,275,309`; `supabase/migrations/20261012180000_readiness_gates_engine.sql:154-157,209-218`
- **Evidencia:** `rows = compute_project_readiness(...)`; `const topBlocker = r.blockers[0]`. Ese RPC cuenta los ITR **de todas las fases** del sistema (`itrs JOIN subsystems … WHERE ss.system_id`) y solo conoce los bloqueos `no_subsystems/no_itrs/itrs_incomplete/punch A/B`.
- **Impacto:** un sistema con MC aprobado y RFC listo muestra como bloqueo «faltan 140 ITR» (los de RFSU). Nunca aparecen los bloqueos propios del readiness: dependencias, registros (bypass, ciegas), restricciones N4, line-up, desempeño. Contradice el badge que está al lado (7.63: «Listo para HC: NO — LCV-201…»). Además, si `compute_project_readiness` falla, la matriz queda vacía aunque los gates estén bien.
- **Recomendación:** derivar la fila de `compute_project_gates`: «siguiente gate no aprobado» y su primer criterio en `fail` (con texto y enlace). Quitar `compute_project_readiness` de la página.
- **Esfuerzo:** M · **Confianza:** alta

**D-02 · Alta · Lógica de gates** — La regresión no se propaga al gate siguiente ni a los sistemas dependientes
- **Ubicación:** `20261017210000_startup_procedures_lineups.sql:904` (`ok = sa.status IN ('approved','approved_with_conditions')`) y `:1117` (`v_prev_ok := v_appr IS NOT NULL AND status <> 'pending_signatures'`); `src/lib/systems/dependencies.ts:88` (trata `regressed` como OK).
- **Evidencia:** un gate en estado `regressed` conserva una aprobación vigente, así que `previous_gate` y `dependencies_ready` dan `pass`.
- **Impacto:** si el aire de instrumentos (U-100) regresa en «Utility Ready» por un Cat A en el compresor, los sistemas de proceso que dependen de él siguen mostrando la dependencia cumplida y se puede aprobar su RFSU. Es un verde falso en un punto de seguridad (7.59). El §7.1 solo contempló la revocación, no la regresión.
- **Recomendación:** tratar `computed_level='red'` del proveedor o del gate anterior como `fail`, o como mínimo `warn` con texto «proveedor en regresión», configurable por org. Mantener TS y SQL alineados.
- **Esfuerzo:** S · **Confianza:** alta

**D-03 · Alta · Gobernanza / independencia de firmas** — Las co-firmas de Operaciones y HSE no están ligadas a personas designadas
- **Ubicación:** `20261012200000_gate_cosignatures.sql:13-14` (default `cosign_roles = owner, admin, architect, leader, client`), `:418-429` (la capacidad la declara quien firma); `20261017210000:209-211` (`hold_release_roles('operations') = hold_release_roles('hse')`).
- **Evidencia:** `sign_system_gate(p_capacity)` solo verifica que el rol del usuario esté en `cosign_roles` y que la persona sea distinta.
- **Impacto:** dos líderes del contratista pueden firmar un RFSU como «Operaciones» y como «HSE». En una auditoría de PSSR/arranque con Ecopetrol o Geopark, esa firma no prueba nada. Lo mismo ocurre con los hold points y los testigos de hitos.
- **Recomendación:** agregar una designación por proyecto o sistema de quién firma en cada capacidad (tabla `project_signatories(capacity, user_id | company_id)`), aprovechando las empresas de F8 (Operaciones = empresa operadora). La RPC debe exigir esa designación. Mientras tanto, mostrar la empresa del firmante en rojo cuando coincide con la de Comisionamiento.
- **Esfuerzo:** M · **Confianza:** alta

**D-04 · Alta · Notificaciones / flujo** — El motor de readiness no notifica nada y no tiene colas propias
- **Ubicación:** `src/app/actions/gates.ts` (sin `notifications`), `src/app/actions/daily.ts`, `registers.ts`, `planning.ts`, `daily-report.ts` (la búsqueda de `notifications` no aparece en ninguno); `my_work_counts` (sin claves de gates ni de registros); `inbox/InboxList.tsx:13-27` (`KIND_LABELS` no tiene tipos de readiness salvo `constraint_overdue`). El §13.2 lo reconoce como pendiente.
- **Impacto:** nadie se entera de que un gate quedó listo, de que falta su co-firma (el gate `pending_signatures` no habilita al siguiente y puede quedar parado días), de que un gate regresó, de un registro por autorizar o verificar (bypass, ciega), de una acción asignada o hecha por verificar, de un TQ respondido o de un reporte por emitir. Solo existe el cron de restricciones vencidas. En la práctica, el flujo de «otra persona» depende de que alguien lo pida por WhatsApp.
- **Recomendación:** emitir `domain_events` desde las RPC (o con triggers) y reutilizar `push-dispatch`. Agregar colas `gates_to_approve`, `gates_to_sign`, `gates_regressed`, `registers_to_authorize`, `registers_to_verify` y `tq_answered` a `my_work_counts` y a `/my-work`.
- **Esfuerzo:** M–L · **Confianza:** alta

**D-05 · Alta · Corrección (zona horaria)** — El «día» de reportes, KPIs y vencimientos se calcula en UTC
- **Ubicación:** `20261017180000_daily_report_handover.sql:90` (`v_from := p_date::timestamptz`), `:272`, `:458` (`current_date`); `take_mgmt_snapshot` (`p_date - 30`); `src/lib/daily/report.ts:83` (`occurred_at.slice(11,16)`); `api/cron/constraints-overdue/route.ts` (`today` en UTC). No existe ninguna columna `timezone` en el esquema (búsqueda sin resultados).
- **Impacto:** para Colombia (UTC−5), el reporte del día D cubre de 19:00 del D−1 a 19:00 del D. Lo que pasa en el turno de tarde/noche cae en el reporte del día siguiente. Desde las 19:00, `current_date` ya es «mañana» (vencimientos, relevos, reporte por defecto). Las horas de los eventos de arranque llegan a la IA en UTC. El reporte inmutable queda con datos corridos.
- **Recomendación:** agregar `projects.timezone` (por defecto `America/Bogota`) y calcular `v_from = (p_date::timestamp AT TIME ZONE tz)`. Pasar la zona a todas las RPC de fecha y a `reportFacts`.
- **Esfuerzo:** M · **Confianza:** alta

**D-06 · Alta · Corrección de datos firmados** — El reporte diario inmutable reporta cifras truncadas a 30
- **Ubicación:** `20261017180000:127-134` (`approved_today … LIMIT 30`), `:138-144` (`raised_today LIMIT 30`), `actions.overdue LIMIT 30`, `registers_in_field LIMIT 30`; `src/lib/daily/report.ts:65,67,75,77` (`${d.itrs.approved_today.length} aprobados hoy`).
- **Evidencia:** el JSON no trae el total, solo la lista recortada, y los hechos de la IA usan `.length`.
- **Impacto:** en un día de 200 ITR aprobados, el reporte emitido (con sha256) dice «30 aprobados hoy». Lo mismo con punch levantados, acciones vencidas y registros en campo. La regla «la IA no inventa cifras» se cumple, pero la cifra está mal en origen.
- **Recomendación:** devolver `{count, items (LIMIT 30)}` por bloque y usar `count` en los hechos y en el PDF.
- **Esfuerzo:** S · **Confianza:** alta (lista y hechos). Media en que el PDF reproduzca el error (no revisé `src/lib/pdf/daily-report.ts`).

**D-07 · Alta · Rendimiento a escala** — La matriz se recalcula completa en cada carga, con cálculo redundante y sin índices clave
- **Ubicación:** `control-tower/page.tsx:109-115` (3 RPC en paralelo: `compute_project_readiness`, `compute_project_gates`, `compute_project_progress`, que repiten `system_phase_level` y conteos de ITR); `compute_project_gates` → `compute_system_gates` por sistema × gate, con unas 10 subconsultas por gate, `lineup_is_stale()` dos veces por hoja y subconsultas correlacionadas por tag crítico; las mismas RPC se llaman en `daily/lookahead/page.tsx:22` y en cada `refresh` del reporte (`daily_report_data` → `compute_project_gates`); `my_work_counts` corre en **cada navegación** (`(dashboard)/layout.tsx:83`) con unas 20 subconsultas a nivel de org. Faltan índices en `punches(tag_id)`, `certificates(subsystem_id, phase_id)` y `pssr_reviews(system_id)` (no aparecen en las migraciones).
- **Impacto:** con 300 sistemas × 6 gates salen unas 1.800 evaluaciones y más de 15.000 consultas bajo RLS en modo invoker. La prueba de carga del 09-03 ya midió 5–7 s solo en conteos con RLS. Lo esperable es que Control Tower y el look-ahead tarden decenas de segundos, o lleguen al timeout del Worker, en el proyecto real.
- **Recomendación:** (a) materializar el estado por sistema × gate en `system_gate_status`, recalculado por triggers que marcan el sistema «sucio» más un worker o cron, o al menos cachear por sistema con un `updated_at`; (b) eliminar la RPC duplicada; (c) crear los índices; (d) llevar `my_work_counts` a contadores incrementales o cachearlo 60 s.
- **Esfuerzo:** L · **Confianza:** media (no medido)

**D-08 · Alta · KPIs** — El snapshot KPI (cron y «Tomar snapshot») se corta en 1000 filas
- **Ubicación:** `src/app/api/cron/snapshot/route.ts:50-53`; `src/app/actions/kpi-snapshots.ts:124-125` (`.from('itrs').select(...).eq('project_id', pid)` sin paginar; existe `src/lib/list/fetch-all.ts` pero no se usa).
- **Impacto:** en proyectos con más de 1000 ITR o punch, `completion_pct`, los Cat A/B abiertos y las curvas por fase del `KpiDashboard` (y los chips delta) quedan mal y además con fecha. `take_mgmt_snapshot`, que es SQL, sí está bien: los dos dashboards de la misma página muestran números incoherentes.
- **Recomendación:** mover este snapshot a SQL (una RPC con agregados) o usar `fetch-all`.
- **Esfuerzo:** S · **Confianza:** alta (el límite por defecto de PostgREST es 1000 y está documentado en la memoria del proyecto)

**D-09 · Alta · Mantenibilidad** — Las funciones centrales solo existen como parches de texto
- **Ubicación:** `20261019150000_performance_results.sql:636-663` (inserta un criterio con `replace()` en `pg_get_functiondef`), `:666-695` (`my_work_counts`), `:698-722` (`daily_report_data`); `20261021120000_companies_documents.sql:603-647`; `20261021130000_documents_current_only_when_outdated.sql` (dos parches más sobre el resultado del anterior). Los parches de `take_mgmt_snapshot` en `20261020120000` y `20261023120000` siguen el mismo patrón.
- **Impacto:** la última definición completa en el repo (`20261017210000:829-1121`) ya no es la que corre. Para revisar `compute_system_gates` hay que aplicar cuatro parches de memoria. Un cambio de espacios en un ancla rompe la migración, el diff entre versiones no se puede leer, el baseline queda obsoleto y crece el riesgo de desalinearse con `gates.ts`, `dependencies.ts` y `planning.ts`.
- **Recomendación:** emitir una migración «canónica» con el `CREATE OR REPLACE` completo de estas cuatro funciones, partir `compute_system_gates` en funciones por criterio (`gate_crit_registers(system, gate)`…) y agregar un test que compare `pg_get_functiondef` con un archivo `supabase/functions-sql/*.sql`.
- **Esfuerzo:** M · **Confianza:** alta

### MEDIA

**D-10 · Media · Decisión §15.4 incumplida** — `documents_current` no afecta a gates aprobados y se aplica a todos los gates
- **Ubicación:** `20261021120000:613-646` (sin filtro por gate ni fase); `status := CASE WHEN v_appr IS NOT NULL AND v_level='red' THEN 'regressed' WHEN v_appr IS NOT NULL THEN v_appr->>'status'…` (`20261017210000:1107-1113`).
- **Impacto:** la decisión dice que el gate pasa a amarillo hasta que alguien revise. Pero un gate aprobado sigue verde en la matriz, porque el amarillo solo cambia `computed_level`. A la vez, una referencia superada en un procedimiento de arranque pone en amarillo MC, RFPC y RFC (si no están aprobados) y obliga a escribir condiciones en todos. Además, el ITR se une por `tag_id`, así que un ITR sin tag (lazo o C&E) no se detecta.
- **Recomendación:** agregar el estado `approved_needs_review` (o un indicador «⚠ condición nueva» en el badge cuando `approval && computed_level='yellow'`), filtrar por la fase del ITR o del gate, y unir por `subsystem_id`.
- **Esfuerzo:** S–M · **Confianza:** alta

**D-11 · Media · Coherencia SQL↔SQL** — El criterio PSSR del gate y los prerrequisitos de arranque usan reglas distintas
- **Ubicación:** `20261017210000:1016-1023` (`ORDER BY (pr.status='approved') DESC, created_at DESC`: vale cualquier PSSR aprobado, aunque sea viejo) frente a `20261018120000_startup_event_log.sql:125` (`ORDER BY created_at DESC LIMIT 1`: tiene que estar aprobado el más reciente).
- **Impacto:** si el PSSR-002 fue rechazado o está en curso y el PSSR-001 está aprobado, el RFSU sale verde y aprobable, pero «primer arranque» queda bloqueado. Es un dashboard que engaña.
- **Recomendación:** una sola función `system_pssr_status(system)` con la regla «más reciente» y usarla en ambos lados.
- **Esfuerzo:** S · **Confianza:** alta

**D-12 · Media · Practicidad** — «Aprobado con condiciones» no tiene seguimiento
- **Ubicación:** `approve_system_gate` (`20261012200000:340-363`): las condiciones se guardan como lista de textos en `conditions jsonb`.
- **Impacto:** el libro (16.48) habla de condiciones registradas y cerradas. Acá no tienen dueño, fecha ni estado, no generan acciones ACC y nada indica cuándo se cumplieron. El gate queda «con condiciones» para siempre.
- **Recomendación:** crear una acción ACC por condición (origen `gate`) y mostrar en el badge las condiciones abiertas; opcionalmente, exigirlas cerradas para el gate siguiente.
- **Esfuerzo:** M · **Confianza:** alta

**D-13 · Media · Lógica / ruido** — Un Cat A nuevo regresa a la vez todos los gates aprobados del sistema
- **Ubicación:** `system_phase_level` (`20261012180000:53-60`): los punch Cat A se cuentan sin fase; `critical_tags_ready` usa punch A/B sin fase.
- **Impacto:** un Cat A levantado durante la puesta en marcha deja «↺» en MC, RFPC, RFC y RFSU al mismo tiempo. La historia de MC (ya certificado) se ve deshecha y la matriz se llena de rojos idénticos. Por D-02, además, no bloquea a los dependientes.
- **Recomendación:** que Cat A bloquee solo el siguiente gate no aprobado, o que la regresión de gates anteriores sea configurable por org («Cat A regresa gates aprobados: sí/no»).
- **Esfuerzo:** S · **Confianza:** alta

**D-14 · Media · Gobernanza** — Cualquier inspector puede desbloquear un gate desescalando o moviendo una restricción
- **Ubicación:** `escalate_constraint` (`20261017120000:567-590`, solo excluye al rol `client`); `update_constraint` (`:548-552`: cambia `gate_id` y `need_date` sin motivo); `transition_constraint` (`resolved → closed` sin «otra persona»); `src/app/actions/daily.ts:191,215,229` (sin `role:`).
- **Impacto:** una restricción N4 bloquea el gate, y un inspector puede bajarla a N1 (con motivo) o quitarle el gate (sin motivo; queda solo «updated» en la línea de tiempo) para liberarlo. La escalera 1–4 (equipo, gerente de comisionamiento, gerente de proyecto, cliente) pierde sentido si cualquiera desescala.
- **Recomendación:** desescalar desde N≥3 o cambiar el `gate_id` de una restricción abierta solo líder o superior y con motivo; cerrar con «otra persona» distinta de quien resolvió.
- **Esfuerzo:** S · **Confianza:** alta

**D-15 · Media · Integridad de KPIs** — Fecha de vencimiento y método de verificación de acciones editables sin motivo
- **Ubicación:** `update_action` (`20261017120000:374-417`); el KPI `on_time_30d` usa la `due_date` vigente (`take_mgmt_snapshot`).
- **Impacto:** mover la fecha borra el atraso del KPI «acciones a tiempo». Cambiar el método a `review` evita la evidencia obligatoria al cerrar. Cualquier no-client puede hacer las dos cosas.
- **Recomendación:** guardar `original_due_date` y medir contra ella (o exigir motivo y registrar el cambio como `replanned`); bloquear el cambio de método una vez la acción está `in_progress`, o reservarlo a líder o superior.
- **Esfuerzo:** S · **Confianza:** alta

**D-16 · Media · Gobernanza** — Decisiones «inmutables» que cualquier no-client registra a nombre de otro y puede reemplazar
- **Ubicación:** `record_decision` (`20261017120000:804-868`): `p_decided_by` es libre (cualquier miembro de la org) y `p_supersedes_id` reemplaza cualquier decisión vigente.
- **Impacto:** un inspector puede registrar «DEC-0042 decidida por el sponsor del cliente» o dejar sin efecto una decisión del gerente. El log de decisiones (7.51) pierde valor probatorio.
- **Recomendación:** que registren y reemplacen solo líderes o superiores; mostrar «registrada por X a nombre de Y»; opcionalmente, que la persona nombrada confirme.
- **Esfuerzo:** S · **Confianza:** alta

**D-17 · Media · KPI sesgado** — El cumplimiento de compromisos solo cuenta éxitos
- **Ubicación:** `take_mgmt_snapshot`, bloque `commitments` (`20261017150000:300-307`).
- **Evidencia:** `FROM system_gate_approvals a JOIN system_gate_plans … WHERE a.approved_at in window`.
- **Impacto:** un compromiso vencido sin aprobación no entra al denominador, así que el KPI tiende al 100 %. Además mide `approved_at` (firma de Comisionamiento), y las co-firmas pueden llegar dos semanas después y el gate igual cuenta «a tiempo».
- **Recomendación:** denominador = compromisos con fecha dentro de la ventana; a tiempo = gate con todas las firmas (`status` final) en o antes del compromiso. Guardar `completed_at` en la aprobación al completar las firmas.
- **Esfuerzo:** S · **Confianza:** alta

**D-18 · Media · Coherencia de métricas** — Tres o cuatro «avances» distintos que no cuadran entre pantallas
- **Ubicación:** `control-tower/page.tsx:138-140` (promedio simple del % de ITR por sistema y ponderado por cantidad de ITR) y `:275-278` (barra = todas las fases); `projects/[id]/kpis/page.tsx` (% por fase por conteo, ponderado en vivo y «gates aprobados» de `compute_project_progress`, que **excluye los gates sin fase**: `WHERE rg.phase_id IS NOT NULL`, `20261017150000:113`). Control Tower, en cambio, cuenta todos los gates activos.
- **Impacto:** el gerente ve «64 % ITR», «41,2 % ponderado» y «gates 3/14» en Control Tower, y «gates 3/12» en KPIs. No sabe cuál reportar.
- **Recomendación:** dos números canónicos, «avance físico ponderado» y «readiness (gates aprobados / totales)», calculados por la misma RPC y con la misma definición de gates en todas partes. Quitar el promedio simple.
- **Esfuerzo:** S · **Confianza:** alta

**D-19 · Media · UX / sobrecarga** — Control Tower sin filtros, orden, búsqueda, paginación ni exportación
- **Ubicación:** `control-tower/page.tsx:241-317`.
- **Impacto:** con 200 o más sistemas queda una tabla larga con 8 columnas y de 6 a 8 badges por fila. No se puede filtrar por área, tipo, prioridad o estado del siguiente gate, ni ver solo los bloqueados, ni ordenar por fecha comprometida, ni exportar para la reunión. La columna Punch C es ruido (Cat C nunca bloquea, §6.1). El selector arranca en el primer proyecto por código en vez del proyecto actual (el sidebar ya lo guarda en `localStorage`). En el detalle del sistema se muestran todos los gates expandidos con todos sus criterios (hasta unos 12 por gate × 6), los aprobados incluidos: hay mucho scroll.
- **Recomendación:** filtros en la URL (área, tipo, prioridad, estado, «solo con bloqueo», «comprometido en ≤ 30 d»), orden por riesgo, «modo reunión diaria» (sistemas que cambiaron desde ayer), Excel, y en el detalle colapsar los gates aprobados y abrir el siguiente.
- **Esfuerzo:** M · **Confianza:** alta

**D-20 · Media · Configuración retroactiva sin auditoría** — Cambios en `/admin/gates` reescriben el pasado
- **Ubicación:** `src/app/actions/gates-admin.ts:108-163,246-265` (sin `logActivity`); `GatesAdminView.tsx:198` (quitar criterio sin confirmación); FK `system_gate_attestations.criterion_id … ON DELETE CASCADE` (`20261012180000:309`); `sign_system_gate` exige `p_capacity = ANY(required_signatures)` (`20261012200000:418`).
- **Impacto:** (a) borrar un criterio `manual_attestation` borra en cascada todas las declaraciones con evidencia de todos los sistemas; (b) quitar una firma requerida deja las aprobaciones en `pending_signatures` sin forma de completarse; (c) volver un criterio no bloqueante o desactivar un gate cambia el estado de todos los sistemas y no queda rastro de quién lo hizo ni cuándo.
- **Recomendación:** registrar en `activity_log` todo cambio de configuración; borrado lógico de criterios; al quitar firmas, recalcular o completar las aprobaciones pendientes; pedir confirmación con el impacto («afecta a N sistemas, M declaraciones»).
- **Esfuerzo:** S–M · **Confianza:** alta

**D-21 · Media · Gobernanza de evidencia** — Declaraciones revocables sin motivo ni log, incluso después de aprobar
- **Ubicación:** `revoke_gate_attestation` (`20261012180000:836-852`; solo exige `is_project_editor`); `src/app/actions/gates.ts:126-139` (sin `logActivity`); la UI la oculta tras aprobar (`SystemGatesView.tsx:383`), pero la RPC lo permite.
- **Impacto:** un editor puede retirar la evidencia de otro y regresar un gate aprobado sin dejar motivo. Además, quien declara puede ser quien aprueba: no hay independencia entre declaración y aprobación.
- **Recomendación:** motivo obligatorio, `activity_log`, bloquear la revocación si el gate está aprobado (que el camino sea revocar la aprobación) y opcionalmente exigir «otra persona» entre quien declara y quien aprueba.
- **Esfuerzo:** S · **Confianza:** alta

**D-22 · Media · Seguridad operativa (registros F3)** — Bypass y temporales sin vencimiento vigilado, validación solo en la app
- **Ubicación:** `src/lib/registers/catalog.ts:57` (`planned_removal`), `:87` (`max_duration_hours`, opcional); no hay cron de registros (`src/app/api/cron/` no tiene ninguno); `transition_register_item` (`20261015200000:281-344`) reemplaza `data` completo con `p_data` sin validar campos por estado (lo dice la cabecera: «Los campos por tipo se validan en la app»).
- **Impacto:** un bypass de una protección puede pasar semanas activo sin aviso (16.34). Un cliente de API o un script puede autorizar un bypass sin `protection_function`, o cambiar `result` de un test pack de `rejected` a `accepted` en la misma transición (la verificación de rechazo usa el `v_data` nuevo).
- **Recomendación:** cron diario de bypass que excedieron su duración y temporales vencidos, con notificación al dueño y a quien autorizó; validar en la RPC los campos obligatorios por estado (reflejar el catálogo en SQL como en `procedure_section_keys()`); impedir cambiar `result` una vez registrado.
- **Esfuerzo:** M · **Confianza:** alta

**D-23 · Media · Mi trabajo** — Colas a nivel de org que inflan el badge y conteos que no coinciden con las listas
- **Ubicación:** `my_work_counts` (`handovers_to_receive`, `actions_verify`, `punches_verify`, `performance_to_decide`: todas las del org para cada usuario); `src/lib/my-work/queues.ts:83-88` (el badge suma relevos, holds y PTC); `my-work/page.tsx:262-264` (`personalTotal` omite `punches_review`, que el badge sí suma para supervisores); en holds la RPC filtra `r.status IN ('at_hold','stopped')` y la lista no (`page.tsx:156-162`, filtra solo por capacidad).
- **Impacto:** en un proyecto con 30 usuarios, cada relevo entregado suma 1 al badge de todos. La cifra del encabezado y la del sidebar difieren. Hay hasta 18 chips sin agrupar por tipo de tarea. Faltan las colas que importan (D-04).
- **Recomendación:** relevos con destinatario o por turno o área (ver D-34); agrupar chips en «Ejecutar / Verificar / Firmar / Decidir»; un solo cálculo de total (usar `badgeTotal` también en la página); mismos filtros en RPC y lista.
- **Esfuerzo:** S–M · **Confianza:** alta

**D-24 · Media · Escala de gestión diaria** — Listas cortadas en 1000 y sin operaciones masivas
- **Ubicación:** `projects/[id]/daily/page.tsx:24-35` (`order('seq', desc).limit(1000)` en las 4 tablas); `DailyView.tsx:81-105` (KPIs calculados en el cliente sobre lo cargado).
- **Impacto:** con PSSR que generan acciones automáticas (un ítem «no» = 1 ACC), un proyecto grande pasa de 1000 acciones. Las primeras que desaparecen son las más antiguas, que suelen ser las abiertas y vencidas, y los KPIs del hub quedan mal. Tampoco se puede reasignar en lote (cuando alguien sale del proyecto), verificar varias, filtrar por sistema, área o responsable, ni cerrar en bloque las acciones de una reunión.
- **Recomendación:** paginar y filtrar en servidor (como Sprint E con ITR y punch), KPIs con SQL, selección múltiple con «reasignar / cambiar fecha (con motivo) / verificar».
- **Esfuerzo:** M · **Confianza:** alta

**D-25 · Media · UX de aprobación** — Ni la aprobación ni la revocación muestran su impacto aguas abajo
- **Ubicación:** `SystemGatesView.tsx:146-151` (`window.prompt` para revocar), `:609-612` (aprobar con un clic).
- **Impacto:** revocar el MC de un sistema deja en `regressed` sus RFPC, RFC y RFSU y a sus dependientes, y nada lo advierte antes. Aprobar un hold point formal no tiene pantalla de confirmación con resumen de lo que se firma.
- **Recomendación:** diálogo con «esto afectará: RFC, RFSU de este sistema; U-100 → P-200, P-300» y un resumen de lo firmado (criterios, condiciones).
- **Esfuerzo:** S · **Confianza:** alta

**D-26 · Media · Practicidad del look-ahead** — No muestra qué bloquea cada gate en riesgo
- **Ubicación:** `daily/lookahead/page.tsx:22-37`, `LookaheadView.tsx:58-80`.
- **Impacto:** el look-ahead marca «en riesgo» pero no dice por qué (criterio que falla, restricción o dependencia), y en la reunión hay que abrir cada sistema. No hay ventana diaria (7.12 dice 90/30/7/diario). Para obtener solo el estado se calcula `compute_project_gates` completo.
- **Recomendación:** traer el `failing` (y el primer criterio que falla) en la celda; ventana de 1 día; reutilizar el estado materializado de D-07.
- **Esfuerzo:** S · **Confianza:** alta

**D-27 · Media · KPIs** — La curva S no tiene línea base y el snapshot queda con la fecha del día siguiente
- **Ubicación:** `ReadinessKpis.tsx:44,93-104` (solo `weighted_pct` real); `.github/workflows/cron.yml` (`0 2 * * *` = 21:00 en Colombia, con `today` en UTC).
- **Impacto:** una curva S sin plan no sirve para controlar (7.23). El punto del 19-oct (21:00 local) queda etiquetado 20-oct, lo que corre la curva y los deltas un día.
- **Recomendación:** línea plan derivada de forecast y compromiso por gate × peso (los datos ya existen); cron a las 05:00 UTC o snapshot con la fecha local del proyecto (D-05).
- **Esfuerzo:** M · **Confianza:** alta

### BAJA

**D-28 · Baja · Robustez** — «Rehacer con IA» borra y escribe en dos RPC no atómicas (`daily-report.ts:116-123`). Si la segunda falla (por ejemplo, otro usuario emitió el reporte entre medio), se pierden las ediciones. Usar un solo RPC `replace_with_ai_draft`. S · alta.

**D-29 · Baja · Corrección** — Un reporte de fecha pasada mezcla el estado actual: avance ponderado, gates en regresión, abiertos por nivel y relevos (`daily_report_data`: `compute_project_progress` y `compute_project_gates` actuales). Rotular «estado al momento de generar» o usar snapshots. S · alta.

**D-30 · Baja · Practicidad** — El relevo de turno es por proyecto, sin destinatario ni área o disciplina (`open_shift_handover`, `accept_shift_handover`). Lo recibe cualquier no-client y entra en el badge de todos. Agregar `area_id/discipline`, destinatario sugerido y equipo de turno. M · alta.

**D-31 · Baja · Redundancia** — El catálogo de gates opcionales trae declaraciones manuales que ya están automatizadas («Line-up verificado… sin bypasses activos» en PROC-INTRO, `src/lib/constants/readiness-gates.ts`), que hoy cubren `lineup_verified` y `registers_clear`. Los gates nuevos se agregan al final del orden (`nextOrder` = máximo + 10) con `requires_previous=false`, así que UTILITY queda después de RFSU. S · alta.

**D-32 · Baja · Seguridad** — `approve_system_gate` y `sign_system_gate` validan el rol en la org, no la pertenencia al proyecto, y la evaluación interna corre como definer, sin RLS (`20261012200000:319-333`). El guard de `withAuth` solo comprueba que el proyecto sea de la org. Usar `register_caller_role(project)` como las RPC de F3 y F5. S · media.

**D-33 · Baja · Roles incoherentes** — Aprobar un gate está reservado por defecto a owner, admin y architect, pero co-firmar puede leader o client, comprometer fechas leader o superior, y autorizar bypass leader o superior (`20261012180000:257`, `20261012200000:14`). El líder de comisionamiento (rol `leader`) firma «Operaciones/HSE» pero no puede aprobar como Comisionamiento. Documentar una matriz RACI por defecto. S · alta.

**D-34 · Baja · Modelo** — Gates y pesos son por org y no por proyecto (`readiness_gates.org_id`). Un brownfield y un greenfield de la misma operadora no pueden tener gates distintos. Agregar un override por proyecto más adelante. L · alta.

**D-35 · Baja · Dependencias** — El chequeo de ciclos es por sistema e ignora los gates (`guard_system_dependency`): rechaza pares válidos («A.RFC necesita B.MC» y «B.RFSU necesita A.MC»). Una dependencia hacia un gate desactivado desaparece sin aviso (`JOIN … rg.is_active`). S · alta.

**D-36 · Baja · i18n / UX** — El Inbox tiene etiquetas en español fijas en el código y le faltan los tipos de readiness (`InboxList.tsx:13-27`). La fecha del detalle usa `toLocaleString` con `suppressHydrationWarning` (`SystemGatesView.tsx:126`). S · alta.

**D-37 · Baja · Tests** — Los tests de BD del motor (`tests/db/readiness.test.ts`, `dependencies.test.ts`, `daily-management.test.ts`, `registers.test.ts`…) no corren en CI porque faltan los secrets. Los únicos tests que corren son de helpers puros (`gates.test.ts`). Las reglas críticas (`regressed`, firmas, criterios implícitos) no tienen red de seguridad en CI. M · alta.

**D-38 · Baja · Dashboard por rol** — `/dashboard` (inicio de owner, admin, architect y client, `navigation.ts:9`) y `/kpis` (global) no tienen ningún widget de readiness: gates por aprobar, sistemas bloqueados, restricciones N4, compromisos que vencen. El gerente aterriza en métricas de completions. Agregar un widget «Readiness» y un resumen por proyecto en `/kpis`. M · alta.

---

## 4. Propuestas estratégicas

1. **«Sala de control» con estado materializado y eventos.** Una tabla `system_gate_status(system_id, gate_id, computed_level, status, failing jsonb, first_blocker, updated_at)` mantenida por triggers en ITR, punch, registros, restricciones, line-up, documentos y aprobaciones (marcan el sistema «sucio») y un recálculo incremental. Esto resuelve D-07, permite que Control Tower, el look-ahead, el reporte y Mi trabajo lean O(1), y cada transición (`ready`, `pending_signatures`, `regressed`) emite un `domain_event` que alimenta notificaciones y push (D-04). Es el cambio con más retorno.
2. **RACI de firmas por proyecto.** Designar quién firma como Comisionamiento, Operaciones, HSE y Cliente (persona o empresa F8) y usarlo en gates, hold points, testigos de hitos, traspasos y PTC (D-03, D-33). Es lo que un auditor de Ecopetrol o Geopark va a preguntar primero.
3. **Control Tower v2 «siguiente gate».** Una fila por sistema con: siguiente gate, su estado, el primer bloqueo con enlace, forecast/compromiso/brecha, etapa de propiedad y avance ponderado. Filtros, orden por riesgo, «cambió desde ayer» y Excel. Es la vista para la reunión diaria de las 7:00, la que el libro pide en 7.68 (D-01, D-18, D-19, D-26).
4. **Condiciones como acciones.** «Aprobado con condiciones» crea acciones ACC con dueño y fecha. El badge muestra «✓! 2 abiertas» y el reporte diario las lista (D-12). Así se unen el motor de gates y la gestión diaria, que hoy son dos mundos.
5. **Zona horaria del proyecto** como dato de primera clase (D-05, D-27). Es barato y evita discusiones con el cliente por el reporte firmado.
6. **Consolidar el SQL** (D-09): migración canónica, funciones por criterio, archivo de referencia versionado y test de definición. Antes de seguir agregando criterios implícitos.
7. **Operaciones masivas donde el trabajo es masivo:** aprobar en lote los gates de N sistemas listos con la misma condición, co-firmar en lote (tras revisar), reasignar acciones y restricciones de una persona que sale, y cambiar compromisos de un área con un motivo común (la grilla del look-ahead ya lo hace para fechas).
8. **Simplificar métricas:** dos números oficiales (avance físico ponderado y readiness) con la misma definición en todas partes. Retirar `compute_project_readiness` y el `kpi_snapshots` hecho en JS cuando el SQL cubra lo mismo (D-08, D-18).
9. **Lo que no recomiendo:** más criterios implícitos antes de resolver 1 a 3. El motor ya es rico; lo que falta es que la información llegue a las personas y sea coherente.

---

## 5. Funcionamiento para el manual

### 5.1 Roles que intervienen (por defecto)

| Acción | Roles por defecto | Dónde se valida |
|---|---|---|
| Configurar gates, criterios y firmas | owner, admin | `gates-admin.ts` (ADMIN_ROLES) + RLS `is_org_admin` |
| Pesos de gates | owner, admin (UI); la RPC también acepta architect | `setGateWeights` / `set_gate_weights` |
| Aprobar un gate (firma Comisionamiento) | los de `approval_roles` (por defecto owner, admin, architect) | `approve_system_gate` |
| Co-firmar Operaciones / HSE | los de `cosign_roles` (por defecto owner, admin, architect, leader, client), persona distinta | `sign_system_gate` |
| Revocar una aprobación | owner, admin o roles de aprobación del gate, con motivo | `revoke_system_gate_approval` |
| Declaración manual con evidencia | editores del proyecto | `attest_gate_criterion` |
| Forecast | cualquier rol salvo client | `set_gate_forecast` |
| Compromiso | owner, admin, architect, leader (motivo al cambiarlo) | `set_gate_commitment` |
| Acciones, restricciones, TQ, decisiones | cualquier rol salvo client (client puede responder TQ) | RPC de `20261017120000` |
| Emitir o revisar el reporte diario | líder o superior | `issue_daily_report` / `revise_daily_report` |
| Relevo: abrir y entregar / recibir | cualquier rol salvo client / otra persona salvo client | RPC de relevo |

### 5.2 Configurar los gates (owner/admin) — `/admin/gates`
1. Al crear las fases de la org (`project_phases`), un trigger crea **un gate por fase** (MC, RFPC, RFC, RFSU) con los criterios «ITR de la fase aprobados» y «tags críticos listos». RFSU agrega «PSSR aprobado» y nace con «exige line-up».
2. Para cada gate se define: nombre, fase vinculada, **requiere el gate anterior**, **exige line-up**, **exige prueba de desempeño**, activo o inactivo, **roles que aprueban**, **firmas adicionales requeridas** (Operaciones, HSE) y **roles que pueden co-firmar**.
3. Criterios configurables: ITR de la fase aprobados, certificados emitidos, PSSR aprobado, tags críticos listos (safety/process), declaración manual con evidencia (texto obligatorio). Cada criterio puede ser bloqueante (rojo) o solo de aviso (amarillo).
4. Se pueden agregar gates del catálogo del libro (Utilities, Funcional, Introducción de proceso, Desempeño, Handover). Entran al final: hay que ordenarlos con ↑ ↓.
5. **Pesos** (tarjeta de pesos): definen cuánto aporta cada gate al avance físico ponderado. Vacío = partes iguales.
6. Fuera de esta pantalla también bloquean gates: cada **tipo de registro controlado** (configurable en registros: qué gate bloquea), las **dependencias** entre sistemas (ficha del sistema o import de Excel) y las **restricciones** asignadas a un gate.
7. ⚠ Los cambios se aplican de inmediato a todos los sistemas y proyectos de la org, sin historial (D-20).

### 5.3 Cómo se calcula un gate (automático, en BD)
Para cada sistema y cada gate activo, en orden, el motor evalúa:
1. **Gate anterior** (si «requiere el anterior»): el gate previo tiene que estar aprobado con todas sus firmas.
2. **Sistemas de los que depende:** el gate requerido de cada proveedor tiene que estar aprobado con firmas.
3. **Registros controlados:** ningún registro del sistema (o de sus tags) de un tipo que bloquee este gate puede estar propuesto, autorizado, activo o retirado sin verificar.
4. **Restricciones:** una restricción abierta o resuelta asignada a este gate deja el gate **con condiciones**; si está abierta en nivel 4, **lo bloquea**.
5. **Line-up** (si el gate lo exige): una hoja del sistema verificada y no desactualizada por cambios posteriores en registros.
6. **Documentos vigentes:** si un ITR firmado o un procedimiento aprobado del sistema usa una revisión superada → condición.
7. **Prueba de desempeño** (si el gate la exige): cada prueba en la que el sistema es principal tiene un PTC aceptado (tres firmas).
8. **Criterios configurados:** ITR de la fase (por subsistema: rojo sin ITR, con ITR pendientes, con Cat A abierto o con Cat B por encima del límite de la org; amarillo con Cat B dentro del límite; Cat C nunca bloquea), certificados, PSSR, tags críticos, declaraciones.

Resultado del gate: **verde** (todo pasa), **amarillo** (algún aviso o condición) o **rojo** (algún bloqueo). Con la aprobación queda un estado de 8 posibles:
- *No listo* (rojo sin aprobación) · *Listo* (verde) · *Listo con condiciones* (amarillo)
- *Pendiente de firmas* (aprobado por Comisionamiento, faltan co-firmas) · *Aprobado* · *Aprobado con condiciones*
- *Regresión* (estaba aprobado y hoy está en rojo)

### 5.4 Aprobar y co-firmar (Comisionamiento → Operaciones → HSE) — `/control-tower/[sistema]`
1. **Comisionamiento** (rol con autoridad) abre el sistema. En el gate **Listo**, escribe condiciones opcionales (una por línea) y notas, y pulsa «Aprobar». En el gate **Listo con condiciones** tiene que escribir al menos una condición. La BD vuelve a evaluar los criterios, guarda la foto de la evidencia y registra la firma de Comisionamiento.
2. Si el gate exige co-firmas, queda **Pendiente de firmas** y todavía no habilita al gate siguiente.
3. **Operaciones** y **HSE** (dos personas distintas entre sí y distintas del aprobador, con un rol en «pueden co-firmar») abren el mismo sistema, escriben un comentario opcional y pulsan «Firmar como…». Al firmar se vuelve a comprobar que el gate no esté en rojo. Con la última firma, el gate pasa a Aprobado (o Aprobado con condiciones).
4. **Declaraciones manuales:** antes de aprobar, un editor sube la evidencia (archivo) con un comentario en el criterio. La evidencia no se puede borrar.
5. **Revocar:** quien tiene autoridad pulsa «Revocar» e indica el motivo. Los gates siguientes y los sistemas dependientes que estaban aprobados pasan a *Regresión*.
6. ⚠ Hoy nadie recibe aviso de que tiene algo que aprobar o firmar (D-04): hay que coordinarlo por fuera.

### 5.5 Cómo leer Control Tower — `/control-tower`
- **Selector de proyecto** arriba (por defecto, el primero por código).
- **Tarjetas:** sistemas, % promedio de ITR aprobados, % de avance ponderado; por gate, «aprobados/total», cuántos están listos para aprobar y cuántos pendientes de firma; punch A y B abiertos; límite de Cat B de la org.
- **Tabla por sistema:** área; sistema con tipo y prioridad; barra de ITR (todas las fases) y avance ponderado; punch A/B/C; **un badge por gate** (✓ aprobado, ✓! con condiciones, ✎ pendiente de firmas, ● listo, ◐ listo con condiciones, ○ no listo, ↺ regresión, ⛓ bloqueado por un sistema proveedor). Al pasar el cursor se ve el estado y cuántos criterios fallan.
- **Bloqueo principal:** viene del cálculo general de ITR y punch, no del gate siguiente (D-01). Para ver qué bloquea de verdad un gate hay que entrar al sistema.
- **Detalle del sistema:** etapa de propiedad, pruebas de desempeño y paquetes vendor como chips; avance ponderado y gates aprobados; dependencias («depende de» / «habilita a»); franja de hitos de arranque; restricciones y acciones vivas; y por gate: forecast y compromiso con historial, la lista de criterios con ✓ ! ✕ y enlaces a cada ITR, punch, registro, restricción, line-up, documento o PSSR, y el bloque de aprobación y firmas.

### 5.6 Mi trabajo — `/my-work` (inicio de inspector y leader)
- **Chips con contadores** y **colas** de hasta 20 filas, cada una con un enlace al módulo:
  - ITR por ejecutar y por revisar
  - mis punch; punch por verificar en campo (resueltos por otros); categorías por revisar (supervisores)
  - ítems de plan de trabajo; certificados por firmar (owner, admin, architect); preservación vencida (supervisores)
  - **mis acciones**; **acciones por verificar** (cerradas por otros); **mis restricciones** abiertas
  - **relevos por recibir**; **hold points por liberar** (según capacidad); **filas críticas de line-up por verificar**
  - **hitos por atestiguar**; **traspasos por firmar**; **pruebas por decidir**; **PTC por firmar**
- El número del sidebar suma lo personal y lo que tu rol debe atender. Las verificaciones de punch y de acciones aparecen en la cola, pero no suman al badge.
- ⚠ Hoy no hay colas de gates por aprobar o firmar ni de registros por autorizar o verificar (D-04).

### 5.7 Gestión diaria — `/projects/[id]/daily`
Pestañas: **Acciones · Restricciones · TQ · Decisiones** (con búsqueda, «vivas», «mías», «vencidas», origen y nivel), más **Look-ahead**, **Reportes** y **Relevo**.

**Rutina sugerida del día:**
1. **07:00 – Reunión diaria** con el look-ahead de 7 días (base forecast o compromiso) y Control Tower. Se revisan los gates en riesgo, las restricciones N≥3 y las vencidas, y las acciones vencidas.
2. **Restricciones (RES-0001…):** se crean con sistema, responsable, fecha requerida, impacto (seguridad, cronograma, costo, calidad, ambiente), plan de recuperación y, opcionalmente, el gate que afectan.
   - Se escalan o desescalan entre 1 y 4 con motivo: 1 equipo · 2 gerente de comisionamiento · 3 gerente de proyecto · 4 cliente/sponsor.
   - Ciclo: abierta → resuelta (con nota) → cerrada (sin acciones vivas). Desde resuelta se puede reabrir con motivo; también se puede cancelar con motivo.
   - Las vencidas reciben aviso diario (08:30 UTC), que se repite cada 3 días.
3. **Acciones (ACC-0001…):** se crean a mano o nacen de restricciones, TQ, PSSR («no» → acción automática), vendor o desempeño. Llevan dueño, fecha, prioridad y método de verificación (campo, documento, prueba o revisión).
   - Ciclo: abierta → en curso → **hecha** (con nota y, salvo método «revisión», con evidencia adjunta) → **verificada por otra persona** (o rechazada de vuelta a en curso con motivo).
4. **TQ (TQ-0001…):** borrador → emitido → respondido (el client también puede responder; se marca «cambio de diseño» y n.º de MOC) → cerrado, o reemitido si la respuesta no alcanza.
5. **Decisiones (DEC-0001…):** se registran con contexto, decisión, fundamento, quién decidió y asistentes. Son inmutables; para corregir se reemplazan por una nueva con motivo.

**Look-ahead** (`/daily/lookahead`): ventanas de 7, 30 y 90 días; base forecast o compromiso. Agrupa por sistema los gates que vencen (con la brecha forecast − compromiso y «en riesgo» si no están listos), las acciones, restricciones, TQ e ítems de plan de trabajo. Con «Editar», los forecast y compromisos se cambian en una grilla y se guardan en bloque, con un motivo común para los compromisos.

**Planificación por gate** (detalle del sistema): cualquier rol salvo client edita el forecast; el compromiso lo fija un líder o superior y cambiarlo exige motivo. Todo queda en el historial.

**Reporte diario** (`/daily/reports`, RD-<proyecto>-AAAAMMDD):
1. Un no-client pulsa «Nuevo reporte» (fecha y, opcionalmente, área). La BD arma los datos del día: avance y delta, ITR, punch, gates aprobados y en regresión, restricciones, acciones, TQ, registros en campo, eventos de arranque, pruebas de desempeño y lo que viene en 7 días.
2. «Redactar con IA»: Claude escribe las 5 secciones (resumen, eventos clave, fallas/problemas, restricciones, plan del día siguiente) solo con esos datos y nunca pisa lo que ya se editó.
3. Se editan las secciones. Con «Actualizar datos» se recalculan los datos mientras el reporte sea borrador.
4. Un **líder o superior lo emite**: queda inmutable, con sha256, y el PDF se regenera desde los datos congelados. Para corregirlo se crea una **revisión R1** con motivo.
5. ⚠ El «día» va en UTC y las listas se cortan en 30 (D-05, D-06): conviene revisar las cifras antes de emitir.

**Relevo de turno** (`/daily/handovers`, REL-0001):
1. Quien entrega lo abre (turno día, noche u otro). Viene precargado con registros activos o retirados (bypass, ciegas, temporales, energizaciones), ITR en curso, punch Cat A abiertos, restricciones abiertas y acciones vencidas.
2. Escribe los pendientes y las notas de seguridad y pulsa «Entregar» (firma).
3. **Otra persona** (no client) lo revisa en «Relevos por recibir» de Mi trabajo, comenta y lo acepta. Queda inmutable con hash.

### 5.8 KPIs — `/projects/[id]/kpis`
- **Parte superior (completions):** % de ITR por fase, KPIs por subsistema, histórico de `kpi_snapshots` y alertas.
- **Readiness y gestión diaria:**
  - avance ponderado en vivo; readiness (gates aprobados / total, solo los gates con fase)
  - cumplimiento de compromisos (30 días); TQ respondidos a tiempo y días promedio; acciones a tiempo, vencidas y por verificar; restricciones abiertas por nivel y antigüedad
  - éxito del primer arranque; sistemas con trips repetidos; pruebas de desempeño aceptadas al primer intento; completitud documental (As-Built/Final); readiness de vendors
  - **curva S** del avance ponderado (180 días)
- Los snapshots se toman cada día a las 02:00 UTC (cron de GitHub Actions `/api/cron/snapshot`) o a mano con «Tomar snapshot» (editores).
- `/kpis` (global) y `/dashboard` muestran solo métricas de completions por proyecto. Todavía no hay vista de readiness a nivel de org (D-38).
