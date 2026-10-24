# Revisión crítica de CommUp

Fecha: 23 de octubre de 2026. Base revisada: commit `1b96eec`. Autor: Codex. Destinatario: Luis Fernando.

**Dictamen: CommUp tiene una base técnica y de dominio que merece continuar. No recomiendo reescribirlo. Su siguiente etapa debe concentrarse en confiabilidad demostrable, conservación de evidencia y validación en campo. Hoy no hay evidencia suficiente para considerarlo un sistema apto para decisiones de seguridad de misión.**

La mayor amenaza es que su amplitud funcional transmita más confianza de la que sus pruebas y garantías transaccionales pueden sostener. Puede gestionar numerosos aspectos de un proyecto; todavía hay caminos donde una operación queda a medias, una captura se elimina tras un rechazo o un expediente se emite con anexos omitidos. En aseguramiento, esas diferencias son centrales.

## Alcance y evidencia

Esta es una auditoría técnica y de producto basada en inventario, lectura dirigida de código, seguimiento de flujos entre TypeScript y SQL, comprobaciones ejecutables y revisión de documentación. **No es una certificación ni una lectura manual exhaustiva de cada línea.** La revisión detallada se concentró en autenticación, permisos, ITR, firmas, sincronización, gates, handover, API, eventos, IA, navegación y entrega del software. Los restantes módulos tuvieron cobertura estructural o de sus puntos de integración; no todos recibieron igual profundidad.

No se modificó código funcional, no se desplegó y no se hicieron pruebas de escritura contra producción. No se verificaron la configuración efectiva de producción, sus respaldos, sus secretos ni sus métricas. La practicidad se evalúa desde los flujos implementados; queda pendiente observar usuarios reales y recorrer la interfaz con datos representativos.

Inventario del árbol local, incluyendo archivos generados y traducciones:

| Área | Archivos | Líneas |
|---|---:|---:|
| `src` | 873 | 153.719 |
| Funciones SQL canónicas | 238 | 9.846 |
| Migraciones activas | 121 | 45.742 |
| `tests` | 20 | 1.972 |
| `e2e` | 2 | 152 |

Estas cifras no son líneas únicas de lógica: SQL histórico, tipos generados y traducciones aumentan el volumen. Tampoco equivalen a cobertura de revisión. Por ejemplo, `CLAUDE.md` aún describe unas 300 fuentes y 62.000 líneas: la documentación de arquitectura ya subestima el tamaño actual.

| Verificación ejecutada | Resultado |
|---|---|
| `npm run lint -- --max-warnings=0` | Pasó |
| `npm run typecheck` | Pasó |
| `npm test` | 115 archivos pasaron; 20 omitidos. 686 pruebas pasaron y 420 se omitieron |
| `npm run build` | Pasó. El primer intento fue bloqueado por el sandbox; el segundo terminó correctamente |
| `npx opennextjs-cloudflare build` | Pasó; generó el Worker localmente |
| `node scripts/ci/worker-size.mjs` | Handler: 21,11 MB sin comprimir y 4,57 MB gzip; dentro del presupuesto de 6 MB del script |
| `npm run e2e` | No ejecutó el recorrido: Supabase local no estaba disponible; comprobación posterior confirmó Docker/Colima detenido |
| Sondas locales sobre `replayQueueOnce` | Reprodujeron eliminación de respuesta y foto aunque fallara el registro del conflicto |

Las sondas ejecutaron el TypeScript real transpiliado, con dependencias simuladas para forzar errores; no son una reproducción en navegador ni contra Postgres. Los logs de las verificaciones se conservan junto al reporte en `revision-2026-10-23-evidencia/`.

## Lo que sí está bien construido

CommUp ya tiene decisiones que sería costoso volver a descubrir en una reescritura:

- **Modelo industrial reconocible.** Organización, proyecto, área, sistema, subsistema, tag, prueba, deficiencia, liberación y entrega forman una cadena coherente. También contempla pruebas por lazo y causa C&E, evitando forzar todo a un único equipo.
- **Reglas críticas en Postgres.** `sign_itr_atomic` bloquea el registro con `FOR UPDATE`, comprueba asignaciones, orden de firmas, contenido, equipo de prueba y documentos. `guard_itr_content` impide editar contenido firmado y valida la relación entre evidencia e ITR. Esto protege frente a llamadas que eviten la interfaz.
- **Identidad y responsabilidad diferenciadas.** Hay roles de acceso y capacidades de firma; en varios flujos una persona no puede ocupar dos firmas. Es una base útil para segregación de funciones.
- **Tratamiento serio del trabajo sin red.** Capturas con autor, colas persistentes, conflictos por versión y restricciones al cambio de usuario muestran conocimiento del campo. Los defectos que detallo no invalidan esa base, pero afectan su promesa más importante.
- **Revisiones y evidencia exportable.** Plantillas versionadas, control documental y manifiestos firmados con Ed25519 son activos reales. Una firma de integridad del paquete, sin embargo, no demuestra por sí misma que las pruebas sean correctas o que el expediente esté completo.
- **Esfuerzo de mantenimiento visible.** Tipos generados, funciones SQL canónicas, pruebas de paridad, comprobaciones de accesibilidad, ayuda por rol y gates de CI reducen errores habituales.
- **Navegación con intención.** `buildMenu` separa permiso y audiencia; «Mi trabajo», búsqueda y accesos de creación acercan las obligaciones al usuario.

No describiría esto como un prototipo vacío. Tampoco usaría «maduro» como sustituto de mediciones operativas. La base existe; la garantía aún es desigual.

## Hallazgos técnicos prioritarios

P1 significa resolver antes de ampliar uso crítico o empresarial. P2 significa corregir en el siguiente ciclo de consolidación. La prioridad contempla impacto y alcance; no implica que se haya observado un incidente en producción.

### 1. P1 — Una captura offline puede desaparecer sin conservar siquiera el rastro del rechazo

**Evidencia:** [replay.ts](/Users/luisfer/Desarrollo/CommUp-App/src/lib/sync/replay.ts:100), [política de reintentos](/Users/luisfer/Desarrollo/CommUp-App/src/lib/sync/outbox-utils.ts:70).

Al agotar reintentos, el replay llama a `log_sync_conflict` y elimina la entrada local sin comprobar el `error` devuelto por Supabase. Lo hace tanto para respuestas como para elementos de la bandeja. Además, en el caso de una foto, el payload del conflicto conserva metadatos, no los bytes de la imagen.

**Reproducción local:** respuesta y foto con dos intentos previos; el servidor rechaza el tercer envío; el registro del conflicto devuelve error. En ambos casos se elimina la entrada y se devuelve `remaining: 0`, `conflicts: 1`.

Esto puede convertir una incidencia recuperable de permisos o servicio en pérdida de trabajo de campo. Que aparezca un aviso no permite reconstruir una foto perdida.

**Cambio:** conservar las entradas rechazadas en una bandeja durable hasta resolución explícita; guardar el binario; comprobar el resultado del registro de auditoría; permitir exportar capturas retenidas. Aplicar la misma regla a respuestas, fotos y firmas.

**Criterio de aceptación:** al inyectar fallo en cada paso de envío y auditoría, los datos locales siguen recuperables; «cero pendientes» nunca significa «eliminados automáticamente por rechazo».

### 2. P1 — Las fotos offline no tienen reenvío idempotente ni conservan la hora original de captura

**Evidencia:** [uploadPhoto](/Users/luisfer/Desarrollo/CommUp-App/src/lib/sync/outbox.ts:36), [storagePathFor](/Users/luisfer/Desarrollo/CommUp-App/src/lib/sync/outbox-utils.ts:43), [saveItrAttachment](/Users/luisfer/Desarrollo/CommUp-App/src/app/actions/itr-instances.ts:372).

Cada intento genera una nueva ruta con hora y aleatoriedad. Si la subida termina pero se pierde la respuesta posterior, el reintento puede crear otro objeto. Si se insertó el adjunto y falla `refresh_itr_status`, la acción devuelve error aunque la evidencia ya quedó persistida. El siguiente intento puede duplicarla. El campo `captured_at` del adjunto recibe la hora del servidor al sincronizar, no `queuedAt` del dispositivo.

**Impacto:** duplicados, archivos huérfanos y cronología inexacta. Las respuestas sí llevan hora de campo; las fotos no tienen el mismo contrato.

**Cambio:** UUID estable de captura, ruta fija, restricción única de idempotencia, `captured_at` y `uploaded_at` separados, resultado recuperable tras pérdida de respuesta. Reutilizar el criterio de idempotencia que ya existe para punches.

**Criterio:** repetir diez veces el envío genera un adjunto y un objeto; una foto capturada horas antes conserva esa hora identificada como hora del dispositivo.

### 3. P1 — Crear un ITR y asignar sus firmantes son operaciones independientes

**Evidencia:** [createItrAssignment](/Users/luisfer/Desarrollo/CommUp-App/src/app/actions/itr-instances.ts:103), [guard_itr_content](/Users/luisfer/Desarrollo/CommUp-App/supabase/functions-sql/guard_itr_content.sql).

Primero se inserta el ITR; después, en otra petición, sus asignaciones. Si un supervisor o cliente no pertenece a la organización, el trigger rechaza las asignaciones, pero el ITR ya existe. La acción devuelve error sin informar del registro creado. Un reintento puede producir otra revisión/numeración.

**Cambio:** una RPC transaccional para creación, asignaciones y eventos, con clave idempotente. Validar antes todas las personas y su elegibilidad actual.

**Criterio:** un fallo en cualquier asignación deja cero ITR nuevos; repetir una solicitud confirmada devuelve el mismo ITR.

### 4. P1 — La API duplica eventos de creación que ya produce la base de datos

**Evidencia:** [POST de tags](/Users/luisfer/Desarrollo/CommUp-App/src/app/api/v1/tags/route.ts:156), [trigger de tags](/Users/luisfer/Desarrollo/CommUp-App/supabase/migrations/00000000000000_baseline.sql:5033), [emit_domain_event](/Users/luisfer/Desarrollo/CommUp-App/supabase/functions-sql/emit_domain_event.sql).

El insert del tag dispara `tag.created` desde Postgres. La ruta inserta después otro `tag.created`. El patrón también aparece en las rutas de creación de ITR y punch. El cliente admin normal no lleva la cabecera especial de importación que suprime el trigger.

**Impacto:** dos eventos con IDs diferentes por una creación. Un consumidor que deduplica por ID de evento puede ejecutar dos veces una automatización de negocio. No he reproducido esta ruta contra una BD; la evidencia es el encadenamiento explícito del código y los triggers del esquema.

**Cambio:** un único productor por evento; transmitir el contexto de API al productor canónico o distinguir un evento técnico de solicitud del evento de negocio. Mantener la deduplicación de entregas como protección adicional.

**Criterio:** una creación por UI, API o importación produce exactamente el contrato de eventos previsto y una sola consecuencia de negocio.

### 5. P1 — Un handover puede quedar emitido con anexos que fallaron o excedieron los topes

**Evidencia:** [límites y tareas del bundle](/Users/luisfer/Desarrollo/CommUp-App/src/lib/handover/bundle.ts:31), [estado ISSUED](/Users/luisfer/Desarrollo/CommUp-App/src/lib/handover/generate.ts:128).

El paquete limita los PDF individuales a 150 ITR y los documentos copiados a 40 MB. Los errores de generación o descarga se convierten en `omitted`. Después se firma el manifiesto y se marca el paquete `ISSUED` sin exigir que no haya omisiones.

Las omisiones sí se documentan en el índice/manifiesto: no es un recorte completamente oculto. El problema es semántico y operativo: el mismo estado puede representar un expediente completo y uno incompleto. Una firma criptográfica autentica ambos por igual.

**Cambio:** separar «exportación parcial», «expediente completo» y «entrega aceptada»; definir anexos obligatorios según alcance; impedir la emisión formal cuando falta evidencia obligatoria; permitir volúmenes vinculados por un manifiesto raíz.

**Criterio:** fallar deliberadamente un anexo obligatorio nunca deja una entrega completa; los casos parciales se identifican antes de descargar y antes de aceptar el traspaso.

### 6. P1 para grandes proyectos — El handover acumula archivos en memoria y consulta información viva

**Evidencia:** [descarga antes del control de tamaño](/Users/luisfer/Desarrollo/CommUp-App/src/lib/handover/bundle.ts:180), [ZIP síncrono](/Users/luisfer/Desarrollo/CommUp-App/src/lib/handover/bundle.ts:243), [generación](/Users/luisfer/Desarrollo/CommUp-App/src/lib/handover/generate.ts:85).

El límite de 40 MB se comprueba después de descargar cada Blob. Se retienen anexos y se crea un ZIP completo en memoria; los PDF y otras estructuras suman memoria adicional. También se construye todo el bundle aunque solo se solicite JSON. El comentario habla de un sistema por paquete, pero las entradas permiten varios o todos.

Cloudflare documenta 128 MB de memoria por isolate; los topes actuales no prueban que toda la operación permanezca debajo de ese límite. [Límites de Workers](https://developers.cloudflare.com/workers/platform/limits/).

Hay otra cuestión independiente: el JSON se obtiene primero y luego los PDF se cargan mediante consultas posteriores. Un cambio concurrente puede dejar el resumen y sus anexos representando instantes diferentes. Las revisiones inmutables mitigan parte del riesgo, pero el empaquetado completo no comparte una única instantánea.

**Cambio:** trabajo durable en segundo plano, manifiesto de alcance congelado, referencias/versiones verificadas, generación reanudable y empaquetado por streaming o en un proceso dimensionado para archivos grandes. Generar únicamente formatos solicitados.

**Criterio:** expediente de tamaño contractual con fallos y reanudaciones, memoria medida, consistencia de versiones y comparación entre resumen y anexos. No se midió agotamiento de memoria en esta auditoría: es un riesgo fundamentado por el diseño.

### 7. P1 — La CI puede quedar verde sin comprobar la matriz completa de roles

**Evidencia:** [variables de CI](/Users/luisfer/Desarrollo/CommUp-App/.github/workflows/lint.yml:51), [selección de actores](/Users/luisfer/Desarrollo/CommUp-App/tests/db/authz-matrix.test.ts:205).

La suite necesita `TEST_ROLE_<ROL>_EMAIL/PASSWORD` para los seis roles. El workflow no los transmite. Solo aporta A y B: A cubre su propio rol y B el outsider. El resto puede omitirse. Además, todas las pruebas de BD se saltan sin credenciales. Esta ejecución omitió las 420 pruebas de BD.

El E2E local obligatorio de la CI es un avance, pero actualmente hay un solo recorrido en `e2e/itr-offline.spec.ts`: captura, foto, firma y reconexión de un inspector. No cubre la matriz completa ni el ciclo de liberación y entrega.

**Cambio:** base efímera por CI, dos organizaciones, todos los roles y fixtures propios; las suites críticas deben fallar si faltan actores. Evitar depender de producción para sondas de autorización.

**Criterio:** cero omisiones en suites críticas; probar lectura, escritura, RPC y Storage por rol, organización, proyecto y estado del recurso.

### 8. P1 para trazabilidad contractual — El panel de auditoría y la retención no forman un historial completo

**Evidencia:** [panel de auditoría](/Users/luisfer/Desarrollo/CommUp-App/src/app/(dashboard)/admin/audit/page.tsx:25), [retención](/Users/luisfer/Desarrollo/CommUp-App/supabase/functions-sql/cleanup_event_retention.sql), [logActivity](/Users/luisfer/Desarrollo/CommUp-App/src/lib/log-activity.ts:13).

El panel consulta `domain_events`; numerosas acciones y firmas escriben detalles en `activity_log`. Por tanto, ese panel no es un visor unificado de todas las acciones auditadas. `cleanup_event_retention` borra eventos ya despachados después de 365 días: un proyecto plurianual pierde historia visible de esa fuente aunque conserve documentos u otros registros.

Además, `logActivity` no examina errores devueltos como `{ error }`; su manejador de rechazo de Promise no cubre el fallo normal de Supabase. En acciones que dependen de ese helper, el negocio puede completarse sin el registro esperado. Las RPC que insertan auditoría dentro de su transacción tienen una garantía mejor.

**Cambio:** separar eventos de integración, logs técnicos e historial de aseguramiento; definir retención por contrato/proyecto; unificar la consulta del historial y hacer atómicos los registros de decisiones críticas. Endurecer la procedencia: `activity_log` permite inserción del propio usuario según su política y no debe tratar cualquier fila como prueba de que ocurrió una transición autorizada.

**Criterio:** reconstruir una decisión completa años después con actor, capacidad, motivo, versión, evidencias y revocaciones, sin depender de eventos transitorios.

### 9. P2 — La rotación de clave no tiene recuperación histórica implementada en el endpoint público

**Evidencia:** [public-key](/Users/luisfer/Desarrollo/CommUp-App/src/app/api/v1/handover/public-key/route.ts:11), [instrucciones del ZIP](/Users/luisfer/Desarrollo/CommUp-App/src/lib/handover/bundle.ts:227).

El manifiesto lleva `key_id`, pero el endpoint publica solamente la clave actual y no resuelve una clave antigua por ID. El ZIP remite a ese endpoint y no incluye el PEM como archivo. Tras rotar, quien no guardó la clave anterior necesita otra fuente para verificar un paquete antiguo.

**Cambio:** registro histórico de claves públicas por `key_id`, fechas y estado; incluir la pública en el paquete, con una fuente independiente para autenticarla; documentar revocación y rotación. La clave pública embebida sola no demuestra identidad si todo el paquete pudiera reemplazarse.

**Criterio:** emitir con K1, rotar a K2 y verificar años después el paquete K1 con una cadena de confianza documentada.

### 10. P2 — El presupuesto de IA es un control aproximado, no un límite de gasto

**Evidencia:** [runAi](/Users/luisfer/Desarrollo/CommUp-App/src/lib/ai/run.ts:14).

La cuota se consulta antes de llamar y el gasto se registra después. Varias solicitudes simultáneas pueden leer el mismo saldo y ejecutarse. Si falla la consulta de cuota, se permite continuar. Esto no coincide con una promesa de presupuesto duro por organización.

**Cambio:** reservar capacidad/coste estimado de forma atómica antes de la llamada, limitar concurrencia y reconciliar consumo. Definir explícitamente si una cuota es aviso o bloqueo.

La revisión de ITR asistida por IA sí exige una decisión humana para aplicar propuestas: conviene conservar ese límite. Añadir evaluación con casos de ingeniería aprobados y medir falsos negativos, especialmente cuando se propone retirar requisitos.

### 11. P2 — La API acepta JSON válido que no tiene la forma esperada y puede responder con error interno

**Evidencia:** [tags POST](/Users/luisfer/Desarrollo/CommUp-App/src/app/api/v1/tags/route.ts:107), [handover POST](/Users/luisfer/Desarrollo/CommUp-App/src/app/api/v1/handover/export/route.ts:63).

El tipado de TypeScript no valida el cuerpo HTTP. Un `null` es JSON válido y falla al desestructurarlo/acceder a propiedades. En handover, `format: [1]` llega a `toLowerCase()` sin validar el tipo de cada elemento.

**Cambio:** esquemas de entrada en runtime, límites de colecciones y respuesta uniforme 400/422. Zod ya está disponible en el proyecto.

**Criterio:** fuzzing acotado con null, arrays, números, tipos incorrectos y cuerpos excesivos no produce excepciones no controladas.

### 12. P2 — La analítica de pronóstico conserva contratos antiguos y una agregación equivocada

**Evidencia:** [vista de velocidad](/Users/luisfer/Desarrollo/CommUp-App/supabase/migrations/00000000000000_baseline.sql:2269), [forecast canónico](/Users/luisfer/Desarrollo/CommUp-App/supabase/functions-sql/analytics_project_forecast.sql:22), [catálogo de eventos](/Users/luisfer/Desarrollo/CommUp-App/src/lib/constants/domain-events.ts:16).

La vista de velocidad del esquema filtra `aggregate_type = 'itrs'` y `itrs.updated`; el emisor actual utiliza `itr` y eventos `itr.*`. No encontré una migración posterior que actualice esa vista. Las nuevas aprobaciones no alimentan ese filtro.

El forecast suma ITR pendientes del proyecto, pero divide por el promedio de velocidades de subsistemas. Ejemplo: dos subsistemas con 10 pendientes y 1 ITR/día cada uno dan 20 días por esa fórmula, aunque el ritmo conjunto simple sea 2 ITR/día y el cálculo agregado resulte 10. Dependencias y recursos pueden exigir otro modelo, pero no justifican mezclar total y promedio sin explicación.

La etiqueta `p50` tampoco se apoya aquí en una distribución estadística; la confianza depende de umbrales de velocidad. **No encontré un consumidor actual de `getProjectForecast` fuera de su definición**, por lo que no afirmo que un tablero visible esté mostrando hoy ese resultado. Es funcionalidad expuesta/dormante que no debe reactivarse como predicción validada. Los módulos `src/analytics` también conservan vocabulario antiguo y no se deben confundir con el motor que realmente usan las pantallas.

**Cambio:** actualizar eventos, corregir unidades/agregación y renombrar a «estimación por ritmo» hasta validar el modelo con datos históricos. Retirar o aislar implementaciones abandonadas.

**Criterio:** pruebas con proyectos de uno y varios subsistemas, cambios de alcance y cero actividad; medición retrospectiva del error antes de publicar probabilidades.

## Decisiones de producto que deben revisarse

### Acceso por proyecto

`is_project_member` comprueba membresía activa en la organización propietaria; no una asignación individual al proyecto. La documentación reconoce esta decisión. No es evidencia de una fuga entre organizaciones: es un alcance de permisos demasiado amplio para ciertos contratos dentro de una misma organización.

Para un contratista que ejecuta trabajos para varias operadoras, invitar un cliente puede exponer proyectos ajenos a ese cliente. Recomiendo membresía por proyecto y, cuando sea necesario, por empresa/alcance. Debe aplicarse a RLS, RPC, Storage, búsqueda, API y exportaciones; esconder elementos del menú no resuelve el problema.

### Política de liberación según criticidad

`org_gate_policy` permite por defecto que requisitos ITR sin generar sean una condición, no un bloqueo; una dependencia aprobada en regresión también puede dejar condición, y nuevos Cat A no regresan automáticamente una aprobación previa. `approve_system_gate` permite aprobar amarillo con condiciones.

Estas reglas pueden reflejar prácticas legítimas: una aprobación histórica no siempre debe desaparecer por un hecho posterior. Pero para una decisión actual de energización o arranque es esencial distinguir **«fue aprobado»** de **«sigue siendo seguro avanzar»**.

Propongo políticas versionadas por proyecto y criticidad, baselines de alcance, autorización explícita de excepciones y una reevaluación final de prerrequisitos antes de ejecutar. Una configuración corporativa editable no debería cambiar de manera inadvertida el significado de una autorización anterior.

### Integridad y aseguramiento son cosas diferentes

Un campo diligenciado no demuestra que una medición sea correcta. Una firma de usuario no demuestra competencia técnica. Un hash correcto no demuestra que el documento incluya todo el alcance. Un 100 % de registros existentes no demuestra que estén identificadas todas las pruebas necesarias.

CommUp ya implementa parte de estas separaciones. Deben convertirse en contratos explícitos del producto: cobertura del alcance, captura completa, aceptación técnica, revisión independiente, liberación vigente y entrega aceptada. La interfaz debe mostrar cuál de esas afirmaciones está haciendo.

## Organización y arquitectura recomendadas

Mantendría Next.js, TypeScript, Postgres/Supabase y la capa web en Cloudflare. La compilación del destino real pasó. No aparece una razón para una reescritura total ni para repartir ahora todo en microservicios.

La mejora necesaria es un monolito modular con límites más claros:

| Dominio | Responsabilidad y contrato |
|---|---|
| Identidad y acceso | Organización, proyecto, empresa, rol, capacidad y vigencia |
| Configuración técnica | Alcance, requisitos, plantillas, revisiones y aplicabilidad |
| Ejecución | Capturas, evidencias, sincronización y resolución de conflictos |
| Aceptación | Firmas, rechazo, reapertura y segregación de funciones |
| Liberación | Gates, dependencias, condiciones y vigencia operativa |
| Entrega | Instantánea, expediente, verificación y aceptación del receptor |
| Integraciones | API, eventos, webhooks, cuotas e idempotencia |

Las acciones de Next deberían validar entrada y contexto, invocar operaciones de dominio y traducir resultados. Las transiciones críticas deberían ejecutarse como una unidad transaccional en la BD. Los trabajos grandes necesitan un ejecutor durable con reintentos e identidad propia.

Hay componentes extensos: `PidViewer.tsx` tiene 1.093 líneas; `CertificateDetail.tsx`, 876; `ItrExecution.tsx`, 827. El número por sí solo no es un defecto. El riesgo es mezclar captura, permisos, sincronización, navegación y representación en un archivo que cambia frecuentemente. Separaría primero los componentes con mayor historial de fallos, sin convertir la refactorización en una campaña estética.

También reduciría la duplicación de reglas entre SQL y TypeScript mediante casos compartidos: mismos ejemplos y resultados esperados para aceptación, tablas, condiciones y gates. El SQL debe conservar la autoridad; el cliente necesita un espejo comprobable para anticipar el resultado offline.

## Practicidad en campo

La estructura por rol y «Mi trabajo» va en la dirección correcta. Sin embargo, la practicidad no se puede acreditar leyendo JSX. Haría pruebas observadas con un inspector, un líder y una persona de la operadora que no hayan participado en el desarrollo.

Los recorridos a medir son concretos:

1. Preparar una jornada: encontrar sus equipos, descargar lo necesario y confirmar qué estará disponible sin red.
2. Ejecutar: escanear tag, identificar revisión, medir, adjuntar evidencia y registrar una desviación.
3. Recuperarse: cerrar la app, volver sin red, cambiar de turno y resolver un conflicto sin perder capturas.
4. Revisar: entender exactamente por qué una prueba no puede firmarse y qué persona puede resolverlo.
5. Liberar: identificar el bloqueo que impide arrancar, su responsable, la dependencia y la evidencia requerida.
6. Entregar: producir y verificar un expediente que el receptor pueda usar fuera de CommUp.

Mediría tiempo, errores, necesidad de ayuda, trabajo repetido y recuperación tras fallos. Incluiría teléfonos modestos, pantalla al sol, guantes cuando corresponda y conectividad intermitente. No establecería metas de tiempo como si ya fueran resultados: primero hace falta una línea base.

Para proyectos simples, ofrecería configuración guiada con módulos opcionales y valores iniciales revisables. Para proyectos exigentes, activaría más rigor sobre el mismo núcleo: designaciones obligatorias, revisión independiente, evidencia mínima, excepciones y retención. La interfaz puede simplificarse sin debilitar las garantías de conservación.

## Operación y recuperación

El repositorio tiene observabilidad habilitada en Wrangler, logs, cron y herramientas de carga. Eso es útil, pero no equivale a demostrar objetivos de disponibilidad, alertas efectivas o restauración completa.

Antes de vender garantías empresariales, pediría evidencia de:

- Restauración ensayada de base, objetos de Storage y claves necesarias para verificar entregables.
- Tiempo máximo de recuperación y pérdida máxima de datos aceptada, acordados con clientes.
- Alarmas por antigüedad de colas, capturas rechazadas, webhooks abandonados, cron atrasado y handovers incompletos.
- Un único camino de despliegue autorizado y verificación de que ninguna integración externa evita los controles de CI. `CLAUDE.md` menciona una vía adicional de Workers Builds pendiente de desconectar; no confirmé su estado actual.
- Pruebas de carga con volumen y concurrencia representativos, incluyendo la distribución de dependencias entre sistemas y generación documental.

**El respaldo de Supabase Database no incluye los archivos de Storage, solo sus metadatos.** Recuperar tablas sin fotos, certificados o planos puede dejar una aplicación operativa pero sin evidencia utilizable. [Documentación de respaldos de Supabase](https://supabase.com/docs/guides/platform/backups).

No concluyo que esos controles externos no existan; concluyo que no quedaron demostrados en esta revisión.

## Futuro del producto y ambición industrial

Sí veo futuro como producto especializado, condicionado a que demuestre resultados repetibles en campo. No puedo inferir demanda, disposición a pagar, retención o ventaja comercial únicamente del código.

Su propuesta más defendible es: **hacer visible qué falta para liberar un sistema, quién debe resolverlo y qué evidencia respalda la decisión**. Esa promesa conecta ejecución, gerencia y operación y permite medir valor. La amplitud de módulos y la IA pueden apoyarla; no deben reemplazarla como argumento principal.

Escogería primero un segmento y un tipo de proyecto donde conseguir implantaciones repetibles. En pilotos mediría reducción del tiempo de cierre, horas de preparación del dossier, pruebas rechazadas por evidencia incompleta, capturas recuperadas tras cortes y capacidad del cliente para verificar la entrega. Un piloto debe terminar con resultados y referencias, no solo con una demostración de pantallas.

Sobre «asegurar el despegue de un cohete»: la arquitectura puede evolucionar para gestionar evidencias y autorizaciones de una campaña compleja. Eso no demuestra que hoy sea apta para decisiones de seguridad de misión, y un sistema de gestión de evidencia no sustituye los sistemas físicos de protección o control.

NASA-STD-8739.8B plantea aseguramiento de software, seguridad e IV&V a lo largo del ciclo de vida. La referencia sirve para dimensionar el tipo de disciplina que exige esa ambición, no para afirmar que CommUp deba cumplir automáticamente una norma particular ni que la cumpla. [NASA Software Assurance and Software Safety Standard](https://standards.nasa.gov/standard/nasa/nasa-std-87398).

Para avanzar hacia esa clase de uso harían falta análisis de peligros, trazabilidad requisito–riesgo–prueba–evidencia, control de configuración, validación independiente, decisiones bajo fallos y evidencia de recuperación. La participación de especialistas independientes en comisionamiento, seguridad y verificación sería parte del producto, no un trámite al final.

## Secuencia propuesta de mejora

Los horizontes son orientativos y dependen del equipo. Los criterios de salida son más importantes que las fechas.

| Etapa | Trabajo | Criterio de salida |
|---|---|---|
| 0–30 días | Capturas retenidas, fotos idempotentes, creación transaccional de ITR, eventos únicos, validación API y CI completa de roles | Fallos inducidos no pierden evidencia ni dejan operaciones ambiguas; suites críticas sin omisiones |
| 30–60 días | Membresías por proyecto, historial unificado, política de retención y restauración ensayada | Aislamiento probado y expediente recuperable con sus binarios |
| 60–90 días | Handover durable, instantáneas, claves históricas, prueba de carga y recorridos reales | Entrega completa verificable y operación medida al volumen objetivo |
| Después | Políticas de criticidad, trazabilidad de riesgos, validación independiente y expansión de integraciones | Evidencia suficiente para el tipo de proyecto que se quiere aceptar |

No intentaría cerrar toda la lista al mismo tiempo. La primera entrega debería demostrar tres garantías: ninguna captura se pierde por un rechazo, una operación reintentada no duplica efectos y ninguna entrega incompleta se presenta como completa.

## Decisión recomendada

**Continuar, consolidar y validar.** Mantener el núcleo técnico, reducir ambigüedades entre estados y concentrar el siguiente esfuerzo en confiabilidad. Posponer nuevas funciones que no mejoren el flujo principal o no tengan un usuario concreto esperando por ellas.

CommUp ya tiene suficiente funcionalidad para ser evaluado seriamente en proyectos reales. Lo que determinará si se convierte en referente será poder demostrar que conserva evidencia, explica decisiones, respeta responsabilidades y se recupera de fallos bajo presión. Los hallazgos de este reporte son corregibles; ignorarlos mientras se amplía el alcance sí pondría en riesgo esa ambición.
