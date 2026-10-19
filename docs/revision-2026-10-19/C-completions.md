# Revisión C — Flujo core de completions (jerarquía, importación, plantillas ITR, ejecución ITR, punch, certificados, preservación, PSSR, planes de trabajo)

Revisor: C · Fecha: 2026-10-19 · Método: lectura estática línea por línea (sin BD, sin servidor). Cada hallazgo se verificó leyendo el código o el SQL citado. Confianza **alta** = comprobado en el código/SQL; **media** = depende del estado real de la BD (ACL, RLS aplicada) o del comportamiento del navegador.

---

## 1. Resumen (franco)

La capa de **integridad del ITR** es de lo mejor que he visto en productos de este tipo: revisiones de plantilla inmutables una vez asignadas, firma atómica en SQL (`sign_itr_atomic`) que vuelve a evaluar el contenido, bloqueo de evidencias después de firmar, reapertura auditada con foto completa de respuestas y adjuntos, equipos de prueba con la calibración congelada al momento de uso, tablas v2 con filas tomadas del lazo o de la matriz C&E. El modelo de punch con «resuelto → verificado por otra persona» y la revisión de categoría también están bien pensados.

El problema es que **el flujo diario, de punta a punta, tiene cortes que impiden terminar el trabajo** en escenarios muy comunes:

1. **Un ITR solo llega a «aprobado» con las TRES firmas (ejecutor + supervisor + cliente)**, pero supervisor y cliente son opcionales al asignar, los ITR de lazo y de C&E nunca llevan cliente, y no hay pantalla para agregar esas asignaciones después (además, la BD las congela apenas firma el ejecutor). Resultado: ITR que no se pueden aprobar nunca → certificados que no se pueden emitir.
2. **Los ITR de loop check y de C&E no se pueden firmar desde la UI**: el cálculo local del estado ignora las filas de origen y nunca da «completado».
3. **El inspector no puede levantar punch** (la acción exige rol de editor), aunque la pantalla le muestra el botón; sin red, el punch se encola y se descarta a los 3 intentos.
4. **Cualquier miembro del proyecto puede cerrar cualquier punch (incluso Cat A) sin verificación** llamando a la RPC `update_punch_ops_status(…,'closed_final')`; por el patrón `auth.uid() IS NOT NULL AND …`, posiblemente también sin sesión (anon).
5. **Preservación ejecutada por un inspector no avanza la próxima fecha** (trigger sin SECURITY DEFINER + RLS de editor), y el registro nunca queda «finalizado» aunque la pantalla muestre ✓.
6. **Modo sin red frágil**: una respuesta rechazada por el servidor bloquea para siempre toda la cola de respuestas sin avisar; la cola no está separada por usuario (en una tableta compartida se reenvía con la sesión de otra persona); al recargar sin red no se muestran las respuestas encoladas.

A esto se suman atajos que **saltan los controles** que el producto vende (cambio masivo de estado del ITR a «completado», cancelar un punch Cat A con un clic sin motivo, aprobar un PSSR en borrador con ítems en «NO», reabrir un certificado sin volver a evaluarlo, una misma persona firmando los tres roles del certificado) y **faltantes frente a la competencia** que pesan en proyectos grandes: no hay generación masiva de ITR (solo de a uno por tag), no hay filtros por subsistema ni «mis ITR», no hay foto ni marcado en el punch levantado desde el ITR, y la importación de tags no escala más allá de unos 10 mil.

Conteo: **4 críticos, 13 altos, 18 medios, 9 bajos (44)**. La mayoría son arreglos S/M y de alto impacto. Recomiendo atacar los críticos y altos antes de cualquier venta nueva a un cliente grande.

---

## 2. Fortalezas

- **Integridad del ITR en la BD** (`20260909180000_itr_atomic_integrity.sql`, redefinida en `20261016150000_test_equipment.sql:193`): `guard_itr_row` (identidad y revisión inmutables, «aprobado» solo por firma atómica), `guard_itr_content` (respuestas, adjuntos, asignaciones y equipos congelados al haber firmas), `sign_itr_atomic` con orden de firmas, asignación obligatoria, contenido completo y equipo de prueba vigente, `reopen_itr_atomic` con foto completa en `activity_log`.
- **Revisiones de plantilla** (`create/activate_itr_template_revision`): copia completa, activación serializada, la matriz sigue a la revisión activa; una revisión asignada no se puede editar.
- **Paridad cliente ↔ SQL** de la evaluación de contenido (`src/lib/itr/completion.ts` ↔ `evaluate_itr_capture`), con condiciones entre ítems, tablas v2, continuidad, opciones con resultado.
- **Evidencias inmutables**: el adjunto se desvincula pero el binario no se borra (`itr-instances.ts:400`); el path de storage queda atado al ITR por trigger.
- **Punch fase 4**: resolver con descripción, verificar otra persona, rechazo con motivo, revisión de categoría por alguien distinto de quien lo levantó, todo por RPC y con trigger que impide cerrar por fuera (`20261016120000_punch_evidence.sql`).
- **Equipos de prueba** con la calibración congelada en el uso y bloqueo de la firma si está vencido.
- **Bandeja sin red** para respuestas, fotos, punch y firmas, con política de reintentos, registro de conflictos (`sync_conflicts`) y aviso al descartar.
- **Listas paginadas en SQL** (Sprint E: `itr_list_v`, `itr_status_counts`), exportaciones con tope y escape contra fórmulas (`sanitizeCell`).
- **Importación** con detección de encabezados, selección de la mejor hoja, deduplicación, lotes de 300 y jerarquía que no pisa nombres existentes.
- **Elegibilidad de certificados** pura y con tests (`eligibility.ts`), y la regla Cat B con límite configurable.

---

## 3. Hallazgos (por severidad)

Formato: **ID · Severidad · Categoría** — Ubicación — Evidencia — Impacto — Recomendación — Esfuerzo — Confianza.

### CRÍTICOS

**C-01 · Crítico · bug/funcionalidad** — ITR que no se pueden aprobar nunca si no tienen supervisor y cliente asignados
- Ubicación: `supabase/migrations/20261016150000_test_equipment.sql:216`; `src/app/(dashboard)/projects/[id]/tags/[tagId]/itrs/[itrId]/types.ts:132-148`; `src/app/actions/itr-instances.ts:85-89`; `src/app/actions/source-itrs.ts:61-62`; `src/app/actions/itr-assign.ts:9` (solo usado con `'executor'` en `ItrListView.tsx:139`); trigger `guard_itr_content` sobre `itr_assignments` (`20260909180000…:136,162`).
- Evidencia: `result_status:=CASE WHEN (SELECT count(DISTINCT role) …)=3 THEN 'approved' ELSE 'completed' END;` · `if (supervisorId) assignments.push(…)` · `if (assigned.length !== 1 …) return []`.
- Impacto: un ITR asignado sin supervisor o sin cliente (opcionales en el formulario; los ITR de lazo y C&E no tienen campo de cliente) queda en «completado» para siempre. No hay pantalla para agregar asignaciones de supervisor o cliente después, y la BD las bloquea apenas existe una firma. `evaluateEligibility` exige todos los ITR aprobados → **certificados imposibles**. En proyectos donde el cliente no firma los ITR A (lo más común), el producto no funciona.
- Recomendación: niveles de firma configurables por plantilla o por fase (p. ej. `itr_templates.required_signatures text[]`, default `{executor,supervisor}`); en `sign_itr_atomic`, aprobar cuando estén todas las requeridas; en la UI de asignación, pedir solo los roles requeridos (obligatorios); pantalla para cambiar asignaciones de supervisor/cliente antes de firmar (y por reapertura después). Migrar los ITR existentes.
- Esfuerzo: M · Confianza: alta.

**C-02 · Crítico · bug** — Los ITR de loop check y de C&E (tabla con filas de origen) no se pueden firmar desde la UI
- Ubicación: `src/lib/sync/outbox-utils.ts:58-71` (sin parámetro `sourceRows`); `ItrExecution.tsx:215-221`; `src/lib/itr/table.ts:307-309`.
- Evidencia: `const result = evaluateItrCompletion(items, answers, attachments)` · `if (!sourceRows?.length) return invalid('El ITR no tiene la foto de filas…')` · `signingReady = effectiveStatus === 'completed' && …`.
- Impacto: en los ITR generados desde Lazos o Matrices C&E, la tabla en modo `source` siempre se evalúa como incompleta en local → el estado local nunca es «completado», el botón Firmar queda deshabilitado y la barra de avance muestra un porcentaje falso. El servidor sí lo marca «completado», así que la pantalla contradice a la lista. Toda la funcionalidad 4-D queda inutilizable para la firma.
- Recomendación: pasar `sourceRows` a `localItrStatus` (y en `ItrExecution` usar `completion`, que ya se calcula con `sourceRows`, en vez de recalcular); agregar un test con una tabla `mode:'source'`.
- Esfuerzo: S · Confianza: alta.

**C-03 · Crítico · bug/permisos** — El inspector no puede levantar punch, comentar ni adjuntar fotos al punch
- Ubicación: `src/app/actions/punches.ts:13-15` (`createPunch` con `EDITOR_ROLES`), `:322-325` (`addPunchComment`), `:437-440` (`addPunchAttachment`); `ItrExecution.tsx:560-565` y `ItemRow.tsx:76-82` (botón siempre visible); `src/lib/sync/replay.ts:215-220` + `outbox-utils.ts:47`.
- Evidencia: `export const createPunch = withAuth({ role: EDITOR_ROLES, …` · `EDITOR_ROLES = ['owner','admin','architect','leader']` (sin `inspector`).
- Impacto: el inspector, que es quien encuentra la deficiencia en campo, recibe «Sin permisos». Sin red, el punch se encola y, al sincronizar, se rechaza 3 veces y **se descarta**. La RLS (`punches_insert` = miembro del proyecto) sí lo permitiría, y `finalizeRecord` de preservación lo inserta directo: la política es incoherente.
- Recomendación: permitir crear, comentar y adjuntar a todo rol ≠ `client` (o a `inspector` explícitamente); ocultar el botón para `client`/aprobado; agregar el caso a los tests de permisos.
- Esfuerzo: S · Confianza: alta.

**C-04 · Crítico · seguridad/integridad** — `update_punch_ops_status('closed_final')` cierra cualquier punch sin verificación, para cualquier miembro y posiblemente sin sesión
- Ubicación: `supabase/migrations/00000000000000_baseline.sql:1828-1869` (y `transfer_punch_to_ops` en `:1737-1782`); `supabase/migrations-archive/migration-stage16-2-post-handover.sql:167` (solo `GRANT … TO authenticated`, sin `REVOKE … FROM PUBLIC`).
- Evidencia: `IF auth.uid() IS NOT NULL AND NOT is_project_member(v_project_id) THEN RAISE…` · `status = CASE WHEN p_new_status = 'closed_final' THEN 'closed'::punch_status …`.
- Impacto: la función es SECURITY DEFINER (escritura «confiable» para `guard_punch_row`), no exige que el punch esté transferido a operaciones, ni que sea Cat B, ni un estado previo. Cualquier inspector o cliente puede cerrar un Cat A por REST, saltando la verificación en campo y desbloqueando el certificado. Si quedó el EXECUTE por defecto a PUBLIC (no se ve ningún REVOKE), con la anon key (que está en el bundle) se salta incluso la comprobación de membresía: escritura entre tenants conociendo un UUID.
- Recomendación: `REVOKE EXECUTE … FROM PUBLIC, anon`; exigir `auth.uid()` o el service role explícito; exigir `post_handover_status='transferred_to_ops'` y una máquina de estados; rol de operaciones o líder+; `closed_final` solo desde `verified_ops` y por otra persona. Revisar el mismo patrón `auth.uid() IS NOT NULL AND` en el resto de las RPC.
- Esfuerzo: S · Confianza: alta (miembros autenticados) / media (anon, depende del ACL real).

### ALTOS

**C-05 · Alto · bug** — Preservación ejecutada por un inspector: no avanza la próxima fecha ni queda finalizada
- Ubicación: `baseline.sql:1806-1820` (`update_preservation_next_due`, sin SECURITY DEFINER) y `:5041`; RLS `preservation_plans_update` / `preservation_records_update` / `pres_rec_resp_update` = `is_project_editor` (`:7552`, `:7645`, `:7479`); `src/app/actions/preservation.ts:366-401`.
- Evidencia: `CREATE FUNCTION public.update_preservation_next_due() … LANGUAGE plpgsql SET search_path…` (invoker) · `.update({ … status: 'finalized' }).eq('id', input.recordId)` sin comprobar filas afectadas.
- Impacto: con rol inspector, el INSERT del registro funciona, pero el UPDATE del plan desde el trigger y el UPDATE de finalización afectan 0 filas **sin error** (RLS filtra). La pantalla muestra ✓, el plan sigue vencido, el cron manda alertas de vencido y el registro queda «open». Al corregir una respuesta ya guardada, el upsert falla por RLS (`ON CONFLICT DO UPDATE`).
- Recomendación: mover la ejecución a una RPC SECURITY DEFINER (`perform_preservation_record`) que valide la membresía y que el rol ≠ client; o RLS de UPDATE para miembros sobre registros propios no finalizados; `.select()` después del update para detectar 0 filas.
- Esfuerzo: M · Confianza: alta (código) / media (estado real de la RLS).

**C-06 · Alto · bug/integridad** — La próxima fecha de preservación avanza al primer toque, no al finalizar
- Ubicación: `PreservationExecution.tsx:173-210` (`ensureRecord` al primer `handleResponse`); trigger `AFTER INSERT` en `preservation_records`.
- Evidencia: `async function handleResponse(…) { const rId = await ensureRecord() …` · `CREATE TRIGGER trg_preservation_next_due AFTER INSERT …`.
- Impacto: para un editor, abrir la ejecución y marcar un ítem ya cuenta como mantenimiento hecho; si abandona, el plan aparece al día sin registro finalizado. Un resultado NOK también avanza la fecha. Dos toques rápidos crean dos registros (carrera antes de `setRecordId`). Los errores de `upsertRecordResponse` se ignoran (no se revisa el resultado) → pérdida silenciosa de respuestas.
- Recomendación: avanzar `next_due_date` solo al finalizar con resultado OK (o según política), dentro de la misma RPC; crear el registro de forma idempotente (una promesa compartida) y mostrar los errores de guardado.
- Esfuerzo: S-M · Confianza: alta.

**C-07 · Alto · bug/pérdida de datos** — Sin red: una respuesta rechazada bloquea para siempre la cola de respuestas
- Ubicación: `src/lib/sync/replay.ts:125-128`; política de firmas `outbox-utils.ts:47`.
- Evidencia: `} else { // Error de servidor — dejar en cola para próximo intento \n break }`.
- Impacto: si el ITR se firmó o aprobó mientras tanto, o la casilla ya no corresponde, `upsertResponse` devuelve error lógico; esa entrada queda primera y **todas las respuestas posteriores, de cualquier ITR, nunca se envían**, sin aviso al usuario (solo hay aviso para la bandeja de fotos, punch y firmas). Después, la firma encolada se intenta igual, falla por «contenido incompleto» y, con política de 1 intento, **se descarta**.
- Recomendación: tratar el rechazo lógico como en la bandeja (intentos, descarte con registro en `sync_conflicts`, aviso `SYNC_DROPPED_EVENT`); seguir con las demás entradas; no drenar firmas de un ITR que todavía tiene respuestas pendientes o rechazadas.
- Esfuerzo: S · Confianza: alta.

**C-08 · Alto · seguridad/privacidad** — La cola sin red y las páginas en caché no están separadas por usuario ni se limpian al cerrar sesión
- Ubicación: `src/lib/offline-queue.ts` (sin `userId` en las entradas); `src/components/layout/UserMenu.tsx:104-108`; `public/sw.js:115-128` (`navigateFirst` guarda el HTML autenticado en `CACHE_STATIC`) y `:131-151` (guarda respuestas de `/rest/v1/` y `/auth/v1/`).
- Evidencia: `async function handleLogout() { … await supabase.auth.signOut(); router.push('/login') }` (no borra IndexedDB ni las cachés).
- Impacto: en una tableta compartida (lo normal en campo), lo que capturó A sin red se reenvía con la sesión de B (`responded_by` = B, o la firma se rechaza y se descarta). Las páginas del proyecto (datos de la organización) quedan legibles sin red para la persona siguiente.
- Recomendación: guardar `userId` en cada entrada y reenviar solo las del usuario actual; al cerrar sesión, ofrecer «sincronizar o descartar» y después `caches.delete` + vaciar los almacenes; no cachear `/auth/v1/`.
- Esfuerzo: M · Confianza: alta.

**C-09 · Alto · UX/funcionalidad** — «ITR sin red» solo funciona con un ITR abierto antes y con navegación completa; al recargar no se ven las respuestas encoladas
- Ubicación: `useItrAutosave.ts:22-44` (estado inicial solo desde `itr.itr_responses`); `offline-queue.ts:152` (`getItrSnapshot` nunca se usa: `grep` sin llamadas); `public/sw.js:56` (las peticiones `_rsc` van siempre a la red).
- Evidencia: `for (const r of itr.itr_responses) map[r.item_id] = r` · `if (url.pathname.startsWith('/_next/data/') || url.searchParams.has('_rsc')) return`.
- Impacto: la navegación por enlaces (RSC) falla sin red; una recarga muestra el HTML en caché de la última visita, **sin las respuestas encoladas** (las fotos encoladas sí se mezclan). El inspector cree que perdió el trabajo y lo vuelve a cargar, o lo abandona. Tampoco hay forma de descargar un paquete de trabajo («mis ITR de hoy») antes de salir a campo, que es lo que ofrece la competencia.
- Recomendación: mezclar las respuestas de `getAllQueued()` del ITR en el estado inicial; «Preparar para trabajar sin red»: precargar las rutas y los datos de los ITR asignados (snapshot que sí se use para pintar); indicador de qué ITR están disponibles sin red.
- Esfuerzo: M-L · Confianza: media (depende del comportamiento real del SW).

**C-10 · Alto · integridad/bug** — El cambio masivo de estado de ITR salta el contenido y «Aprobar seleccionados» siempre falla
- Ubicación: `src/app/actions/bulk.ts:9-23` y `:59-83`; `ItrListView.tsx:236-245` (el desplegable ofrece los 5 estados, también a quien no es editor); `ItrListGlobal.tsx:112`; trigger `guard_itr_row` (`20260909180000…:187`).
- Evidencia: `.from('itrs').update({ status })` · `.update({ status: 'approved' })` → `RAISE EXCEPTION 'Approval requires atomic signing'`.
- Impacto: un líder puede marcar 500 ITR como «completado» o «no iniciado» sin contenido, lo que corrompe los KPI, la curva de avance y la cola de revisión. El botón «Aprobar» muestra un error en inglés y nunca funciona. Con RLS `itrs_update` = miembro, cualquier miembro (incluido el cliente) puede hacerlo por REST (ver C-34).
- Recomendación: eliminar el cambio de estado masivo (el estado se deriva del contenido y las firmas); reemplazarlo por acciones con sentido (reasignar, reprogramar, agregar a plan, firma masiva de supervisor con revisión: ver §4). Quitar `bulkApproveItrs`.
- Esfuerzo: S · Confianza: alta.

**C-11 · Alto · integridad** — Cancelar un punch Cat A es un clic, sin motivo ni auditoría, y desbloquea el certificado
- Ubicación: `TagPunchTab.tsx:380-386` y `:469-471`; `src/app/actions/punches.ts:195-232`; `bulk.ts:25-41` (cambio masivo a `cancelled`); RLS `punches_update` = miembro (`20260903200000…:55`); `guard_punch_row` permite `cancelled` (`20261016120000…:57-66`); `eligibility.ts:53-55`.
- Evidencia: `<button onClick={() => handleStatusChange('cancelled')} …>` (sin confirmación) · `if (input.status === 'cancelled') update.closed_date = …` (sin `logActivity`).
- Impacto: un Cat A desaparece de la elegibilidad sin verificación en campo ni rastro. Por REST, cualquier miembro (también el cliente) puede cancelar o recategorizar A→C. Un cancelado no se puede reabrir desde la UI.
- Recomendación: cancelar solo por RPC con motivo, rol de supervisor y persona distinta de quien lo levantó; registrar en `activity_log` y `punch_comments`; en `guard_punch_row`, rechazar el cambio directo a `cancelled` y el de categoría para no confiables; RLS de UPDATE limitada a roles ≠ client.
- Esfuerzo: S-M · Confianza: alta.

**C-12 · Alto · integridad** — Se puede aprobar un PSSR en borrador con ítems en «NO»; cualquier miembro puede ponerlo «aprobado» por REST
- Ubicación: `src/app/actions/pssr.ts:372-480` (no comprueba `status` ni los ítems); RLS `pssr_reviews_update` = `is_project_member` (`baseline.sql:7841`), sin trigger de guarda.
- Evidencia: solo `if (!sigCount || sigCount === 0) return { error: … }` y `startupPunchBlocker`.
- Impacto: con una sola firma, un líder aprueba un PSSR con ítems «NO» o pendientes y se emite el RFSU. Por REST, un inspector o cliente puede poner `status='approved'`, y la fase 6 usa «PSSR más reciente aprobado» como requisito de primer arranque. Es un control de seguridad de procesos.
- Recomendación: aprobación solo por RPC SECURITY DEFINER que exija `pending_approval`, todos los ítems sí/NA, firmas de las disciplinas requeridas y aprobador distinto del que envió; RLS de UPDATE sin `status` para no confiables (trigger como en punch e ITR); bloquear la edición de ítems después de enviar.
- Esfuerzo: M · Confianza: alta.

**C-13 · Alto · integridad** — Certificados: una persona firma los tres roles, el cliente no puede firmar, se reabre sin volver a evaluar y no se invalida después
- Ubicación: `src/app/actions/certificates.ts:416-532` (`signCertificate`), `:331-409` (`reopenCertificate`), `:65-165` (`issueCertificate`); columna `certificates.is_blocked` sin uso (`baseline.sql:2157`).
- Evidencia: solo comprueba `existing` por rol · `role: EDITOR_ROLES` (la organización con rol `client` queda fuera) · `if (signerUserIds.length >= 3)` cuenta firmas, no personas · `reopenCertificate` hace `update({ status: 'issued' })` sin `computeEligibility`.
- Impacto: un mismo líder firma «completion», «client» y «authority»; el representante del cliente (rol `client`) no puede firmar su certificado; no se comprueba que el certificado esté emitido antes de firmar; un certificado revocado se reemite aunque haya Cat A abiertos; no se exige el certificado de la fase anterior (MC antes que RFC); si después aparece un Cat A o se reabre un ITR, el certificado sigue «emitido». `issueCertificate` no es atómico: el error de insertar las excepciones Cat B se ignora (`:120-129`).
- Recomendación: RPC `issue_certificate` / `sign_certificate` en SQL (transacción, número atómico, excepciones en la misma transacción); firmantes distintos por rol con capacidad por rol (cliente = rol `client`); estado obligatorio; `reopen` vuelve a evaluar; `requires_previous` como en los gates; trigger que marque `is_blocked` o «regresado» cuando cambia la base (punch Cat A nuevo, ITR reabierto).
- Esfuerzo: M · Confianza: alta.

**C-14 · Alto · funcionalidad faltante** — No hay generación masiva de ITR: se asignan de a uno, tag por tag
- Ubicación: `TagItrTab.tsx:98-121` (único llamado a `createItrAssignment`); `itr-matrix.ts` (la matriz tipo de equipo × plantilla solo sirve para sugerir).
- Evidencia: `grep createItrAssignment` → solo `TagItrTab.tsx:103`.
- Impacto: con 5.000–50.000 tags, asignar ITR de a uno (5 a 6 toques cada uno) es inviable. La matriz aprobada por un editor ya tiene la información para generar todo. ICAPS, WinPCS, SmartCompletions y Bluerithm generan por reglas (tipo de equipo, disciplina, fase) y por alcance (subsistema o sistema).
- Recomendación: «Generar ITR» por alcance (proyecto / sistema / subsistema / selección de tags) × fase, desde la matriz aprobada, con vista previa (qué se crea, qué ya existe, qué falta en la matriz), asignación por defecto por disciplina o área, en lotes por RPC idempotente (`generate_itrs_from_matrix`) con número atómico.
- Esfuerzo: M-L · Confianza: alta.

**C-15 · Alto · bug** — Choque de número de ITR al usar una revisión nueva de la plantilla (y por carrera)
- Ubicación: `src/app/actions/itr-instances.ts:55-65`; `source-itrs.ts:52-53`; `UNIQUE (project_id, itr_number)` (`baseline.sql:4009`); las revisiones comparten `code` (`20260909230000…`).
- Evidencia: `.eq('tag_id', tagId).eq('template_id', templateId)` → `count = 0` con la revisión v2 → `itr_number = E01A/TAG` (ya existe con v1).
- Impacto: volver a probar un tag después de publicar una revisión da `duplicate key value violates unique constraint "itrs_project_id_itr_number_key"` (en inglés, crudo). Dos asignaciones simultáneas del mismo tag y plantilla chocan igual. Borrar un R2 hace que el siguiente repita número.
- Recomendación: numeración atómica en SQL por (proyecto, código de plantilla, tag/lazo/causa) con un contador, como `next_punch_number_atomic`; contar por `template.code`, no por `template_id`.
- Esfuerzo: S · Confianza: alta.

**C-16 · Alto · pérdida de datos** — Reimportar tags borra datos maestros y mueve tags de subsistema dejando sus ITR en el anterior
- Ubicación: `src/app/actions/import.ts:164-192` y `:217-219`; `ImportWizard.tsx:76-79`; `guard_itr_row` (el subsistema del ITR es inmutable).
- Evidencia: `manufacturer: textOrNull(row.manufacturer)` (siempre presente) · `preservation_required: row.preservation_required ?? false` · `description: textOr(row.description, tagNumber)` · `upsert(…, { onConflict: 'project_id,tag_number', ignoreDuplicates: false })`.
- Impacto: un Excel parcial (p. ej. solo TAG + SUBSISTEMA para corregir la jerarquía) pone en null fabricante, modelo, serie, P&ID, fluido y montaje, desactiva la preservación, reemplaza la descripción por el número de tag y recalcula el tipo de equipo. Si cambia el subsistema, el tag se mueve pero sus ITR siguen en el anterior (no se pueden mover) → la elegibilidad por subsistema (ITR por `itrs.subsystem_id`, punch por `punches.subsystem_id`) queda partida.
- Recomendación: aplicar a todas las columnas la regla «la columna ausente no se toca»; vista previa del diff por campo («cambian 340 fabricantes; 12 tags cambian de subsistema y tienen ITR»); bloquear o pedir confirmación para mover de subsistema un tag con ITR o punch, con un flujo explícito de «mover tag».
- Esfuerzo: M · Confianza: alta.

**C-17 · Alto · UX/flujo** — «Mi trabajo»: el ejecutor pierde el ITR antes de firmarlo y el supervisor lo ve sin poder firmar
- Ubicación: `src/lib/my-work/queues.ts:131-143`; `my_work_counts` (`20261016120000…:212-232`); `upsertResponse` pasa a `completed` al terminar el contenido (`itr-instances.ts:272-274`).
- Evidencia: ejecutor: `if (itr.status !== 'not_started' && itr.status !== 'in_progress') continue` · revisor: `if (itr.status !== 'completed') continue`.
- Impacto: apenas el inspector llena la última casilla, el ITR sale de su cola aunque no lo firmó; el supervisor y el cliente lo ven a la vez «por revisar», pero `sign_itr_atomic` les responde «Previous signature required». Los ITR «rechazado» (falla crítica) desaparecen de todas las colas. ITR olvidados sin firmar y confusión diaria.
- Recomendación: colas por **siguiente firma pendiente**: ejecutor hasta que firma (incluye completado sin su firma y rechazado), supervisor después de la firma del ejecutor, cliente después de la del supervisor; mismo criterio en `my_work_counts`.
- Esfuerzo: S · Confianza: alta.

### MEDIOS

**C-18 · Medio · UX/i18n** — Errores de la BD en inglés y textos fijos en español
- Ubicación: `itr-instances.ts:458` (`return { error: error.message }` de `sign_itr_atomic`: «Applicable content incomplete or rejected», «User not assigned to signing role», «Previous signature required», «ITR unavailable»); `TagItrTab.tsx:121,137-165` (textos en español fijos); `ItrExecution.tsx:293-295` («Loop check del lazo…»); `ItrListView.tsx:342` (`t('filters.allPhases').replace('All ', '')` → en español queda «Todas las fases ×»); `ItemRow.tsx:252`.
- Impacto: el inspector ve mensajes técnicos en inglés justo en el momento crítico (firmar). La app vende un PDF bilingüe pero la UI mezcla idiomas.
- Recomendación: códigos de error en las RPC (`USING ERRCODE`, `HINT`) mapeados a mensajes i18n en el servidor; pasar los textos fijos a `messages/*.json`; etiqueta propia para «Limpiar filtros».
- Esfuerzo: S-M · Confianza: alta.

**C-19 · Medio · rendimiento/pérdida de datos** — Guardado al perder el foco y `router.refresh()` de la página entera en cada guardado
- Ubicación: `ItemRow.tsx:126,145,159,203,257` (`onBlur`, inputs no controlados con `defaultValue`); `useItrAutosave.ts:75`; `page.tsx:59-66` (una URL firmada por adjunto, en `Promise.all`).
- Evidencia: `onBlur={e => onSave(item.id, { valueText: e.target.value || null })}` (también guarda si no cambió) · `if (pendingSavesRef.current === 0 && savedOnline) router.refresh()`.
- Impacto: cada salida de un campo hace una server action más un re-render completo en el servidor (plantilla, respuestas, firmas, N URLs firmadas, equipos, sugerencias, documentos): lento con 3G o satelital. Si el teléfono se bloquea o la app pasa a segundo plano sin perder el foco, lo escrito se pierde. Los inputs no se actualizan después del refresh (`defaultValue`).
- Recomendación: guardar con debounce y al ocurrir `visibilitychange`/`pagehide`; no guardar si el valor no cambió; actualizar solo el estado local con la respuesta de la acción (devolver `progress_pct`/`status`) y no hacer `router.refresh()`; `createSignedUrls` en lote.
- Esfuerzo: M · Confianza: alta.

**C-20 · Medio · bug de dominio** — Casilla desmarcada cuenta como respondida; un «No» no crítico pasa sin observación
- Ubicación: `evaluate_itr_capture` (`WHEN 'checkbox' THEN i.value_bool IS NOT NULL`); `ItemRow.tsx:85-113`.
- Impacto: marcar y desmarcar una casilla obligatoria la deja «completa» con `false`; un ITR puede llegar al 100 % con verificaciones sin hacer. Un «No» en un ítem no crítico no pide observación ni sugiere un punch.
- Recomendación: casilla obligatoria completa solo con `true` (o tres estados: OK / No OK / N/A); en un «No», pedir observación y ofrecer «Levantar punch» con el ítem precargado.
- Esfuerzo: S · Confianza: alta.

**C-21 · Medio · bug** — Descripción en español vacía deja el ítem en blanco
- Ubicación: `ItemRow.tsx:51-53`; `ItrExecution.tsx:456`.
- Evidencia: `(item.description_es?.trim() ?? item.description)` — si `description_es` es `''`, `''` no es nullish.
- Recomendación: `item.description_es?.trim() || item.description` (como en `TagItrTab.tsx:61`).
- Esfuerzo: S · Confianza: media (depende de si hay `''` en datos).

**C-22 · Medio · funcionalidad faltante** — El punch desde el ITR sale sin foto, sin vínculo al ítem y sin responsable
- Ubicación: `CreatePunchModal.tsx:11` (`itrItemId: _itrItemId` descartado), sin captura de foto; `PunchPhotosSection.tsx` (solo en la ficha del tag, con red, rol de editor, HEIC sin vista previa).
- Impacto: la evidencia fotográfica del defecto, que es lo más valioso, no se toma en el momento. No hay marcado sobre la foto (flechas, círculos), algo estándar en Bluerithm, Fieldwire y Procore. Se pierde la trazabilidad punch ↔ ítem del ITR.
- Recomendación: foto (o varias) en el modal, con cola sin red (como las fotos del ITR); guardar `itr_item_id`; asignado y fecha opcionales; marcado simple en canvas; conversión de HEIC a JPEG y compresión en el cliente.
- Esfuerzo: M · Confianza: alta.

**C-23 · Medio · flujo** — El supervisor no puede devolver un ITR con observaciones
- Ubicación: `reopen_itr_atomic` exige owner/admin/architect (`20260909180000…:250`); `ItrExecution.tsx:254`.
- Impacto: si el supervisor (líder) encuentra un error después de la firma del ejecutor, solo puede no firmar y pedir a un administrador que reabra. No hay estado «devuelto» con comentario ni notificación al ejecutor.
- Recomendación: acción «Devolver al ejecutor» para el supervisor asignado (o el cliente), con motivo obligatorio, que revoque las firmas previas, notifique y deje rastro (variante restringida de `reopen_itr_atomic`).
- Esfuerzo: S-M · Confianza: alta.

**C-24 · Medio · rendimiento/escala** — La importación manda el archivo entero en una sola server action
- Ubicación: `ImportWizard.tsx:218` (`importTags(projectId, rows)`); `next.config.ts:51-52` (`bodySizeLimit: '5mb'`); `import.ts` hace todos los lotes dentro de una sola invocación del Worker.
- Impacto: con unos 25 campos por fila, alrededor de 10–12 mil tags superan los 5 MB; además se suma el límite de CPU y tiempo del Worker. Un proyecto de 50 mil tags no se puede importar. Solo se muestran 10 errores y no se pueden descargar.
- Recomendación: lotes de 1–2 mil filas desde el cliente con barra de progreso y reanudación (o subir el archivo a storage y procesarlo en segundo plano); exportar el informe de errores a Excel.
- Esfuerzo: M · Confianza: alta.

**C-25 · Medio · bug/seguridad baja** — La búsqueda rompe el filtro `or()` de PostgREST
- Ubicación: `src/lib/list/params.ts:32-35` (solo quita `% _ \`); `itr-query.ts:33-37,49`; `fetchItrPage` lanza (`throw new Error`).
- Impacto: buscar `PT-101(A)` o `A,B` rompe la consulta y la lista falla. Con comas y puntos se pueden inyectar condiciones extra en el `or` (dentro de la propia organización por RLS).
- Recomendación: escapar o entrecomillar el valor (`"…"` en la sintaxis de PostgREST) o quitar `,()."`; usar una RPC de búsqueda.
- Esfuerzo: S · Confianza: media-alta.

**C-26 · Medio · seguridad/integridad** — Cualquier inspector o líder llena cualquier ITR; la firma del ITR no tiene límite de tamaño
- Ubicación: `itr-instances.ts:141-157` (`withAuth({})`, sin comprobar asignación); `page.tsx:68`; `signItr` (`:436-465`) no valida `signatureImage` (el certificado sí: 256 KB, `certificates.ts:432-436`).
- Impacto: no queda garantizado que quien capturó las respuestas sea el ejecutor asignado (solo se exige en la firma); se pueden guardar firmas base64 de varios MB por fila.
- Recomendación: capturar solo el ejecutor asignado o un líder+ (con registro); validar `data:image/png` y tamaño en `signItr` y en la RPC.
- Esfuerzo: S · Confianza: alta.

**C-27 · Medio · integridad** — Borrados sin control de estado ni auditoría
- Ubicación: `punches.ts:357-386` (`deletePunch`, cualquier estado, sin `logActivity`); `bulk.ts:85-123` (borra cerrados con evidencia); `itr-instances.ts:117-132` (`deleteItr`) y `TagItrTab.tsx:124-130` (ignora el error: un ITR firmado no se borra pero la UI no avisa); `punches.ts:472-504` (cualquier editor borra la foto de otro; primero borra en storage, después la fila).
- Recomendación: borrar solo en estado `open` sin evidencia (si no, cancelar con motivo); auditoría siempre; mostrar errores; borrado de fotos solo del autor o de un supervisor, primero la fila.
- Esfuerzo: S · Confianza: alta.

**C-28 · Medio · robustez** — El asistente de configuración no es transaccional y se puede repetir
- Ubicación: `src/app/actions/setup.ts:32-128` (`completeSetup` sin `withAuth`, con service role, sin validación de entrada).
- Impacto: un fallo a mitad de camino deja una organización sin proyecto o sin fases; como el usuario ya es miembro, el layout no lo devuelve a `/setup`. Cualquier usuario autenticado puede crear organizaciones sin límite.
- Recomendación: una RPC `bootstrap_org` en transacción; rechazar si el usuario ya es owner de una organización (o limitar la cantidad); validar con zod.
- Esfuerzo: S-M · Confianza: alta.

**C-29 · Medio · UX móvil** — La pantalla de ejecución y las listas no están pensadas para un teléfono
- Ubicación: `ItrExecution.tsx:541-612` (barra fija con 4–5 botones sin `flexWrap`), `:468,472` (`padding: '0 32px'`); `ItemRow.tsx:76-82` (botón ⚑ de unos 20 px); `ItrListView.tsx:182` (5 tarjetas en `repeat(5,1fr)`) y `:404` (grilla de columnas fijas sin desplazamiento horizontal); inputs numéricos sin `inputMode="decimal"`.
- Impacto: en 375 px los botones se desbordan; los objetivos táctiles quedan por debajo de 44 px (con guantes es peor); la lista se aplasta.
- Recomendación: barra inferior con acción principal más menú «⋯»; botones de 44 px como mínimo; vista de tarjetas en móvil; `inputMode`; navegación «siguiente ítem pendiente»; modo de alto contraste para exteriores.
- Esfuerzo: M · Confianza: alta.

**C-30 · Medio · funcionalidad faltante** — Las listas de ITR no filtran por subsistema, sistema, área ni responsable
- Ubicación: `src/lib/list/itr-types.ts:30-36` (solo estado, fase, disciplina, texto y proyecto).
- Impacto: el trabajo de completions se organiza por subsistema y por cuadrilla; sin estos filtros, el líder no puede armar el paquete del día ni el inspector ver «mis ITR».
- Recomendación: agregar `subsystem`, `system`, `area`, `assignee` y «solo míos», con índices en la vista; filtros guardados.
- Esfuerzo: S-M · Confianza: alta.

**C-31 · Medio · UX/funcionalidad** — QR: patrón de tag restrictivo y resolución ambigua; no hay etiquetas QR por tag
- Ubicación: `src/components/QRNFCScanner.tsx:60-79` (regex `^[A-Z]{2,4}-\d{3,6}-…$` más `toUpperCase()`); `tag_360/[tagId]/page.tsx:31-32` (`eq('tag_number', …).maybeSingle()` en toda la organización).
- Impacto: tags reales como `PT-1001`, `21-PT-1001A` o `ESDV-7621001` no se reconocen; si el mismo número de tag existe en dos proyectos, `maybeSingle` falla y aparece «no encontrado»; no hay impresión de etiquetas QR para tags (solo para registros).
- Recomendación: un QR propio por tag (`/t/<uuid>`) con PDF de etiquetas por subsistema; aceptar cualquier texto y buscar en el proyecto actual; si hay varios resultados, mostrar un selector.
- Esfuerzo: S-M · Confianza: alta.

**C-32 · Medio · integridad** — Firmas del PSSR débiles
- Ubicación: `pssr.ts:330-357` (cualquier miembro, disciplina en texto libre, sin comprobar estado); `:196-232` (ítems editables en cualquier estado).
- Impacto: no se exige un conjunto de disciplinas (Operaciones, HSE, Mantenimiento…); quien aprueba puede ser el único firmante; se pueden cambiar respuestas después de aprobado.
- Recomendación: disciplinas requeridas por plantilla; firmas solo en `pending_approval`; ítems bloqueados después de enviar.
- Esfuerzo: S-M · Confianza: alta.

**C-33 · Medio · bug** — Numeración de certificados y del RFSU frágil
- Ubicación: `certificates.ts:97-103` (`like('certificate_number', `${certType}/${subsystem.code}%`)` → `SS-01` también cuenta `SS-010`); `pssr.ts:422-428` (`RFSU-` más el conteo de **todos** los certificados del proyecto); sin atomicidad.
- Recomendación: contador atómico en SQL por tipo y subsistema.
- Esfuerzo: S · Confianza: alta.

**C-34 · Medio · seguridad** — La RLS `itrs_update` = cualquier miembro, incluido el cliente
- Ubicación: `20260903200000_rls_set_based_policies.sql:53`; `guard_itr_row` solo impide «aprobado» y los cambios cuando hay firmas.
- Impacto: con su JWT, un cliente o inspector puede cambiar por REST `status` (a no aprobado), `progress_pct`, `scheduled_date` y `completed_date` de ITR sin firmar: manipulación de avance.
- Recomendación: en el trigger, para escrituras no confiables, permitir solo los campos de planificación a editores; el estado y el avance, solo derivados (que los calcule la RPC de respuestas).
- Esfuerzo: S · Confianza: alta.

**C-35 · Medio · integridad** — Conflictos sin red resueltos con el reloj del dispositivo; se pierde la hora real de captura
- Ubicación: `replay.ts:57` (`serverRow.responded_at > item.updatedAt`); `upsertResponse` fija `responded_at = now()` al sincronizar (`itr-instances.ts:194-196`).
- Impacto: con el reloj del teléfono atrasado o adelantado (frecuente sin red), gana la versión equivocada; el ITR registra la hora de sincronización, no la de la inspección. La fase 6 ya resolvió esto con `p_captured_at` acotado.
- Recomendación: enviar `captured_at` (acotado como en arranque) y comparar con el `responded_at` que vio el cliente (compare-and-set con versión), no con relojes.
- Esfuerzo: M · Confianza: alta.

### BAJOS

**C-36 · Bajo · bug** — Posible desajuste de hidratación: `useState` lee `localStorage` al inicializar (`ItrExecution.tsx:59-64`). Leerlo en un efecto. S · alta.

**C-37 · Bajo · mantenibilidad** — Código muerto: `useSyncConflictResolution.ts` (sin usos) registra etiquetas de Background Sync (`commup-itr-sync`) que el SW no escucha (`sw.js:165`, `commup-itr-responses-sync`); la cola real nunca registra Background Sync. Borrar o unificar. S · alta.

**C-38 · Bajo · rendimiento** — `saveItrSnapshot` escribe el ITR completo (incluidas firmas en base64) en cada cambio de props, nunca se lee ni se purga (`useItrAutosave.ts:22-29`). Usarlo (C-09) o quitarlo. S · alta.

**C-39 · Bajo · bug** — En el cron de preservación vencida, `.in('id', tagIds)` con hasta 2000 UUID supera el largo de URL de PostgREST, y el `limit(2000)` es global, para todas las organizaciones (`api/cron/preservation-overdue/route.ts:44-62`). Agrupar en lotes de 200 y paginar. S · media.

**C-40 · Bajo · coherencia de permisos** — Plantillas editables por el líder (`itr-templates.ts`, `EDITOR_ROLES`) cuando CLAUDE.md indica PRIVILEGED; `createItrAssignment` no comprueba que la plantilla esté activa ni que el subsistema coincida con el del tag, y no valida el rol de la persona asignada (se puede asignar un cliente como ejecutor). S · alta.

**C-41 · Bajo · rendimiento** — Una llamada `createSignedUrl` por adjunto (`page.tsx:59-66`, `punches.ts:416-431`). Usar `createSignedUrls`. S · alta.

**C-42 · Bajo · pérdida de datos** — Borrar un tag borra en cascada su historial de preservación (`baseline.sql:5888`, `ON DELETE CASCADE`). Usar RESTRICT o borrado lógico. S · alta.

**C-43 · Bajo · costo** — `generateMatrixWithAi` hace una llamada no streaming de 16k tokens sin límite de frecuencia y la puede lanzar cualquier líder (`itr-matrix.ts:160-200`). Límite por organización y por día, y streaming. S · alta.

**C-44 · Bajo · UX** — La cola `punches_verify` de `my_work_counts` cuenta todos los punch resueltos de la organización para todos los usuarios, y `signatures` cuenta todos los certificados para cualquier rol: ruido en el contador del menú lateral. Filtrar por disciplina, rol o asignación. S · alta.

---

## 4. Propuestas estratégicas (para ser opción de primer nivel en la industria)

1. **Motor de generación de alcance** (cierra C-14): reglas «tipo de equipo × fase → plantilla» (la matriz ya existe) más alcance por sistema o subsistema, con vista previa de diferencias, generación idempotente y regeneración cuando cambia la ingeniería (tags nuevos → ITR nuevos; tags eliminados → ITR huérfanos marcados). Es lo primero que evalúa un comprador de ICAPS o WinPCS.
2. **Matriz de firmas configurable** (cierra C-01, C-13, C-32): por plantilla o fase, roles requeridos, orden, capacidad (como `cosign_roles` de los gates) y firma con nueva autenticación (PIN o contraseña) para que valga como firma electrónica auditable (estilo 21 CFR Part 11 o eIDAS simple). Firma masiva del supervisor sobre ITR revisados, con vista previa en PDF.
3. **«Paquete de campo» sin red de verdad** (cierra C-07/C-08/C-09/C-35): el inspector descarga sus ITR del día (plantillas, datos del tag, P&ID en miniatura, punch abiertos del tag), trabaja con la cola por usuario, versión y hora de captura, ve una bandeja «pendiente/rechazado» por ITR y resuelve conflictos. Hoy es el diferenciador anunciado y es frágil.
4. **Punch de primer nivel**: foto con marcado, voz a texto (MicAppend ya existe), ubicación en el P&ID (los hotspots ya existen), responsable por empresa o contratista (fase 8 ya tiene empresas), fecha objetivo por categoría, cola del contratista con un portal de acceso limitado, y walkdown masivo («recorrido del subsistema»: lista de punch rápida con cámara continua).
5. **Certificados como objetos vivos**: foto congelada de la base (ITR y punch) al emitir, invalidación o regresión automática, `requires_previous`, numeración atómica, PDF con el anexo de excepciones Cat B, y paquete de dossier del subsistema (ITR + punch + certificados + documentos) con un clic.
6. **Tableros por disciplina y por subsistema**: curva S de ITR por disciplina y fase (los snapshots por fase ya existen), cuadrilla del día, tasa de rechazo por plantilla (calidad), tiempo medio entre «resuelto» y «verificado», punch por contratista. El cliente pide eso en la reunión semanal.
7. **Cerrar los atajos de integridad en la BD** (C-04, C-10, C-11, C-12, C-34): mover todas las transiciones de estado (punch, PSSR, certificado, preservación) a RPC SECURITY DEFINER con triggers de guarda, como ya se hizo con el ITR. Es la promesa que se vende («no se puede saltar»); hoy solo vale para el ITR.
8. **Importación industrial**: lotes, reanudación, diff por campo, plantillas de mapeo guardadas por cliente (SPI/SmartPlant, Excel del EPC) y sincronización incremental por API (ya existe la v1).
9. **QR/NFC de punta a punta**: etiqueta por tag, escanear → «mis ITR de este tag / levantar punch / preservación vencida» en un toque.
10. **Calidad de datos de campo**: rangos de aceptación con unidades y conversión, valores fuera de rango que exigen observación, foto obligatoria configurable por ítem crítico, y antifraude básico (EXIF/GPS de la foto, fotos repetidas).

---

## 5. Funcionamiento para el manual (paso a paso por rol)

Roles de la organización: **owner** (dueño), **admin**, **architect** (configura y estructura), **leader** (líder de disciplina o supervisor), **inspector** (ejecuta en campo), **client** (representante del cliente; solo lectura, más firmas y verificación). Notas marcadas con ⚠ = comportamiento actual que conviene conocer (ver hallazgos).

### 5.1 Configuración inicial (owner)
1. Registrarse e iniciar sesión → la app redirige a `/setup` si el usuario no pertenece a ninguna organización.
2. Asistente de 4 pasos: (1) tu nombre (no puede ser el correo); (2) organización y proyecto (código, ubicación, cliente, país, región, fechas); (3) fases (por defecto A/B/C/D, cada una con el nombre del certificado: MC, RFPC, RFC, RFSU); (4) disciplinas (código, nombre y color).
3. Al terminar se crean el catálogo de tipos de equipo y una plantilla PSSR de 22 ítems. Por trigger se siembra un gate de readiness por fase.
4. Proyectos adicionales: owner, admin o architect desde «Nuevo proyecto» (solo el paso de proyecto).
- Errores comunes: un corte de red en el último paso puede dejar la organización a medias (⚠ C-28); el código de proyecto se guarda en mayúsculas.

### 5.2 Jerarquía e importación de tags (owner, admin, architect)
1. Proyecto → **Importar**. Subir un .xlsx o .xls: la app elige la hoja con más encabezados reconocibles y detecta la fila de encabezados.
2. Columnas: **TAG** (obligatoria), DESCRIPCIÓN, DISCIPLINA (o elegir una para todo el archivo), AREA_CODE/NAME, SYSTEM_CODE/NAME, SUBSYSTEM_CODE/NAME, TIPO DE EQUIPO, P&ID, FABRICANTE, MODELO, SERIE, PRESERVACIÓN (SI/YES), DATASHEET y su revisión, RANGO MIN/MAX, UNIDAD, CAJA DE CONEXIONES, CRITICIDAD, SIL.
3. Vista previa: muestra las primeras 30 filas y marca las que ya existen. Importar = crear las nuevas y actualizar las existentes (se conserva su estado y avance).
4. La jerarquía área → sistema → subsistema se crea sola; los códigos son únicos por proyecto. Sin código, el tag va a GENERAL / GEN-SYS / GEN-SUB.
- Errores comunes: disciplina inexistente → fila omitida; el mismo código bajo dos padres → aviso y se usa el primero; tags repetidos → gana la última fila.
- ⚠ Reimportar un Excel parcial **borra** fabricante, modelo, serie, P&ID y el indicador de preservación de los tags existentes, y puede mover tags de subsistema (C-16). Importar siempre el archivo completo. ⚠ Por encima de unos 10 mil tags, importar por partes (C-24).

### 5.3 Plantillas ITR (owner, admin, architect, leader)
1. Admin → **Plantillas**. Crear una o importarla del catálogo público u otra organización (clonar), o restaurar un respaldo.
2. Encabezado: código (p. ej. E13B), título EN/ES, disciplina, fase, tipo de equipo, «requiere equipo de prueba».
3. Secciones e ítems: tipos checkbox, sí/no, texto, número, medición (mín/máx/unidad), selección (opciones con resultado pasa/falla/NA y justificación), foto, fecha, documento PDF, continuidad por conductores, tabla (fija, variable o desde lazo/C&E). Marcas: crítico (una falla rechaza el ITR), obligatorio, requiere foto, requiere documento, condición (se muestra si otro ítem tiene un valor).
4. **Activar** la revisión. Una revisión con ITR asignados es inmutable: para cambiarla, «Nueva revisión» → editar → activar (las demás del mismo código se desactivan y la matriz se re-apunta).
5. Admin → Plantillas → **Matriz**: la IA propone tipo de equipo × plantilla con motivo y confianza; el editor acepta o rechaza. La matriz ordena las sugerencias en la ficha del tag (no genera ITR).
- Errores comunes: activar sin ítems o con selecciones sin opciones → error; editar una revisión ya usada → «Assigned revision is immutable».

### 5.4 Generar y asignar ITR (owner, admin, architect, leader)
1. **Por tag**: Tag → pestaña ITR → «+ Asignar ITR» (o «✦ Sugerir con IA») → plantilla (solo activas de la disciplina del tag; primero las recomendadas) → inspector (obligatorio), supervisor y cliente (opcionales en pantalla), fecha → Asignar. Número: `CÓDIGO/TAG` y, si se repite, `R2`, `R3`…
2. **Por lazo o causa C&E**: Lazos (o Matrices C&E) → seleccionar → Generar ITR (máximo 200) → plantilla con tabla de origen → inspector y supervisor. La tabla toma una foto de las señales o efectos en ese momento.
3. **Reasignar ejecutor en masa**: lista de ITR del proyecto → seleccionar → «Asignar a».
4. Agregar a un plan de trabajo diario desde la lista o el tag.
- ⚠ **Asignar siempre ejecutor, supervisor y cliente**: hoy el ITR solo queda «aprobado» con las tres firmas y no hay pantalla para agregarlas después (C-01). Los ITR de lazo y C&E no tienen cliente.
- ⚠ No hay generación masiva por subsistema (C-14). ⚠ Asignar un ITR con una revisión nueva a un tag que ya tenía uno puede dar «duplicate key» (C-15).

### 5.5 Ejecutar y firmar un ITR en campo (inspector; también leader, architect, admin y owner)
Precondiciones: ser miembro del proyecto; ITR sin firmas y no aprobado. Para firmar: estar asignado al rol y que hayan firmado los roles anteriores.
1. Entrar desde **Mi trabajo** («por ejecutar»), desde el tag o escaneando el QR o NFC del tag.
2. Cabecera: número, plantilla y revisión, fase, datos maestros del tag (desplegable), avance, estado de las firmas. Botón ES/EN para el idioma de los ítems.
3. Registrar el **equipo de prueba** si la plantilla lo exige (inventario de la organización; si está vencido en la fecha de uso, bloquea la firma).
4. Completar los ítems: se guardan solos al salir del campo (texto, número, fecha) o al tocar (casilla, sí/no, selección, tabla). Las fotos se toman con la cámara trasera; los documentos son PDF de hasta 10 MB y necesitan red. Las mediciones muestran el criterio y Pasa/Falla. El micrófono dicta observaciones.
5. Un ítem crítico en falla pone el ITR en **rechazado**: corregir o levantar punch (⚑).
6. **Firmar**: con el ITR completado, botón Firmar → elegir el rol habilitado → firmar en el recuadro → Confirmar. Orden: ejecutor → supervisor → cliente. Con las tres firmas → aprobado → PDF disponible.
7. **Sin red** (PWA instalada y el ITR abierto antes con red): las respuestas, fotos, punch y firmas quedan «pendiente» (⏳) y se envían al volver la red; el pie muestra «Sin conexión · N pendientes».
8. **Reabrir** (owner, admin o architect): «Revocar» con motivo → se borran las firmas, se notifica a los firmantes y queda la foto completa en la auditoría.
- Errores comunes (hoy aparecen en inglés, C-18): «User not assigned to signing role» (no eres el asignado de ese rol); «Previous signature required» (falta la firma anterior); «Applicable content incomplete or rejected» (faltan ítems o hay falla crítica); equipo de prueba vencido.
- ⚠ Los ITR de loop check o C&E hoy no habilitan el botón Firmar (C-02). ⚠ Al terminar el contenido, el ITR sale de «por ejecutar» aunque falte tu firma: firmar enseguida (C-17). ⚠ No cerrar la app con un campo de texto abierto: se guarda al salir del campo (C-19). ⚠ Sin red, no recargar la página: las respuestas encoladas no se muestran hasta sincronizar (C-09). ⚠ En una tableta compartida, sincronizar antes de cerrar sesión (C-08).

### 5.6 Punch list (levantar, resolver, verificar, transferir)
1. **Levantar** (hoy: owner, admin, architect, leader ⚠ C-03; el inspector no puede): desde el ITR (⚑ en un ítem o «Punch» en el pie) o desde Tag → Punch → «+». Categoría (A bloquea; B se transfiere con excepción; C nunca bloquea), **impacto** obligatorio (seguridad, ambiente, proceso, equipo, operabilidad), descripción, fecha objetivo y responsable (solo desde el tag). Número correlativo atómico por proyecto.
2. **Revisar la categoría** (líder+, persona distinta de quien lo levantó): confirmar o recategorizar con motivo; cola «por revisar» en Mi trabajo.
3. **Disposición para el arranque** (cerrar antes del arranque / con controles / largo plazo): exigida por el PSSR para todo punch abierto del sistema.
4. **Resolver** (cualquier rol excepto client): describir qué se hizo (5 caracteres como mínimo); si no hay fotos, pide confirmación. Las fotos se suben en Tag → Punch → detalle (con red).
5. **Verificar en campo** (cualquier miembro, incluido el cliente, distinto de quien lo resolvió): aceptar = cerrado; rechazar = vuelve a «en curso» con motivo obligatorio.
6. **Cat B a operaciones**: `/ops/punches` → transferir a una persona de operaciones con fecha objetivo y notas → seguimiento post-handover (en curso, diferido, resuelto, verificado, cierre final).
- ⚠ «Cancelar» es un clic sin motivo y saca el punch del bloqueo del certificado (C-11). ⚠ El cierre final de operaciones no exige verificación (C-04).

### 5.7 Preservación
1. **Procedimientos** (líder+; borrar: architect+): Admin → Plantillas → Preservación; ítems con tipo, frecuencia e intervalo en días, foto requerida; importables del catálogo.
2. **Plan** (líder+): Tag → Preservación → asignar procedimiento, fecha de inicio y responsable → próxima fecha = inicio + intervalo.
3. **Ejecutar** (cualquier miembro): abrir el plan → responder los ítems → fotos → el resultado se calcula (NOK si hay una falla crítica; se puede cambiar a mano) → «Levantar punch» opcional con categoría → **Finalizar**.
4. Vencidos: aparecen en Mi trabajo y en la vista global de Preservación; un cron diario notifica al responsable.
- ⚠ Hoy, si ejecuta un inspector, la próxima fecha no avanza y el registro no queda finalizado aunque se vea ✓ (C-05). ⚠ Si ejecuta un editor, la fecha avanza al primer toque (C-06): no abrir un plan «para ver».

### 5.8 PSSR
1. Plantillas (líder+): Admin → Plantillas → PSSR (la estándar de 22 ítems viene sembrada).
2. **Crear la revisión** (líder+): Proyecto → PSSR → sistema + plantilla → se copian los ítems.
3. **Llenar** (cualquier miembro): cada ítem Sí / No / NA, responsable, acciones y fecha. Un «No» crea una acción en Gestión diaria.
4. **Enviar a aprobación** (cualquier miembro): exige todos los ítems en Sí o NA, que todo punch abierto del sistema tenga disposición y que ninguno «cerrar antes del arranque» siga abierto.
5. **Firmar** (cualquier miembro, una firma por persona, disciplina en texto libre).
6. **Aprobar** (líder+): se emite un certificado RFSU del sistema (fase cuyo certificado empieza por RFSU). **Rechazar** con motivo.
- ⚠ Hoy «Aprobar» no exige que esté enviado ni revisa los ítems, y basta con una firma (C-12, C-32): aplicar la regla por procedimiento interno.

### 5.9 Certificados (MC, RFPC, RFC, RFSU)
1. Proyecto → Certificados → elegir subsistema × fase → la elegibilidad se muestra en verde, amarillo o rojo.
   - Rojo: sin ITR en la fase, algún ITR sin aprobar, un Cat A abierto en el subsistema o Cat B por encima del límite (3 por defecto; configurable en `settings.max_open_cat_b_per_subsystem`).
   - Amarillo: Cat B dentro del límite → cada uno exige una justificación al emitir.
2. **Emitir** (líder+): notas más las justificaciones Cat B → número `TIPO/SUBSISTEMA` (reemisiones `-R2`…). Se notifica a owner, admin y architect para firmar.
3. **Firmar** (líder+): roles completion, client y authority, uno por rol, con firma dibujada. Con las tres → notificación «emitido y firmado».
4. **Revocar** (architect+, con motivo): borra las firmas y deja el certificado «rechazado»; **Reabrir** (architect+, con motivo) lo vuelve a «emitido».
- ⚠ Hoy una misma persona puede firmar los tres roles y el usuario con rol client no puede firmar (C-13); reabrir no vuelve a evaluar los punch ni los ITR; el certificado no se invalida si después aparece un Cat A.

### 5.10 Planes de trabajo (leader+)
1. Proyecto → Planes de trabajo → crear (disciplina y fecha) → agregar ITR (desde la lista de ITR o el tag) con responsable → publicar.
2. El inspector los ve en Mi trabajo («plan del día»). Un ítem se completa solo cuando su ITR se aprueba; el estado manual lo cambian líder+.

### 5.11 Matriz rápida de «quién hace qué» (estado actual del código)
| Acción | owner | admin | architect | leader | inspector | client |
|---|---|---|---|---|---|---|
| Configurar e importar tags | ✓ | ✓ | ✓ | – | – | – |
| Editar plantillas y matriz | ✓ | ✓ | ✓ | ✓ | – | – |
| Asignar o generar ITR | ✓ | ✓ | ✓ | ✓ | – | – |
| Capturar respuestas ITR | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| Firmar ITR (si está asignado al rol) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Reabrir ITR firmado | ✓ | ✓ | ✓ | – | – | – |
| Levantar punch | ✓ | ✓ | ✓ | ✓ | ⚠ no (C-03) | – |
| Resolver punch | ✓ | ✓ | ✓ | ✓ | ✓ | – |
| Verificar o cerrar punch (otra persona) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Revisar la categoría de un punch | ✓ | ✓ | ✓ | ✓ | – | – |
| Ejecutar preservación | ✓ | ✓ | ✓ | ✓ | ⚠ parcial (C-05) | – |
| Aprobar PSSR / emitir RFSU | ✓ | ✓ | ✓ | ✓ | – | – |
| Emitir o firmar certificado | ✓ | ✓ | ✓ | ✓ | – | ⚠ no (C-13) |
| Revocar o reabrir certificado | ✓ | ✓ | ✓ | – | – | – |
