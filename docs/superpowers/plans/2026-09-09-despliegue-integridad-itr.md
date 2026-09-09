# Despliegue de integridad ITR — 9 septiembre 2026

El usuario confirmó utilizar `mdyljpgzvigzjpqluket` (commup-production), cuyos datos indicó que son de pruebas. Se preservaron los registros existentes.

## Ejecutado

- Respaldo de tablas involucradas en `insumos-locales/respaldo-previo-migraciones/`, manifest del 2026-09-09T20:49:53.481Z. No es un backup completo del proyecto ni del esquema.
- Preflight: PostgreSQL 17.6; propietario de itrs postgres; sin relaciones casilla/sección, respuesta/revisión ni condición/revisión incompatibles; sin conflictos de las políticas nuevas.
- Migraciones 20260909190000, 20260909200000 y 20260909180000 aplicadas mediante SQL Editor y registradas en supabase_migrations.schema_migrations. Se instaló primero la columna compatible; después el evaluador final; finalmente los triggers/RPC/políticas de 180000 sin reinstalar el evaluador anterior que 200000 reemplaza. Cada bloque se aplicó dentro de BEGIN/COMMIT. El SQL se compactó para el editor, conservando las definiciones funcionales. El historial registra versión y nombre; los archivos del repositorio contienen las sentencias originales.
- Verificación remota: 3 migraciones, 7 triggers de integridad, 2 políticas restrictivas de evidencia; authenticated sin INSERT directo en firmas y con EXECUTE sobre sign_itr_atomic.
- Conteos posteriores: 7 ITR, 606 templates, 14032 items, 139 respuestas, 4 firmas; coinciden con respaldo.
- Inspección de la función instalada confirma expresión de fecha YYYY-MM-DD y pg_input_is_valid.
- Build OpenNext/Cloudflare correcto. Desplegado Worker commup-starter-template, versión 46728606-cb47-469d-97f3-2fd65d0a804e.
- commup.app carga y redirige al login. La sesión de CommUp no está autenticada en el navegador actual.

## Pendiente para cierre

Prueba autenticada de captura, adjuntos, firmas por orden, bloqueo tras firma parcial, reapertura auditada y exportación. Se pidió al usuario iniciar sesión en la pestaña abierta. No afirmar validación integral ni actualización masiva de los 302 formatos: esas tareas siguen pendientes.

## Evaluación remota de registros existentes

El evaluador ejecutó correctamente sobre los 7 ITR sin escrituras. El ITR `f6295348-3512-4f2b-9257-992fd341875b` conserva estado histórico approved pero resulta captura incompleta (0%). No se alteró el estado ni sus firmas: requiere revisión explícita de históricos. Otro registro rejected tiene captura completa; captura completa no implica aceptación. Los estados históricos no se normalizaron automáticamente.

## Prueba autenticada y hallazgo de autoguardado

Sesión del usuario confirmada. El ITR existente de batería en progreso bloquea firma. Se creó exclusivamente para pruebas el ITR 19c64088-61ec-4193-98f1-b23dc6368a77, código QA-INTEGRIDAD-20260909 — NO CERTIFICA (template inactivo 77d91067-33da-46fb-b27b-66ae9031c640). Tres roles asignados al mismo usuario solamente para comprobar secuencia funcional, no segregación de funciones ni aprobación industrial.

En UI: Rechazado cambia estado y bloquea firma; No aplica muestra justificación obligatoria y mantiene captura incompleta mientras falta. Se detectó pérdida de guardados concurrentes en useItrAutosave: savingRef descartaba llamadas nuevas después de modificar estado optimista. La fecha apareció en pantalla sin fila correspondiente en DB. Dos pruebas del hook reprodujeron el descarte y bloqueo después de excepción; se sustituyó por cola secuencial y refresco al finalizar. Ambos tests pasan localmente. Pendiente publicar este ajuste y repetir captura, firmas y PDF.

### Ajuste de autoguardado publicado y verificado

- Lint y typecheck correctos; 141 tests pasan, 11 de integración omitidos por entorno. La compilación inicial dentro del sandbox falló por listen EPERM; la compilación OpenNext con permiso de red/puerto terminó correctamente.
- Worker desplegado: 341bc94a-9955-4f26-bb78-2fc7c7353e0c.
- En nueva pestaña se repitió texto + fecha consecutivos: progreso 100%, estado Completado, firma habilitada. Consulta remota confirma tres respuestas persistidas, fecha 2026-09-09 y selección Aceptado/is_passed true.
- Modal de firma: Ejecutor habilitado, Supervisor y Cliente deshabilitados. Se pidió al usuario trazo de prueba/confirmación de Ejecutor para continuar comprobación de bloqueo y reapertura. No hay firmas sintéticas insertadas directamente en DB.
- Pendientes: adjuntos en UI, firma parcial y posteriores, reapertura, PDF. No cerrar integralmente estos puntos todavía.

### Firma parcial comprobada en UI

El usuario firmó como Ejecutor. Al abrir de nuevo el ITR QA el 9 septiembre: firma registrada con usuario y fecha, estado Completado (no Aprobado), texto/selección/fecha y carga de foto deshabilitados. Modal siguiente: Ejecutor deshabilitado como firmado, Supervisor habilitado, Cliente deshabilitado. Reapertura disponible mediante «Revocar aprobación». La fecha visible del registro de prueba firmado es 2026-09-10; no se modifica el contenido firmado.

Se deja el modal de Supervisor abierto para el siguiente trazo del usuario. Falta comprobar las firmas restantes, reapertura y PDF en UI.

### Segunda firma comprobada

Firma de Supervisor visible con usuario y fecha 09/09/2026 21:20. Estado permanece Completado, campos y fotos bloqueados. Modal: Ejecutor y Supervisor deshabilitados como firmados; únicamente Cliente habilitado. Se deja abierto para la última firma de prueba. La aprobación final todavía no está comprobada.

### Tercera firma y exportación comprobadas

Cliente firmado 09/09/2026 21:23. UI muestra Aprobado, tres firmas, contenido/fotos bloqueados y botón de firma deshabilitado. PDF descargado en Downloads/ITR-QA-INTEGRIDAD-20260909___NO_CERTIFICA.pdf, generación 21:24:16 UTC. Se extrajo texto y renderizó con pypdfium2 para inspección visual.

PDF contiene tag, proyecto, APPROVED, fecha y nombres/fechas de los tres roles. Hallazgos pendientes: respuesta de texto truncada a «PRUEBA FUNCIO...» y los trazos de firmas visibles en UI no aparecen en el PDF (solo identidad y fecha). No dar exportación documental por cerrada. Antes de retirar el QA conservar este caso para corregir y repetir exportación, luego probar reapertura auditada.

## PDF y reapertura cerrados para el caso QA (21:34 UTC)

Corrección publicada Worker 5167e076-ff17-484d-b57d-daac6a6398a8: respuestas completas, paginación de filas extensas, imágenes originales PNG/JPEG de firmas, identidad y fecha UTC con milisegundos. 145 pruebas pasan, 11 omitidas; lint/typecheck/build correctos. Descarga real revisada por extracción y render: tres imágenes de firma y respuesta íntegra; copia preservada en insumos-locales/prueba-itr-integridad/qa-firmado-publicado.pdf. Esta prueba no valida todavía todos los 302 formatos ni evidencias fotográficas en PDF.

Reapertura del QA ejecutada desde UI con motivo explícito. Motivo vacío deshabilita confirmar. Verificación remota: estado completed, cero firmas activas, tres firmas previas completas en activity_log.payload.previousSignatures y tres respuestas tanto actuales como históricas. Campos y carga de foto habilitados. No se eliminaron históricos ni QA; el PDF firmado permanece como evidencia previa. Prueba de roles realizada con un usuario asignado a tres roles; segregación entre usuarios diferentes no probada en UI.

## Siguiente prueba: adjunto requerido

Preparado QA-FOTO-20260909 — NO CERTIFICA, template inactivo 084240f7-0860-4d19-8062-685df315cbf7, ITR 21222e28-8dbf-4d89-800c-ffd1b5bea3c3. Un ítem photo requerido; UI 0%, Sin iniciar, Firmar deshabilitado. Abierto para que el usuario seleccione una imagen de prueba mediante «Agregar foto» del ítem. Pendiente validar carga, 100%/completed y retiro con regreso a incompleto, preservación del objeto para trazabilidad. Los formatos industriales no fueron modificados.

## Prueba fotográfica completada (9 septiembre)

Usuario cargó foto al ítem obligatorio y firmó Ejecutor. UI confirmó 100%/Completado, foto vinculada visible, firma ejecutor, sin control de retirada y carga deshabilitada. Se reabrió QA-FOTO con motivo explícito para probar retiro; quedó habilitado ×. Al retirarla desde UI: 0%, En progreso, firma bloqueada. Consulta remota confirmó estado/progreso, cero adjuntos y firmas activas, una firma y un adjunto en snapshot de reapertura; el objeto original continúa en Storage. No se borró el archivo histórico. QA-FOTO se conserva incompleto deliberadamente como evidencia de prueba negativa. No precisa volver a firmarse para validar este caso.

Esta prueba cubre adjunto obligatorio y recálculo, protección tras firma parcial y reapertura/retirada. No equivale a validar fotografías dentro del PDF ni roles con usuarios distintos, ni completa las revisiones de los 302 originales.
