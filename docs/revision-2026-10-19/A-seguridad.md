# Revisión A — Seguridad y multi-tenancy (CommUp)

Revisor: A (seguridad / multi-tenancy). Revisión estática, solo lectura, 2026-10-19. Cada hallazgo se verificó leyendo el código o la migración citada. Lo que no se pudo verificar desde el repo se dice explícitamente.

---

## 1. Resumen

La capa de aplicación está bien protegida: todos los módulos de server actions pasan por `withAuth`/`withAuthOnly` (excepto los excluidos a propósito y documentados), los IDs que manda el cliente se verifican con los guards de `access.ts`, la API v1 comprueba la org en cada recurso y los módulos nuevos (F1–F8) escriben solo por RPC `SECURITY DEFINER` con control de rol, `search_path` fijo y `REVOKE` a `anon`. El problema de fondo está **una capa más abajo**. En los módulos heredados (api_keys, org_members, punches, PSSR, certificados, webhooks, auditoría) **la regla de rol vive solo en la server action**, y RLS deja pasar a cualquier miembro. Cualquier usuario autenticado tiene la anon key (pública) y su propio JWT (cookie legible por JS), así que puede llamar a PostgREST directamente y saltarse esas reglas. El caso más grave: **cualquier miembro, incluido un `inspector` o un `client`, puede insertar su propia API key con scope `*`** y operar la API pública con service role sobre toda la org. Además, varias funciones `SECURITY DEFINER` del baseline no tienen control interno y siguen ejecutables por `anon`, y dos RPC de punch se saltan la membresía cuando `auth.uid()` es NULL. El aislamiento **entre** tenants está razonablemente bien. La autorización **dentro** del tenant (por rol) no lo está, y ningún test la cubre. Antes de vender a una operadora grande hay que hacer de RLS la autoridad única.

## 2. Fortalezas

- Wrapper `withAuth`/`withAuthOnly` (`src/lib/auth/withAuth.ts`) con guards FK declarativos. Cobertura total de `src/app/actions/*.ts`. Las excepciones (`alerts`, `dashboard-layout`, `locale`, `theme`, `org.switchOrg`, `setup`, `leads`, lecturas de `kpi-snapshots`) están comentadas y justificadas.
- `getActiveMembership` usa `auth.getUser()`, no `getSession()`. La org activa sale de una cookie httpOnly y se revalida contra `org_members` en cada request, así que quitar a un miembro tiene efecto inmediato.
- API keys: token de 256 bits (`gen_random_bytes(32)`), solo se guarda el hash SHA-256 y el token se muestra una vez. Hay expiración y revocación, y cada ruta v1 verifica la org del proyecto, tag, subsistema, plantilla y fase.
- Edge Functions con `requireServiceCaller` y anti-SSRF (`assertPublicHttpsUrl`: https, sin credenciales, bloqueo de IP privadas, resolución DNS, `redirect: 'manual'`).
- Integridad de ITR muy sólida: `sign_itr_atomic`, `guard_itr_row`, `guard_itr_content`, `REVOKE INSERT/UPDATE/DELETE` en `itr_signatures`, evidencia inmutable en storage con políticas RESTRICTIVE.
- Módulos F1–F8 (gates, gestión diaria, arranque, traspasos, vendors, documentos) con escritura solo por RPC, regla de «otra persona» en SQL, `REVOKE ... FROM PUBLIC, anon` y helpers internos revocados también a `authenticated`.
- Storage: migración `20261012210000` aísla por entidad dueña. Buckets nuevos privados, con TTL corto en URLs firmadas (300 s) y validación de la ruta en la action (`getMgmtEvidenceUrl`, `getGateEvidenceUrl`).
- Cabeceras de seguridad completas (CSP, HSTS, nosniff, frame DENY, COOP), sin `x-powered-by`, sin contraseña temporal, guard anti fórmulas en Excel, sanitizado WinAnsi en PDF, anti-spam del formulario de leads.

## 3. Hallazgos (ordenados por severidad)

Conteo: **Crítico 1 · Alto 6 · Medio 10 · Bajo 13** (30 en total).

Nota general sobre la explotabilidad: el baseline (`00000000000000_baseline.sql`) es un pg_dump **sin privilegios** (0 sentencias GRANT). Supone los grants por defecto de Supabase: tablas y funciones de `public` accesibles para `anon` y `authenticated` vía PostgREST, filtradas por RLS. Las migraciones posteriores asumen lo mismo, porque revocan explícitamente. Ver A-14.

---

### A-01 — Crítico — seguridad — Cualquier miembro puede crearse una API key con scope `*`
- **Ubicación:** `supabase/migrations/00000000000000_baseline.sql:7248` (política `"org members can manage api_keys"`); `src/lib/api/auth.ts:96-140`
- **Evidencia:** `CREATE POLICY "org members can manage api_keys" ON public.api_keys USING ((org_id IN (SELECT org_members.org_id FROM org_members WHERE user_id = auth.uid())))`. No tiene `FOR`, así que vale para ALL, y no tiene `WITH CHECK`, así que se usa el `USING`. Ninguna migración posterior la cambia. `authenticateApiKey` solo hace `sha256(token)` y busca `key_hash`. No valida el formato ni quién creó la key.
- **Impacto:** un `inspector` o un `client` (incluido personal externo del cliente) puede hacer `INSERT` en `api_keys` con `org_id` = su org, `key_hash = sha256('loquequiera')` y `scopes = '{*}'`. Después usa `/api/v1/*`, que corre con **service role**: crea tags, ITR y punches, cierra punches con `ops-update closed_final`, genera paquetes de handover, ingesta señales y lee todo. También puede hacer `UPDATE` sobre keys existentes (subir scopes a `*`, poner `revoked_at` a NULL, quitar la expiración) o `DELETE` (cortar integraciones). El rol en UI (`PRIVILEGED_ROLES`) es decorativo.
- **Recomendación:** `DROP POLICY "org members can manage api_keys"`. Dejar solo `api_keys_select` (y limitarla a owner/admin/architect, o exponer una vista sin `key_hash`). La escritura solo por `create_api_key`/`revoke_api_key`, alineando ambos RPC con `PRIVILEGED_ROLES` (hoy usan `is_org_editor`, que incluye `leader`, a diferencia de la UI). Añadir `REVOKE INSERT, UPDATE, DELETE ON public.api_keys FROM authenticated, anon`. Revisar en producción si existen keys no creadas por el RPC (`key_prefix` que no empiece por `sk_live_` o `created_by` sin rol privilegiado).
- **Esfuerzo:** S · **Confianza:** alta (código). La explotación depende de los grants por defecto, que son los de Supabase.

### A-02 — Alto — seguridad — Un admin puede hacerse owner o expulsar a los owners por RLS directa
- **Ubicación:** `baseline.sql:7279, 7286, 7300` (`org_members_delete/insert/update` con `is_org_admin(org_id)`); `src/app/actions/users.ts:107-140`
- **Evidencia:** `org_members_update ... USING (is_org_admin(org_id)) WITH CHECK (is_org_admin(org_id))`. No hay trigger de protección sobre `org_members`; el único es `org_members_company_guard`. Las reglas «solo un owner cambia owners» y «no dejar la org sin owner» solo existen en `updateMemberRole`/`removeMember`.
- **Impacto:** escalada de privilegios: un `admin` hace `update org_members set role='owner' where user_id=<yo>`, borra o degrada a los owners o inserta a un tercero como owner. Con eso se queda la org: `org_update`/`org_delete` son solo de owner, así que también puede cambiar la configuración y borrar la organización.
- **Recomendación:** pasar la gestión de miembros a RPC `SECURITY DEFINER` (`set_member_role`, `remove_member`, `add_member`) con estas reglas en SQL. Mientras tanto, un trigger `BEFORE INSERT/UPDATE/DELETE` que exija `role='owner'` del llamante para tocar filas owner o asignar `owner`, y que impida quedarse con 0 owners.
- **Esfuerzo:** S-M · **Confianza:** alta

### A-03 — Alto — seguridad — `update_punch_ops_status`/`transfer_punch_to_ops`: sin control para `anon` ni de rol, y cierran punches sin verificación
- **Ubicación:** `baseline.sql:1828-1841` y `1737-1756`; `src/app/actions/post-handover.ts`; `src/app/api/v1/punches/[id]/ops-update/route.ts`
- **Evidencia:** `IF auth.uid() IS NOT NULL AND NOT is_project_member(v_project_id) THEN RAISE ...`. Con `auth.uid()` NULL (rol `anon`) **no se valida nada**. La función hace `status = CASE WHEN p_new_status='closed_final' THEN 'closed'` y, al ser DEFINER, `guard_punch_row` la trata como de confianza. Tampoco comprueba que el punch esté en estado post-handover. No hay REVOKE para `anon`.
- **Impacto:** (a) cualquiera con la anon key (pública en el bundle) y un UUID de punch puede cerrarlo o reasignarlo (`assigned_to` arbitrario). (b) Cualquier miembro, incluso `client` o `inspector`, puede cerrar cualquier punch Cat A de su org sin la verificación en campo por otra persona (fase 4), lo que desbloquea certificados y gates. El rol EDITOR solo lo pide la action. Los UUID se filtran por URLs, webhooks y PDFs.
- **Recomendación:** quitar la rama `auth.uid() IS NOT NULL`. Para service role, comprobar `auth.role() = 'service_role'` de forma explícita, como hace `generate_handover_package`. Exigir rol editor y `post_handover_status` en `transferred_to_ops`/estados ops antes de permitir `closed_final`. Validar que `p_transferred_to` sea miembro de la org. `REVOKE EXECUTE ... FROM PUBLIC, anon`.
- **Esfuerzo:** S · **Confianza:** alta

### A-04 — Alto — seguridad — La aprobación del PSSR y sus firmas se pueden falsificar desde cualquier rol
- **Ubicación:** `baseline.sql:7841` (`pssr_reviews_update ... USING (is_project_member(project_id))`), `baseline.sql:7861` (`pssr_signatures_insert` solo con `is_project_member`); `src/app/actions/pssr.ts:372-450`
- **Evidencia:** la aprobación (`status:'approved'`, `approved_by`) solo la hace la action `approvePssrAndIssueRfsu` (EDITOR, con firma previa y bloqueo por punches). La política `UPDATE` admite a cualquier miembro y no hay trigger que proteja `status`. `pssr_signatures_insert` no exige `user_id = auth.uid()`.
- **Impacto:** un `inspector` o `client` pone `status='approved'` en un PSSR por PostgREST e inserta firmas a nombre de otras personas. El PSSR aprobado alimenta el criterio `pssr_approved` de los gates y `startup_prerequisites()`, que habilita `first_startup`/`first_hydrocarbon` (migración `20261018120000:130`). Es un hold point de seguridad de procesos que se puede saltar.
- **Recomendación:** igual que en F1–F8: sin políticas de escritura en `pssr_reviews`/`pssr_signatures` y RPC `approve_pssr`, `sign_pssr` (con `user_id = auth.uid()`) y `reject_pssr` con las reglas en SQL. Si no se puede ya, trigger que bloquee cambios de `status`/`approved_*` fuera del RPC, y `WITH CHECK (user_id = auth.uid())` en firmas.
- **Esfuerzo:** M · **Confianza:** alta

### A-05 — Alto — seguridad — Certificados: firmas a nombre de otros y emisión directa saltándose la elegibilidad
- **Ubicación:** `baseline.sql:6600-6616` (`cert_sig_insert_editors`, `cert_sig_delete_editors`); `20260903200000_rls_set_based_policies.sql:91` (`certificates_update` editores); no existe trigger de guardia en `certificates` (solo `trg_events_certificates`)
- **Evidencia:** la política de INSERT valida que el llamante sea editor, pero **no** que `certificate_signatures.user_id = auth.uid()`. DELETE permite borrar firmas ajenas. `certificates_update` permite `status='issued'`, `is_blocked=false`. La regla de bloqueo por Cat A/B (`eligibility.ts` / `compute_system_readiness`) solo se aplica en la action.
- **Impacto:** un `leader` puede insertar la firma de Operaciones o del Cliente a nombre de otra persona, borrar firmas y emitir un MC/RFC con punches Cat A abiertos sin pasar por la action. El certificado es el documento formal de completitud y el contraste con la protección de los ITR es grande.
- **Recomendación:** RPC `issue_certificate`/`sign_certificate`/`revoke_certificate` que recalculen la elegibilidad en SQL y fijen `user_id = auth.uid()`. Revocar escritura directa (como en `itr_signatures`) y añadir un trigger que impida pasar a `issued` fuera del RPC.
- **Esfuerzo:** M · **Confianza:** alta

### A-06 — Alto — seguridad — Punches: cualquier miembro puede cancelar, recategorizar o reasignar por PostgREST
- **Ubicación:** `20260903200000_rls_set_based_policies.sql:55-57` (`punches_update`/`punches_insert` con `get_my_project_ids()`); `20261016120000_punch_evidence.sql:56-63` (`guard_punch_row`)
- **Evidencia:** `guard_punch_row` solo bloquea `status='closed'` y los campos de resolución/verificación. `cancelled`, el cambio de `category` (A→C), `assigned_to`, `description` y `target_date` siguen abiertos a cualquier miembro, incluido `client`. La action `updatePunchStatus`/`reassignPunch` exige EDITOR.
- **Impacto:** un usuario de bajo privilegio cancela o pasa a Cat C un punch Cat A y desbloquea certificados y gates (abierto = `not in (closed,cancelled)`; Cat C nunca bloquea). Además manipula KPIs.
- **Recomendación:** limitar `punches_update` a `get_my_editor_project_ids()` y crear RPC para lo que hace el campo (comentar, resolver ya lo es). En el trigger, bloquear `cancelled` y bajar de categoría salvo desde RPC con rol editor y motivo obligatorio.
- **Esfuerzo:** S-M · **Confianza:** alta

### A-07 — Alto — seguridad — Funciones DEFINER del baseline sin control: emails de cualquier org e ingesta IIoT en cualquier org
- **Ubicación:** `baseline.sql:1260` (`get_org_member_emails`), `baseline.sql:1289` (`ingest_signal_samples`); la única revocación es `20260903150000` (solo `is_org_admin`, `is_catalog_org`)
- **Evidencia:** `get_org_member_emails(p_org_id)`: `SELECT m.user_id, u.email FROM org_members m JOIN auth.users u ... WHERE m.org_id = p_org_id`, sin comprobar al llamante. `ingest_signal_samples(p_org_id, ...)` inserta en `signal_samples` y ejecuta `evaluate_signal_rules_for_batch`, también sin comprobar al llamante.
- **Impacto:** cualquier usuario autenticado, o `anon` con la anon key, que conozca un `org_id` obtiene todos los emails de esa org (fuga entre tenants). El `org_id` de la org catálogo es visible para todos por `org_select_catalog`, y otros se filtran por `itr_templates.org_id` globales. Con un `org_id` y nombres de señal se pueden inyectar muestras en otra org: falsean la «foto IIoT» de los eventos de arranque (`startup_event_params`, ±5 min) y generan sugerencias de cierre de ITR.
- **Recomendación:** `get_org_member_emails`: `IF NOT is_org_admin(p_org_id) THEN RAISE`. `ingest_signal_samples`: `REVOKE EXECUTE FROM PUBLIC, anon, authenticated` (solo lo usa la API v1 con service role). Repasar con el linter de Supabase (0028/0029) todas las DEFINER del baseline (ver A-19).
- **Esfuerzo:** S · **Confianza:** alta en el código; media en los grants de producción (no versionados)

### A-08 — Medio — seguridad / funcionalidad — ITR: una sola persona puede firmar como ejecutor, supervisor y cliente
- **Ubicación:** `20261016150000_test_equipment.sql:199-216` (`sign_itr_atomic`); `baseline.sql:3905` (`UNIQUE (itr_id, role)` en `itr_assignments`); `src/app/actions/itr-instances.ts:86-89`
- **Evidencia:** `sign_itr_atomic` comprueba que el usuario esté asignado al rol y el orden de las firmas, pero no que sean **personas distintas**. La única unicidad es por `(itr_id, role)`, y `createItrInstance` acepta el mismo id en `inspectorId`, `supervisorId` y `clientId`.
- **Impacto:** un `leader` se asigna los tres roles y aprueba su propio ITR. Esto contradice la segregación de funciones que el resto del producto aplica (punches, gates, procedimientos, traspasos) y que una auditoría de QA/QC espera.
- **Recomendación:** en `sign_itr_atomic`, rechazar si `uid` ya firmó otro rol del mismo ITR (configurable por org si algún cliente lo permite). En `guard_itr_content`, opcionalmente exigir que la asignación `client` sea de un miembro con rol `client`.
- **Esfuerzo:** S · **Confianza:** alta

### A-09 — Medio — seguridad — Cerrar sesión no borra las cachés del SW ni la cola offline (dispositivos compartidos)
- **Ubicación:** `public/sw.js:115-151` (`navigateFirst`, `networkWithStaleFallback`), `public/sw.js:24-28` (`API_PATTERNS` incluye `/rest/v1/`, `/auth/v1/`); `src/components/layout/UserMenu.tsx:104-108`; `src/lib/sync/replay.ts`, `src/lib/sync/outbox.ts:136-154`
- **Evidencia:** todas las navegaciones HTML autenticadas se guardan en `CACHE_STATIC` y las respuestas GET de Supabase REST/Auth en `CACHE_API`, con clave por URL sin tener en cuenta el usuario. Las imágenes (URLs firmadas de evidencias) quedan en caché sin caducidad. `handleLogout` solo hace `signOut()`. No se llama a `caches.delete` y no se vacía IndexedDB. La cola guarda firmas (`signatureImage`) y punches sin `userId`.
- **Impacto:** en una tablet de campo compartida, el usuario B (o alguien sin sesión, en modo offline) ve páginas y datos del usuario A. Peor: si A cierra sesión con pendientes en la cola, al reconectar se reenvían con la sesión de B, y la firma de A queda registrada como firma de B en un ITR.
- **Recomendación:** al cerrar sesión o cambiar de org, mandar `postMessage` al SW para borrar `commup-api-*`, `commup-images-*` y las páginas HTML, y vaciar o bloquear las colas IndexedDB. Guardar `userId` en cada entrada y descartar o pedir confirmación si no coincide con la sesión. No cachear `/auth/v1/` ni respuestas con `Authorization`.
- **Esfuerzo:** M · **Confianza:** alta

### A-10 — Medio — seguridad — El secreto HMAC de los webhooks es legible por cualquier miembro
- **Ubicación:** `baseline.sql:8281` (`webhook_subs_select ... org_id IN get_my_org_ids()`); `baseline.sql:3623` (`secret text NOT NULL`)
- **Evidencia:** la UI (`admin/webhooks/page.tsx:15`) no selecciona `secret`, pero RLS no limita columnas, así que cualquier `inspector` o `client` puede leerla.
- **Impacto:** con el secreto se pueden falsificar entregas firmadas (`X-CommUp-Signature`) hacia el ERP o CMMS del cliente, que las aceptará como legítimas.
- **Recomendación:** `REVOKE SELECT (secret) ON webhook_subscriptions FROM authenticated` (privilegio por columna) o mover el secreto a una tabla aparte o a Vault, legible solo por service role. Limitar el SELECT a `PRIVILEGED`.
- **Esfuerzo:** S · **Confianza:** alta

### A-11 — Medio — seguridad — Falsificación del registro de auditoría y notificaciones arbitrarias
- **Ubicación:** `baseline.sql:6461` (`activity_log_insert ... WITH CHECK (org_id IN (...))`); `baseline.sql:7225` (`notifications_insert_org_member`); `src/app/(dashboard)/inbox/InboxList.tsx:69`
- **Evidencia:** `activity_log` acepta cualquier `user_id`, `action` y `payload` de cualquier miembro. `notifications` acepta cualquier `recipient_user_id` y `link_url`, y la bandeja hace `router.push(n.link_url)`.
- **Impacto:** cualquier miembro inserta entradas de auditoría falsas atribuidas a otra persona (en un pleito de handover el log pierde valor probatorio). También puede enviar notificaciones con apariencia de sistema y enlace externo (phishing interno).
- **Recomendación:** escribir `activity_log` solo desde triggers o RPC (sin política INSERT) o forzar `user_id = auth.uid()` en `WITH CHECK`. Para notificaciones, RPC con lista blanca de `kind`, `link_url` relativo (`^/`) y destinatario miembro de la org.
- **Esfuerzo:** S-M · **Confianza:** alta

### A-12 — Medio — seguridad — XSS almacenado en el detalle de certificado
- **Ubicación:** `src/app/(dashboard)/projects/[id]/certificates/[certId]/CertificateDetail.tsx:576, 626`
- **Evidencia:** `dangerouslySetInnerHTML={{ __html: t('detail.reopenModal.body', { certNumber: \`<strong>${cert.certificate_number}</strong>\` }) }}`. `certificate_number` se compone con `subsystem.code` (editable o importable por editores) y además se puede cambiar con `certificates_update`.
- **Impacto:** un editor guarda `<img src=x onerror=...>` en el código de subsistema o en el número de certificado, y el script se ejecuta a quien abra el modal de reabrir o revocar (normalmente un admin). La CSP permite `'unsafe-inline'` y las cookies de sesión de `@supabase/ssr` son legibles por JS, así que se puede robar la sesión del admin.
- **Recomendación:** usar `t.rich(..., { strong: c => <strong>{c}</strong> })` de next-intl, o escapar. Prohibir `<>"'` en los códigos de jerarquía e importación.
- **Esfuerzo:** S · **Confianza:** alta

### A-13 — Medio — seguridad / rendimiento — Sin rate limiting ni cuotas (API v1, IA, push)
- **Ubicación:** `src/lib/api/auth.ts` (no hay limitador); `src/app/api/v1/signals/samples/route.ts` (5000 muestras por request sin límite de frecuencia); `src/app/actions/daily-report.ts:85-102` (`generateDailyReportAi` sin rol); `ce-import.ts`, `systems-ai.ts`, `itr-translations.ts` (`max_tokens: 16000`, modelo Opus)
- **Evidencia:** no hay contador por key, usuario u org. `generateDailyReportAi` usa `{ guards: projectGuard }` sin `role`, así que un `client` también puede lanzarlo.
- **Impacto:** abuso de coste (Anthropic Opus), saturación de la BD por ingesta y fuerza bruta de keys sin freno (aunque la entropía las protege).
- **Recomendación:** Cloudflare Rate Limiting (binding de Workers o regla WAF) por `Authorization`/IP en `/api/v1/*`. Cuota diaria de IA por org (tabla `ai_usage`) y rol mínimo para las acciones de IA.
- **Esfuerzo:** M · **Confianza:** alta

### A-14 — Medio — mantenibilidad / seguridad — Grants y políticas de storage fuera de control de versiones
- **Ubicación:** `supabase/migrations/00000000000000_baseline.sql` (0 `GRANT`, sin `storage.*`); buckets `pid-documents`, `handover-packages`, `org-assets` y la creación original de `itr-attachments`/`punch-attachments`/`preservation-attachments`
- **Evidencia:** `grep -c '^GRANT' baseline` = 0. Las políticas de `pid-documents`, `handover-packages` y `org-assets` no aparecen en ninguna migración, y tampoco el flag `public` de esos buckets. `uploadOrgLogo` usa `getPublicUrl`, así que `org-assets` es público.
- **Impacto:** no se puede auditar desde el repo quién ejecuta qué ni qué protege `pid-documents`/`handover-packages` (planos P&ID y dossiers de handover, que son información sensible de la planta). Recrear el entorno desde las migraciones da otros privilegios.
- **Recomendación:** volcar con privilegios (`pg_dump --schema=public --schema=storage` sin `--no-privileges`) o escribir una migración con todos los GRANT/REVOKE y las políticas de storage. Añadir `supabase db lint` y los advisors de seguridad al CI.
- **Esfuerzo:** S-M · **Confianza:** alta

### A-15 — Medio — funcionalidad / UX — El inspector no puede levantar punches desde la ejecución del ITR
- **Ubicación:** `src/app/actions/punches.ts:13-15` (`createPunch` con `role: EDITOR_ROLES`), también `addPunchComment` y `addPunchAttachment`; `src/lib/sync/outbox.ts:105-120`; `ItrExecution.tsx:261, 615` (el modal se abre sin comprobar el rol); `src/lib/constants/navigation.ts:9` (`FIELD_ROLES = ['inspector','leader']`)
- **Evidencia:** la UI de ejecución ofrece «Crear punch» a todos. El inspector recibe «Sin permisos» y, si estaba offline, la entrada se descarta tras 3 intentos (`outboxPolicy`), dejando rastro en `sync_conflicts`. RLS (`punches_insert`) sí permite al inspector.
- **Impacto:** se pierden en campo deficiencias detectadas por el rol que más punches levanta. Es incoherente con la política de RLS (A-06 en sentido inverso).
- **Recomendación:** definir una matriz de rol por operación. Probablemente `createPunch`/comentario/adjunto deberían ser `EDITOR + inspector`, y cancelar o recategorizar solo `EDITOR`. Aplicarla igual en SQL y en la action.
- **Esfuerzo:** S · **Confianza:** media-alta (no vi un gate de rol en la UI; confirmar en campo)

### A-16 — Medio — funcionalidad faltante / seguridad — No hay membresía por proyecto y las API keys son siempre de toda la org
- **Ubicación:** `is_project_member`/`get_my_project_ids` (`baseline.sql:1460`; `20260903200000`): miembro de la org = miembro de todos sus proyectos; `src/lib/api/auth.ts:136` (`projectId: null` siempre)
- **Evidencia:** no existe una tabla `project_members`. El rol `client` (personal de la operadora) ve todos los proyectos de la org contratista, y una key de integración ve todos los proyectos.
- **Impacto:** un EPC con varios clientes en una misma org no puede aislarlos. Es un bloqueante comercial habitual (cliente A no debe ver el proyecto del cliente B) y amplía el radio de daño de A-01.
- **Recomendación:** tabla `project_members` (opcional por org) usada por `get_my_project_ids`, rol `client` limitado a los proyectos asignados y API keys con `project_ids[]` y lista blanca de IP.
- **Esfuerzo:** L · **Confianza:** alta

### A-17 — Medio — mantenibilidad — No hay tests de autorización por rol dentro del tenant
- **Ubicación:** `tests/db/rls-smoke.test.ts:25-61` (solo cruce entre usuario A y usuario B); todos los `tests/db/*` usan `describe.skipIf(!enabled)` y en CI no hay secretos (CLAUDE.md)
- **Evidencia:** los 4 casos de `rls-smoke` son entre tenants. Ningún test intenta como `inspector`/`client` escribir `api_keys`, `org_members`, `pssr_reviews` o `certificates`.
- **Impacto:** A-01 a A-06 pasaron todas las auditorías previas porque nada las prueba. Cualquier política nueva puede volver a abrirse sin aviso.
- **Recomendación:** matriz automatizada rol × tabla × operación (INSERT/UPDATE/DELETE directos por PostgREST con el JWT de cada rol) contra una rama de Supabase en CI, con resultado esperado «denegado» salvo lista blanca.
- **Esfuerzo:** M · **Confianza:** alta

### A-18 — Bajo — seguridad — Redirección abierta en `/auth/confirm`
- **Ubicación:** `src/app/auth/confirm/route.ts:15, 22, 27`
- **Evidencia:** `const next = url.searchParams.get('next')`; `NextResponse.redirect(new URL(dest, url.origin))`. Con `next=https://evil.tld` o `//evil.tld`, la URL resultante apunta fuera del sitio.
- **Impacto:** tras un OTP válido se puede redirigir a un sitio de phishing. Combinado con un token propio del atacante, permite un login-CSRF.
- **Recomendación:** aceptar solo rutas relativas: `next?.startsWith('/') && !next.startsWith('//')`.
- **Esfuerzo:** S · **Confianza:** alta

### A-19 — Bajo — seguridad — Otras DEFINER del baseline sin control y ejecutables por `anon`
- **Ubicación:** `baseline.sql:348` (`bump_push_subscription_failure`: tras 5 fallos desactiva cualquier suscripción), `:1275` (`increment_webhook_failure_count`), `:1523` (`next_punch_number_atomic`: consume correlativos de cualquier proyecto), `:366` (`cleanup_signal_samples_retention`), `evaluate_signal_rules_for_batch`; `20261016150000:` `itr_test_equipment_blocker` (da códigos de equipo de prueba de cualquier ITR); varias funciones solo con `REVOKE ... FROM PUBLIC` (`evaluate_itr_table`, `itr_table_deviation`), que no quitan un GRANT explícito a `anon`
- **Impacto:** DoS menores (desactivar pushes ajenos, huecos en la numeración de punches) y fugas de información pequeñas. Todos requieren un UUID.
- **Recomendación:** `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` en las que solo usa service role, y añadir `is_project_member` en `itr_test_equipment_blocker`. Usar siempre la forma `FROM PUBLIC, anon`.
- **Esfuerzo:** S · **Confianza:** alta

### A-20 — Bajo — seguridad — `completeSetup` crea orgs con service role para cualquier autenticado y acepta campos de más
- **Ubicación:** `src/app/actions/setup.ts:32-140`, en especial `:97` y `:104` (`input.phases.map(p => ({ ...p, org_id }))`)
- **Evidencia:** solo comprueba `getUser()`. No comprueba si ya tiene org (el layout `(setup)` sí, pero la action se puede invocar directamente). Tampoco limita la longitud de nombres ni la cantidad de fases o disciplinas, y el spread envía columnas arbitrarias a `project_phases`/`disciplines` con el cliente admin (por ejemplo `id`).
- **Impacto:** cualquier invitado puede crear orgs ilimitadas (spam o coste) e insertar filas con columnas no previstas. No compromete a otros tenants.
- **Recomendación:** validar con zod, construir los objetos campo a campo, limitar a N orgs por usuario o exigir aprobación de plataforma.
- **Esfuerzo:** S · **Confianza:** alta

### A-21 — Bajo — bug / privacidad — Invitaciones: límite de 1000 usuarios, email sensible a mayúsculas y alta sin consentimiento
- **Ubicación:** `src/app/actions/users.ts:31-32` (`listUsers({ page: 1, perPage: 1000 })`, `u.email === email`), `:34-56`
- **Evidencia:** con más de 1000 usuarios en Auth, o con mayúsculas en el email, no encuentra al usuario existente e `inviteUserByEmail` falla. Un usuario existente se agrega directamente a otra org sin aceptar nada, y la respuesta revela si el email ya está registrado.
- **Impacto:** a escala, invitar falla. Un admin de cualquier org puede «capturar» a usuarios de la plataforma en su org y saber qué emails tienen cuenta.
- **Recomendación:** normalizar a minúsculas. Buscar por email con una RPC sobre `auth.users` (service role) en vez de paginar. Para usuarios existentes, invitación pendiente con aceptación.
- **Esfuerzo:** S-M · **Confianza:** alta

### A-22 — Bajo — bug — Incoherencias con usuarios de varias orgs
- **Ubicación:** `src/app/api/admin/export/route.ts:11-15` (`.limit(1)`: la primera membresía, no la activa); `baseline` `upsert_push_subscription` (`ORDER BY joined_at LIMIT 1`); `src/app/(setup)/layout.tsx:12-16`; `src/app/actions/kpi-snapshots.ts:41, 81` (`getSubsystemKpis`/`getProjectSnapshots` sin `checkProjectAccess`, solo RLS)
- **Impacto:** el export puede devolver 403 o 404 en la org activa. Los push solo llegan de la primera org. Las lecturas de KPI aceptan proyectos de otra org del usuario fuera de la org activa.
- **Recomendación:** usar `getActiveMembership()` en todos los route handlers y RPC con `p_org_id` explícito validado.
- **Esfuerzo:** S · **Confianza:** alta

### A-23 — Bajo — seguridad — El endpoint de push es una URL arbitraria que el servidor llama (SSRF ciego)
- **Ubicación:** `src/app/api/push/subscribe/route.ts:22-32`; `src/lib/push/web-push.ts:203-216`; `src/app/api/cron/push-dispatch/route.ts`
- **Evidencia:** `endpoint` se guarda sin validar y luego se hace `fetch(args.endpoint, { method: 'POST' ... })`. `/api/push/test` devuelve el `status`.
- **Impacto:** POST ciego desde el Worker hacia hosts arbitrarios. En Cloudflare el riesgo de red interna es bajo, pero sirve como relé.
- **Recomendación:** lista blanca de orígenes de push (`fcm.googleapis.com`, `*.push.apple.com`, `updates.push.services.mozilla.com`, `*.notify.windows.com`) y solo https.
- **Esfuerzo:** S · **Confianza:** alta

### A-24 — Bajo — bug / seguridad — Filtros `.or()` de PostgREST construidos con texto de búsqueda sin escapar
- **Ubicación:** `src/app/actions/tag-search.ts:30`; `src/lib/list/tag-query.ts:60`; `src/lib/list/itr-query.ts:48-52`; `normalizeSearch` (`src/lib/list/params.ts:32-35`) solo quita `%_\`
- **Evidencia:** buscar `PT-100, A` o con paréntesis rompe la consulta. Un texto como `x,id.not.is.null` añade condiciones al OR.
- **Impacto:** búsquedas fallidas y manipulación de filtros. RLS lo acota, así que no hay fuga entre tenants.
- **Recomendación:** quitar o escapar `,()` y comillas, o usar RPC con parámetros (trigram).
- **Esfuerzo:** S · **Confianza:** alta

### A-25 — Bajo — mantenibilidad — Higiene de la API v1
- **Ubicación:** `src/lib/api/auth.ts:160-164` (`limit` negativo pasa porque `Math.min(-5,500)` = -5); `src/app/api/v1/events/route.ts:32` (`NaN` si `limit` no es numérico); `src/app/api/v1/tags/route.ts:79-92` (`total: count ?? items.length` sin pedir `count`, así que total = tamaño de la página); `error.message` de la BD devuelto tal cual (500/400); cuerpos sin validación de esquema
- **Impacto:** paginación engañosa para integradores y filtración del esquema interno en los mensajes de error.
- **Recomendación:** zod por endpoint, `limit ∈ [1,500]`, `{ count: 'exact' }` cuando se informa el total y mensajes de error genéricos con id de correlación.
- **Esfuerzo:** S-M · **Confianza:** alta

### A-26 — Bajo — seguridad — Subidas sin lista de tipos MIME y logo con extensión libre
- **Ubicación:** `20261012180000:355` (`gate-evidence`), `20261017120000:229` (`mgmt-evidence`), `20261021120000:230` (`project-documents`): `INSERT INTO storage.buckets` sin `allowed_mime_types`; `src/app/actions/config.ts:384-391` (`ext = file.name.split('.').pop()`, `contentType: file.type`, bucket público)
- **Impacto:** se pueden subir HTML o SVG ejecutables en el origen de Supabase Storage (el logo es público). Hay riesgo de contenido activo y de rutas raras derivadas del nombre del archivo.
- **Recomendación:** `allowed_mime_types` en cada bucket. En el logo, lista blanca `png|jpg|webp` y extensión según el MIME validado, no según el nombre.
- **Esfuerzo:** S · **Confianza:** alta

### A-27 — Bajo — seguridad — Detalles de endurecimiento
- **Ubicación:** `src/app/api/cron/*/route.ts` (comparación `!==` del secreto, no en tiempo constante); `src/app/actions/leads.ts` (reutiliza `CRON_SECRET` como sal del hash de IP); `next.config.ts` (HSTS sin `includeSubDomains; preload`, `script-src 'unsafe-inline'`)
- **Recomendación:** comparación en tiempo constante, un secreto separado para la sal y HSTS completo. Aceptar `'unsafe-inline'` como deuda documentada hasta tener nonces.
- **Esfuerzo:** S · **Confianza:** alta

### A-28 — Bajo — bug — Aprobación masiva de ITR muerta
- **Ubicación:** `src/app/actions/bulk.ts:9-23, 59-82` frente a `20260909180000_itr_atomic_integrity.sql:187` (`IF NOT trusted AND NEW.status='approved' THEN RAISE 'Approval requires atomic signing'`)
- **Impacto:** `bulkApproveItrs` y `bulkUpdateItrStatus('approved')` siempre fallan. El trigger es correcto; la funcionalidad de la UI, no.
- **Recomendación:** quitar la opción o redirigir a firma.
- **Esfuerzo:** S · **Confianza:** media (no comprobé si la UI todavía expone el botón)

### A-29 — Bajo — seguridad — El guard anti fórmulas no se aplica en todas las exportaciones
- **Ubicación:** `src/app/(dashboard)/admin/templates/matrix/MatrixView.tsx:133-161` (`aoa_to_sheet` sin `sanitizeCell`, con nombres y títulos de la org y propuestas de la IA); `src/lib/excel/sanitize.ts:14` (no cubre espacios iniciales antes de `=`)
- **Recomendación:** pasar por `sanitizeCell` y un helper único `toSafeSheet`.
- **Esfuerzo:** S · **Confianza:** alta

### A-30 — Bajo — mantenibilidad — Componente de IA muerto
- **Ubicación:** `src/components/AIAssistantChat.tsx:78` llama a `/api/ai/assistant`, que no existe en `src/app/api`
- **Impacto:** código muerto con `dangerouslySetInnerHTML` (escapado, pero es superficie innecesaria).
- **Recomendación:** eliminarlo o implementarlo con el mismo patrón de las actions de IA.
- **Esfuerzo:** S · **Confianza:** alta

---

## 4. Propuestas de mejora estratégicas

1. **«RLS es la autoridad»: un solo modelo de autorización.** Llevar los módulos heredados (api_keys, org_members, punches, PSSR, certificados, webhooks, activity_log, notifications) al patrón de F1–F8: sin políticas de escritura en tablas sensibles, solo RPC `SECURITY DEFINER` con rol y reglas de negocio en SQL, y las server actions como capa fina. Es lo que cierra A-01 a A-06 de una vez y elimina la deriva entre la action y la BD.
2. **Matriz de permisos ejecutable.** Una tabla `role_permissions` (o un archivo TS generado a SQL) como fuente única de qué rol hace qué, consumida por las actions, la UI y la generación de políticas. Va acompañada de la suite de tests rol × tabla × operación en CI contra una rama de Supabase, con los advisors del linter de Supabase bloqueando el merge.
3. **Integridad de firmas tipo 21 CFR Part 11 / ISO 9001.** Reautenticar al firmar (contraseña u OTP, sesión AAL2), segregación de funciones configurable por org, firmas con hash encadenado (cada firma referencia el hash anterior) y un `activity_log` de solo inserción escrito por triggers, con verificación de cadena exportable en el dossier. Es lo que piden las operadoras y los auditores de terceros en O&G.
4. **Identidad empresarial.** SSO SAML/OIDC por org (Azure AD/Entra es lo habitual en operadoras), MFA obligatorio para owner, admin y aprobadores, aprovisionamiento SCIM, caducidad de sesión configurable y «cerrar sesión en todos los dispositivos».
5. **Aislamiento más fino.** Membresía por proyecto y por empresa (contratista, subcontratista, cliente), rol `client` limitado a sus proyectos y API keys con alcance de proyecto, lista de IP permitidas, rotación y caducidad por defecto (90 días). Cuentas de servicio separadas de las personas (hoy los punches de la API se atribuyen a quien creó la key).
6. **Endurecer el borde.** Rate limiting de Cloudflare por key, usuario e IP, cuotas de IA por org, WAF y Bot Fight en `/login` y `/api/v1`. CSP con nonces cuando OpenNext lo permita, y Trusted Types.
7. **Seguridad offline de verdad.** IndexedDB cifrado por usuario (clave derivada de la sesión), cola ligada a `userId`, purga al cerrar sesión y bloqueo por PIN en dispositivos compartidos. Así se puede vender «tablet compartida en campo», que es el caso real.
8. **Programa y evidencias.** Versionar los grants y el storage, pentest externo anual, camino a SOC 2 Type II e ISO 27001, política de retención y PITR documentada, y alineación con IEC 62443 para la ingesta IIoT (la API de señales es un punto de entrada OT↔IT). Un «Trust Center» con estos documentos acelera las ventas a operadoras.

---

## 5. Funcionamiento para el manual (seguridad, roles, invitaciones y API)

### Organizaciones y aislamiento de datos
- Cada empresa trabaja en su propia **organización**. Los datos de una organización (proyectos, tags, ITR, punches, certificados, documentos, fotos) no son visibles para otras organizaciones; la base de datos lo garantiza en cada consulta.
- Dentro de una organización, **todos los miembros ven todos los proyectos** de esa organización. Lo que cambia según el rol es lo que pueden hacer, no lo que ven. Hoy no hay restricción por proyecto.
- Si perteneces a varias organizaciones, el selector del menú de usuario cambia la organización activa. Todo lo que ves y haces se aplica a la organización activa.

### Roles
| Rol | Para quién | Qué puede hacer (resumen) |
|---|---|---|
| **Owner** (propietario) | Responsable de la cuenta | Todo. Es el único que cambia la configuración general de la organización, nombra o quita a otros owners y puede eliminar la organización. Siempre debe quedar al menos un owner. |
| **Admin** | Administración de la plataforma en la empresa | Invita y quita usuarios, cambia roles (excepto el de owner), configura la organización (fases, disciplinas, tipos de equipo, logo) y exporta datos. |
| **Architect** | Ingeniería de completamiento | Configura la estructura: plantillas ITR y PSSR, matriz de ITR, importaciones Excel (jerarquía, tags, señales), creación de proyectos, gates, API keys y webhooks. |
| **Leader** (líder) | Supervisores y jefes de disciplina | Gestión diaria del proyecto: crea y asigna ITR, gestiona punches, emite certificados, aprueba PSSR, planes de trabajo, procedimientos y líneas de alineación. Aprueba y firma según su capacidad. |
| **Inspector** | Personal de campo | Ejecuta los ITR que tiene asignados (respuestas, fotos, firmas), registra preservación, resuelve punches y trabaja offline en la app instalada. |
| **Client** (cliente) | Representante de la operadora o del dueño | Consulta todo el avance, firma como «cliente» los ITR donde está asignado, verifica punches en campo, responde consultas técnicas (TQ) y puede cofirmar gates si la organización lo configura. |

Reglas de «cuatro ojos» que aplica el sistema: un punch lo verifica una persona distinta de quien lo resolvió; los gates multifirma exigen personas distintas para Comisionamiento, Operaciones y HSE; un procedimiento lo aprueba alguien distinto del autor y un hold point lo libera otra persona habilitada; un traspaso de propiedad requiere dos firmas de personas distintas. Un ITR firmado queda bloqueado y solo se modifica con una reapertura auditada.

### Invitar usuarios
1. Un owner o admin entra en **Administración → Usuarios → Invitar**, escribe el correo y elige el rol. Solo un owner puede invitar a otro owner.
2. La persona recibe un **correo de invitación**. El enlace la autentica y la lleva a **«Fija tu contraseña»** (mínimo 8 caracteres). No se generan contraseñas temporales.
3. Si el correo ya tiene cuenta en CommUp, la persona se agrega directamente a la organización con el rol elegido y la verá en su selector de organizaciones.
4. Para dar de baja a alguien, un admin u owner lo **quita de la organización**. El acceso se pierde de inmediato. Sus firmas, punches e historial se conservan; antes de quitarlo, el sistema muestra lo que deja pendiente (punches abiertos, ITR asignados) para reasignarlo.
5. Si olvidaste tu contraseña: **«¿Olvidaste tu contraseña?»** en la pantalla de acceso te envía un enlace para fijar una nueva.

### Cerrar sesión y dispositivos compartidos
- Usa **Cerrar sesión** en el menú de usuario al terminar. En tablets compartidas, sincroniza los pendientes («No sincronizado») **antes** de cerrar sesión, para que tus registros offline se envíen con tu usuario.

### API pública (integraciones) y webhooks
- **API keys:** owners, admins y architects las crean en **Administración → API keys**. Se elige un nombre, los permisos (scopes: `tags:read/write`, `itrs:read/write`, `punches:read/write`, `certificates:read`, `systems:read`, `events:read`, `handover:read/write`, `signals:read/write`) y una fecha de expiración opcional. La clave (`sk_live_…`) **se muestra una sola vez**; guárdala en un gestor de secretos. Se puede revocar en cualquier momento y deja de funcionar al instante.
- La clave da acceso a **todos los proyectos de la organización**. Se envía en la cabecera `Authorization: Bearer sk_live_…`. Las listas devuelven hasta 500 registros por página (`limit`, `offset`) y la ingesta de señales admite hasta 5000 muestras por envío.
- **Webhooks:** en **Administración → Webhooks** se registra una URL **https** pública y los eventos de interés. Cada envío lleva la cabecera `X-CommUp-Signature: sha256=<HMAC>` calculada con el secreto que se muestra al crear el webhook; el sistema receptor debe verificarla. Si el destino falla, se reintenta hasta 5 veces (inmediato, 1 min, 5 min, 30 min, 2 h).

### Archivos y evidencias
- Fotos, PDFs y evidencias se guardan en almacenamiento privado separado por proyecto. Se abren con enlaces temporales (de 5 minutos a 1 hora). Las evidencias de ITR firmados, gates, gestión diaria y documentos son **inmutables**: no se pueden reemplazar ni borrar.
