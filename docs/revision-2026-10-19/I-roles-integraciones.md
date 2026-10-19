# Revisión I — Roles y permisos + Integraciones (CommUp)

Fecha: 2026-10-19 · Revisor I · Revisión estática, solo lectura, sobre `main` (922b861). No se ejecutaron consultas, servidores ni builds. Cada hallazgo indica su nivel de confianza. «Alta» significa que lo verifiqué en el código y en las migraciones. «Media» significa que depende de configuración de producción que no está en el repo (GRANTs, pg_cron, ajustes de Auth).

---

## 1. Resumen

El modelo de roles de CommUp tiene dos capas que no siempre coinciden.

- **Capa de aplicación.** Son los server actions con `withAuth` y los guards de página. Está ordenada y casi siempre es correcta.
- **Capa de base de datos.** La forman las políticas RLS heredadas del baseline más las RPC `SECURITY DEFINER` de las fases F1–F8. Las RPC nuevas (gates, registros, gestión diaria, arranque, traspasos, desempeño, documentos, vendors) son de buena calidad: verifican el rol, exigen que otra persona apruebe o verifique, escriben solo por RPC y quedan auditadas. Las políticas RLS de las tablas «viejas» (punches, ITR, preservación, api_keys, org_members, projects) son mucho más laxas que los actions. Como el navegador tiene la anon key y la sesión del usuario, **la RLS es la verdadera frontera**, y en varias tablas cualquier miembro (incluido `client`) puede hacer por REST lo que la UI le prohíbe.

Problemas principales, en orden de gravedad:

1. **Escalada crítica: cualquier miembro de la org puede crear una API key con alcance `*`.** La política `"org members can manage api_keys"` es `FOR ALL` para cualquier miembro. Esa key opera con el cliente service-role en toda la org.
2. **El rol `inspector` está mal cableado para su trabajo real.**
   - No puede levantar punches: `createPunch` exige EDITOR. Sin embargo, el botón aparece en la ejecución del ITR y la leyenda de roles dice «Ejecutar ITRs, crear punches».
   - Los punches que encola offline se descartan después de 3 reintentos.
   - Al finalizar un registro de preservación no se guarda nada y la UI no muestra error.
3. **Las reglas de firma del ITR y del certificado no exigen independencia.**
   - El ITR exige siempre 3 firmas (ejecutor, supervisor y cliente). Si no se asignó cliente, el ITR nunca se aprueba.
   - Nada impide asignar a la misma persona en los tres roles y que se autoapruebe.
   - En el certificado, el usuario con rol `client` no puede firmar como Cliente: solo firman los EDITOR. Además, la misma persona puede firmar las tres capacidades.
4. **No existe membresía por proyecto.** `is_project_member` equivale a «miembro de la org dueña del proyecto». Un `client` ve todos los proyectos de la org, incluidos los de otros clientes y la gestión interna del EPC. Las capacidades «Operaciones» y «HSE» (gates, hold points, traspasos) las puede firmar cualquier `leader`: no están ligadas a la función real de la persona.
5. **Las integraciones de eventos están rotas casi por completo.**
   - El trigger emite eventos en plural (`punches.updated`), pero el catálogo de webhooks y el push usan nombres en singular (`punch.closed`, `itr.approved`, `certificate.ready`). Por eso las suscripciones a eventos concretos no reciben nada.
   - Hay **dos triggers** que despachan cada evento al dispatcher, lo que genera entregas duplicadas.
   - En el repo no hay ningún scheduler para los reintentos.
   - El web push depende de eventos que no se emiten nunca.
   - Un workflow «punch creado → crear punch» entra en bucle infinito.
6. **Faltan las integraciones que un cliente industrial pide.** No hay SSO/SAML, no hay MFA, no hay conectores reales para SAP PM/Maximo/Aconex (P6 es un POC que necesita la service key) y no hay exportación del audit log.

Lo bueno: el wrapper `withAuth` está aplicado en todos los actions. Las RPC F1–F8 (gates con multifirma, punch verify por otra persona, line-up, hold points, traspasos, PTC) son lo mejor del producto en controles de independencia. El dispatcher de webhooks y el executor de workflows tienen una buena defensa anti-SSRF y aislamiento por org.

**Conteo de hallazgos:** 1 Crítico · 11 Altos · 10 Medios · 6 Bajos (28 en total).

---

## 2. Matriz de roles (rol × capacidad, según el código que la aplica)

Leyenda: ✓ permitido · ✗ denegado · ◐ condicionado (ver nota) · ⚠ la UI y la BD no coinciden (ver hallazgo).
Roles: **O**=owner · **A**=admin · **Ar**=architect · **L**=leader · **I**=inspector · **C**=client.
Tiers de TS (`src/lib/auth/permissions.ts`): OWNER=[O]; ADMIN=[O,A]; PRIVILEGED=[O,A,Ar]; EDITOR=[O,A,Ar,L]. Equivalentes SQL: `is_org_admin`=[O,A], `is_org_editor`/`is_project_editor`/`get_my_editor_project_ids`=[O,A,Ar,L], `is_project_member`/`get_my_project_ids`=cualquier miembro de la org.

### 2.1 Organización, usuarios e integraciones

| Capacidad | O | A | Ar | L | I | C | Dónde se aplica |
|---|---|---|---|---|---|---|---|
| Crear org (wizard) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | `setup.ts completeSetup`: cualquier usuario autenticado, con admin client y sin comprobar membresía previa |
| Borrar proyecto | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | `projects.ts deleteProject` OWNER (la RLS `projects_delete` permite O,A) |
| Crear o editar proyecto | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | `setup.ts createProject`, `projects.ts updateProject` PRIVILEGED; RLS `projects_insert` con tautología ⚠ (I-13) |
| Configuración de fases, disciplinas, tipos de equipo, glosario, logo, límite Cat B | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | `config.ts` ADMIN; `/admin/config` ADMIN |
| Catálogo de plantillas de la org | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | `config.ts setOrgTemplateCatalog` OWNER |
| Invitar usuario | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | `users.ts inviteUser` ADMIN; invitar a un owner solo puede hacerlo un owner (en el action) |
| Cambiar rol o quitar miembro | ✓ | ◐ | ✗ | ✗ | ✗ | ✗ | `users.ts` ADMIN; el admin no toca owners, pero solo en el action. La RLS `org_members_update/delete` = `is_org_admin` ⚠ (I-12) |
| Empresas (alta, edición, asignar a miembro) | ✓ | ✓ | ✗⚠ | ✗⚠ | ✗ | ✗ | `documents.ts saveCompany/setMemberCompany` ADMIN + RPC `save_company`; la página y el sidebar dejan entrar a EDITOR (I-15) |
| Gates: configurar (crear, criterios, orden, pesos) | ✓ | ✓ | ✗◐ | ✗ | ✗ | ✗ | `gates-admin.ts` ADMIN + RLS `is_org_admin`; `set_gate_weights` SQL acepta Ar (I-15) |
| Tipos de registro (activar, bloquear gate) | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | `registers.ts configureRegisterType` PRIVILEGED = SQL `configure_register_type` |
| Equipos de prueba (alta, edición, certificado) | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | `test-equipment.ts` EDITOR; borrar = ADMIN |
| API keys (crear, revocar) | ✓ | ✓ | ✓ | ◐ | **✓⚠** | **✓⚠** | Action PRIVILEGED; RPC `create_api_key` = `is_org_editor` (L); **la RLS `api_keys` FOR ALL deja insertar a cualquier miembro** (I-01) |
| Webhooks (crear, activar, borrar) | ✓ | ✓ | ✓ | ◐ | ✗ | ✗ | Action PRIVILEGED; RPC = `is_org_editor`; el SELECT (con `secret`) está abierto a todos (I-11) |
| Workflows | ✓ | ✓ | ✓ | ◐ | ✗ | ✗ | Action PRIVILEGED; RLS `workflow_rules_*` = `is_org_editor` (L por REST) |
| Audit log (ver) | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | `/admin/audit` ADMIN; la RLS `activity_log_select` deja leer a cualquier miembro por REST |
| Data quality | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | `/admin/data-quality` PRIVILEGED (los actions de lectura no tienen rol) |
| Handover (generar paquete) | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | `handover.ts` PRIVILEGED |
| Exportar proyecto a Excel | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | `api/admin/export` O,A (usa la *primera* membresía, I-22) |
| Preferencias de push propias | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | `api/push/*`: cada usuario las suyas |

### 2.2 Ingeniería, plantillas y estructura

| Capacidad | O | A | Ar | L | I | C | Dónde se aplica |
|---|---|---|---|---|---|---|---|
| Plantillas ITR, PSSR y preservación: crear o editar | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | `itr-templates.ts`, `pssr.ts`, `preservation.ts` EDITOR; RLS `is_org_editor` |
| Plantillas ITR o PSSR: borrar | ✓ | ✓ | ✓ | ⚠ | ✗ | ✗ | Action EDITOR, pero la RLS de delete = O,A,Ar → para L es un no-op silencioso (I-14). Borrar procedimiento de preservación = PRIVILEGED |
| Matriz ITR con IA, traducciones con IA | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | `itr-matrix.ts`, `itr-translations.ts` EDITOR |
| Importar tags o señales (Excel) | ✓ | ✓ | ✓ | ✗⚠ | ✗ | ✗ | `import.ts`/`import-signals.ts` PRIVILEGED; el sidebar se lo muestra a L (I-15) |
| Editar o borrar tag | ✓ | ✓ | ✓ | ✗◐ | ✗ | ✗ | `tags.ts` PRIVILEGED; la RLS `tags_update` permite L |
| Vincular NFC | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | `tags.ts linkNfcToTag` EDITOR |
| Sistemas: editar, congelar límites, dependencias, importar | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | `systems.ts` EDITOR |
| Sistematización con IA | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | `systems-ai.ts` EDITOR |
| Lazos, matrices C&E (también import con IA) | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | `ce-matrix.ts`, `ce-import.ts` EDITOR; RLS `loops_write` editor |
| P&ID: documentos y hotspots | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | `pid-*.ts` EDITOR (la página solo muestra edición a PRIVILEGED) |

### 2.3 Ejecución de campo

| Capacidad | O | A | Ar | L | I | C | Dónde se aplica |
|---|---|---|---|---|---|---|---|
| Crear ITR o asignar (ejecutor, supervisor, cliente) | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | `itr-instances.ts createItrAssignment`, `itr-assign.ts` EDITOR; RLS `itr_assignments_*` editor |
| Capturar respuestas, fotos o tablas del ITR | ✓ | ✓ | ✓ | ✓ | ✓ | ✗◐ | `upsertResponse` sin rol; UI `editable && role!=='client'`; **la RLS deja escribir a C** (I-04) |
| Firmar ITR como ejecutor, supervisor o cliente | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ | `sign_itr_atomic`: solo el usuario **asignado** a ese rol, en orden E→S→C. No se exige rol de org ni persona distinta (I-05) |
| Aprobar ITR | – | – | – | – | – | – | Automático cuando hay 3 firmas distintas; sin firma cliente nunca se aprueba (I-05) |
| Reabrir o revocar ITR aprobado | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | `revokeItrApproval` PRIVILEGED = `reopen_itr_atomic` |
| Borrar ITR (sin firmas) | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | `deleteItr` EDITOR + guard trigger |
| Aprobar en masa, cambios de estado en masa | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | `bulk.ts` EDITOR |
| **Levantar punch** | ✓ | ✓ | ✓ | ✓ | **✗⚠** | ✗⚠ | `createPunch` EDITOR; el botón es visible para todos en ITR y tag; **la RLS `punches_insert` permite a cualquier miembro** (I-02, I-04) |
| Comentar o adjuntar en un punch | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | `addPunchComment`/`addPunchAttachment` EDITOR (la RLS `punch_comments_insert` permite a cualquiera) |
| Reasignar punch, cambiar estado | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | `reassignPunch`/`updatePunchStatus` EDITOR; la RLS `punches_update` permite a cualquiera (I-04) |
| Resolver punch (con evidencia) | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | RPC `resolve_punch`: cualquiera salvo client |
| Verificar y cerrar punch | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ | RPC `verify_punch`: **cualquier miembro, incluido client**, siempre que sea ≠ `resolved_by` |
| Revisar o recategorizar punch | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | RPC `review_punch_category`: líder+ y ≠ quien lo levantó. **Por REST cualquiera cambia `category`** (I-04) |
| Borrar punch | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | `deletePunch` EDITOR + RLS editor |
| Traspaso a operación y estado ops del punch | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | `post-handover.ts` EDITOR |
| Preservación: asignar plan, procedimientos | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | `preservation.ts` EDITOR |
| Preservación: ejecutar registro (crear, responder) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Sin rol en el action; RLS insert para cualquier miembro |
| Preservación: **finalizar** registro | ✓ | ✓ | ✓ | ✓ | **⚠** | **⚠** | La RLS `preservation_records_update` es solo para editores → para I y C es un no-op silencioso (I-03) |
| Registros de campo (proponer, editar, retirar) | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | RPC `create/update/transition_register_item` (excluye client) |
| Registros: autorizar o cancelar | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | `transition_register_item` líder+; autoriza alguien ≠ quien propuso; verifica alguien ≠ quien retiró |
| Planes de trabajo | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | `work-plans.ts` EDITOR |

### 2.4 Certificados, PSSR, gates y documentos

| Capacidad | O | A | Ar | L | I | C | Dónde se aplica |
|---|---|---|---|---|---|---|---|
| Emitir certificado o excepción de punch | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | `certificates.ts` EDITOR |
| Revocar o reabrir certificado | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | PRIVILEGED |
| Firmar certificado (completion, client, authority) | ✓ | ✓ | ✓ | ✓ | ✗ | **✗⚠** | `signCertificate` EDITOR + RLS editor: **el client no firma como Cliente** y una misma persona puede firmar las 3 capacidades (I-06) |
| Quitar firma de certificado | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ | Quien firmó, o O/A |
| PSSR: crear revisión, fechas, aprobar → RFSU, rechazar | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | `pssr.ts` EDITOR |
| PSSR: llenar ítems, notas, enviar, firmar | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | `updatePssrReviewItem`, `submitPssrForApproval`, `addPssrSignature` sin rol |
| Aprobar gate (firma Comisionamiento) | ✓ | ✓ | ✓ | ◐ | ◐ | ◐ | RPC `approve_system_gate` según `readiness_gates.approval_roles` (por defecto O,A,Ar) |
| Co-firmar gate (Operaciones / HSE) | ✓ | ✓ | ✓ | ✓ | ◐ | ✓ | `sign_system_gate` según `cosign_roles` (por defecto O,A,Ar,L,C). Persona ≠ las anteriores, pero **la capacidad se autodeclara** (I-07) |
| Revocar aprobación de gate | ✓ | ✓ | ◐ | ◐ | ◐ | ◐ | O,A o un rol de `approval_roles` |
| Declarar o revocar criterio manual (evidencia) | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | `attest_gate_criterion` = `is_project_editor` |
| Forecast de gate / compromiso | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✗ | ✗/✗ | `set_gate_forecast` (no-client) / `set_gate_commitment` (líder+) |
| Documentos: registrar, revisión, emitir | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | `document_is_controller` = O,A,Ar,L |
| Documentos: referenciar desde ITR, punch, etc. | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | `add/remove_document_reference` no-client; revalidar un registro firmado = controlador |

### 2.5 Gestión diaria, arranque, operación, desempeño y vendors

| Capacidad | O | A | Ar | L | I | C | Dónde se aplica |
|---|---|---|---|---|---|---|---|
| ACC / RES / TQ: crear, editar, cerrar | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | RPC `create_*`/`update_*`/`transition_*` (excluye client) |
| ACC / RES / TQ: cancelar | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | `transition_*` líder+ |
| ACC: verificar | ◐ | ◐ | ◐ | ◐ | ◐ | ✗ | Persona ≠ quien la cerró |
| RES: escalar 1–4 | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | `escalate_constraint` (no-client, con motivo) |
| TQ: responder | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | `answer_tq` cualquier miembro; client puede adjuntar solo en TQ |
| DEC: registrar o reemplazar decisión | ✓ | ✓ | ✓ | ✓ | ✓◐ | ✗ | `record_decision` no-client: un inspector registra decisiones inmutables (I-27) |
| Borrar ítem de gestión | ◐ | ◐ | ◐ | ◐ | ◐ | ✗ | Creador, o O/A |
| Reporte diario: borrador, IA, editar | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | RPC no-client (la llamada a la IA corre *antes* de la RPC; I-19) |
| Reporte diario: emitir o revisar | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | `issue_daily_report`/`revise_daily_report` líder+ |
| Relevo de turno: abrir, entregar, recibir | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | Recibe otra persona, no client |
| Procedimiento: redactar, revisar | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | `save/transition_procedure_revision` no-client |
| Procedimiento: aprobar | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | Líder+, ≠ autor y ≠ quien lo envió |
| Procedimiento: verificar en campo | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | No-client, ≠ quien aprobó |
| Ejecución: iniciar, completar pasos, detener | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | `start_procedure_run`, `complete_run_step` |
| Ejecución: reanudar o abortar | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | Líder+ |
| Liberar hold point (commissioning) | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | `hold_release_roles('commissioning')`, ≠ quien ejecutó |
| Liberar hold point (operations / hse) | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | `hold_release_roles` incluye client; **L también firma como Operaciones o HSE** |
| Line-up: crear, emitir, posicionar | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | No-client |
| Line-up: verificar posición | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ | Cualquier miembro (también client), ≠ quien posicionó |
| Evento de arranque: registrar o agregar parámetro | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | `record_startup_event` no-client |
| Evento de arranque: atestiguar | ◐ | ◐ | ◐ | ◐ | ✗ | ◐ | `milestone_witness_capacity` → `hold_release_roles`, ≠ quien registró |
| Evento de arranque: anular | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | Líder+ |
| Personal ops y repuestos críticos | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | No-client |
| Competencia: evaluar | ✓ | ✓ | ✓ | ✓ | ◐ | ◐ | Líder+ o persona de nivel 4 en el sistema; nadie se evalúa a sí mismo |
| Meta de competencia por sistema | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | Líder+ |
| Solicitar traspaso de propiedad | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | `request_ownership_transfer`: cualquier miembro |
| Traspaso: firmar Comisionamiento / Operaciones | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | ✗/✗ | ✗/✓ | Líder+ / `hold_release_roles('operations')`, 2 personas distintas |
| Prueba de desempeño: diseñar, dirigir, cerrar, resultado, emitir o revocar PTC | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | `performance_is_lead` |
| Prueba de desempeño: perturbaciones, lecturas manuales | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | No-client |
| Firmar PTC (Operaciones / Cliente) | ✓/✗ | ✓/✗ | ✓/✗ | ✓/✗ | ✗/✗ | ✓/✓ | La firma Cliente **exige rol client** (no así la del certificado MC, I-06) |
| Vendors: paquete, movilizar, desmovilizar, decidir recomendación | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | `vendor_package_for_write(p_lead=true)` = `document_is_controller` |
| Vendors: interfaces, checklist, actividad, hallazgo, reporte, proponer recomendación | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | `vendor_package_for_write(false)` no-client |

### 2.6 Visibilidad (lectura)

Todos los roles, incluido `client`, ven **todos los proyectos de la org** y todo su contenido: punches, ITR, gestión diaria (restricciones con escalamiento, decisiones), vendors, documentos, KPIs, audit vía REST, `domain_events` con la fila completa, alertas de otros usuarios y secretos de webhooks. Solo se esconden en la UI las páginas admin y los botones. Las rutas de proyecto `registers`, `daily` y `startup` solo cambian el modo de edición para client (`role !== 'client'`), no ocultan contenido.

---

## 3. Hallazgos

### Crítico

#### I-01 · Cualquier miembro (incluido client e inspector) puede crear una API key con alcance `*`
- **Severidad:** Crítica · **Categoría:** Seguridad / escalada de privilegios
- **Ubicación:** `supabase/migrations/00000000000000_baseline.sql:7248` (política `"org members can manage api_keys"`), `src/lib/api/auth.ts:89-140`
- **Evidencia:** `CREATE POLICY "org members can manage api_keys" ON public.api_keys USING (org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid()))`. No tiene cláusula `FOR`, así que vale para ALL (insert, update y delete) y no tiene `WITH CHECK` distinto. Ninguna migración posterior la toca. `authenticateApiKey` solo calcula `sha256(token)`, busca el `key_hash` y acepta `scopes` desde la fila. No valida el prefijo ni quién creó la key. El CHECK `api_keys_scopes_valid` acepta `'*'`.
- **Impacto:** un `client` o `inspector`, con su JWT de navegador, puede hacer `POST /rest/v1/api_keys {org_id, name, key_prefix:'x', key_hash: sha256('cualquier-cosa'), scopes:['*']}`. Con eso obtiene una key que la API v1 ejecuta con **service role**: leer todos los proyectos, crear tags, ITR y punches, inyectar muestras de señal, operar post-handover. También puede des-revocar keys (`UPDATE revoked_at=null`) o borrar las de integración. Tampoco hay rate limit (I-18).
- **Recomendación:** quitar la política. Dejar solo `SELECT` para O, A y Ar (sin `key_hash`) y que toda escritura pase por las RPC `create_api_key`/`revoke_api_key`, alineadas a PRIVILEGED. Agregar `REVOKE INSERT, UPDATE, DELETE ON api_keys FROM authenticated`. Auditar las keys existentes (`created_by IS NULL` o creadas fuera de la RPC).
- **Esfuerzo:** S (1 migración) · **Confianza:** Alta (asume los GRANT por defecto de Supabase a `authenticated`; el baseline se volcó sin privilegios, verificar en prod).

### Alto

#### I-02 · El inspector no puede levantar punches, pero la UI se lo ofrece y la cola offline los descarta
- **Severidad:** Alta · **Categoría:** Roles / pérdida de datos
- **Ubicación:**
  - `src/app/actions/punches.ts:13-16` (`createPunch` `role: EDITOR_ROLES`)
  - `src/app/(dashboard)/projects/[id]/tags/[tagId]/itrs/[itrId]/ItrExecution.tsx:560-564` (botón «Punch» sin condición) e `ItemRow.tsx:77`
  - `TagPunchTab.tsx:83` (botón «Nuevo punch» sin condición)
  - `src/lib/sync/outbox.ts:105-121`
  - `src/lib/sync/outbox-utils.ts:47` (`punch: 3` intentos y después `drop`)
  - `src/i18n/messages/es.json:941` («inspector: Ejecutar ITRs, crear punches»)
- **Evidencia:** el inspector ejecuta el ITR y pulsa «Punch». Recibe «Sin permisos» o, si no tiene red, el punch se encola. Al sincronizar falla 3 veces y se descarta (solo queda un `log_sync_conflict`). Tampoco puede comentar ni adjuntar (`addPunchComment`/`addPunchAttachment` EDITOR). En `PunchListView` el botón sí está condicionado a EDITOR, así que la UI es incoherente entre pantallas.
- **Impacto:** el flujo central del producto (encontrar una deficiencia mientras se inspecciona) no funciona para el rol que está en campo. Se pierden punches capturados offline, que es justamente lo que se promete vender.
- **Recomendación:** decisión de producto. Lo recomendado es permitir que el inspector levante punches (`createPunch` sin rol o con `[...EDITOR, 'inspector']`), que comente y adjunte, y dejar la recategorización en manos del supervisor (ya existe la cola de revisión). Si se mantiene la restricción, ocultar los botones y que el outbox rechace antes de encolar. En ambos casos, no hacer `drop` silencioso de errores de permiso: dejarlos en la bandeja «No sincronizado».
- **Esfuerzo:** S · **Confianza:** Alta.

#### I-03 · El inspector (o el client) «finaliza» un registro de preservación y no se guarda nada
- **Severidad:** Alta · **Categoría:** Roles / integridad de datos
- **Ubicación:** `src/app/actions/preservation.ts:366-407` (`finalizeRecord` sin rol, usa `ctx.supabase.update` y no comprueba filas afectadas); `supabase/migrations/20260903200000_rls_set_based_policies.sql:158-159` (`preservation_records_update` con `get_my_editor_project_ids`)
- **Evidencia:** para un no-editor, el UPDATE afecta 0 filas sin error. El action devuelve éxito y además **crea el punch** (`punches_insert` permite a cualquier miembro). El registro queda en borrador y `next_due_date` no avanza. `PreservationExecution.tsx` no tiene ningún control de rol.
- **Impacto:** quedan registros de preservación sin cerrar y planes que siguen «vencidos» aunque se ejecutaron. La evidencia contractual de preservación queda inconsistente.
- **Recomendación:** mover el finalizado a una RPC `finalize_preservation_record` (no-client) o abrir la RLS de update para no-client. Siempre usar `.select('id')` y fallar si devuelve 0 filas.
- **Esfuerzo:** S · **Confianza:** Alta.

#### I-04 · La RLS de punches e ITR permite a client e inspector escribir por REST lo que el action prohíbe
- **Severidad:** Alta · **Categoría:** Seguridad / integridad
- **Ubicación:** `20260903200000_rls_set_based_policies.sql:53-57` (`itrs_update`, `punches_update`, `punches_insert` = `get_my_project_ids`), `:131-133` (`itr_responses_insert/update` = cualquier miembro), `:152` (`punch_comments_insert`); `20261016120000_punch_evidence.sql:42-76` (el guard solo protege el cierre y los campos de resolución, verificación y revisión)
- **Evidencia:** con la anon key y su sesión, un `client` puede:
  - `UPDATE punches SET category='C'` (A→C), lo que elimina un bloqueo de certificado o gate. El guard solo marca el punch como «sin revisar».
  - `status='cancelled'` y cambiar `description` o `assigned_to`.
  - Insertar punches.
  - Editar respuestas de ITR no firmados y `itrs.status` (salvo `approved`).
- **Impacto:** el rol «solo lectura» no es de solo lectura. Se pueden manipular los bloqueos que alimentan Control Tower, certificados y KPIs. Queda en `domain_events`, pero no en `activity_log`.
- **Recomendación:** alinear la RLS con los actions: `punches_insert` y `punches_update` para no-client (o mejor, escritura solo por RPC como F1–F8); en el trigger, impedir que alguien que no sea líder cambie `category` o pase a `cancelled`; `itr_responses` y `itrs_update` para no-client. Agregar tests RLS por rol en `tests/db/`.
- **Esfuerzo:** M · **Confianza:** Alta.

#### I-05 · ITR: la firma de cliente siempre es obligatoria y no se exige independencia entre firmantes
- **Severidad:** Alta · **Categoría:** Reglas de negocio / control
- **Ubicación:** `20261016150000_test_equipment.sql:193-230` (`sign_itr_atomic`: `approved` solo si `count(DISTINCT role)=3`); `itr-instances.ts:22-100` (`clientId` opcional y sin validar que ejecutor ≠ supervisor ≠ cliente); `ItrExecution/types.ts:132-148` (`availableSigningRoles` devuelve `[]` si no hay asignación); baseline `itr_assignments_itr_id_role_key UNIQUE(itr_id, role)` (no impide repetir el usuario)
- **Evidencia:**
  - Si no se asigna cliente, el ITR queda en `completed` para siempre, y los gates y certificados cuentan solo los `approved`.
  - Si se asigna la misma persona a los tres roles, firma tres veces y aprueba sola.
  - El rol de org del firmante no se valida: un inspector puede ser el «cliente».
- **Impacto:** en proyectos reales, la mayoría de los A/B-sheets no llevan testigo del cliente, así que los ITR se bloquean. Y cuando el cliente se usa, la firma no prueba independencia, a diferencia del resto de la plataforma (punch, gates, line-up y hold points sí exigen «otra persona»).
- **Recomendación:** que la plantilla o la fase defina las firmas requeridas (`required_signatures` por plantilla o por punto de witness/hold). Exigir personas distintas por firma. Opcionalmente, exigir que «cliente» tenga rol `client` o empresa `kind='owner'`.
- **Esfuerzo:** M · **Confianza:** Alta.

#### I-06 · Certificados: el client no puede firmar como Cliente y una persona puede firmar las tres capacidades
- **Severidad:** Alta · **Categoría:** Roles / control
- **Ubicación:** `src/app/actions/certificates.ts:429-470` (`signCertificate` EDITOR; solo valida que no exista firma de ese rol); baseline `:6604/6615` (RLS de `certificate_signatures` para editores)
- **Evidencia:** la firma `client` de MC/RFC la hace un leader del EPC. No hay comprobación `user_id` ≠ otras firmas. En cambio, `sign_performance_certificate` exige rol `client` para la firma Cliente y personas distintas. El criterio es incoherente.
- **Impacto:** los certificados de completitud no reflejan la aceptación real del cliente. Es un punto débil en una auditoría o en una disputa contractual.
- **Recomendación:** mover la firma a una RPC (como el PTC) con persona distinta por capacidad. La capacidad `client` solo para rol `client` (o empresa owner). `authority` configurable.
- **Esfuerzo:** S-M · **Confianza:** Alta.

#### I-07 · Sin membresía por proyecto ni capacidades funcionales: client ve todo y cualquier leader firma como Operaciones o HSE
- **Severidad:** Alta · **Categoría:** Modelo de roles / confidencialidad
- **Ubicación:** baseline `is_project_member` (`:1460`) y `get_my_project_ids` (`20260903200000:7-12`): proyecto = org; `20261012200000_gate_cosignatures.sql:14` (`cosign_roles` por defecto incluye `leader`); `hold_release_roles` (`20261017210000:203`): operations/hse = O,A,Ar,L,C
- **Evidencia:**
  - No existe tabla `project_members`.
  - Un `client` de la operadora X, en una org EPC con proyectos de X e Y, ve los dos: punches, decisiones, restricciones escaladas, vendors.
  - Las capacidades Operaciones y HSE son autodeclaradas al firmar. Dos leaders del EPC cumplen la «multifirma».
  - El inspector de una disciplina ve y ejecuta cualquier ITR asignado; no hay alcance por disciplina ni por área.
- **Impacto:** no sirve para EPC multicliente (el caso típico) sin crear una org por cliente, lo que rompe el catálogo de plantillas y las personas compartidas. La segregación de funciones de gates y traspasos es nominal.
- **Recomendación:** ver §4.1. Agregar `project_members(project_id, user_id, role_override, disciplines[], capacities[])` con `get_my_project_ids` basado en esa tabla (migración compatible: todos los miembros actuales asignados a todo). Agregar `capacities` (commissioning, operations, hse, quality) por persona y que `sign_system_gate`/`hold_release_roles` lo validen.
- **Esfuerzo:** L · **Confianza:** Alta.

#### I-08 · Webhooks: nombres de evento incompatibles, doble despacho y reintentos sin scheduler
- **Severidad:** Alta · **Categoría:** Integraciones / correctitud
- **Ubicación:** baseline `emit_domain_event` (`:795`, `v_aggregate_type := TG_TABLE_NAME` → `punches.updated`, `itrs.updated`…); `src/lib/constants/webhook-events.ts` (catálogo en singular: `punch.closed`, `itr.approved`, `certificate.issued`, `preservation.due`…); baseline `:4943` y `:4964` (dos triggers AFTER INSERT en `domain_events`: `notify_webhook_dispatcher` y `dispatch_webhook_event`, al mismo `webhook_dispatcher_url`); `supabase/functions/webhook-dispatcher/index.ts:300-340` (Mode B retry); `.github/workflows/cron.yml` (no tiene job de retry)
- **Evidencia:**
  - El catálogo de la UI solo coincide con los eventos que emiten a mano las rutas API (`punch.created`, `itr.created`, `tag.created`, `handover.issued`, `punch.transferred_to_ops`). Los eventos del trigger están en plural, y `itr.approved`, `punch.closed`, `certificate.issued`, `preservation.due` y `tag.status_changed` no existen.
  - Cada evento dispara dos POST al dispatcher y `webhook_deliveries` no tiene UNIQUE (subscription, event), así que se crean entregas duplicadas.
  - En el repo nadie invoca `{mode:'retry'}`: las entregas fallidas quedan `pending` para siempre (salvo que exista un pg_cron fuera de las migraciones).
  - `/api/v1/events` documenta `aggregate_type: tag|itr|punch`, pero se guarda `tags|itrs|punches`.
- **Impacto:** un integrador (SAP, Maximo, BI) que se suscribe a «punch.closed» nunca recibe nada; con `*` recibe duplicados y payloads de fila completa sin esquema estable. Integrar es poco fiable.
- **Recomendación:** definir un catálogo canónico versionado de eventos de negocio (`punch.closed`, `itr.approved`, `gate.approved`, `certificate.issued`, `transfer.completed`…) emitidos desde las RPC, no desde el trigger genérico. Borrar uno de los dos triggers. Agregar `UNIQUE(subscription_id, domain_event_id)`. Programar el retry (pg_cron o GH Actions). Agregar `event_id` y timestamp en la firma HMAC para idempotencia y anti-replay.
- **Esfuerzo:** M · **Confianza:** Alta (en los triggers y nombres) / Media (en el scheduler de retry).

#### I-09 · El web push está prácticamente muerto
- **Severidad:** Alta · **Categoría:** Integraciones / notificaciones
- **Ubicación:** `src/app/api/cron/push-dispatch/route.ts:43-90` (mapea `itr.returned`, `punch.created` con `p.category`, `punch.assigned`, `certificate.ready`); `:104-110` (ventana fija de 5 min, `limit(500)`, sin cursor pese al comentario); `.github/workflows/cron.yml` (`*/5`)
- **Evidencia:**
  - `itr.returned`, `punch.assigned` y `certificate.ready` no se emiten en ningún lado.
  - `punch.created` solo lo emite la API v1. El trigger emite `punches.created` con `payload.new.category`, no `payload.category`.
  - Las notificaciones in-app (`notifications`: asignaciones de ITR, punch, PSSR, preservación, restricciones vencidas) nunca se envían por push.
  - Los cron de GitHub Actions suelen retrasarse 5–30 min, y la ventana fija pierde o duplica eventos.
  - Como cada autosave de ITR genera eventos, los 500 de la ventana se agotan rápido.
  - La URL `/itrs/<id>` del push no existe como ruta.
- **Impacto:** se vende «PWA con push», pero el usuario no recibe avisos de holds por liberar, traspasos por firmar ni punches asignados. Tampoco hay email.
- **Recomendación:** despachar push desde la tabla `notifications` (trigger o cola `push_outbox`) con cursor persistente y respetando los topics. Agregar notificaciones para las colas de Mi trabajo (hold, firma de gate, traspaso, testigo). Opcionalmente, un digest por email.
- **Esfuerzo:** M · **Confianza:** Alta.

#### I-10 · Workflows: bucle infinito con `create_punch`
- **Severidad:** Alta · **Categoría:** Integraciones / robustez
- **Ubicación:** `supabase/functions/evaluate-workflow/index.ts:150-200` y `:262-296`; `WorkflowsView.tsx:37-51` (ofrece `punches.created` + acción «Crear punch»)
- **Evidencia:** cada punch insertado emite `punches.created`. Una regla «punches.created → create_punch» (con o sin condición que se vuelva a cumplir) crea un punch, ese punch emite un evento, y así sucesivamente. No hay control de `created_via='workflow'`, de profundidad, de rate limit ni de idempotencia por `event_id`. Pasa algo parecido con las reglas sobre `*.updated` que actualizan la misma tabla.
- **Impacto:** una regla mal configurada por un architect (o por un leader vía REST, ver la matriz) genera miles de punches y llamadas a edge functions, y contamina gates y KPIs.
- **Recomendación:** ignorar los eventos cuyo `payload.new.created_via='workflow'` o propagar `causation_depth`. Limitar las ejecuciones por regla por minuto. Validar en la UI las combinaciones evento/acción reflexivas.
- **Esfuerzo:** S · **Confianza:** Alta.

#### I-11 · Secretos de webhooks y headers de workflows legibles por cualquier miembro
- **Severidad:** Alta · **Categoría:** Seguridad
- **Ubicación:** baseline `webhook_subs_select` (todos los miembros) sobre `webhook_subscriptions.secret`; `workflow_rules_select` (todos) sobre `action_payload.headers`
- **Evidencia:** la UI admin está limitada a PRIVILEGED, pero por REST un client puede hacer `select secret from webhook_subscriptions`.
- **Impacto:** con el `whsec_` cualquiera falsifica webhooks firmados hacia el ERP o CMMS del cliente. Los headers de `webhook_call` suelen llevar tokens de terceros.
- **Recomendación:** SELECT solo para PRIVILEGED y columna `secret` no expuesta (vista sin secret, o RPC de rotación que lo muestre una vez). Cifrar `action_payload.headers` o guardarlos en Vault.
- **Esfuerzo:** S · **Confianza:** Alta.

#### I-12 · Un admin puede hacerse owner o degradar owners por REST
- **Severidad:** Alta · **Categoría:** Seguridad / escalada interna
- **Ubicación:** baseline `:7279-7300` (`org_members_insert/update/delete` = `is_org_admin`, sin restricciones de rol); `src/app/actions/users.ts:104-165` (protecciones de owner y de último owner solo en el action)
- **Evidencia:** `UPDATE org_members SET role='owner' WHERE user_id=auth.uid()` es válido para un admin. También puede borrar al último owner o insertar a cualquier `user_id` existente como owner.
- **Impacto:** se puede tomar control de la org (borrar proyectos, `setOrgTemplateCatalog`) y bloquear al dueño legítimo.
- **Recomendación:** escritura de `org_members` solo por RPC (`invite`, `set_role`, `remove`) con las mismas reglas del action, más un trigger que impida quedarse con 0 owners.
- **Esfuerzo:** S · **Confianza:** Alta.

### Medio

#### I-13 · `projects_insert` con tautología: inserción de proyectos en otra org
- **Ubicación:** baseline `:7749` (`org_members.org_id = org_members.org_id`)
- **Evidencia:** cualquier usuario que sea O, A o Ar en *alguna* org puede insertar `projects` con un `org_id` ajeno. Cualquier usuario autenticado puede llegar a owner de una org propia con `completeSetup`, que no verifica membresía previa y usa admin client.
- **Impacto:** spam o sabotaje en el listado de proyectos de otra org (si se conoce su UUID), además de los triggers de siembra. No da lectura cross-tenant.
- **Recomendación:** cambiar a `org_members.org_id = projects.org_id`. Limitar `completeSetup` a usuarios sin membresía (o a una política de alta controlada).
- **Esfuerzo:** S · **Confianza:** Alta.

#### I-14 · El leader «borra» plantillas ITR o PSSR y no pasa nada
- **Ubicación:** `itr-templates.ts:69-82`, `pssr.ts:105-113` (EDITOR) frente a la RLS `itr_templates_delete`/`pssr_templates_delete` (O,A,Ar) en el baseline `:7063`/`:7918`
- **Evidencia:** el DELETE afecta 0 filas sin error, el action devuelve `{}` y la UI muestra éxito.
- **Recomendación:** unificar el tier (o PRIVILEGED en el action, o EDITOR en la RLS) y comprobar las filas afectadas.
- **Esfuerzo:** XS · **Confianza:** Alta.

#### I-15 · Constantes de rol duplicadas en más de 12 sitios, con divergencias
- **Evidencia:**
  - Tiers copiados en `sidebar.tsx:28-30` y arrays inline en unas 30 páginas (`['owner','admin','architect','leader'].includes`).
  - `documents/catalog.ts`, `vendors/catalog.ts`, `startup/catalog.ts` y SQL (`is_org_editor`, `hold_release_roles`, `performance_is_lead`, `document_is_controller`, listas inline en cada RPC).
- **Divergencias encontradas:**
  - Import de tags y señales: el sidebar lo muestra a EDITOR, la página y el action exigen PRIVILEGED.
  - `/admin/companies`: la página es EDITOR, `saveCompany` es ADMIN.
  - `setGateWeights`: el action es ADMIN, la RPC SQL acepta Ar.
  - API keys, webhooks y workflows: los actions son PRIVILEGED, las RPC y la RLS son `is_org_editor` (L).
  - El comentario de `permissions.ts` menciona un rol `viewer` que no existe.
  - La leyenda de roles en `es.json:936-943` contradice el código: el inspector no crea punches y el client no es solo lectura (libera holds de Ops y HSE, co-firma gates, verifica punches y line-ups, solicita traspasos, firma PTC).
- **Recomendación:** una sola fuente de capacidades (`capabilities.ts` ↔ tabla SQL `role_capabilities` o función `has_capability(role, cap)`), un test que compare TS y SQL, y la leyenda generada desde esa fuente.
- **Esfuerzo:** M · **Confianza:** Alta.

#### I-16 · El audit log y las notificaciones se pueden falsificar
- **Ubicación:** baseline `:6461` (`activity_log_insert`: solo verifica `org_id`, `user_id` libre); `:7225` (`notifications_insert_org_member`: cualquier miembro inserta para cualquier destinatario, con `link_url` libre)
- **Impacto:**
  - Un miembro puede insertar entradas de auditoría a nombre de otro.
  - Se puede hacer phishing interno con notificaciones que enlazan a URLs externas.
  - No hay exportación del audit log ni retención definida.
- **Recomendación:** auditoría solo por triggers o RPC (`user_id := auth.uid()` forzado); notificaciones solo por service role o RPC; validar que `link_url` sea relativa; exportar el audit a CSV o NDJSON y aplicar política de retención.
- **Esfuerzo:** S · **Confianza:** Alta.

#### I-17 · Volumen de `domain_events`: cada autosave del ITR emite un evento con la fila completa y 3 llamadas pg_net
- **Ubicación:** `itr-instances.ts:~277` (`update itrs.progress_pct/status` en cada `upsertResponse`); triggers `trg_events_itrs` y los 3 `AFTER INSERT` en `domain_events`
- **Impacto:** a escala (50k tags, cientos de inspectores) se generan millones de filas sin retención, tres invocaciones de edge function por evento aunque no haya suscriptores, y un coste y una latencia innecesarios. También satura el `limit(500)` del push.
- **Recomendación:** emitir solo los cambios de estado de negocio. Hacer cortocircuito en el trigger si no hay suscripciones ni reglas en la org. Particionar o purgar `domain_events` (90 días).
- **Esfuerzo:** M · **Confianza:** Alta.

#### I-18 · API v1: brechas funcionales y de gobierno
- **Evidencia:**
  - No hay rate limit ni cuota por key.
  - `projectId` siempre es `null` (no hay keys por proyecto).
  - `POST /punches` no exige `impact` (regla de la fase 4) y acepta un `subsystem_id` distinto al del tag.
  - `POST /itrs` crea ITR sin asignaciones, que no se pueden firmar.
  - No hay endpoints de resolve, verify, gates, traspasos, documentos ni vendors.
  - `openapi` no documenta `signals/samples`, `handover/*`, `punches/post-handover`, `ops-update` ni `transfer-to-ops`.
  - `last_used_at` se hace fire-and-forget sin `waitUntil` (en Workers puede perderse).
  - Se enlaza `docs.commup.app/api`, que no está en el repo.
- **Recomendación:** rate limiting (Cloudflare Rate Limiting o contador en KV); keys con `project_ids[]`; las rutas de escritura deberían llamar a las mismas RPC que la UI, no al admin client; OpenAPI generado y probado en CI.
- **Esfuerzo:** M · **Confianza:** Alta.

#### I-19 · IA: sin cuotas, sin medición de coste y con manejo de errores irregular
- **Ubicación:** `src/lib/ai/claude.ts` (Opus para todo, `maxRetries 2`, timeout de 10 min); `itr-matrix.ts:179` (`messages.parse` sin try/catch y sin manejar `max_tokens`); `daily-report.ts:85-110` (un client dispara la llamada antes de que la RPC lo rechace); `@anthropic-ai/sdk` en `devDependencies`
- **Evidencia:**
  - No se registra `usage` (tokens) por org ni por usuario.
  - No hay límite diario.
  - Cualquier leader puede repetir generaciones de 16k tokens.
  - No hay `logActivity` en la matriz.
- **Recomendación:**
  - Tabla `ai_usage(org, user, feature, input/output tokens, coste)` y cuota por org.
  - Usar Haiku o Sonnet para traducciones y reporte diario.
  - Envolver todas las llamadas en un helper con try/catch, `stop_reason` y telemetría.
  - Comprobar el rol antes de llamar.
  - Mover el SDK a `dependencies`.
- **Esfuerzo:** S-M · **Confianza:** Alta.

#### I-20 · No hay SSO/SAML, MFA ni re-autenticación al firmar
- **Ubicación:** `src/app/(auth)/login/page.tsx:26` (solo `signInWithPassword`); ninguna referencia a `mfa`, `aal2` o `signInWithSSO`
- **Impacto:** las operadoras grandes (Ecopetrol, YPF, Shell…) exigen SSO con su IdP (Azure AD, Okta) y bajas centralizadas. Las firmas de ITR, certificado, gate y PTC son una imagen dibujada sobre una sesión de password, sin MFA ni re-autenticación, algo débil frente a una aceptación contractual.
- **Recomendación:** ver §4.2.
- **Esfuerzo:** M-L · **Confianza:** Alta.

#### I-21 · Ciclo de vida de usuarios incompleto
- **Ubicación:** `users.ts:30-31` (`listUsers({perPage:1000})` y búsqueda lineal); `org_members` sin `status`
- **Evidencia:**
  - Con más de 1000 usuarios en Auth, un usuario existente no se encuentra y la invitación falla.
  - Un usuario existente se agrega sin aviso ni aceptación.
  - No hay suspensión ni desactivación (solo borrar la membresía), ni vencimiento de acceso para contratistas o vendors.
- **Recomendación:** buscar por email con `admin.auth.admin.getUserByEmail`, o una tabla `profiles.email`. Agregar `org_members.status` (invited, active, suspended) y `access_expires_at`.
- **Esfuerzo:** S-M · **Confianza:** Alta.

#### I-22 · `/api/admin/export` usa la primera membresía y no la org activa
- **Ubicación:** `src/app/api/admin/export/route.ts:11-16` (`.limit(1)` sin orden y sin cookie `active_org_id`); el SELECT de Supabase tope a 1000 filas
- **Impacto:** un usuario con varias orgs recibe un 403 o un 404 aleatorio, y los exports están truncados.
- **Recomendación:** usar `getActiveMembership()` y paginar.
- **Esfuerzo:** XS · **Confianza:** Alta.

### Bajo

#### I-23 · El conector P6 es un POC que necesita la service role key
- **Ubicación:** `scripts/p6-connector/p6-sync.ts:174-195`
- **Evidencia:** usa un cliente service-role, la consulta de `work_plan_items` no tiene filtro por proyecto ni org, y lee solo 500 tags. No hay conectores para SAP PM, Maximo o Aconex (solo se mencionan en el texto de OpenAPI).
- **Recomendación:** reescribirlo sobre API v1 con un endpoint `work-plans:write`. Ver §4.3.
- **Esfuerzo:** M · **Confianza:** Alta.

#### I-24 · `bulkAssignItrs` borra y luego inserta sin transacción
- **Ubicación:** `itr-assign.ts:31-43`
- **Impacto:** si el INSERT falla, los ITR quedan sin asignar. **Esfuerzo:** XS (RPC). **Confianza:** Alta.

#### I-25 · Las firmas «Cliente» exigen tener usuarios client dentro del tenant
- **Ubicación:** PTC `sign_performance_certificate` (rol `client` obligatorio); ITR (I-05)
- **Impacto:** en despliegues donde solo usa CommUp el EPC y el cliente firma en papel, la aprobación no se puede completar, salvo que se invite al cliente, que entonces ve toda la org (I-07). **Confianza:** Alta.

#### I-26 · Observabilidad mínima
- **Evidencia:** solo `console.error`. No hay Sentry ni APM. Los fallos de cron solo se ven en GitHub Actions. Las entregas de webhook abandonadas solo quedan en `console.warn`. No hay panel de salud de integraciones (aunque sí hay columnas como `last_error_at`).
- **Recomendación:** Sentry (compatible con Workers) y alertas en cron, webhook abandonado e IA fallida. **Confianza:** Alta.

#### I-27 · Un inspector puede registrar decisiones (DEC) inmutables
- **Ubicación:** `record_decision` excluye solo a client (`20261017120000:826-827`)
- **Impacto:** las decisiones formales de gestión no deberían poder registrarlas los técnicos de campo. Exigir líder+. **Confianza:** Alta.

#### I-28 · Detalles menores de push
- **Evidencia:** la URL `/itrs/<id>` del payload no existe (404 al hacer clic). `subscribe` usa topics por defecto que dependen de eventos que no se emiten (I-09). **Confianza:** Alta.

---

## 4. Propuestas estratégicas

### 4.1 Modelo de roles: de «rol de org» a «rol de org + asignación de proyecto + capacidades»

El modelo actual (6 roles planos por org) sirve para una sola empresa con un solo cliente. Los proyectos reales tienen EPC, operadora, subcontratistas, vendors y certificadora en el mismo proyecto, con alcances por disciplina o área y funciones de firma específicas. Propuesta, por orden de prioridad:

1. **Rol de org (se mantiene, se simplifica):**

   | Rol | Alcance |
   |---|---|
   | owner | Facturación y propiedad |
   | admin | Usuarios y configuración |
   | member | El resto |

   `architect` queda como capacidad «ingeniería de completions» (plantillas, estructura, importación, integraciones). Hoy su significado es confuso: puede editar tags, importar, crear proyectos y crear API keys y webhooks, pero no configurar fases ni disciplinas.

2. **`project_members`** (project_id, user_id, project_role, disciplines[], areas[]).
   - Project roles: `manager` (≈leader+), `engineer` (≈architect), `supervisor`, `inspector`, `client_rep`, `vendor`, `viewer`.
   - `get_my_project_ids()` pasa a leer esta tabla. Es la única función que hay que cambiar, porque las 199 políticas ya la usan.
   - Migración: sembrar a todos los miembros actuales en todos los proyectos con su rol equivalente.
3. **Capacidades de firma por persona** (`commissioning`, `operations`, `hse`, `quality`, `client_acceptance`, `authority`), asignadas por el admin y validadas en `sign_system_gate`, `release_hold_point`, `sign_ownership_transfer`, `sign_performance_certificate`, ITR y certificados. Con esto la multifirma deja de ser nominal.
4. **Roles nuevos que se necesitan:**
   - `viewer`: solo lectura real, por ejemplo gerencia o auditor.
   - `vendor`: solo sus paquetes, actividades, FAT/SAT y punches asignados; hoy los vendors tendrían que ser `inspector` y verían todo.
   - `client_rep` limitado a los proyectos de su operadora.
5. **Inspector por disciplina:** filtrar Mi trabajo y la asignación por `disciplines[]` (opcional, no bloqueante).
6. **Fuente única de capacidades** (I-15): `has_capability(project_id, cap)` en SQL y su espejo en TS, con un test de paridad. La leyenda de roles y la documentación se generan desde ahí.

### 4.2 Identidad: SSO, MFA y firma

- **SSO SAML/OIDC por org** con Supabase Auth SSO (`signInWithSSO({domain})`). Incluir mapeo de dominio a org, aprovisionamiento JIT con rol por defecto `viewer` y SCIM opcional para las bajas. Es un requisito habitual de compras en Oil & Gas.
- **MFA (TOTP) obligatorio** para O, A y Ar, y para quien firma gates, certificados y PTC (`aal2`).
- **Firma con re-autenticación** (password, OTP o passkey) y sello que incluya hash del contenido, fecha UTC, IP y empresa (`signer_company` ya existe). Así la firma se acerca a una firma electrónica avanzada.

### 4.3 Integraciones industriales

| Sistema | Qué espera el cliente | Propuesta |
|---|---|---|
| SAP PM / Maximo (CMMS) | Al traspasar a operaciones: maestro de equipos (tags + atributos), punches abiertos como avisos u órdenes, repuestos críticos, planes de preservación → planes de mantenimiento | Evento `transfer.completed` + endpoint `handover/export` en formato estándar (CFIHOS / ISO 14224) + conector iPaaS (webhook → SAP CPI / Maximo MIF) |
| Primavera P6 | Sincronizar actividades ↔ ITR y gates, y avance físico (ya existe `compute_system_progress`) | Endpoint `work-plans` en API v1 + conector XER/REST oficial, programado y por proyecto; quitar el uso de la service key |
| Aconex / ProjectWise / SharePoint (EDMS) | Registro documental sincronizado, revisiones superadas | Importador de transmittals y webhook `document.revision_superseded`; ya existe el bloqueo por revisión superada |
| BI (Power BI) | Datos de KPI y snapshots | Endpoints de lectura de `mgmt_kpi_snapshots` / `system_progress_snapshots` o una réplica de solo lectura |
| IIoT / historian (PI, IP.21) | Muestras de señal | Ya existe `signals/samples` (5000 por lote). Falta documentarlo en OpenAPI, agregar rate limit y un conector PI Web API |
| Email | Avisos de holds, firmas y vencidos | Digest diario y avisos críticos (Resend o SES), complemento del push |

Base común: catálogo de eventos de negocio versionado (I-08), entrega idempotente (`event_id` + timestamp firmados), panel de salud de integraciones (entregas, fallos, reintentos) y exportación del audit log (I-16).

---

## 5. Funcionamiento para el manual

> Nota: este apartado describe el comportamiento **actual** del código. Donde hay una discrepancia conocida se indica con «(ver I-xx)» para que el manual no prometa algo que la BD rechaza.

### Owner (dueño de la organización)
**Quién es:** el responsable de la cuenta CommUp de la empresa, normalmente el gerente de completions o el director del proyecto.
**Pantallas principales:** Dashboard, Proyectos, Control Tower y Administración completa.
**Qué hace:** todo lo que hace un admin, y además:
- Borrar proyectos.
- Elegir el catálogo de plantillas de la organización.
- Invitar a otros owners, cambiarles el rol o quitarlos.
- Siempre debe quedar al menos un owner.

**No puede:** firmar un ITR si no está asignado en ese rol, ni verificar su propio trabajo (las reglas de «otra persona» también se le aplican).

### Admin
**Quién es:** el administrador funcional de la plataforma.
**Pantallas:** Administración → Usuarios, Configuración (fases, disciplinas, tipos de equipo, glosario, logo, límite de punches Cat B), Gates (hold points y criterios), Empresas, Audit log, Workflows, API keys, Webhooks, Calidad de datos y Handover.
**Tareas típicas:**
- Invitar personas por email y asignarles rol y empresa.
- Configurar fases y gates.
- Revisar la auditoría.
- Exportar un proyecto a Excel.

**No puede:** borrar proyectos ni tocar a los owners desde la UI (ver I-12: la BD hoy no lo impide).

### Architect (ingeniero de completions / configuración)
**Quién es:** quien prepara el proyecto: estructura, tags y plantillas.
**Pantallas:**
- Proyecto → Tags e Importar (Excel de tags y señales), P&ID, Sistemas, Lazos, Matrices C&E.
- Admin → Plantillas ITR, PSSR y preservación, Matriz ITR con IA, Traducciones, Tipos de registro, API keys, Webhooks, Workflows, Calidad de datos, Handover.

**Qué hace:**
- Crear y editar proyectos.
- Importar y editar tags.
- Diseñar plantillas.
- Aprobar gates (es uno de los roles aprobadores por defecto).
- Reabrir ITR aprobados y revocar o reabrir certificados.
- Conectar integraciones.

**No puede:** configurar fases, disciplinas ni usuarios (eso es del admin).

### Leader (supervisor / líder de comisionamiento)
**Quién es:** el supervisor de disciplina o el líder de sistema.
**Inicio:** Mi trabajo (ITR por revisar, punches, firmas pendientes, holds por liberar, traspasos por firmar).
**Qué hace:**
- Crea y asigna ITR (ejecutor, supervisor, cliente).
- Levanta, reasigna, comenta y borra punches, y revisa y recategoriza los que levantaron otros.
- Emite certificados y excepciones de punch.
- Crea y aprueba PSSR (→ RFSU).
- Gestiona planes de trabajo, declara criterios manuales de gates y fija compromisos de fecha.
- Aprueba procedimientos de arranque (si no es el autor), libera hold points de Comisionamiento, reanuda o aborta ejecuciones y anula eventos.
- Emite el reporte diario, dirige pruebas de desempeño y gestiona paquetes de vendors y documentos.
- Edita plantillas, matrices C&E y lazos.

**No puede:**
- Importar tags ni editar tags (aunque el menú muestre «Importar», ver I-15).
- Borrar plantillas (ver I-14).
- Aprobar gates, salvo que el admin lo agregue a sus roles aprobadores.
- Configurar la organización.

### Inspector (técnico de campo)
**Quién es:** quien ejecuta las inspecciones y pruebas en terreno, con la PWA instalada.
**Inicio:** Mi trabajo → ITR por ejecutar, punches asignados, preservación vencida.
**Qué hace:**
- Ejecuta los ITR que tiene asignados: respuestas, fotos, tablas y equipos de prueba, también sin red.
- Los firma como ejecutor (o como supervisor o cliente si lo asignaron así).
- Resuelve punches con evidencia y verifica punches resueltos por otra persona.
- Ejecuta registros de preservación.
- Propone y retira registros de campo (bloqueos, bypass, etc.) y crea acciones, restricciones y TQ.
- Ejecuta pasos de procedimientos y posiciona line-ups.
- Registra eventos de arranque y lecturas manuales de pruebas.

**No puede hoy:**
- Levantar punches, comentarlos ni adjuntarles fotos: el botón aparece, pero falla, y offline se pierde (ver I-02).
- Finalizar registros de preservación (no se guarda, ver I-03).
- Crear o asignar ITR, emitir certificados ni aprobar nada que requiera líder.

### Client (representante de la operadora / cliente)
**Quién es:** el personal del dueño de la planta que atestigua y acepta.
**Inicio:** Dashboard compacto (firmas pendientes como Cliente, proyectos activos).
**Qué hace:**
- Firma ITR en la casilla Cliente cuando está asignado.
- Co-firma gates (Operaciones o HSE) y libera hold points de Operaciones o HSE.
- Atestigua hitos de arranque (energización, primer hidrocarburo).
- Firma el traspaso de propiedad como Operaciones y el certificado de desempeño (Operaciones o Cliente).
- Responde TQ, verifica punches resueltos y verifica posiciones de line-up.
- Llena ítems de PSSR y los firma.

**Ve:** todos los proyectos de la organización (ver I-07: hoy no se puede limitar a «sus» proyectos).
**No puede:**
- Firmar los certificados MC, RFC, etc. como Cliente (lo hace un leader, ver I-06).
- Crear acciones, restricciones o registros.
- Ejecutar ITR ni levantar punches desde la UI.

### Para administradores: notificaciones, API y webhooks

**Notificaciones in-app (campana / Inbox):** se generan automáticamente para:
- Asignación o cambio de ITR.
- Punch asignado o reasignado.
- Eventos de certificados.
- PSSR (envío, aprobación, vencimiento).
- Preservación vencida (cron diario 07:00 UTC).
- Restricciones vencidas (08:30 UTC).

Las colas de Mi trabajo (holds, firmas de gate, traspasos, testigos) no generan notificación: se ven al entrar.

**Push (PWA):** cada usuario lo activa en su perfil (en iOS hace falta tener la app instalada) y elige topics: ITR devuelto, punch Cat A, certificado listo, solo mis ítems. *Estado actual:* el despachador corre cada 5 min, pero los eventos que escucha casi no se emiten (ver I-09). No hay que prometer avisos push de campo hasta corregirlo.

**API pública v1** (`https://commup.app/api/v1`, especificación en `/api/v1/openapi`):
- El admin o architect crea una key en Admin → API keys, elige los scopes (`tags:read/write`, `itrs:*`, `punches:*`, `certificates:read`, `systems:read`, `events:read`, `handover:*`, `signals:*` o `*`) y una expiración opcional. El token `sk_live_…` se muestra una sola vez y se guarda hasheado.
- Se usa con `Authorization: Bearer sk_live_…`.
- La key alcanza a todos los proyectos de la org.
- Endpoints: lectura y alta de tags, ITR y punches; certificados; jerarquía; eventos (últimas 24 h); ingesta de muestras de señal (hasta 5000 por lote); exportación y paquetes de handover; gestión post-handover de punches.
- Revocar es inmediato.

**Webhooks:**
- En Admin → Webhooks se registra una URL https pública, el proyecto (opcional) y los tipos de evento. El secreto `whsec_…` se muestra al crear.
- Cada entrega es un POST JSON `{id, event_type, occurred_at, data}` con los headers `X-CommUp-Event`, `X-CommUp-Delivery` y `X-CommUp-Signature: sha256=HMAC(secret, body)`.
- Se reintenta hasta 5 veces (1 min, 5 min, 30 min, 2 h).
- *Estado actual:* hay que usar `*` o los nombres en plural (`punches.created`, `itrs.updated`…) porque los nombres del selector no coinciden. Pueden llegar duplicados: hay que deduplicar por `data` + `occurred_at` (ver I-08).

**Workflows:**
- En Admin → Workflows se define una regla «evento → condición (JSONLogic) → acción». Acciones disponibles: bloquear certificado, notificar a un usuario o rol, crear punch, o llamar a un webhook https.
- Se evalúan en la edge function `evaluate-workflow`, aisladas por org.
- No hay que combinar «Punch creado» con «Crear punch» (bucle, ver I-10).

**Tareas programadas:** las lanza GitHub Actions (`.github/workflows/cron.yml`):
- Snapshot de KPI: 02:00 UTC.
- Push: cada 5 min.
- Preservación vencida: 07:00 UTC.
- PSSR vencida: 08:00 UTC.
- Restricciones vencidas: 08:30 UTC.

Si GitHub retrasa una corrida, el aviso llega tarde.

**IA (Claude):** está disponible si la plataforma tiene `ANTHROPIC_API_KEY`. Funciones:
- Proponer la matriz tipo de equipo × plantilla ITR (la acepta un editor).
- Traducir plantillas.
- Sistematizar el proyecto.
- Leer matrices C&E desde Excel o PDF (hasta 4 MB).
- Redactar el borrador del reporte diario.

La IA **propone**: una persona revisa y acepta. No asigna ni aprueba nada.
