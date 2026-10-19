# Revisión F — Datos de ingeniería, documentos, vendors y reportes

Revisor F · 2026-10-19 · revisión estática, solo lectura (sin BD, sin servidor). Cada hallazgo se verificó en el código. Para el renderer de PDF ejecuté pdf-lib del propio `node_modules` en un script del scratchpad, fuera del repo, para confirmar qué caracteres hacen fallar el render.

Alcance revisado: señales, lazos, matrices C&E (editor, importación con IA), la página `interlocks`, documentos P&ID con hotspots y visor, explorador, gemelo digital, `/tag_360`, `/scan`, `/r/[id]`, empresas, registro de documentos y referencias (migraciones `20261021120000` y `20261021130000`), paquetes de vendor (`20261022120000`, `vendors.ts`), KPIs F8 (`20261023120000`), PDFs (`src/lib/pdf/*`), exportaciones Excel/CSV, `/kpis/report` y paquetes de handover.

---

## 1. Resumen (franco)

El backend de F8 es sólido. Toda escritura pasa por RPC SECURITY DEFINER, cada una valida rol, proyecto y estado, y los bloqueos duros de firma y aprobación están parcheados en las funciones correctas. La parte de ingeniería de F4-D (cadena del loop check, C&E por causa, foto inmutable `source_rows`) está bien pensada. **En la práctica de campo, en cambio, el registro de documentos y los vendors todavía no rinden lo que prometen.** Hay cuatro motivos:

1. **El bloqueo por revisión superada depende de referencias que alguien tiene que crear a mano, ITR por ITR.** No hay referencia masiva, ni automática por sistema, plano o plantilla, ni revalidación masiva. En un proyecto con miles de ITR nadie va a cargar esas referencias, así que el bloqueo protegerá muy poco (F-02).
2. **La "revisión vigente" es la última que se registró, no la más reciente.** Si al poblar el registro alguien carga el historial en desorden, una revisión vieja queda como vigente y las referencias correctas aparecen como superadas (F-03).
3. **Hay errores reales en reportes y en datos:**
   - El PDF de punch list falla (500) si alguna descripción tiene un salto de línea (F-01).
   - El reporte KPI imprimible subcuenta los punch abiertos por el tope de 1000 filas (F-04).
   - El KPI "readiness de vendors" no vuelve a quedar limpio nunca si una FAT falló alguna vez (F-05).
   - Reimportar señales borra la cadena del loop check y desvincula los lazos (F-06).
4. **Hay dos registros de P&ID que no se hablan:** `pid_documents` (sin revisiones; al resubir pisa el archivo y los pines quedan descolocados) y `documents` (con revisiones, sin visor ni hotspots). Hay que fusionarlos (F-13).

También faltan piezas que la competencia industrial da por hechas: transmittals, VDRL/MDR con importación y exportación, red-lines (estaban en el plan §4 F8 y no se construyeron), dossier compilado con las hojas reales y API para integrarse con el EDMS de la operadora. Ninguna de estas faltas es un bug, pero el discurso de venta "control documental" queda corto sin ellas.

**Conteo:** 6 Alta · 17 Media · 13 Baja (36 hallazgos).

---

## 2. Fortalezas

- **Modelo de escritura cerrado.** `documents`, `document_revisions`, `document_references` y las tablas `vendor_*` solo tienen políticas SELECT. Todo pasa por RPC con `register_caller_role`, validación de pertenencia al proyecto u org (`document_check_refs`, `save_vendor_package`) y `FOR UPDATE` sobre la fila madre. Los helpers internos (`vendor_package_for_write`, `mgmt_next_seq`, `member_company_name`, `document_references_blocker`) tienen `EXECUTE` revocado para `authenticated`. La lista blanca de tablas en `mgmt_next_seq` evita la inyección por `format('%I')`.
- **Bloqueo duro bien ubicado.** Está dentro de `sign_itr_atomic` y de `transition_procedure_revision` (al enviar y al aprobar). Los parches por ancla abortan si el ancla no aparece exactamente una vez, lo que da una buena protección contra deriva.
- **Firma "nombre · empresa" congelada por trigger** (`freeze_signer_company`) en las cinco tablas de firma, sin depender del cliente.
- **Paquetes de vendor con reglas claras:**
  - Movilización: gate aprobado con firmas, checklist completo y ninguna interfaz abierta.
  - Desmovilización: reporte final, checklist y ningún Cat A abierto.
  - Recomendaciones con MOC obligatorio para implementarse (CHECK en la tabla, además de la RPC).
  - Hallazgos: los que tienen tag se vuelven punch y los que no, acción ACC. Así se reutilizan los circuitos de bloqueo existentes sin duplicar lógica.
- **Importación C&E con IA bien diseñada:**
  - La IA solo propone, la persona revisa en una grilla y el servidor vuelve a validar y a emparejar los tags (no confía en el cliente).
  - Salida estructurada con zod; se manejan `refusal` y `max_tokens`.
  - Límite de 4 MB para PDF y de caracteres para la hoja.
- **El ITR de loop check y de C&E es un ITR normal generado desde una plantilla.** Hereda firmas, equipo calibrado, tabla v2, PDF, offline y gates. La foto `source_rows` con aviso de "desactualizado" es una decisión de ingeniería madura.
- **El PDF del ITR es robusto.** Usa `wrapText` en todo el cuerpo, pagina filas largas y tiene tests (`itr.test.ts`) con textos de 350 repeticiones y 80 conductores. Las firmas muestran solo el trazo almacenado, sin reconstruirlo.
- **Compatibilidad con Workers:** pdf-lib, `qrcode-generator` en JS puro, xlsx de SheetJS desde el tarball del CDN y `nodejs_compat` para `Buffer`. Los reportes PDF del proyecto (system-completion, phase-progress, area-kpis, test-pack, punch PDF) ya paginan con `fetchAllRows`.
- **Paridad i18n** completa en los namespaces `Documents`, `Vendors` y `PidDocuments` (100, 172 y 60 claves en es/en, sin faltantes).

---

## 3. Hallazgos

Formato: **ID · Severidad · Categoría · Confianza**. Ubicación, evidencia, impacto, recomendación y esfuerzo (S, M o L).

### Severidad ALTA

**F-01 · Alta · Bug / PDF · Confianza alta**
- **Ubicación:**
  - `src/lib/pdf/renderer.ts:61-79` (`sanitize` y `truncateToWidth`) y `:363-389` (`tableRow`).
  - Se dispara desde `src/lib/pdf/punch-list.ts:149-157` (descripción del punch en celda de tabla).
  - También desde `completion-dossier.ts:221` (justificación) y desde cualquier `kv()` o `drawText` con `maxWidth`.
- **Evidencia:** `sanitize` deja pasar todo `\x00-\xFF`, y por tanto `\n`, `\r` y `\t`. `truncateToWidth` llama a `font.widthOfTextAtSize(text)`, que con WinAnsi **lanza excepción**. Verificado con pdf-lib 1.17: `widthOfTextAtSize("a\nb")` lanza `WinAnsi cannot encode "\n" (0x000a)`, y lo mismo con `\t` y `\r`. La descripción del punch se captura en un `<textarea>` (`PunchListView.tsx:826`).
- **Impacto:** basta un punch con salto de línea para que el **PDF de punch list del proyecto entero devuelva 500**. Lo mismo pasa con el dossier si una justificación de excepción tiene saltos de línea, y con textos importados por Excel o por la API v1 que traigan `\r` o `\t`.
- **Recomendación:**
  - En `sanitize`, reemplazar `[\x00-\x1F\x7F-\x9F]` por un espacio y usar `canEncodeUnicodeCodePoint` de la fuente como respaldo.
  - En `tableRow` y `kv`, colapsar el espacio en blanco.
  - Agregar un test con `"línea1\nlínea2\tx\r"` en `tableRow`.
- **Esfuerzo:** S.

**F-02 · Alta · Practicidad / Diseño de producto · Confianza alta**
- **Ubicación:**
  - `src/components/documents/DocumentReferences.tsx:136-144`: único punto de alta de referencias, un `<select>` dentro de cada ITR o procedimiento.
  - `add_document_reference` (migración `20261021120000:479`) referencia un documento a un registro.
  - El detalle del documento (`DocumentDetail.tsx:224-241`) muestra "dónde se usa" pero no tiene ninguna acción.
- **Evidencia:** `grep addDocumentReference` encuentra solo el componente. No hay trigger ni RPC que cree referencias desde `document_systems`, `tags.pid_drawing`, `signals.loop_diagram` o la plantilla.
- **Impacto:**
  - El valor central de F8 ("nunca comisionar contra una revisión no controlada") depende de que alguien abra cada ITR y elija cada documento a mano. En un proyecto con 5000 ITR eso no va a ocurrir, y el bloqueo queda como una función que nadie usa.
  - Además, cuando se emite la Rev B de un P&ID usado por 200 ITR firmados, hay que **revalidar una por una**, entrando a cada ITR y escribiendo un motivo de 10 o más caracteres cada vez.
- **Recomendación:**
  1. Referencia automática al crear el ITR: los documentos ligados al sistema o subsistema del tag, más los que coincidan con `tags.pid_drawing` y `signals.loop_diagram` / `wiring_diagram` normalizados, más los tipos que exija la plantilla (`requires_doc_types`).
  2. Acción masiva en el detalle del documento: "referenciar desde todos los ITR abiertos de los sistemas X" y "revalidar N registros firmados con un motivo común", con auditoría por fila.
  3. Al emitir una revisión, preguntar "¿afecta a registros de campo? sí/no". Si es no (por ejemplo, un cambio de cajetín), revalidar automáticamente con ese motivo.
- **Esfuerzo:** M.

**F-03 · Alta · Consistencia de datos · Confianza alta**
- **Ubicación:**
  - `20261021120000_companies_documents.sql:376-388` (`document_refresh_current`).
  - `:421` (`seq = MAX+1`).
- **Evidencia:** `SELECT id ... WHERE status <> 'draft' ORDER BY seq DESC LIMIT 1`. La revisión vigente es la última **registrada**, sin mirar el orden de la revisión ni `issued_on`.
- **Impacto:** al inicializar un registro es habitual cargar primero la vigente (Rev C) y después el historial (A, B) para dejar trazabilidad. Con este cálculo **la Rev B queda vigente**, todas las referencias a la C pasan a "superadas", se bloquean firmas y los gates se ponen amarillos. Esto no se puede corregir: no hay forma de anular ni reordenar una revisión emitida (ver F-24).
- **Recomendación:**
  - Agregar un campo "fecha de emisión" obligatoria y calcular la vigente por `issued_on DESC, seq DESC`.
  - O bien permitir marcar una revisión como "histórica (no vigente)" al registrarla.
  - Agregar una RPC de "corregir vigente" (líder+, con motivo).
- **Esfuerzo:** S.

**F-04 · Alta · Reportes / Datos incorrectos · Confianza alta**
- **Ubicación:** `src/app/(dashboard)/projects/[id]/kpis/report/page.tsx:44-48`.
- **Evidencia:** `supabase.from('punches').select('id, category, status').eq('project_id', …).not('status','in','(closed,cancelled)')` sin `fetchAllRows`. PostgREST devuelve 1000 filas como máximo, como reconoce el propio `src/lib/list/fetch-all.ts:2`. Los ITR del mismo archivo sí usan `fetchAllRows`.
- **Impacto:** en proyectos con más de 1000 punch abiertos, el **reporte ejecutivo imprimible subcuenta Cat A y Cat B**. Es un dato falso en un documento para la gerencia o el cliente. El semáforo por subsistema llega por otra ruta (`getSubsystemKpis`), así que el reporte puede contradecirse a sí mismo.
- **Recomendación:** contar con `count: 'exact', head: true` por categoría, o usar un agregado SQL. Revisar el resto de esa página con el mismo criterio.
- **Esfuerzo:** S.

**F-05 · Alta · KPI incorrecto · Confianza alta**
- **Ubicación:**
  - `20261023120000_documents_vendors_kpis.sql:40`.
  - `20261022120000_vendor_packages.sql:499-519` (resultado inmutable).
- **Evidencia:** `bad_tests := EXISTS (… va.result IN ('pending','failed'))`. `record_vendor_activity_result` no permite cambiar el resultado, y no existe RPC para borrar una actividad ni para enlazar una re-prueba.
- **Impacto:** que una FAT falle y se repita es lo normal. Con esta regla, cualquier paquete que haya tenido **una sola FAT fallida** cuenta para siempre como "con bloqueos", aunque la re-prueba haya salido aprobada. El KPI "readiness de vendors" queda sesgado a la baja de forma permanente.
- **Recomendación:**
  - Agregar `vendor_activities.retest_of uuid`, o un estado `superseded` que se asigne al registrar la re-prueba.
  - Hacer que el KPI tome el **último** resultado por cadena de re-pruebas.
- **Esfuerzo:** S a M.

**F-06 · Alta · Pérdida de datos / Importación · Confianza alta**
- **Ubicación:** `src/app/actions/import-signals.ts:200-224` y `:259-261`.
- **Evidencia:** el payload incluye `junction_box: textOrNull(c.row.junction_box)`, `… dcs_tag, hmi_display` y `loop_id: loopIdMap.get(…) ?? null`, y se hace upsert con `ignoreDuplicates: false`. `textOrNull(undefined)` devuelve `null` (`normalize.ts:21`).
- **Impacto:**
  - Al **reimportar** un índice de señales sin las columnas de cadena o sin la columna LAZO (por ejemplo, el índice de instrumentación "puro"), se borran JB, marshalling, I/O, DCS y HMI ya cargados y **se desvinculan las señales de sus lazos**.
  - Los ITR de loop check pasan a "desactualizado" y la generación de faltantes encuentra lazos sin señales.
  - También se pisan con `null` la descripción, el servicio, las alarmas y el resto de campos opcionales. La memoria del proyecto ya advierte contra este patrón ("Partial-patch: nunca upsert con `?? null`").
- **Recomendación:**
  - Construir el payload solo con las columnas **presentes en el archivo**, porque el wizard ya conoce el mapeo.
  - O hacer un upsert en dos pasos: insertar las señales nuevas y hacer un UPDATE parcial de las existentes.
  - Mostrar un aviso en la previsualización: "estas columnas no vienen en el archivo; se conservan los valores actuales".
- **Esfuerzo:** S a M.

### Severidad MEDIA

**F-07 · Media · Escala (tope de 1000 filas) en módulos F8 · Confianza alta**
- **Ubicación:**
  - `documents/page.tsx:20-21`: `.limit(5000)` en documentos y `.limit(20000)` en referencias.
  - `lib/documents/refs-server.ts:21`: `.limit(2000)`.
  - `vendors/[packageId]/page.tsx:47`: tags con `.limit(3000)`.
  - `admin/companies/page.tsx:16-17`: `.limit(10000)`.
- **Evidencia:** `.limit()` no supera el `max_rows=1000` de PostgREST. Los autores parecen suponer que sí.
- **Impacto:**
  - El conteo de referencias "superadas" de la lista se calcula sobre 1000 referencias como máximo, así que **se subcuenta**.
  - En `refs-server`, si el documento referenciado queda fuera de los primeros 1000 por número, el panel del ITR muestra el número "—" y **`outdated=false`**. El servidor sí bloquea la firma, pero el usuario no ve por qué.
  - El selector de vendors no ofrece tags más allá del número 1000.
- **Recomendación:** usar `fetchAllRows`, o mejor, que el panel de referencias consulte solo los documentos referenciados más una búsqueda con autocompletado en el servidor.
- **Esfuerzo:** S.

**F-08 · Media · Escala en páginas de ingeniería · Confianza alta**
- **Ubicación:**
  - `signals/page.tsx:22-44` (todas las señales).
  - `loops/page.tsx:24-38`.
  - `pid-documents/[docId]/viewer/page.tsx:64-80`: todos los tags, punch e ITR del proyecto **sin paginar**, de donde sale `itr_completion_pct` por pin.
  - `twin/page.tsx:30-35` (`tag_360` completo).
- **Evidencia:** las consultas no usan `range` ni `fetchAllRows`.
- **Impacto:**
  - Con más de 1000 señales, la lista queda truncada sin aviso.
  - En el visor P&ID, el % de ITR de cada pin se calcula sobre los primeros 1000 ITR del proyecto, así que es **incorrecto**, y el selector de tags para nuevos pines no muestra todos.
  - El gemelo digital solo dibuja 1000 tags.
- **Recomendación:**
  - Paginar en el servidor con filtros y búsqueda.
  - En el visor, consultar solo los tags con pin en ese plano (`.in('tag_id', hotspotTagIds)`) y usar un buscador remoto para agregar pines.
- **Esfuerzo:** M.

**F-09 · Media · Seguridad / Exportación · Confianza alta**
- **Ubicación:** `src/app/(dashboard)/punch-list/PunchListGlobal.tsx:180-206` y `src/app/(dashboard)/itrs/ItrListGlobal.tsx:125-151`.
- **Evidencia:** CSV armado a mano (`"${String(c).replace(/"/g,'""')}"`) **sin** `sanitizeCell`. Las comillas no impiden que Excel evalúe `=HYPERLINK(...)`.
- **Impacto:** la inyección de fórmulas tiene sentido justamente en CSV. Cualquier miembro, o la API v1 de punches, puede escribir una descripción maliciosa que se ejecuta al abrir el CSV. Paradoja: los XLSX llevan la protección y los CSV, que son donde importa, no.
- **Recomendación:** aplicar `sanitizeCell` a cada celda de estos dos CSV. O, mejor, cambiarlos por XLSX con el helper existente.
- **Esfuerzo:** S.

**F-10 · Media · PDF / Unidades · Confianza alta**
- **Ubicación:** `renderer.ts:50-64` (`UNICODE_MAP` y `sanitize`).
- **Evidencia:** todo carácter por encima de U+00FF que no esté en el mapa se convierte en `'?'`. Falta `Ω` (U+03A9), que pdf-lib no puede codificar (verificado), y también `Δ`. El catálogo ITR v2 usa "MΩ" en 33 ocasiones (`scripts/itr-v2/manual/E13A.json`, `E19A`, `I11B`…) y "ΔP".
- **Impacto:** el **PDF firmado del ITR de megado muestra "M?"** como unidad de resistencia de aislamiento. En un registro de calidad legal, la unidad aparece corrompida. Cualquier texto con alfabeto no latino (vendors asiáticos, por ejemplo) se vuelve "????".
- **Recomendación:**
  - Mínimo: mapear `Ω`→`Ohm`, `Δ`→`d`, `µ`/`μ`→`u`, `√`→`sqrt` y `°`→`°` (este último ya funciona).
  - Mejor: incrustar una fuente TTF Unicode (Noto Sans, con `@pdf-lib/fontkit`). Funciona en Workers, pero sube unos 300 KB por PDF; se puede usar solo cuando el texto lo necesite.
- **Esfuerzo:** S para el mapeo, M para la fuente.

**F-11 · Media · Trazabilidad en PDF · Confianza alta**
- **Ubicación:** `src/lib/pdf/itr-signatures.ts:4-9` y `:29` (solo `full_name`), `src/lib/pdf/itr.ts`, `src/lib/pdf/procedure.ts:110-114`.
- **Evidencia:** no hay ninguna aparición de `company` ni de `document_references` en `src/lib/pdf/`.
- **Impacto:**
  - La decisión §15.1 ("las firmas muestran nombre · empresa congelado al firmar") se cumple solo en pantalla.
  - El PDF del ITR y el del procedimiento, que son lo que se entrega al cliente, **no dicen contra qué revisión de qué documento se ejecutó la prueba** ni de qué empresa era cada firmante.
  - Justo la evidencia que exige 13.4 queda fuera del entregable.
- **Recomendación:**
  - Agregar al PDF del ITR y al del procedimiento una sección "Documentos de referencia", con número, revisión usada, revisión vigente al imprimir y marca de "revalidado" con su motivo.
  - Mostrar `signer_company` en la grilla de firmas.
- **Esfuerzo:** S.

**F-12 · Media · Consistencia de datos · Confianza alta**
- **Ubicación:** `new_procedure_revision` (migración `20261017210000:390`). Ninguna migración F8 la parchea; `grep document_references` solo aparece en `20261021120000` y `20261023120000`.
- **Evidencia:** la nueva revisión de un procedimiento copia el contenido pero **no las referencias a documentos**.
- **Impacto:** el procedimiento R2 nace sin referencias, se aprueba sin el bloqueo y la trazabilidad documental se pierde en silencio en cada revisión. Lo mismo ocurre al regenerar un ITR R2 de loop o C&E (no se verificó a fondo).
- **Recomendación:** copiar `document_references` de la revisión anterior en `new_procedure_revision`, apuntando a la revisión **vigente** del documento, y avisar si cambió.
- **Esfuerzo:** S.

**F-13 · Media · Funciones duplicadas / Consistencia · Confianza alta**
- **Ubicación:**
  - `src/app/actions/pid-documents.ts:31-37`: upsert por `(project_id, drawing_number)`.
  - `PidDocumentsView.tsx:380-399`.
  - `sidebar.tsx:145` y `:157`: "Documentos" y "Documentos P&ID" aparecen como entradas separadas.
- **Evidencia:** al resubir un plano con el mismo número, el upsert reemplaza `file_path`:
  - **sin historial de revisiones**;
  - el archivo viejo queda huérfano en el bucket;
  - **los hotspots (`x_pct`, `y_pct`) quedan sobre el plano nuevo con coordenadas del viejo**.
- **Impacto:**
  - Conviven dos registros de P&ID: uno con visor y pines pero sin control de revisión, y otro con revisiones pero sin visor.
  - El usuario no sabe cuál es el oficial, y un plano Rev B en `/pid-documents` no supera las referencias de `/documents`.
  - `tags.pid_drawing` y `signals.pid_drawing` son texto libre que solo se cruza con `pid_documents`.
- **Recomendación (fusión):**
  - Convertir `pid_documents` en una vista o adaptador sobre `documents` con `doc_type = 'pid'` y el PDF de la revisión vigente.
  - Ligar los hotspots a `document_revision_id`, de modo que una nueva revisión copie los pines marcados como "por revisar posición".
  - Resolver `tags.pid_drawing` contra `documents.number`.
  - Una sola entrada de menú.
  - Migración de datos: cada `pid_documents` se convierte en un `documents` con Rev "0" o "S/R".
- **Esfuerzo:** M.

**F-14 · Media · Seguridad funcional / Multi-empresa · Confianza alta**
- **Ubicación:**
  - Políticas `*_select` de `vendor_*` y de `documents*` sobre `get_my_project_ids()`.
  - `get_my_project_ids` = **todos los proyectos de la org** (`20260903200000:7-12`).
  - Decisión §15.5 ("sin rol vendor nuevo").
- **Evidencia:** la empresa del miembro (`org_members.company_id`) no restringe nada.
- **Impacto:** el personal de un vendor, dado de alta con rol inspector o leader:
  - ve **todos los paquetes de los demás vendors** (alcance, recomendaciones, reportes, hallazgos), todos los documentos y todos los proyectos de la org;
  - si tiene rol leader, puede movilizar su propio paquete, registrar el resultado de su propia FAT y aprobar sus propias recomendaciones.
  
  Con varios vendors competidores en el mismo proyecto, esto es un problema contractual.
- **Recomendación:**
  - Antes de invitar vendors: (a) política de lectura de `vendor_*` limitada a `company_id` igual a la empresa del miembro, o a no-vendors; (b) exigir en las RPC de decisión (`record_vendor_activity_result`, `decide_vendor_recommendation`, `mobilize`) que la empresa del llamador **no** sea la del paquete.
  - Documentar la restricción en la guía de despliegue.
- **Esfuerzo:** M.

**F-15 · Media · Correctitud / IA C&E · Confianza alta**
- **Ubicación:** `src/app/actions/ce-import.ts:41-49` (`matchingTags`).
- **Evidencia:** la consulta es `.in('tag_number', variants)` con `variants = [trim(c), upper(trim(c))]`. La normalización `normalizeTag` (mayúsculas y sin espacios) se aplica **después**, solo a lo que ya devolvió la BD.
- **Impacto:**
  - La decisión §10.26 ("se emparejan sin mayúsculas/espacios") no se cumple: "PT 101" en el documento no empareja con "PT101" en la BD, ni "pt-101" con "PT-101", ni "PT-101" con un tag guardado como "pt-101".
  - Tampoco tolera diferencias de guion ("PT101" contra "PT-101"), que son muy comunes entre una matriz C&E y el registro de tags.
  - Resultado: más tags en ámbar que se guardan sin `tag_id`, y ya no se pueden generar los ITR de la causa.
- **Recomendación:**
  - Agregar un RPC o una columna generada `tag_key = upper(regexp_replace(tag_number, '[\s\-_./]', '', 'g'))` con índice, y emparejar por esa clave.
  - Mostrar en la grilla de revisión sugerencias del tipo "¿quisiste decir PT-101?".
- **Esfuerzo:** S.

**F-16 · Media · Práctica en campo / Ingeniería · Confianza alta**
- **Ubicación:**
  - `signals/SignalsView.tsx`: solo filtros y detalle.
  - `loops/LoopsView.tsx`.
  - `grep from('signals').update|from('loops').update` en `src/app/actions` no da resultados.
- **Evidencia:** no hay alta, edición ni baja individual de señales, lazos ni `loop_tags`. La lista de señales ni siquiera muestra la cadena JB / marshalling / I/O / DCS / HMI (no está en el `select` de `signals/page.tsx:22-44`).
- **Impacto:** corregir una JB mal escrita obliga a reimportar el Excel, y la reimportación borra otros campos (F-06). El técnico del loop check no puede corregir lo que encuentra en campo.
- **Recomendación:** edición en línea de las señales (cadena, rango y alarmas) para líder+, con historial (`signal_events`), y CRUD básico de lazos y de sus instrumentos.
- **Esfuerzo:** M.

**F-17 · Media · Integración / Estrategia F8 · Confianza alta**
- **Ubicación:** `src/app/api/v1/`, que solo tiene `certificates, events, handover, itrs, openapi, punches, signals, systems, tags`. Sin ruta `export` ni `import` en `/documents`.
- **Evidencia:** no hay API ni importación masiva para documentos y revisiones, ni exportación del registro (MDR).
- **Impacto:** la decisión §15.2 dice "integrar por referencia con el EDMS de la operadora", pero sin API ni importación Excel el registro se mantiene a mano, documento por documento. Se desactualiza enseguida y el bloqueo pierde valor.
- **Recomendación:**
  - Importación Excel del MDR/VDRL (número, título, tipo, disciplina, empresa, sistemas, revisión, estado, fecha, URL del EDMS).
  - Exportación XLSX del registro con estado y referencias superadas.
  - `POST /api/v1/documents/revisions`, idempotente por (número, rev), para que el EDMS (Aconex, Documentum, Assai) empuje las emisiones.
- **Esfuerzo:** M.

**F-18 · Media · Bug / QR y Tag 360 · Confianza alta**
- **Ubicación:**
  - `tag_360/[tagId]/page.tsx:24-34`.
  - `components/QRNFCScanner.tsx:60-63`, `:539`.
- **Evidencia:**
  - **Resolución ambigua:** por `tag_number` con `.limit(1)` sin `order`, entre **todos los proyectos de la org**. El mismo tag en dos proyectos (fases, brownfield) lleva a un proyecto arbitrario.
  - **Lectura del QR:** la regex `[A-Z0-9\-_]+` corta en `.`, `/`, `#` y `%`: "FT-101/A" se lee como "FT-101", que es otro tag o ninguno. El patrón de texto plano `^[A-Z]{2,4}-\d{3,6}-…$` exige tres segmentos, así que un QR con "PT-101" (formato ISA típico) no se reconoce. Además se aplica `toUpperCase()` y la búsqueda es exacta, por lo que no encuentra tags guardados en minúsculas.
  - **Dominio de ejemplo:** el texto muestra `https://app.commup.io/...`; el dominio real es commup.app.
- **Impacto:** el escaneo de campo lleva a un tag o proyecto equivocado, que es un riesgo real en un ITR o un LOTO.
- **Recomendación:**
  - Si hay más de una coincidencia, mostrar una lista para elegir, priorizando el último proyecto visitado.
  - Cambiar la regex a `/\/tag_360\/([^?#]+)/` con `decodeURIComponent`.
  - Comparar sin distinguir mayúsculas.
  - Generar etiquetas QR de tags con el UUID (hoy solo existen para registros, en `register-labels.ts`).
- **Esfuerzo:** S.

**F-19 · Media · Integridad · Confianza alta**
- **Ubicación:**
  - `actions/ce-matrix.ts:79-87` y `:166-175`.
  - `CeMatrixEditor.tsx:70`.
  - FK `itrs.ce_cause_id … ON DELETE SET NULL` (`20261016210000:151`).
- **Evidencia:** borrar una matriz, causa o efecto (EDITOR, con un `confirm` que no menciona los ITR) deja los ITR de prueba C&E, **incluso los aprobados**, sin vínculo a su causa.
- **Impacto:** se pierde la trazabilidad de qué disparo se probó. La celda de la matriz pierde su resultado. No hay auditoría.
- **Recomendación:** bloquear el borrado si hay ITR generados (exigir archivar, o "solo un owner, con motivo") y mostrar en el `confirm` cuántos ITR quedarían huérfanos.
- **Esfuerzo:** S.

**F-20 · Media · Diseño / Control documental · Confianza media**
- **Ubicación:** `add_document_reference` (`20261021120000:492`): exige solo que exista `current_revision_id`.
- **Evidencia:** se puede referenciar, y por tanto firmar, contra una revisión **IFR o IFA** (emitida para revisión o aprobación, no para construcción).
- **Impacto:** contradice el espíritu de 13.4 ("controlled revision"). Una prueba hecha contra un IFR es una prueba hecha contra un documento no aprobado.
- **Recomendación:** fijar un estado mínimo configurable para referencias de campo (por defecto IFC o superior), con aviso en IFR/IFA, o bloqueo si la org lo configura.
- **Esfuerzo:** S.

**F-21 · Media · Alcance F8 incompleto frente al plan · Confianza alta**
- **Ubicación:**
  - `docs/ANALISIS-GUIA-COMISIONAMIENTO-2026-10-12.md` §4 F8: "Red-lines como adjuntos versionados".
  - `grep redline|markup|transmittal|vdrl` en `src` y `migrations` no da resultados.
- **Evidencia:** no hay red-lines, transmittals ni VDRL.
- **Impacto:**
  - El red-line de campo (marcar el P&ID durante el loop check o el walkdown) es el insumo del as-built. Sin él, "completitud documental As-Built" mide un estado que CommUp no ayuda a producir.
  - ICAPS, Completions/Orion y Aconex sí los ofrecen.
- **Recomendación:** red-line como adjunto versionado de una revisión (PDF anotado o foto) con estado incorporado / no incorporado, más un KPI de "red-lines pendientes de incorporar por sistema". Ver §4.
- **Esfuerzo:** M a L.

**F-22 · Media · Handover / Dossier · Confianza alta**
- **Ubicación:**
  - `generate_handover_package` (baseline; nunca se actualizó).
  - `src/lib/handover/types.ts` (ITR, tags, punch, certificados).
  - No hay `copyPages` ni `PDFDocument.load` en `src`.
- **Evidencia:** el paquete que se genera al traspasar a operaciones (F6) **no incluye**:
  - el registro de documentos (as-built por sistema);
  - los paquetes de vendor (reporte final, FAT/SAT, recomendaciones/MOC);
  - las aprobaciones de gates con firmas, el PSSR, los procedimientos ni los certificados de desempeño (PTC).
  
  El "ITR test pack" es solo un índice (`itr-test-pack.ts`). En ningún sitio se compila un dossier con las hojas reales.
- **Impacto:** el entregable de turnover queda muy por debajo de lo que ya existe en la BD. El cliente tiene que armar el dossier fuera de CommUp.
- **Recomendación:**
  - Extender el JSON del handover con `documents`, `vendors`, `gates`, `pssr`, `procedures` y `performance`.
  - Agregar un "Dossier de sistema" que compile con `copyPages` los PDF de los ITR, certificados, PSSR, PTC y las revisiones vigentes de los documentos ligados.
  - Para cuidar el límite de CPU de Workers, ejecutarlo como tarea por lotes, guardar en storage y notificar al terminar.
- **Esfuerzo:** L.

**F-23 · Media · Escala / Workers · Confianza media**
- **Ubicación:**
  - `import-signals/ImportSignalsWizard.tsx:161`: `importSignals(projectId, rows)` con **todas** las filas.
  - `next.config.ts:51-52`: `bodySizeLimit: '5mb'`.
- **Evidencia:** unos 30 campos por señal; 10 000 señales están por encima de 5 MB. Todo se procesa en una sola invocación del Worker, con N×3 subrequests a Supabase.
- **Impacto:** los índices de proyectos grandes (más de 10 000 señales) fallan con un error poco claro o rozan el límite de CPU o subrequests.
- **Recomendación:** que el cliente envíe lotes de unas 1000 filas con barra de progreso, como hacen otros importadores.
- **Esfuerzo:** S.

### Severidad BAJA

**F-24 · Baja · UX / Control documental · Confianza alta**
- **Ubicación:** `issue_document_revision` / `add_document_revision`.
- **Evidencia:** una revisión emitida no se puede anular, retirar ni corregir (por ejemplo, un error de tipeo "B" por "C"). Se acepta `issued_on` en el futuro y no hay estado "void/cancelled".
- **Recomendación:** agregar estado `void` (líder+, con motivo) que la saque del cálculo de vigente, y validar que `issued_on <= current_date`.
- **Esfuerzo:** S.

**F-25 · Baja · Seguridad / Storage · Confianza alta**
- **Ubicación:** `20261021120000:230-242`.
- **Evidencia:** la política INSERT de `project-documents` acepta a **cualquier** miembro del proyecto, incluido el rol client, sin `allowed_mime_types`. Los archivos son inmutables y no se pueden borrar. La validación de tipo es solo `accept=` en el navegador.
- **Impacto:** quedan archivos huérfanos imposibles de limpiar (también los subidos cuando el RPC falla o al descartar un borrador). Además se pueden subir HTML o SVG que se sirven desde el dominio de storage.
- **Recomendación:** INSERT solo para `document_is_controller`, `allowed_mime_types` (pdf, png, jpg, dwg, dxf) y un cron de huérfanos con service_role.
- **Esfuerzo:** S.

**F-26 · Baja · Workers (subrequests) · Confianza media**
- **Ubicación:** `pid-documents/page.tsx:43-87`.
- **Evidencia:** un `createSignedUrl` por cada plano, más hasta 50 páginas de tags. Con varios cientos de P&ID se acerca al límite de subrequests del Worker.
- **Recomendación:** usar `createSignedUrls` (por lotes), o firmar la URL bajo demanda al abrir el plano.
- **Esfuerzo:** S.

**F-27 · Baja · Seguridad (higiene) · Confianza alta**
- **Ubicación:** `actions/pid-hotspots.ts:8-48`; `actions/pid-documents.ts:48-72`.
- **Evidencia:**
  - `upsertHotspot` no verifica que `pid_document_id` sea del proyecto (los guards solo cubren el proyecto y el tag).
  - `deletePidDocument` borra en storage el `filePath` que manda el cliente **antes** de comprobar la fila, y borra la fila por `id` sin filtrar por `project_id`.
  - La UI permite editar a owner/admin/architect, mientras la acción permite EDITOR (incluye leader).
- **Impacto:** bajo, porque la RLS limita al editor de sus propios proyectos, pero puede dejar una fila apuntando a un archivo inexistente o un hotspot ligado a un documento de otra org.
- **Recomendación:** agregar un guard `pid_document` con `scopeField`, leer `file_path` desde la BD y alinear el rol entre UI y acción.
- **Esfuerzo:** S.

**F-28 · Baja · Gate engine · Confianza media**
- **Ubicación:** parche `documents_current` en `compute_system_gates` (`20261021120000:613-645`).
- **Evidencia:** el criterio se calcula para **cada gate** del sistema sin filtrar por la fase del ITR. Una referencia superada en un ITR de la fase SU pone en amarillo también el gate MC.
- **Recomendación:** filtrar por `system_phase_level` o por la fase del gate, igual que los demás criterios de ITR.
- **Esfuerzo:** S.

**F-29 · Baja · KPIs inconsistentes · Confianza alta**
- **Ubicación:** `documents/DocumentsView.tsx:50-55` frente a `ReadinessKpis.tsx:65-67` y la migración `20261023120000`.
- **Evidencia:**
  - En el registro, "As-Built" se cuenta sobre todos los documentos; en `/kpis`, solo sobre los ligados a sistemas.
  - En el registro, "superadas" incluye ITR abiertos; en el KPI, solo los firmados.
  - `/kpis` lee el snapshot diario (con hasta 24 h de desfase) y el registro calcula en vivo.
- **Impacto:** dos cifras distintas para "completitud documental".
- **Recomendación:** usar una sola definición (una función SQL) en ambos lugares y rotular "al cierre del día" cuando el dato venga del snapshot.
- **Esfuerzo:** S.

**F-30 · Baja · i18n · Confianza alta**
- **Ubicación:**
  - `ce-matrices/*` (el namespace `CeMatrices` existe pero tiene 0 claves; textos como "¿Borrar la causa…?").
  - `twin/page.tsx`, `explorer/page.tsx`, `kpis/report/*` (con `es-CO` fijo), `import-signals/ImportSignalsWizard.tsx` y la cabecera de `pid-documents/page.tsx:102-111`.
  - Los PDF de certificado y dossier están solo en inglés; los del ITR y el diario son bilingües.
- **Evidencia:** ninguno de esos archivos usa `useTranslations`.
- **Recomendación:** migrar a next-intl y unificar la política de idioma de los PDF (bilingüe, o según el idioma del usuario, como `procedure.ts`).
- **Esfuerzo:** M.

**F-31 · Baja · Código muerto / afirmaciones falsas · Confianza alta**
- **Ubicación y evidencia:**
  - `projects/[id]/interlocks/page.tsx`: solo redirige. Puede quedarse como compatibilidad, pero conviene marcarlo así.
  - `admin/workflows/WorkflowsView.tsx:49` ofrece el disparador `interlocks.updated`, pero la tabla se eliminó (`20261016210000:156`) y **el evento nunca ocurre**.
  - `twin/page.tsx` promete "Semáforo en tiempo real", pero `TwinView` no tiene suscripción realtime.
  - `public/pdf.worker.min.mjs` es una copia manual, hoy igual a `pdfjs-dist@5.4.296`, pero `react-pdf` va con `^` y sin script de copia. Si se actualiza, aparece un error de versión del worker.
- **Recomendación:** quitar el evento, corregir el texto y añadir un `postinstall` que copie el worker.
- **Esfuerzo:** S.

**F-32 · Baja · Excel · Confianza media**
- **Ubicación:** `src/lib/excel/sanitize.ts:14-20`, que se aplica a XLSX en `punch-list.ts`, `daily.ts`, `kpis/export` y `api/admin/export`.
- **Evidencia:** en XLSX, una celda de tipo string nunca se evalúa como fórmula. El apóstrofo se guarda **literalmente**, así que "- Falta perno" se convierte en "'- Falta perno". En cambio, `MatrixView.tsx:133-161` exporta sin protección.
- **Recomendación:** en XLSX, usar `cell.t='s'` sin prefijo, o el estilo `quotePrefix`. Reservar el apóstrofo para CSV (F-09).
- **Esfuerzo:** S.

**F-33 · Baja · Correctitud · Confianza alta**
- **Ubicación:** `actions/ce-matrix.ts:29`, `:39`.
- **Evidencia:** `resolveTag` y `resolveSignal` usan `ilike` con el texto del usuario, donde `_` y `%` son comodines. "PT_101" empareja con "PT-101" y con "PTX101", lo que provoca errores de "más de un tag" o un emparejamiento equivocado.
- **Recomendación:** escapar `%` y `_`, o comparar por la clave normalizada de F-15.
- **Esfuerzo:** S.

**F-34 · Baja · Vendors (reglas) · Confianza alta**
- **Ubicación:** `20261022120000:454-467`, `:601-618`.
- **Evidencia:**
  - Solo se cancela un paquete planificado; un contrato rescindido con el vendor movilizado no tiene salida.
  - La misma persona puede proponer y aprobar una recomendación.
  - Los ítems "documentos vigentes", "equipo calibrado" y "as-built entregados" del checklist son casillas manuales, sin conexión con el registro de documentos (`documents.company_id`) ni con `test_equipment.owner_company_id`, que ya existen.
  - No hay PDF ni Excel de los reportes ni del paquete.
- **Recomendación:** cierre anticipado ("terminado") con motivo, segregación de funciones (quien propone no aprueba), checklist precalculado desde los datos y PDF del reporte final.
- **Esfuerzo:** S a M.

**F-35 · Baja · Mantenibilidad · Confianza alta**
- **Ubicación:** `compute_system_gates`, `take_mgmt_snapshot`, `sign_itr_atomic` y `seed_default_gate_for_phase`, parcheados con `replace()` de anclas a lo largo de al menos 6 migraciones.
- **Evidencia:** el cuerpo efectivo de la función no existe en ningún archivo del repo; solo aparece al reproducir todas las migraciones.
- **Impacto:** las revisiones y el diagnóstico se hacen a ciegas. Un cambio de espacio en blanco rompe parches futuros. Hoy la verificación "una sola ancla" lo mitiga.
- **Recomendación:** volcar periódicamente las funciones a `supabase/functions-sql/<name>.sql` como fuente legible (o regenerar la línea base) y poner un test de CI que compare.
- **Esfuerzo:** M.

**F-36 · Baja · Atomicidad · Confianza alta**
- **Ubicación:** `actions/ce-import.ts:133-171`.
- **Evidencia:** se hacen cuatro inserciones separadas, y si una falla, un `delete` compensatorio. Si ese borrado falla (red o RLS), queda una matriz parcial con `source='ai'`.
- **Recomendación:** un RPC transaccional `create_ce_matrix_from_review(jsonb)`.
- **Esfuerzo:** S.

*(Notas menores, sin ID: (a) la firma capturada offline contra un ITR cuya referencia quedó superada se descarta al primer rechazo (`OUTBOX_MAX_ATTEMPTS.signature = 1`) y se pierde el trazo; conviene mensajes específicos y conservar el trazo para volver a firmar. (b) En el PDF de punch list, la descripción queda en una sola línea truncada con "…" y se pierde información en el entregable. (c) `freeze_signer_company` solo actúa en el INSERT de `itr_signatures`; un upsert de firma no actualiza la empresa.)*

---

## 4. Propuestas estratégicas

1. **Un solo "Registro documental" como columna vertebral (resuelve F-02, F-13, F-17 y F-21).**
   - `documents` absorbe `pid_documents`. El visor P&ID y los hotspots pasan a colgar de la revisión.
   - `tags.pid_drawing`, `signals.loop_diagram` y `signals.wiring_diagram`, y `ce_matrices.source_document`/`revision`, se resuelven contra `documents`.
   - Así, cada ITR hereda automáticamente sus documentos (por plano del tag, diagrama del lazo, documento C&E de la causa y tipos exigidos por la plantilla).
   - El bloqueo F8 se vuelve automático y masivo, que es como lo venden ICAPS y Orion.

2. **MDR/VDRL de verdad.**
   - Importar y exportar el MDR (Excel) con lo previsto por documento: revisión, estado esperado y fecha comprometida.
   - En el VDRL, la lista de documentos que cada vendor debe entregar por paquete (`vendor_packages` ↔ `documents.company_id`).
   - KPI de "entregados a tiempo / vencidos".
   - El checklist de desmovilización "as-built entregados" se calcula desde el VDRL (F-34).

3. **Transmittals ligeros.** Emitir un lote de revisiones a un destinatario (empresa o persona), con acuse de recibo y fecha de respuesta requerida (aprobado, aprobado con comentarios, rechazado). Es el flujo IFR → IFA → IFC que hoy se registra a mano. CommUp no necesita ser un EDMS: le basta con conservar el rastro de quién recibió qué revisión.

4. **Red-lines de campo** (plan §4 F8):
   - "Marcar plano" en el visor P&ID durante el loop check o el walkdown, como anotación sobre la revisión vigente.
   - Estados: abierto → enviado a ingeniería → incorporado en Rev X.
   - KPI "red-lines pendientes por sistema" y condición amarilla en el gate de handover si quedan pendientes.
   - Es el puente real hacia el KPI As-Built.

5. **API de integración EDMS (F-17).** `POST /api/v1/documents/revisions` idempotente, más webhooks `document.revision_issued` y `document.reference_outdated`. Con esto CommUp se vende como la "capa de comisionamiento sobre el EDMS de la operadora" (§6.4), en lugar de como un registro paralelo.

6. **Dossier compilado por sistema (F-22).** Un PDF único y firmado (HMAC, como el handover) con índice, ITR reales, certificados, PSSR, PTC, punch list y las revisiones vigentes de los documentos. Se genera por lotes en segundo plano (Workers tiene límite de CPU) y queda en storage. Es lo que pide el cliente para el MC y el RFSU.

7. **Vendors con acceso restringido (F-14).** Un rol "vendor" (o la regla "empresa del miembro = empresa del paquete") que solo vea su paquete, sus tags y sus documentos, y que pueda cargar reportes, evidencias y respuestas. Así el vendor alimenta el sistema directamente en lugar de mandar PDFs por correo.

8. **Ingeniería editable y trazable (F-06, F-16).** Edición en línea de señales y lazos con historial, importación que respeta columnas ausentes y un "diff" previo a la importación (nuevas, cambiadas, sin cambio y campos que se borrarían). En el loop check, permitir que el técnico proponga correcciones de la cadena que un líder acepta.

9. **Robustez de PDF centralizada (F-01, F-10).** Un `safeText()` único en `renderer.ts` (controles a espacio, mapa Unicode ampliado y, opcionalmente, fuente TTF), con un test fuzz que recorra cada generador de PDF con textos que tengan `\n`, `\t`, `Ω`, emoji y 10 000 caracteres.

---

## 5. Funcionamiento para el manual

Roles: **owner**, **admin**, **architect**, **leader**, **inspector**, **client**. "Líder+" = owner, admin, architect o leader. "No-client" = cualquiera menos client.

### 5.1 Señales, lazos y cadena del loop check

**Quién:** owner, admin o architect importan. Líder+ genera los ITR.

1. Preparar el Excel del índice de señales. Encabezados reconocidos (en español o en inglés):
   - Identificación: `TAG INSTRUMENTO`, `TAG DE SEÑAL`, `DESCRIPCION`, `TIPO DE SEÑAL` (AI, AO, DI, DO, PI o PO), `DISCIPLINA` (código existente en la org).
   - Proceso: `SERVICIO`, `RANGO INF`/`LRV`, `RANGO SUP`/`URV`, `UNIDAD`, `ALARMAS / SET POINT`, `ORIGEN`, `DESTINO`.
   - Documentos: `P&ID`, `DIAGRAMA DE LAZO`, `DIAGRAMA DE CABLEADO`.
   - Lazo y cadena: `N° LAZO`, `CAJA DE CONEXION`/`JB`, `MARSHALLING`, `TARJETA I/O`, `CANAL I/O`, `TAG DCS`, `DESPLIEGUE HMI`.
   - Jerarquía: `AREA`, `SISTEMA`, `SUBSISTEMA`, y opcionalmente sus nombres.
2. Ir a Proyecto → Importar señales (`/projects/[id]/import-signals`). Subir el archivo; el asistente detecta la hoja y el encabezado. Revisar la vista previa y los errores (disciplina inexistente, tipo inválido).
3. Pulsar Importar. Qué pasa:
   - Se crean las áreas, sistemas y subsistemas que falten.
   - Se crean los tags de instrumento que no existan; los existentes no se modifican.
   - Se crean o actualizan las señales por (instrumento, señal).
   - Se crean los lazos de la columna LAZO y se vinculan sus instrumentos.
   - ⚠ Al reimportar, las columnas que no vengan en el archivo **se vacían** (F-06). Hay que reimportar siempre el índice completo.
4. Consultar las señales en Proyecto → Señales (filtros por tipo y detalle). Por ahora no se editan en pantalla: las correcciones se hacen reimportando.
5. Generar el loop check en Proyecto → Lazos:
   - Requisito: un editor de plantillas tiene que activar en el Catálogo la plantilla con tabla de lazo (I29C, revisión F4-D).
   - Elegir la plantilla, el inspector y, si se quiere, el supervisor. Pulsar "Generar" por lazo o "Generar faltantes".
   - El ITR copia la cadena campo → JB → marshalling → I/O → DCS → HMI y los puntos del rango.
   - Si después cambian el lazo o sus señales, el ITR aparece como "desactualizado" y se genera una revisión R2.

### 5.2 Matrices causa-efecto (C&E)

**Quién:** líder+ (EDITOR).

1. Ir a Proyecto → Matrices C&E y elegir "Nueva matriz" (código, título, sistema, revisión y documento fuente) o "Importar con IA".
2. Importar con IA (`/ce-matrices/import`):
   - Subir un Excel (elegir la hoja) o un PDF de 4 MB como máximo. Si el documento trae varias matrices, indicar cuál.
   - Claude propone causas (tag, señal, condición, set point y votación), efectos (tag y acción) y cruces (directos o con retardo).
   - Revisar la propuesta en la grilla editable. Las celdas dudosas salen marcadas y los tags que no existen en el proyecto salen en ámbar; se guardan sin tag, con el texto leído en las notas.
   - Pulsar "Aceptar y crear matriz". Nada se guarda antes, y si se cierra la página la propuesta se descarta.
3. En el editor se crean o editan causas y efectos (tag por número exacto) y se marca cada celda (vacía, directa o con N segundos).
4. Generar las pruebas: plantilla I30C (revisión F4-D activa) → una prueba por causa, con una fila por efecto. Botón por causa o "Generar faltantes".
5. Cada celda muestra el resultado del ITR vigente de su causa (✓, ✗ o pendiente).
6. ⚠ Borrar la matriz, una causa o un efecto deja huérfanos los ITR generados (F-19).

### 5.3 P&ID con hotspots

**Quién:** owner, admin o architect.

1. Ir a Proyecto → Documentos P&ID y subir el PDF con su número de plano. El número se normaliza (mayúsculas, espacios colapsados) para coincidir con la columna P&ID de tags y señales.
2. La página muestra los planos referenciados por tags que todavía no tienen PDF y los sistemas que cubre cada plano.
3. En el visor, hacer clic sobre el plano para colocar el pin de un tag. Los colores van por sistema, con filtros, y la vista rápida del tag muestra el % de ITR aprobados y los punch A/B abiertos.
4. ⚠ Subir otra vez el mismo número reemplaza el archivo sin guardar historial, y los pines no se mueven (F-13). Para control de revisiones hay que usar el Registro de documentos.

### 5.4 Empresas

**Quién:** owner o admin. Pueden verlas también architect y leader.

1. En Administración → Empresas, crear cada empresa: nombre, nombre corto, tipo (operadora o cliente, EPC, vendor, subcontratista u otra), NIT y notas.
2. En Administración → Usuarios, asignar la empresa a cada miembro. Las firmas mostrarán "nombre · empresa", congelado en el momento de firmar.
3. En el personal de operaciones y en los equipos de prueba basta escribir el nombre o el nombre corto de la empresa; se enlaza solo.

### 5.5 Registro de documentos y revisiones

**Quién:** líder+ gestiona. Cualquier miembro consulta.

1. Ir a Proyecto → Documentos y pulsar "+ Nuevo". Completar número (único en el proyecto), tipo (P&ID, PFD, hoja de datos, plano, especificación, procedimiento, manual, cálculo, vendor u otro), título, disciplina, empresa emisora y sistemas.
2. En la ficha del documento, pulsar "+ Nueva revisión":
   - Revisión (A, B, 0, 1…), estado (borrador, IFR, IFA, IFC, As-Built o Final), fecha de emisión, archivo (PDF, DWG, DXF o imagen, de 50 MB como máximo) y/o enlace https al EDMS, y notas.
   - Una revisión emitida pasa a ser la **vigente** y las anteriores quedan "superadas". ⚠ La vigente es la última que se registra, así que el historial se carga en orden cronológico (F-03).
   - Un borrador se emite después eligiendo su estado, o se descarta. Solo puede haber un borrador por documento.
3. La lista tiene filtros por tipo, estado, sistema, "sin revisión" y "con referencias superadas", y KPIs del registro.
4. La sección "Dónde se usa" de la ficha muestra cada ITR o procedimiento que referencia el documento y con qué revisión.

### 5.6 Referenciar documentos desde ITR y procedimientos

**Quién:** cualquier no-client agrega referencias. Líder+ revalida.

1. En el ITR, el panel "Documentos de referencia" permite elegir un documento (que debe tener una revisión emitida) y pulsar "Agregar". Queda ligado a la revisión vigente.
   - Solo se puede hacer mientras el ITR no tenga firmas. Desde la primera firma, las referencias quedan fijas.
2. En el procedimiento se usa el mismo panel en la revisión en borrador. Fuera de borrador queda fijo. ⚠ Al crear una revisión nueva del procedimiento hay que volver a agregar las referencias (F-12).
3. Cuando sale una revisión nueva del documento:
   - **ITR sin firmar o procedimiento en borrador:** aparece un aviso rojo y la firma o el envío quedan bloqueados hasta pulsar "Actualizar a la vigente".
   - **ITR firmado o procedimiento aprobado:** el gate del sistema pasa a amarillo (criterio "documentos vigentes" en Control Tower) hasta que un líder+ pulsa "Revalidar" y escribe un motivo de 10 caracteres o más, o hasta que se rehace el registro.
   - Un procedimiento en revisión con una referencia superada no se aprueba; se revalida igual que uno firmado.

### 5.7 Paquetes de vendor, de punta a punta

**Quién:** líder+ dirige. Cualquier no-client registra datos.

1. **Crear** (líder+): Proyecto → Vendors → "Nuevo paquete" (número automático VND-0001):
   - empresa vendor, título, alcance y límites;
   - sistemas y tags del paquete (los tags elegibles son los de esos sistemas);
   - gate de movilización (un sistema y uno de sus gates, que debe estar aprobado con todas sus firmas);
   - fecha prevista de movilización.
2. **Interfaces:** una por cada contraparte (empresa del catálogo o texto libre), con descripción, responsable y estado (abierta, acordada o cerrada). Para movilizar no puede quedar ninguna abierta.
3. **Checklist de movilización** (con el paquete planificado): alcance e interfaces acordados, inducción HSE, permisos, equipo calibrado y documentos vigentes.
4. **Movilizar** (líder+): el sistema verifica el gate, el checklist y las interfaces, y lo indica si falta algo. Solo un paquete planificado se puede cancelar, con motivo.
5. **FAT/SAT:**
   - Crear la actividad (FAT o SAT, título, fecha prevista y lugar) y adjuntar evidencia.
   - Registrar los hallazgos mientras esté pendiente. Con tag, se crea un punch (Cat A, B o C, origen "paquete vendor"), que entra en la cola de revisión del supervisor. Sin tag, se crea una acción ACC con responsable y fecha.
   - Registrar el resultado (líder+): aprobada, aprobada con hallazgos o fallida. Las dos últimas exigen al menos un hallazgo. El resultado no se puede cambiar; para repetir la prueba se crea una actividad nueva (⚠ F-05).
6. **Reportes** (con el paquete movilizado): diarios (fecha, personal, horas, actividades, problemas y adjuntos) y un **reporte final único**. Se vuelven inmutables al registrarse.
7. **Recomendaciones del vendor:**
   - Proponer (descripción, justificación y si requiere MOC).
   - Un líder+ aprueba, o rechaza con motivo. Puede corregir "requiere MOC" al decidir.
   - Al marcarla como implementada, si requiere MOC hay que escribir el número de MOC de la operadora.
8. **Desmovilizar** (líder+), con el paquete movilizado. Exige el reporte final, el checklist (as-built entregados, herramientas retiradas, permisos cerrados y área limpia) y ningún punch Cat A abierto del paquete. Los Cat B y C pueden quedar abiertos.
9. **Seguimiento:** chip del paquete en Control Tower y KPI "Readiness de vendors" en `/kpis` (según el snapshot diario).

### 5.8 Reportes

| Reporte | Dónde | Formato |
|---|---|---|
| Reporte ejecutivo imprimible | `/kpis` → "Reporte" (`/kpis/report`, abre la impresión del navegador) | HTML para imprimir o guardar como PDF |
| Completitud por sistema | `/kpis` → botón (`/reports/system-completion/pdf`) | PDF |
| Avance por fase | `/kpis` (`/reports/phase-progress/pdf`) | PDF |
| KPIs por área | `/kpis` (`/reports/area-kpis/pdf`) | PDF |
| Exportación de KPIs | `/kpis/export` | XLSX |
| Test pack de ITR (índice) | `/itrs` → botón (`/reports/itr-test-pack/pdf`) | PDF |
| ITR individual (bilingüe, firmas y equipos de prueba) | ITR → PDF (`/tags/[tagId]/itrs/[itrId]/pdf`) | PDF |
| Punch list | `/punches/pdf` y `/punches/export`; lista global en `/punch-list/export` y CSV | PDF, XLSX, CSV |
| Certificado y dossier del certificado | Certificado → PDF / Dossier | PDF |
| PSSR, reporte diario, relevo de turno, procedimiento, prueba de desempeño, preservación | En cada módulo | PDF |
| Gestión diaria | `/daily/export` | XLSX |
| Etiquetas QR de registros | `/registers/labels` | PDF |
| Paquete de handover (JSON y PDF firmados con HMAC) | Administración → Handover (owner, admin o architect) o automático al traspasar a operaciones | JSON y PDF |

Notas para el usuario:
- El PDF de punch list falla si alguna descripción tiene saltos de línea, hasta corregir F-01.
- Los símbolos Ω y Δ salen como "?" (F-10).
- El reporte imprimible cuenta como máximo 1000 punch abiertos (F-04).
