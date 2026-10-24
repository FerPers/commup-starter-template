# Plan integral de mejora de CommUp

**Fecha:** 23 de octubre de 2026 · **Versión:** 1.2 · **Estado:** propuesta consolidada para organizar la ejecución, ampliada con el diagnóstico del CORE ITR y las recomendaciones de Control Tower, navegación y credibilidad comercial.

**Actualización 1.2:** se conservan A01–A45 y se incorporan F12 (Control Tower y contexto visual, A46–A50) y F13 (producto visible y credibilidad comercial, A51–A53). El plan contiene **13 frentes y 53 acciones**. La sección 13 conserva el programa del CORE ITR; la sección 14 incorpora las recomendaciones de Grok con ajustes de significado, verificabilidad y utilidad. Las acciones son propuestas; esta actualización no activa plantillas ni modifica el software.

**Historial:** versión 1.0, consolidación inicial; versión 1.1, incorporación del CORE ITR; versión 1.2, Control Tower y credibilidad comercial.

**Objetivo:** convertir la base actual de CommUp en una plataforma de aseguramiento confiable, comprensible y verificable, desde proyectos sencillos hasta proyectos industriales de alta exigencia.

Este documento reúne las recomendaciones de la revisión técnica y de producto del 23 de octubre, y las recomendaciones posteriores sobre navegación, orientación, visibilidad de riesgos, identidad visual y colores. Contiene el alcance de cada mejora, su secuencia, dependencias, responsables por especialidad y criterios de aceptación. Los responsables son perfiles propuestos; no representan asignaciones a personas ni compromisos de calendario.

**Dirección recomendada:** conservar la arquitectura y la marca, consolidar las garantías del núcleo, hacer visible el contexto y los bloqueos, y validar con usuarios y proyectos reales antes de ampliar las promesas del producto.

## 1 Alcance y punto de partida

La consolidación cubre las revisiones técnica y visual iniciales, el diagnóstico específico de ITR y las recomendaciones posteriores de Grok evaluadas en esta conversación. El [reporte técnico original](/Users/luisfer/Desarrollo/CommUp-App/docs/REVISION-CRITICA-COMMUP-2026-10-23.md) conserva el detalle de los hallazgos y sus enlaces al código. Este plan incluye lo necesario para organizar su ejecución sin tener que reconstruir la conversación.

El [plan previo de referente](/Users/luisfer/Desarrollo/CommUp-App/docs/PLAN-REFERENTE-2026-10-22.md) sigue siendo una fuente de decisiones y trabajo anterior. Esta consolidación no convierte automáticamente su backlog histórico en trabajo nuevo, ni cambia estados ya registrados. En la etapa inicial se contrastarán ambos para evitar duplicados y detectar incompatibilidades. Se conserva el vocabulario acordado: **Liberación de sistemas, Liberaciones y criterios, Punto de espera, Punch, Plantilla, Resumen y Portafolio**.

La revisión fue dirigida a flujos críticos y no una certificación ni una lectura manual exhaustiva de cada línea. Los defectos detectados por código deben reproducirse en un entorno aislado antes de corregirlos. Los riesgos arquitectónicos deben medirse; las recomendaciones de producto deben validarse con usuarios. No se comprobó la configuración efectiva de producción ni se realizó una evaluación visual completa en dispositivos.

### Evidencia disponible de la revisión

| Comprobación histórica del 23 de octubre | Resultado registrado |
|---|---|
| ESLint y TypeScript | Pasaron |
| Pruebas automatizadas | 686 pasaron; 420 se omitieron por configuración de BD |
| Compilación Next.js | Pasó |
| Compilación Cloudflare | Pasó |
| Tamaño del handler | 4,57 MB gzip frente al presupuesto interno de 6 MB del script |
| Recorrido E2E local | No se ejecutó: Docker/Supabase local no estaba disponible |
| Sonda de sincronización con dependencias simuladas | Reprodujo eliminación local de respuesta y foto aunque fallara el registro del conflicto |

Estos resultados son la línea base del reporte, no pruebas de que las mejoras de este plan estén implementadas. La evidencia está en [revision-2026-10-23-evidencia](/Users/luisfer/Desarrollo/CommUp-App/docs/revision-2026-10-23-evidencia/replay-probe.log).

### Activos que deben conservarse

- Modelo de organización, proyecto, sistema, subsistema y tag, con pruebas por equipo, lazo y causa C&E.
- Reglas críticas y bloqueo transaccional en Postgres; protección del contenido firmado.
- Separación entre roles de acceso, capacidades de firma y personas responsables.
- Captura offline con autor, persistencia local y conflictos por versión.
- Revisiones de plantillas y documentos, exportación y manifiestos firmados.
- Tipos generados, funciones SQL canónicas, pruebas de paridad, ayuda por rol y controles de CI.
- «Mi trabajo», búsqueda, selector de proyecto y administración plegada.
- Next.js, TypeScript, Supabase/Postgres y Cloudflare para la capa web.
- Identidad principal navy y naranja.

## 2 Principios y garantías del producto

1. Una captura rechazada permanece recuperable hasta una resolución explícita; el sistema no la elimina automáticamente por agotar reintentos.
2. Repetir una operación no duplica registros, archivos ni consecuencias de negocio.
3. Una entrega incompleta se identifica como parcial y no se presenta como expediente completo.
4. Toda decisión crítica permite reconstruir quién la tomó, con qué capacidad, bajo qué versión y con qué evidencia.
5. El usuario puede identificar el alcance actual, el proyecto y la fase del trabajo cuando corresponda, también desde un enlace directo y en móvil.
6. Los bloqueos importantes están a un acceso directo, con alcance y fecha de actualización visibles.
7. Captura completa, aceptación técnica, revisión independiente, liberación vigente y entrega aceptada son estados distintos.
8. Las pruebas y mediciones respaldan las afirmaciones de confiabilidad, rendimiento y utilidad.
9. La simplicidad de un proyecto reduce configuración y módulos visibles, sin reducir la conservación de evidencia.
10. El avance a usos de mayor criticidad exige más evidencia y revisión independiente.

Una firma criptográfica acredita integridad y procedencia dentro de su cadena de confianza; no demuestra que una prueba sea correcta o que el alcance esté completo. Del mismo modo, un registro diligenciado o un porcentaje del 100 % no acreditan por sí solos aceptación técnica.

## 3 Organización por frentes

Los frentes son responsabilidades continuas. Las fases de ejecución indican cuándo entregar cada mejora. Las etapas dividen una fase en resultados verificables. **No deben confundirse con precomisionamiento, comisionamiento y puesta en operación**, que son fases industriales gestionadas por CommUp.

| Frente | Responsabilidad | Perfil líder propuesto | Acciones |
|---|---|---|---|
| F01 Evidencia y ejecución | Captura offline, recuperación, identidad y cronología | Ingeniería de cliente y backend | A01–A02 |
| F02 Dominio e integraciones | Transacciones, eventos, contratos HTTP | Backend y base de datos | A03–A05 |
| F03 Acceso y gobierno técnico | Alcances de acceso, firmas, políticas y excepciones | Seguridad y especialista en comisionamiento | A06–A08 |
| F04 Auditoría y entrega | Historial, expedientes completos, claves e instantáneas | Backend y control documental | A09–A12 |
| F05 Calidad y operación | CI, restauración, alertas, despliegue y carga | Calidad e infraestructura | A13–A17 |
| F06 Navegación y contexto | Proyecto, fase, identidad del registro y menús | Diseño de producto y frontend | A18–A21 |
| F07 Riesgos y decisiones | Visibilidad de bloqueos, regresiones y compromisos | Producto y especialista de dominio | A22–A23 |
| F08 Identidad y accesibilidad | Colores, estados, tipografía y dispositivos | Diseño visual y frontend | A24–A27 |
| F09 Arquitectura y analítica | Límites de módulos, reglas, IA y pronósticos | Arquitectura y datos | A28–A31 |
| F10 Adopción y aseguramiento | Configuración, campo, pilotos y alta criticidad | Producto y especialistas independientes | A32–A35 |
| F11 CORE ITR | Coherencia de pruebas, criterios, alcance, biblioteca y adopción de revisiones | Responsable técnico ITR, con ingeniería, calidad y especialistas de disciplina | A36–A45; coordina A01–A03, A08, A13, A29 y A33 |
| F12 Control Tower y contexto visual | Decisiones del proyecto, matriz de preparación, actividad y contexto espacial | Producto, diseño e ingeniería de dominio | A46–A50; coordina A18–A27 y F11 |
| F13 Producto visible y credibilidad comercial | Landing, demostración, pruebas de valor y oferta comprensible | Producto y responsable comercial | A51–A53; coordina A24, A34 y A50 |

Una persona puede cubrir varios perfiles. Cada acción debe tener un responsable nominal antes de comenzar y un revisor distinto cuando su criticidad lo justifique.

## 4 Fases y etapas de ejecución

Los horizontes orientativos de 30, 60 y 90 días del reporte se mantienen como referencia de planificación, no como estimación validada. La capacidad del equipo, la reproducción de defectos y la preparación de ambientes definirán las fechas. Las fases pueden solaparse cuando sus dependencias lo permitan; la salida se decide por evidencia.

| Fase | Etapas | Resultado esperado | Acciones principales |
|---|---|---|---|
| P0 Preparación | E0.1 conciliar alcance; E0.2 preparar ambientes; E0.3 acordar mediciones | Backlog trazable y línea base reproducible | A13 y A17 iniciales; A28 inventario; preparación de A32–A34 |
| P1 Integridad del núcleo | E1.1 conservar capturas; E1.2 asegurar transacciones; E1.3 probar fallos | Sin pérdidas automáticas ni duplicación por reintentos | A01–A05, A10 control de completitud, A13, A16 |
| P2 Orientación y lenguaje visual | E2.1 modelo de navegación; E2.2 maquetas; E2.3 implementación y validación | Proyecto, contexto, estados y bloqueos comprensibles | A08 contrato de estados, A18–A27 |
| P3 Gobierno y continuidad | E3.1 permisos; E3.2 políticas e historial; E3.3 recuperación | Acceso acotado y decisiones reconstruibles | A06–A09, A12, A14–A15 |
| P4 Escala y consolidación | E4.1 trabajos documentales; E4.2 arquitectura y analítica; E4.3 carga | Expedientes consistentes y capacidad medida | A10 completo, A11, A17, A28–A31 |
| P5 Validación y expansión | E5.1 campo; E5.2 pilotos; E5.3 mayor criticidad | Utilidad demostrada y expansión condicionada | A32–A35 |

**Integración del CORE ITR:** A45 prepara la verificación desde P0; A36, A39 y A40 entran en P1 por coherencia y preservación de requisitos; A43 se integra en P2; A37, A38, A41 y A44 se desarrollan con el gobierno técnico de P3. A42 avanza por lotes homologados entre P3 y P5. No es necesario esperar a terminar todas las mejoras visuales para corregir o validar ITR. La sección 13 detalla las etapas ITR y sus dependencias.

**Integración de F12/F13:** A50 prepara datos de demostración desde P0; A46–A49 se diseñan y validan en P2, con reglas y datos de P1/P3/F11 antes de afirmar preparación técnica. A51 se desarrolla con pantallas representativas verificadas; A52/A53 avanzan en P5 con evidencia de pilotos y oferta aprobada. No se posponen defectos de integridad para completar un rediseño o una landing.

### P0 Preparación

- Registrar los 12 hallazgos del reporte como hipótesis de corrección con su evidencia y alcance.
- Contrastar cada acción con el plan anterior y el código que exista al iniciar. Una revisión histórica no prueba que el defecto siga presente después de otros cambios.
- Levantar un entorno aislado, dos organizaciones, proyectos y usuarios de todos los roles. No usar producción como banco de fallos.
- Registrar versiones de aplicación, esquema, configuración y datos de prueba.
- Acordar volúmenes objetivo, dispositivos, recorridos y responsabilidades. Definir qué significa «crítico» antes de diseñar sus indicadores.

**Salida:** cada acción tiene estado, responsable, evidencia de partida y dependencias; las pruebas críticas pueden ejecutarse en aislamiento. La reproducción y corrección de una pérdida de datos no deben esperar a completar toda la planificación.

### P1 Integridad del núcleo

Primero se protege lo ya capturado. Después se unifican operaciones que hoy pueden quedar a medias, y se prueba la respuesta a cortes, reintentos, concurrencia y fallos de auditoría. El control de completitud del handover entra aquí aunque su generación durable se complete en P4.

**Salida:** datos recuperables ante rechazo, operaciones idempotentes, creación de ITR atómica, eventos sin duplicación lógica, entradas API validadas y suites críticas sin omisiones. Ninguna entrega parcial se presenta como completa.

### P2 Orientación y lenguaje visual

Se diseña el contexto persistente y la relación entre módulos, fases y estados. Las maquetas deben incluir escritorio, móvil, enlace directo, ámbito global y modo offline. La implementación utiliza el contrato de estados de A08 y las definiciones de riesgos de A22.

**Salida:** usuarios de los roles previstos identifican alcance y registro sin abrir el menú; llegan directamente a bloqueos; distinguen pendientes, aceptación y riesgo. Los contrastes y el comportamiento responsive se verifican renderizados.

### P3 Gobierno y continuidad

Se implantan permisos por proyecto, políticas versionadas, historial duradero y recuperación de evidencias. Se ensaya el cambio desde permisos existentes para evitar tanto accesos excesivos como pérdida accidental de acceso legítimo.

**Salida:** aislamiento probado por todas las vías; reconstrucción de decisiones; recuperación conjunta de datos y binarios; verificación de paquetes emitidos antes de rotar claves; alertas operativas verificadas.

### P4 Escala y consolidación

Se extraen los trabajos grandes de la petición interactiva, se congela su alcance y se valida el resultado bajo carga. La refactorización se centra en componentes y reglas con riesgo real. Se corrigen analítica y cuotas antes de respaldar promesas con ellas.

**Salida:** expediente de volumen objetivo generado, interrumpido y reanudado sin inconsistencias; consumo medido; pronósticos correctamente denominados; gasto IA controlado según política; reglas SQL y cliente comprobadas con los mismos casos.

### P5 Validación y expansión

Se mide el trabajo real desde preparación de jornada hasta entrega. Los pilotos se concentran en un segmento para conseguir resultados repetibles. La alta criticidad se aborda como una etapa posterior con análisis de peligros y evaluación independiente.

**Salida:** resultados de campo, aceptación del receptor y evidencia comercial; cualquier ampliación a usos críticos queda condicionada al nivel de aseguramiento necesario.

## 5 Catálogo completo de acciones

**Prioridad alta:** antes de ampliar uso crítico o empresarial. **Prioridad media:** siguiente ciclo de consolidación. **Estratégica:** expansión sujeta a validación. Las prioridades de UX indican orden de mejora y no equivalen automáticamente a severidad de seguridad.

### F01 Evidencia y ejecución

**A01 Conservar capturas rechazadas — Prioridad alta — P1 E1.1**

Sustituir el descarte automático por una bandeja durable de respuestas, fotos y firmas rechazadas. Conservar datos y binarios, motivo, autor y estado; comprobar el resultado de `log_sync_conflict`. Permitir reintentar, resolver o exportar las capturas retenidas. El descarte explícito requiere trazabilidad y no debe confundirse con sincronización exitosa.

**Aceptación:** fallar el envío y el registro de auditoría conserva la captura, incluso tras cerrar y abrir la app. «Cero pendientes» no oculta elementos eliminados por rechazo. Probar también sesiones vencidas y dispositivos compartidos. **Dependencias:** entorno de A13; coordinar estados con A08.

**A02 Identidad y fechas de evidencia — Prioridad alta — P1 E1.1**

Asignar UUID estable a cada captura, ruta de archivo fija y unicidad de adjunto. Distinguir hora de captura en dispositivo de hora de recepción/subida. Recuperar el resultado de una operación confirmada aunque se pierda su respuesta. Revisar los objetos huérfanos y duplicados existentes antes de cualquier limpieza, conservando evidencia válida.

**Aceptación:** diez reenvíos producen un objeto y un adjunto; una foto tomada horas antes conserva su hora original identificada como hora del dispositivo. Un fallo en el recálculo de avance no duplica la evidencia. **Dependencias:** A01, A03 patrón transaccional.

### F02 Dominio e integraciones

**A03 Creación transaccional de ITR — Prioridad alta — P1 E1.2**

Crear ITR, asignaciones y eventos mediante una operación transaccional e idempotente. Validar todas las personas, membresías, capacidades y elegibilidad vigentes. Repetir una solicitud ya confirmada devuelve el registro original.

**Aceptación:** el fallo de cualquier asignación deja cero ITR nuevos; solicitudes concurrentes/repetidas no producen revisiones adicionales no solicitadas. **Dependencias:** A13; coordinar eventos con A04.

**A04 Un único origen por evento de negocio — Prioridad alta — P1 E1.2**

Eliminar la doble emisión entre API y triggers en creación de tags, ITR y punches. Definir productor canónico y transmitir contexto de API, actor y origen. Distinguir eventos técnicos de solicitudes de los hechos de negocio. Mantener deduplicación de entregas y consecuencias en consumidores.

**Aceptación:** una operación por UI, API o importación produce el contrato previsto y una consecuencia de negocio, incluso con reentregas. **Dependencias:** A13; alimenta A09, A22 y A30.

**A05 Validación de entrada en runtime — Prioridad media — P1 E1.2**

Aplicar esquemas a cuerpos HTTP y entradas de acciones relevantes, utilizando Zod donde encaje. Verificar tipos, UUID, colecciones, tamaños y formatos antes de operar. Responder de forma uniforme con 400/422 ante entradas inválidas.

**Aceptación:** `null`, arrays inesperados, números, `format: [1]`, campos incorrectos y cargas excesivas no provocan excepciones no controladas. **Dependencias:** A13.

### F03 Acceso y gobierno técnico

**A06 Membresías por proyecto y alcance — P1 empresarial — P3 E3.1**

Evolucionar desde acceso por organización a permisos por proyecto y, donde el contrato lo requiera, empresa o alcance. Mantener la separación entre rol de acceso y capacidad de firma. Aplicar el modelo a RLS, RPC, Storage, búsqueda, API y exportaciones; el menú solo refleja los permisos.

**Aceptación:** un cliente de un proyecto no accede a otro por ninguna vía; los roles y capacidades conservan las restricciones previstas. Migración de usuarios existentes ensayada y auditada. **Dependencias:** A13, A28 mapa de dominio; revisión de alcance de A18 y A22.

**A07 Políticas de liberación versionadas — P1 para criticidad — P3 E3.2**

Definir por proyecto y criticidad el tratamiento de ITR requeridos sin generar, Cat A nuevos, dependencias en regresión y aprobación con condiciones. Congelar baselines de alcance y versiones de política. Registrar excepciones y sus autorizaciones. Reevaluar prerrequisitos antes de una acción operativa crítica, conservando la historia de aprobaciones previas.

**Aceptación:** cambiar configuración no reinterpreta silenciosamente decisiones anteriores; se distingue aprobación histórica de vigencia actual. Un caso con regresión muestra su efecto y la autoridad necesaria para resolverlo. **Dependencias:** A08, A09 y participación de especialista de dominio; se completa antes de A35.

**A08 Contrato de estados de aseguramiento — P1 de producto — P2 E2.1 y P3**

Definir cobertura del alcance, diligenciamiento, aceptación técnica, revisión independiente, liberación vigente y entrega aceptada. Precisar actores y evidencia exigidos en cada transición. Mantener firmas independientes y verificar capacidad/competencia según el uso previsto.

**Aceptación:** pantallas, API, PDF y reportes no equiparan «completado» con «aprobado», ni un hash con completitud. Los estados tienen definición compartida y pruebas de transición. **Dependencias:** análisis de dominio; precede a A22, A25 y A10 final.

### F04 Auditoría y entrega

**A09 Historial durable y unificado — Prioridad alta — P3 E3.2**

Separar eventos de integración, logs técnicos y auditoría de aseguramiento. Unificar la consulta de `domain_events` y `activity_log` donde corresponda, identificando su procedencia. Corregir el manejo de errores de `logActivity`; las decisiones críticas y su auditoría deben ser atómicas. Definir retención por contrato/proyecto en lugar de depender del borrado de eventos despachados a 365 días. Distinguir registros declarados por usuarios de transiciones verificadas por el sistema.

**Aceptación:** reconstruir actor, capacidad, motivo, versión, evidencia y revocaciones de una decisión histórica, incluso después de la limpieza de eventos de integración. **Dependencias:** A04, A08, A14.

**A10 Completitud formal del expediente — Prioridad alta — control en P1 E1.3 y cierre en P4**

Separar exportación parcial, expediente completo y entrega aceptada. Definir anexos obligatorios según alcance. Los límites actuales de 150 PDF de ITR y 40 MB de documentos, o cualquier fallo de anexo, no deben permitir una emisión formal engañosa. Mostrar omisiones antes de descargar y aceptar el traspaso. Permitir volúmenes asociados a un manifiesto raíz.

**Aceptación:** un anexo obligatorio ausente impide el estado de expediente completo; los paquetes parciales son inequívocos en UI, API, índice y manifiesto. **Dependencias:** A08 para significado final; A11 para escala; el guard inicial no espera a A11.

**A11 Generación durable e instantáneas — P1 a escala — P4 E4.1**

Congelar alcance, referencias y versiones antes de generar JSON y anexos. Ejecutar en segundo plano con identidad de trabajo, reintentos y reanudación. Generar solo los formatos solicitados. Evitar acumular todos los binarios y ZIP en memoria; comprobar tamaños antes o durante la transferencia y emplear streaming, volúmenes o un proceso dimensionado. Tratar explícitamente solicitudes de varios sistemas o proyecto completo.

**Aceptación:** resumen y anexos corresponden a la misma base; cambios concurrentes se detectan o quedan fuera de la instantánea. Interrumpir y reanudar no altera el expediente ni duplica efectos. Memoria y tiempo medidos al volumen contractual. **Dependencias:** A02, A04, A10 contrato, A17.

**A12 Verificación histórica de firmas — Prioridad media — P3 E3.3**

Crear registro de claves públicas por `key_id`, vigencia y estado; permitir recuperación histórica. Incluir clave pública en el paquete y una vía independiente para autenticarla. Documentar rotación, revocación y custodia/recuperación de claves necesarias. La clave dentro del ZIP no constituye por sí sola una raíz de confianza.

**Aceptación:** emitir con K1, rotar a K2 y verificar el paquete K1 siguiendo instrucciones independientes de la clave actual. **Dependencias:** A09, A14.

### F05 Calidad y operación

**A13 CI y pruebas de flujos críticos — Prioridad alta — desde P0 E0.2 hasta P5**

Crear BD efímera con dos organizaciones, varios proyectos, todos los roles y fixtures propios. Transmitir los actores que requiere la matriz; fallar si faltan actores críticos. Probar lectura, escritura, RPC y Storage por rol, organización, proyecto y estado. Ampliar E2E desde el recorrido offline actual hasta firma, rechazo, reapertura, liberación y entrega. Incluir fallos de red, auditoría, concurrencia y reintentos.

**Aceptación:** cero omisiones en suites críticas y despliegue bloqueado por fallos. Los tests no necesitan escribir en producción. Cada defecto corregido tiene una prueba que distingue el comportamiento anterior del nuevo. **Dependencias:** ninguna para comenzar; se amplía con cada acción.

**A14 Recuperación completa — P1 empresarial — P3 E3.3**

Definir RPO, pérdida máxima de datos aceptada, y RTO, tiempo máximo de recuperación. Respaldar y restaurar base, objetos de Storage y material necesario para verificar entregables. Comprobar correspondencia entre metadatos y binarios, y conservar un procedimiento de restauración ensayado.

**Aceptación:** restaurar en ambiente separado y abrir/verificar fotos, planos, certificados y paquetes; medir RPO/RTO frente a objetivos acordados. El backup de tablas por sí solo no satisface el criterio. **Dependencias:** alcance contractual de P0 y A09/A12 para historial y claves.

**A15 Observabilidad accionable — P1 operativo — P3 E3.3**

Establecer métricas y alertas de antigüedad de colas, capturas rechazadas, cron atrasado, webhooks abandonados y handovers fallidos/incompletos. Definir objetivos de servicio y quién responde. Vincular incidentes con operación, proyecto y evidencia, sin exponer datos innecesarios.

**Aceptación:** fallos inducidos activan avisos útiles y un procedimiento de recuperación; un estado desconocido o desactualizado no se presenta como saludable. **Dependencias:** A01, A04, A10; alimenta A23.

**A16 Un camino de despliegue controlado — Prioridad alta — P1 E1.3**

Verificar si Workers Builds u otra integración puede desplegar evitando CI. Consolidar el camino autorizado, checks, migraciones y procedimiento de reversión/compensación. La existencia actual de una vía alternativa debe comprobarse, no asumirse desde una nota histórica.

**Aceptación:** una revisión con CI crítica fallida no llega a producción por ninguna vía habilitada. Se conserva evidencia del artefacto, esquema y comprobaciones del release. **Dependencias:** A13.

**A17 Capacidad y límites medidos — P1 a escala — P0 E0.3 y P4 E4.3**

Definir volumen y concurrencia de referencia; medir navegación, consultas, dependencias entre sistemas, generación documental y sincronización masiva. Registrar percentiles, memoria, errores y tamaño del artefacto. Separar tamaño del bundle de memoria en ejecución y latencia de usuario.

**Aceptación:** pruebas representativas cumplen objetivos acordados o producen límites explícitos del producto. Cada aumento de alcance tiene evidencia de capacidad. **Dependencias:** escenario de P0; cierre con A11 y A28.

### F06 Navegación y contexto

**A18 Cabecera persistente de alcance — P1 UX — P2 E2.1–E2.3**

Mostrar proyecto y contexto en escritorio y móvil sin abrir el menú. Mostrar «Todos los proyectos» u «Organización» en pantallas globales. Distinguir último proyecto visitado de alcance activo. Conservar selector, búsqueda y creación contextual. El cambio de proyecto debe tener un resultado predecible y visible.

**Aceptación:** entrar desde notificación o URL directa permite identificar el alcance; el teléfono conserva el contexto aunque oculte las migas largas. Probar nombres largos y cambio de organización. **Dependencias:** A06 modelo de alcance; puede diseñarse antes de su implantación.

**A19 Módulos y fases como dimensiones separadas — P1 UX — P2 E2.1**

Mantener acceso estable a equipos, ITR, Punch, documentos y liberaciones. No asignar visualmente ITR o Punch a una única fase industrial. Incorporar contexto/filtro de fase y estado del sistema como dimensiones distintas. No representar un proyecto con sistemas en paralelo mediante una falsa fase única. La actividad reciente puede orientar la apertura del menú, pero no definir la fase técnica.

**Aceptación:** el mismo módulo permite identificar su fase real o «Todas las fases»; los roles no reciben interpretaciones incompatibles. Los filtros y enlaces conservan contexto. **Dependencias:** A08, A18.

**A20 Identidad del registro y rutas comprensibles — P2 UX — P2 E2.2**

Usar códigos/nombres concretos de sistema, tag e ITR en cabecera y migas donde sean útiles, en lugar de depender de «Tag» o «ITR» genéricos. Mantener rutas de retorno claras y coherencia entre menú, título, ayuda y traducciones. El contexto de fase proviene del registro o filtro, no de una inferencia de su URL.

**Aceptación:** el usuario identifica qué registro está modificando y cómo volver a su lista con el alcance esperado. En móvil se prioriza el contexto esencial sin truncarlo hasta hacerlo ambiguo. **Dependencias:** A18–A19.

**A21 Menú por tareas y roles — P2 UX — P2 E2.2–E2.3**

Conservar «Mi trabajo», escaneo, búsqueda, creación y administración plegada. Organizar la navegación en Mi trabajo (pendientes/asignados/escaneo), Proyecto (Resumen, Liberación de sistemas, fases como contexto, preservación, registros de campo y módulos), Portafolio (proyectos, indicadores entre proyectos y postentrega) y Administración (usuarios, plantillas, fases, auditoría e integraciones según capacidades autorizadas). Evitar niveles innecesarios. La barra superior mantiene proyecto activo o ámbito global, búsqueda ⌘K, notificaciones, crear y usuario. Evaluar en móvil Mi trabajo · Escanear · Crear · Menú como propuesta, conservando el contexto y comprobando acceso a las tareas más frecuentes. Revisar «Más…», agrupaciones y densidad con usuarios de cada rol. Las diferencias de audiencia no deben esconder el alcance ni impedir descubrir una obligación importante. Reducir navegación innecesaria sin debilitar comprobaciones de permisos.

**Aceptación:** inspector, líder y cliente completan recorridos previstos sin aprender la estructura interna del software. Gerencia localiza decisiones y bloqueos sin recorrer todos los módulos. **Dependencias:** A18–A20; validación A33.

### F07 Riesgos y decisiones

**A22 Acceso permanente a bloqueos — P1 UX y dominio — P2 E2.1–E2.3**

Añadir una franja compacta del proyecto con Cat A abiertos, sistemas bloqueados y liberaciones en regresión; cada indicador abre su lista filtrada. Definir aparte «sistema en riesgo de incumplimiento», considerando compromisos, dependencias y condiciones. Evitar contar el mismo sistema varias veces sin explicarlo. Conservar el tablero detallado del Resumen.

**Aceptación:** desde una pantalla de trabajo se llega en un acceso a la lista pertinente; cada cifra tiene alcance, definición y correspondencia con la lista. Un bloqueo técnico no se etiqueta automáticamente como riesgo de plazo. **Dependencias:** A08, A18, A04; política vigente de A07.

**A23 Relevancia y vigencia de las alertas — P1 UX — P2 E2.3 y P3**

Priorizar para campo los bloqueos del sistema/trabajo asignado y para gerencia los del proyecto. Mostrar actualización y condición offline/desactualizada. Reservar avisos intrusivos para situaciones que los justifiquen y mantener lo demás accesible sin saturar la pantalla.

**Aceptación:** una cifra cacheada no parece actual; ausencia de datos no aparece como cero riesgos. La alerta explica qué ocurre, dónde y qué acción permite resolverlo. **Dependencias:** A22, A15 y A01.

### F08 Identidad y accesibilidad

**A24 Conservar y ordenar la marca — P2 visual — P2 E2.2**

Mantener navy `#12304A`, navy oscuro `#0B1F33` y naranja `#F47A20`. Usar navy en estructura, naranja con moderación para acento/selección y superficies neutras para contenido. Aplicar una jerarquía consistente de títulos, datos, acciones y avisos. La expansión cromática debe responder a un significado, no a decoración por módulo.

**Aceptación:** las maquetas y componentes conservan reconocimiento de CommUp y una lectura clara, con foco en contenido y decisiones. **Dependencias:** A18–A22.

**A25 Paleta semántica de estados — P1 de comprensión — P2 E2.2**

Normalizar azul para información/trabajo en curso; neutro o azul para revisión pendiente; verde para aceptación/verificación/liberación; ámbar para condiciones; rojo para bloqueo crítico/rechazo/fallo; gris para inactivo/no iniciado. Eliminar el rojo de contadores de obligaciones normales. Revisar verde de ITR completado y violeta de aprobado/resuelto contra el contrato A08. Mantener textos e iconos: ningún significado depende solo del color.

**Aceptación:** el usuario distingue diligenciado, aprobado, pendiente y bloqueado en todas las familias de registros. La fase se reconoce por nombre y ubicación, sin consumir colores de alarma. **Dependencias:** A08, A24.

**A26 Contraste y legibilidad — P2 accesibilidad — P2 E2.3**

Corregir combinaciones detectadas: naranja sobre blanco ≈2,74:1, blanco sobre rojo `#EF4444` ≈3,76:1 y gris `#64748B` sobre navy oscuro ≈3,51:1. No usar esos pares para texto pequeño informativo sin ajuste. Mantener el buen contraste navy/blanco ≈13,57:1. Revisar rótulos de 10–12 px, foco, controles y objetivos táctiles en contexto de campo.

**Aceptación:** texto normal alcanza al menos 4,5:1 según WCAG, salvo excepciones aplicables; contraste de componentes y estados se verifica según su criterio correspondiente. Validar temas claro, oscuro y contraste, teclado y pantallas reales. Los cálculos de tokens no equivalen por sí solos a una auditoría completa. **Dependencias:** A24–A25.

**A27 Validación visual y consistencia — Prioridad media — P2 E2.3 y P5 E5.1**

Revisar cabeceras, tablas, listas, fichas, diálogos y exportaciones relevantes con una jerarquía común. Verificar resolución pequeña, zoom, nombres largos, estados vacíos/error/carga y tema visual. Mantener consistencia entre etiquetas ES/EN, manual y ayuda contextual; regenerar la ayuda cuando corresponda.

**Aceptación:** capturas de referencia y recorridos documentan contexto visible, alertas legibles y estados no ambiguos. **Dependencias:** A18–A26; pruebas observadas A33.

### F09 Arquitectura y analítica

**A28 Monolito modular y refactorización dirigida — Prioridad media — P0 inventario y P4 E4.2**

Mantener el stack y separar responsabilidades de identidad/acceso, configuración técnica, ejecución, aceptación, liberación, entrega e integraciones. Hacer que acciones web validen contexto y deleguen operaciones de dominio; dejar autoridad de transiciones críticas en BD. Extraer responsabilidades de componentes extensos con riesgo o cambios frecuentes, como visor P&ID, certificado e ITR, sin refactorizar solo por longitud. Actualizar documentación de arquitectura y tamaño que quedó obsoleta.

**Aceptación:** límites y responsables de módulos documentados; cambios focalizados mantienen comportamiento y reducen acoplamiento en los flujos intervenidos. No se introduce una reescritura total ni microservicios sin necesidad demostrada. **Dependencias:** A13; acompaña las correcciones, no las retrasa.

**A29 Paridad entre validación cliente y SQL — P1 de consistencia — P4 E4.2**

Usar casos de referencia compartidos para captura, aceptación, tablas, condiciones y liberaciones. El cliente anticipa el resultado offline y Postgres conserva autoridad al sincronizar. Registrar diferencias y resolverlas explícitamente.

**Aceptación:** los mismos casos producen resultados compatibles; ninguna discrepancia permite aprobación indebida ni rechazo inexplicable. **Dependencias:** A08, A13 y A07.

**A30 Pronósticos y código analítico heredado — Prioridad media — P4 E4.2**

Actualizar el consumo de eventos antiguos `itrs.*` al contrato vigente `itr.*`; corregir mezcla de pendientes totales y velocidad promedio de subsistemas. Revisar unidades, alcance y calendario. Denominar «estimación por ritmo» mientras no exista validación estadística de P50/confianza. Retirar o aislar motores sin consumidores actuales tras confirmar usos. No atribuir fallos de código dormante a tableros que no lo usan.

**Aceptación:** casos de uno/varios subsistemas, cero actividad y cambios de alcance; error retrospectivo medido antes de publicar probabilidades. **Dependencias:** A04, A13; datos de A34 para calibración futura.

**A31 Cuotas y calidad de IA — Prioridad media — P4 E4.2**

Definir si el presupuesto es aviso o límite duro. Si es duro, reservar coste/capacidad atómicamente, limitar concurrencia y reconciliar consumo; decidir comportamiento ante fallo de lectura de cuota. Conservar aceptación humana de propuestas. Evaluar con casos de ingeniería aprobados, especialmente falsos negativos y propuestas que retiran requisitos.

**Aceptación:** concurrencia no evita el control acordado; consumo registrado y reconciliado; ninguna propuesta de IA altera requisitos sin la decisión humana prevista. **Dependencias:** A13 y especialista técnico; coordinación con A08.

### F10 Adopción y aseguramiento

**A32 Configuración por complejidad — Estratégica — P5 E5.1**

Ofrecer inicio guiado, módulos opcionales y valores iniciales revisables para proyectos sencillos. En proyectos exigentes activar designaciones obligatorias, revisión independiente, evidencia mínima, excepciones y retención sobre el mismo núcleo. No debilitar conservación ni trazabilidad para simplificar la interfaz.

**Aceptación:** configurar un proyecto simple no exige dominar todos los módulos; un proyecto exigente declara sus controles antes de ejecutar. **Dependencias:** A06–A08, A18–A27.

**A33 Pruebas observadas de campo — P1 de validación — preparación P0 y P5 E5.1**

Observar inspector, líder y representante de operadora ajenos al desarrollo. Recorrer preparación de jornada, descarga offline, escaneo, revisión aplicable, medición, evidencia, desviación, cierre/reapertura de app, cambio de turno, conflictos, revisión de firma, liberación y entrega verificable fuera de CommUp. Incluir teléfonos modestos, luz intensa, guantes cuando aplique y red intermitente.

**Aceptación:** medir tiempo, errores, ayuda necesaria, trabajo repetido y recuperación. Definir objetivos después de la línea base y repetir los recorridos tras mejoras. **Dependencias:** A01–A02, A18–A27 y ambiente A13; observación inicial puede preceder a cambios.

**A34 Pilotos y evidencia de valor — Estratégica — P5 E5.2**

Elegir un segmento y tipo de proyecto para implantaciones repetibles. Medir tiempo de cierre, horas de dossier, rechazos por evidencia incompleta, capturas recuperadas y verificación por el receptor. Evaluar demanda, disposición a pagar, retención y coste de soporte con evidencia comercial, sin inferirlos del código. Priorizar funciones con un usuario concreto y necesidad demostrada.

**Aceptación:** cada piloto termina con resultados, incidencias, aceptación y una decisión de continuar/corregir; no solo una demostración de pantallas. **Dependencias:** A33 y garantías de P1/P3; capacidad acorde al piloto mediante A17.

**A35 Evolución hacia alta criticidad — Estratégica — P5 E5.3 y posterior**

Incorporar análisis de peligros, trazabilidad requisito–riesgo–prueba–evidencia, control de configuración, decisiones bajo fallos y verificación/validación independiente. Participan especialistas en comisionamiento, seguridad y aseguramiento. Determinar requisitos aplicables al caso de uso antes de prometer aptitud para seguridad de misión.

**Aceptación:** evaluación independiente y evidencia suficiente para el uso concreto. Gestionar evidencias de una campaña compleja no convierte automáticamente a CommUp en un sistema de control o protección ni acredita un lanzamiento seguro. **Dependencias:** A07–A17, A29 y resultados de A34.

## 6 Especificación de navegación y lenguaje visual

### Modelo objetivo de contexto

La cabecera muestra, según el caso: **alcance → proyecto → sistema/registro → fase aplicable**. En listas transversales puede mostrar «Todas las fases». En pantallas globales no atribuye el contenido al último proyecto visitado.

Ejemplo ilustrativo, sin datos reales:

> Proyecto Alfa ▾ · Comisionamiento · Sistema S-120  
> ITR E13C / PT-101  
> 3 Cat A abiertos · 2 sistemas bloqueados · 1 liberación en regresión  
> Actualizado hace 2 minutos

En móvil se conserva proyecto y contexto esencial en una cabecera compacta; el detalle secundario se despliega. Se evita reemplazar toda la orientación por un botón de menú. La franja crítica se adapta al rol y puede agrupar indicadores, manteniendo acceso directo y estado de vigencia.

### Gramática visual

| Significado | Tratamiento propuesto | Evitar |
|---|---|---|
| Marca y estructura | Navy, superficies neutras, naranja moderado | Convertir cada módulo en una paleta distinta |
| Selección | Acento consistente, borde/forma y etiqueta | Confundir selección con alerta |
| Trabajo en curso | Azul + texto de estado | Dar apariencia de aceptación final |
| Pendiente normal | Neutro/azul + contador | Badge rojo por cualquier obligación |
| Aceptado/verificado/liberado | Verde + estado preciso | Verde para mero diligenciamiento |
| Condición/atención | Ámbar + causa | Usar color sin explicación |
| Crítico/rechazado/fallido | Rojo + icono/etiqueta y acción | Alarmas permanentes sin prioridad |
| Fase industrial | Nombre, posición y filtro | Inferir fase por color o sección del módulo |

Esta gramática se implementa con tokens semánticos y componentes compartidos. La selección exacta de tonos se verifica sobre los fondos reales de cada tema.

## 7 Dependencias y orden práctico

| Cadena | Razón |
|---|---|
| A13 → A01–A05 → ampliación de uso | Las correcciones de integridad necesitan reproducción y regresión verificables |
| A08 → A19/A22/A25 | Menú, alertas y colores deben expresar estados definidos |
| A06 → filtrado final de A18/A22 | El contexto y los contadores deben respetar el alcance autorizado |
| A04 → A09/A22/A30 | Eventos confiables alimentan historial, indicadores y analítica |
| A10 contrato → A11 → A17 | Primero definir expediente completo, después generarlo a escala y medirlo |
| A09/A12 → ensayo A14 | Recuperación debe preservar historia, archivos y verificabilidad |
| A18–A27 → A33 → A34 | El diseño se valida en campo antes de afirmar valor comercial |
| P1–P4 y A34 → A35 | Alta criticidad exige garantías y evidencia previas |
| A45 preparación → A36/A39/A40 → A41 → A42 | Reproducir fallos, preservar reglas, homologar y después distribuir las revisiones ITR |
| A37/A38/A44 → homologación de ensayos en A41 | Parámetros, alcance y referencias deben ser verificables antes de aprobar las plantillas complejas |
| A43 + A33 → aceptación de campo de A42 | La mejora de plantilla debe demostrar utilidad en el dispositivo real |

Se puede avanzar simultáneamente en diseño y correcciones técnicas cuando no compartan una dependencia pendiente. No se debe retrasar la conservación de capturas para terminar un rediseño visual. Tampoco se debe esperar a la etapa de alta criticidad para corregir una entrega engañosamente completa.

## 8 Cobertura por fase industrial

| Fase del proyecto | Mejoras que debe percibir el usuario | Acciones relacionadas |
|---|---|---|
| Preparación y definición de alcance | Configuración guiada, permisos, requisitos y revisiones claros | A06–A08, A18–A21, A32 |
| Precomisionamiento | Evidencia recuperable, ITR consistentes, revisión y Punch visibles | A01–A05, A08, A22–A27, A29 |
| Comisionamiento | Prerrequisitos, firmas, dependencias y aceptación técnica explicados | A06–A09, A19, A22–A23, A29 |
| Puesta en operación | Vigencia de liberaciones, regresiones y condiciones antes de actuar | A07–A09, A15, A22–A23, A35 según criticidad |
| Entrega y transición a operación | Expediente completo, aceptación del receptor y verificación histórica | A09–A12, A14, A17, A34 |
| Gestión transversal | Contexto estable, trazabilidad, recuperación y métricas confiables | A13–A18, A24–A31, A33–A34 |

La tabla no obliga a mover módulos a una fase: indica dónde deben aportar valor. Sistemas distintos pueden encontrarse en fases diferentes al mismo tiempo.

## 9 Seguimiento y definición de terminado

Estado inicial de las acciones: **propuestas, pendientes de conciliación con el código y los planes vigentes**. No se marca una acción como terminada por estar documentada.

Cada acción tendrá una ficha con ID, responsable, prioridad, estado, versión base, evidencia del problema, alcance, dependencias, cambio/PR, migración si aplica, pruebas, documentación y resultado de aceptación. Estados sugeridos: propuesta, lista para ejecutar, en curso, en validación, cerrada o bloqueada con causa.

Una acción se cierra cuando su criterio de aceptación está comprobado, las regresiones relevantes pasan, se actualizan manual/ayuda/contratos afectados y se registra cualquier límite residual. Para cambios de datos o permisos, incluir ensayo de migración y recuperación. Para UX, incluir validación renderizada y, cuando aplique, observación de usuario.

| Medida | Regla de evaluación |
|---|---|
| Pérdidas de captura por rechazo | Cero en escenarios de fallo definidos |
| Duplicados por reintento | Cero efectos duplicados en casos de referencia |
| Suites críticas omitidas | Cero |
| Expedientes completos con anexo obligatorio ausente | Cero |
| Acceso fuera del alcance autorizado | Cero en matriz probada |
| Orientación | Identificar alcance y registro sin abrir el menú; medir éxito por rol/dispositivo |
| Acceso a bloqueos | Un acceso directo a la lista pertinente desde el contexto del proyecto |
| Recuperación y capacidad | Cumplir objetivos RPO/RTO, volumen y latencia definidos en P0 |
| Utilidad de campo y comercial | Comparar con línea base; no inventar mejoras antes del piloto |

Los ceros son criterios para escenarios y alcances probados, no afirmaciones de infalibilidad universal.

## 10 Matriz de cobertura de las recomendaciones

| Propuesta de origen | Destino en este plan |
|---|---|
| Hallazgo 1: descarte offline y fallo de rastro | A01 |
| Hallazgo 2: fotos duplicadas y hora de captura | A02 |
| Hallazgo 3: ITR sin asignaciones por operación parcial | A03 |
| Hallazgo 4: doble emisión API/BD | A04 |
| Hallazgo 5: handover emitido con omisiones | A10 |
| Hallazgo 6: memoria y datos vivos en handover | A11, A17 |
| Hallazgo 7: matriz de roles y E2E insuficientes | A13 |
| Hallazgo 8: auditoría fragmentada y retención | A09 |
| Hallazgo 9: claves históricas | A12 |
| Hallazgo 10: cuota aproximada de IA | A31 |
| Hallazgo 11: JSON sin validación de forma | A05 |
| Hallazgo 12: pronósticos y contratos antiguos | A30 |
| Acceso por proyecto/empresa/alcance | A06 |
| Política de liberación, Cat A, regresión y requisitos faltantes | A07 |
| Diferenciar captura, aceptación, revisión, liberación y entrega | A08, A25 |
| Mantener stack y modularizar; componentes grandes | A28 |
| Consistencia SQL/TypeScript | A29 |
| Documentación arquitectónica obsoleta | A28, sección 9 |
| Copias, Storage, claves, RPO y RTO | A14 |
| Alarmas y objetivos de servicio | A15 |
| Evitar vías de despliegue que eludan CI | A16 |
| Pruebas representativas de carga | A17 |
| Proyecto persistente, móvil y ámbito global | A18 |
| Separar módulos de fases; sistemas en paralelo | A19 |
| Migas con identidad real y enlaces directos | A20 |
| Conservar Mi trabajo, búsqueda, selector y administración plegada | A18, A21 |
| Cat A, bloqueos, regresiones y riesgos visibles | A22 |
| Datos offline, actualización y relevancia por rol | A23 |
| Conservar navy/naranja y ordenar jerarquía | A24 |
| Reservar colores según significado y no solo color | A25 |
| Contrastes medidos y tamaños pequeños | A26 |
| Verificación visual, responsive, temas y consistencia | A27 |
| Configuración simple y perfiles más exigentes | A32 |
| Recorridos reales, dispositivos y recuperación | A33 |
| IA con aceptación humana y evaluación técnica | A31 |
| Segmento, pilotos, demanda y valor medido | A34 |
| Análisis de peligros, trazabilidad e independencia | A35 |
| Conservar fortalezas y evitar reescritura sin necesidad | Secciones 1–2, A28 |
| Secuencia de 30/60/90 días y criterios de salida | Sección 4; fechas sujetas a capacidad y dependencias |
| Diagnóstico específico del CORE ITR: H1–H9, versiones y adopción por familias | F11, A36–A45 y matriz de trazabilidad de la sección 13; conserva A01–A03 para riesgos transversales |
| Recomendaciones de Grok: Control Tower, navegación, contexto visual, landing y credibilidad | F12/F13, A46–A53; A18–A27 ampliadas; cobertura detallada en sección 14.5 |

## 11 Decisiones que deben concretarse al ejecutar

Estas decisiones no impiden consolidar el documento ni reproducir defectos. Deben resolverse antes de implementar la parte que dependa de ellas:

| Decisión | Acción que la necesita |
|---|---|
| Alcance de acceso por proyecto, empresa y contrato | A06 |
| Política ante Cat A nuevo, regresión y requisitos faltantes por criticidad | A07 |
| Evidencia obligatoria y significado contractual de entrega aceptada | A08, A10 |
| Retención de historial, objetos y claves | A09, A12, A14 |
| RPO/RTO, objetivos de servicio y volumen objetivo | A14–A17 |
| Menú final, prioridad móvil y definición de sistema en riesgo | A18–A23 |
| Presupuesto IA orientativo o estricto | A31 |
| Segmento del piloto y participantes de campo | A33–A34 |
| Uso crítico concreto y requisitos aplicables | A35 |

## 12 Referencias

- Recomendaciones de Grok aportadas por el usuario en la conversación y texto adjunto: integradas críticamente en la sección 14. No se trasladan credenciales del adjunto ni se toman sus afirmaciones de acceso o comparaciones comerciales como verificaciones independientes.

- [Diagnóstico del CORE ITR](/Users/luisfer/Desarrollo/CommUp-App/docs/DIAGNOSTICO-CORE-ITR-2026-10-23.md): consulta de plantillas, comparación de revisiones y sondas que sustentan el frente F11.

- [Revisión técnica de CommUp del 23 de octubre](/Users/luisfer/Desarrollo/CommUp-App/docs/REVISION-CRITICA-COMMUP-2026-10-23.md): evidencia local y hallazgos 1–12.
- Revisión de navegación e identidad visual de esta conversación: incorporada en A18–A27 y secciones 6 y 10.
- [Plan previo de referente](/Users/luisfer/Desarrollo/CommUp-App/docs/PLAN-REFERENTE-2026-10-22.md): vocabulario y decisiones anteriores que deben conciliarse.
- [WCAG 2.2 de W3C](https://www.w3.org/TR/WCAG22/): criterios de contraste y uso de color para A25–A27.
- [Respaldos de Supabase](https://supabase.com/docs/guides/platform/backups): el respaldo de base no incluye los objetos de Storage, relevante para A14.
- [Límites de Cloudflare Workers](https://developers.cloudflare.com/workers/platform/limits/): dimensionamiento del proceso de A11/A17; verificar límites vigentes al implementar.
- [NASA Software Assurance and Software Safety Standard](https://standards.nasa.gov/standard/nasa/nasa-std-87398): referencia para dimensionar aseguramiento y validación independiente en A35; no acredita cumplimiento de CommUp ni impone automáticamente esa norma al producto.

## 13 F11 — Programa de cierre de brechas del CORE ITR

### 13.1 Objetivo y alcance

Que un ITR permita demostrar qué se probó, contra qué criterio, con qué evidencia y por qué se acepta. Se conserva el motor existente, se corrigen contradicciones y se homologan las revisiones antes de distribuirlas. **No se activan V2/V3 por su número de versión.** La revisión de plantilla, el esquema de tabla y la versión del motor son conceptos distintos.

La línea base del diagnóstico específico incluye 922 revisiones consultadas en DEMO y catálogo, comparación de los 302 códigos originales, 137 pruebas satisfactorias y tres sondas reproducidas en TypeScript y SQL con datos sintéticos. Los hallazgos no demuestran firmas incorrectas de instancias reales. La evidencia, su fecha y sus límites se conservan en el diagnóstico enlazado en la sección 12.

El frente tiene un responsable técnico ITR propuesto. Ingeniería mantiene el motor; cada especialista de disciplina valida el contenido y los criterios de su familia; calidad verifica las pruebas; producto/diseño valida la ejecución en campo. Se asignarán personas antes de iniciar cada acción.

### 13.2 Etapas y condiciones de salida

| Etapa ITR | Relación con fases generales | Trabajo | Condición para avanzar |
|---|---|---|---|
| ITR-0 Línea base | P0 E0.1–E0.3 | A45: inventario vigente, casos reproducibles, responsables y entorno aislado | Diferencias identificadas por organización/código/revisión; pruebas críticas ejecutables |
| ITR-1 Coherencia y conservación | P1 E1.1–E1.3 | A36, A39, A40 y coordinación con A01–A03 | Contradicciones detectadas, requisitos conservados al copiar, capturas recuperables y operaciones atómicas verificadas |
| ITR-2 Referencias homologadas | P3 E3.2; A43 acompaña P2 E2.1–E2.3 | A37, A38, A41 y A44; seis referencias técnicas | Cobertura, alcance, criterios y evidencia aprobados; recorridos completos pasan en el alcance de cada referencia |
| ITR-3 Extensión por familias | P3–P4 | A41/A42 para cada lote; corregir hallazgos de revisión técnica | Cada candidata tiene ficha de homologación y comparación con la revisión activa |
| ITR-4 Activación y campo | P5 E5.1, sin esperar etapas ajenas al lote | A42/A43/A45 junto con A33 | Activación trazable, copia equivalente, históricos preservados, aceptación del inspector/revisor/receptor |

Las etapas se aplican por lote: una familia lista puede avanzar mientras otra resuelve criterios. Los defectos de ITR ya activos se atienden en ITR-1; no esperan la migración del catálogo. No se fijan jornadas sin conocer capacidad y criterios de ingeniería pendientes.

### 13.3 Acciones incorporadas

**A36 Coherencia entre respuestas y aceptación — Prioridad alta — P1 E1.3 / ITR-1**

**Responsable propuesto:** ingeniería de dominio y especialista en instrumentación/control. Corregir el caso de I30C V3 «Ejecutó la acción: No» con resultado conforme. Definir explícitamente qué columnas son descriptivas y cuáles deciden aceptación; el texto traducido no debe determinar el resultado. Clasificar las 94 tablas de las últimas revisiones que contienen alguna columna de resultado opcional y exigir decisión cuando la tabla acredita un ensayo. Revisar resultados agregados y la relación entre «decisión del inspector» y firma nativa para evitar decisiones contradictorias.

**Aceptación:** la contradicción de I30C se rechaza o queda pendiente de resolución; una matriz de aceptación no se completa sin el resultado requerido; las tablas informativas siguen admitiendo ausencia de resultado cuando esté justificada. N/A requiere la justificación y autorización definidas. Los casos de referencia producen decisiones coherentes en TS y SQL. **Dependencias:** A45 preparación y A08; coordinar A29. **Entregable:** reglas corregidas y clasificación documentada de las 94 tablas.

**A37 Criterios y cálculo de ensayos — Prioridad alta — P3 E3.2 / ITR-2**

**Responsable propuesto:** especialista de disciplina y backend. Configurar I10A y las familias pertinentes con desviación calculada, resultado automático, unidades y base del error explícitas. Resolver rango, span, tolerancia, transferencia y criterio desde ingeniería/procedimiento aprobado, con fuente y revisión; conservar los parámetros utilizados por la instancia. Separar as found de as left sin sobrescribir el resultado inicial. Revisar I05A/I11A, P03A y E32A según su ensayo.

**Aceptación:** el caso de salida esperada 12, observada 99 y error declarado 0 no puede presentarse como cálculo verificado; se recalcula o se señala que falta criterio. Se prueban límites exactos, fuera de tolerancia, unidades incompatibles, referencia cero cuando corresponda y criterio ausente. As found fuera de tolerancia se conserva y la decisión final sigue el procedimiento y el resultado as left. No se utiliza un span o tolerancia de ejemplo como valor universal. **Dependencias:** A08, A29 y criterios de ingeniería; A44 para referencias. **Entregable:** ficha de parámetros por familia y plantillas de ensayo configuradas y probadas.

**A38 Concordancia del alcance ejecutado con ingeniería — Prioridad alta — P3 E3.2 / ITR-2**

**Responsable propuesto:** especialista de disciplina e ingeniería de datos. Vincular conductores/pares/pantallas y terminales de I01A al listado maestro o a un alcance aprobado. Comparar cantidad declarada en D.4 con la continuidad. Definir puntos, secuencia y ciclos de calibración por procedimiento. Mantener las filas derivadas de señales y efectos en I29C/I30C; identificar cambios posteriores de ingeniería y su efecto sobre la prueba.

**Aceptación:** probar un conductor no satisface un alcance que exige varios; no desaparecen pantallas ni puntos requeridos por reducir la cantidad capturada. Una discrepancia queda visible y necesita resolución trazable. Cuando no exista ingeniería estructurada, el alcance manual debe quedar identificado, revisado y congelado según la política acordada. **Dependencias:** A37 y A44; coordinar A07. **Entregable:** reglas de cobertura y casos de cantidad/identidad/secuencia para cada familia.

**A39 Equipos de prueba y requisitos de firma — Prioridad alta — P1 E1.3 / ITR-1**

**Responsable propuesto:** metrología/especialista de disciplina y backend. Revisar los 27 códigos cuya última revisión desactiva `requires_test_equipment`, decidir y documentar cada diferencia. Integrar I10A con el control nativo del patrón; eliminar la captura duplicada de I01A donde exista información nativa suficiente. Definir firmas por alcance/contrato sin imponer tres roles a todos los casos. Conservar el requisito aplicable a cada instancia y evaluar explícitamente el efecto de cambios posteriores en políticas de equipo.

**Aceptación:** cada uno de los 27 cambios tiene una decisión técnica; ningún requisito se pierde por actualizar. Un equipo fuera de vigencia en la fecha de uso o ausente cuando es obligatorio impide firma. Los datos maestros y certificado usados quedan trazables. Los roles requeridos se conservan y una persona no cubre dos firmas del mismo ITR. **Dependencias:** A08 y A45; A40 para distribución. **Entregable:** matriz revisada de equipos/firmas y configuración nativa de las referencias.

**A40 Importación y actualización sin degradar requisitos — Prioridad alta — P1 E1.2 / ITR-1**

**Responsable propuesto:** backend y base de datos. Unificar pantalla y scripts de distribución en un recorrido transaccional que conserve firmas, equipo de prueba, condiciones, matriz y procedencia. Incluir metadatos relevantes en la comparación de equivalencia; no marcar «al día» solo porque coinciden secciones e ítems. Comprobar errores al remapear condiciones. Revisar las copias existentes para detectar diferencias; proponer reconciliación sin reescribir silenciosamente instancias usadas.

**Aceptación:** el fallo de cualquier paso no deja una plantilla nueva activa y parcial; reintentar no duplica revisiones; una diferencia solo en firmas/equipo se detecta; la copia final conserva todos los requisitos y relaciones previstos. Se ensayan concurrencia y fallos entre pasos. **Dependencias:** A13/A45 y decisiones A39; aprovecha la RPC existente tras verificar su cobertura completa. **Entregable:** vía única verificada, comparación ampliada e informe de discrepancias entre copias.

**A41 Homologación técnica antes de publicación — Prioridad alta — P3 E3.2 / ITR-2 e ITR-3**

**Responsable propuesto:** responsable técnico ITR, especialistas de disciplina y calidad. Establecer una ficha por plantilla con fuente, cobertura por control, cambios frente a revisión activa, parámetros, evidencia, prerrequisitos y responsable técnico. Diferenciar errores que bloquean publicación, advertencias y decisiones pendientes. Revisar numeración, traducción, unidades, condiciones, resultados neutrales, fotos/documentos y controles originales eliminados o agrupados.

**Aceptación:** ninguna candidata del lote se considera homologada solo por pasar el validador JSON. Cada control original tiene correspondencia o una decisión documentada; cada decisión de aceptación tiene efecto definido. La publicación verifica el estado de homologación acordado y muestra pendientes. Se prueban I04A/I06A, I01A, I10A, I29C e I30C como referencias. **Dependencias:** A36–A40 y A44 según la familia. **Entregable:** seis fichas de referencia y registro de homologación del catálogo.

**A42 Adopción de V2/V3 por familias y organizaciones — Prioridad alta — P3–P5 / ITR-3 e ITR-4**

**Responsable propuesto:** responsable técnico ITR y administración del catálogo. Migrar listas, continuidad, calibración, aislamiento, presión/fuga, alineación/torque/vibración, lazos y C&E por lotes homologados. Conciliar los 302 códigos originales y definir el alcance de plantillas adicionales; resolver M13B pendiente de catálogo. Registrar qué cambia en cada organización, porque sus números de versión no son equivalentes. Mantener instancias históricas en su revisión.

**Aceptación:** cada activación tiene ficha, diferencia aprobada y verificación de matriz; las nuevas asignaciones usan la revisión prevista. La distribución conserva requisitos y procedencia. Volver a seleccionar una revisión anterior para nuevas instancias no altera respuestas/firmas históricas. Se observa un lote real y se documentan problemas residuales antes de ampliarlo. **Dependencias:** A40, A41 y A45; A01–A03 para ampliar uso de campo. **Entregable:** registro de lotes, activaciones y verificaciones por organización.

**A43 Ejecución ITR clara en móvil y escritorio — Prioridad media — P2 E2.1–E2.3 / ITR-2 e ITR-4**

**Responsable propuesto:** diseño de producto y frontend con inspectores/revisores. Mantener proyecto, sistema, objeto probado, código/revisión y sincronización visibles. Separar diligenciado, conforme y aprobado; presentar una lista directa de faltantes/rechazos. Evaluar captura móvil por punto/conductor/efecto para tablas amplias, conservando matriz para revisión. Simplificar campos duplicados y definir evidencia por necesidad técnica, no por volumen de fotos.

**Aceptación:** el inspector identifica contexto y qué falta sin recorrer toda la pantalla; un 100 % diligenciado con rechazo no parece aprobado. Puede capturar y revisar una matriz representativa en teléfono, con teclado/táctil y estados offline claros. El revisor identifica N/A, fallos, cambios y soportes. Se mide tiempo, errores y ayuda requerida contra línea base, sin prometer mejoras antes de observarlas. **Dependencias:** A08, A18–A27 y A44; coordinar A33. **Entregable:** flujo validado y medición de campo.

**A44 Datos y referencias nativas con historia — Prioridad alta — P3 E3.2 / ITR-2**

**Responsable propuesto:** ingeniería de datos y control documental. Reutilizar identidad y datos del tag, equipos de prueba y documentos nativos en lugar de recrearlos como texto libre. Distinguir dato de ingeniería, dato observado y modificación de la prueba. Conservar identificación/revisión y valores utilizados por la instancia; hacer visible una referencia superada o una discrepancia de placa. Integrar datos maestros con A37/A38 sin cambiar retrospectivamente evidencia ejecutada.

**Aceptación:** cambiar hoy el maestro no reescribe lo que se probó y firmó antes; el documento/procedimiento usado es identificable y una revisión superada se trata según la regla vigente. Los datos faltantes no se completan con supuestos silenciosos; una diferencia observada tiene resolución trazable. **Dependencias:** A09, A37–A39 en coordinación. **Entregable:** contrato de datos/referencias y eliminación controlada de duplicaciones.

**A45 Verificación integral y evidencia de cierre ITR — Prioridad alta — P0 y cada salida / ITR-0–ITR-4**

**Responsable propuesto:** calidad con ingeniería y especialistas de disciplina. Extender A13/A29 con casos de referencia compartidos: captura conforme, rechazo, N/A, condiciones, cardinalidad, límites, contradicciones, documentos/fotos ausentes, equipo vencido, roles, revisión de plantilla, importación, cortes/reintentos y exportación. La preparación comienza antes de corregir; la aceptación final se repite sobre cada lote candidato, no sobre producción mediante escrituras experimentales.

**Aceptación:** los casos críticos ejecutan sin omisiones en entorno aislado; TS y SQL coinciden en el resultado esperado, y ese resultado está validado por dominio. Se demuestra que los ITR existentes conservan respuestas/firmas; PDF y vista de campo contienen las mismas referencias, lecturas y decisiones. Calidad archiva resultados y límites. **Dependencias:** A13/A29 para infraestructura; las acciones correctivas correspondientes para cierre. **Entregable:** matriz de pruebas, evidencia por lote y acta de aceptación. Que ambas implementaciones coincidan no basta si ambas aceptan una contradicción.

### 13.4 Trazabilidad del diagnóstico a acciones

| Brecha o recomendación | Acción responsable de cierre | Evidencia mínima |
|---|---|---|
| H1: I30C con acción no ejecutada y resultado conforme | A36 | Caso contradictorio bloqueado en TS/SQL y recorrido de captura |
| H2: error manual incoherente en I10A | A37 | Cálculo, criterio y pruebas de límites con fuente real |
| H3: 94 tablas con resultado opcional | A36/A41 | Clasificación de cada tabla y regla comprobada |
| H4: 27 cambios en equipo requerido; patrón de I10A | A39 | Decisiones por código y ensayos de vigencia/ausencia |
| H5: importación omite requisitos y permite copia parcial | A40 | Pruebas de fallos, equivalencia, reintento y discrepancias existentes |
| H6: continuidad y alcance autodeclarado | A38 | Pruebas de cantidades/identidades discrepantes |
| H7: as found/as left sin semántica suficiente | A37 | Evidencia inicial preservada y aceptación final correcta |
| H8: activación sin homologación técnica completa | A41 | Fichas, cobertura y control de publicación |
| H9: pérdida offline, duplicados y creación parcial | A01–A03 con A45 | Regresiones de fallos y recuperación; no se duplica ese trabajo |
| Biblioteca rezagada y adopción de V2/V3 | A42 | Lotes homologados, revisión correcta y trazabilidad por organización |
| Duplicación de datos, referencias y equipo patrón | A39/A44 | Fuentes nativas e historia preservada |
| Tablas amplias, contexto y estados en campo | A43 con A33 | Validación en dispositivos y observación de usuarios |
| I29C: lecturas/unidades por señal; I30C: tiempos y restauración | A37/A38/A41 | Criterios de procedimiento y alcance documentados |
| Numeración, traducción y política proporcionada de evidencia | A41/A43 | Revisión de contenido y recorrido de campo |

### 13.5 Qué significa cerrar las brechas

El frente se considera cerrado para un lote cuando las correcciones aplicables están verificadas, cada plantilla está homologada, su copia conserva requisitos, las instancias existentes permanecen íntegras y el recorrido real de captura/revisión/firma/exportación ha sido aceptado. El cierre de seis referencias no equivale al cierre de todo el catálogo.

El seguimiento distinguirá: códigos inventariados, candidatos corregidos, homologados, activados y validados en campo; tablas revisadas de las 94; decisiones resueltas de las 27; discrepancias de copias detectadas/resueltas; pruebas críticas ejecutadas/omitidas; defectos y riesgos pendientes. No se contará «borrador creado» como «ITR listo».

Para criterios dependientes de ingeniería, primero se prepara la ficha de valores y fuentes faltantes. La decisión técnica se solicita sobre ese resultado concreto. Las correcciones objetivas de coherencia, transacción y conservación pueden avanzar sin esperar a definir todas las tolerancias del catálogo.

## 14 Recomendaciones incorporadas de Grok: Control Tower y credibilidad

### 14.1 Dirección de producto

CommUp debe permitir que un Commissioning Lead o Project Manager identifique rápidamente la situación del proyecto y decida dónde intervenir. La apariencia industrial se construye con jerarquía, información verificable y acciones claras. El objetivo de **15 segundos** se incorpora como prueba de usabilidad, no como desempeño ya demostrado.

La Control Tower será una evolución del **Resumen del proyecto**, coordinada con Liberación de sistemas; no se crea otro tablero paralelo con cifras incompatibles. Se aprovechan los indicadores, bloqueos y look-ahead existentes antes de construir componentes nuevos. La landing, el producto y los materiales de demostración compartirán lenguaje visual, manteniendo distintas prioridades de uso.

Se adopta navy profundo/charcoal, grises fríos, tipografía clara, sombras suaves y decoración contenida. El oscuro será una presentación de referencia para la vista de control, con tema claro y preferencia del usuario para campo. No se afirma que oscuro reduzca siempre la fatiga. Naranja conserva marca y acción principal; rojo indica bloqueo/rechazo; ámbar advertencia; azul progreso/información; verde aceptación o condición favorable explícitamente etiquetada. Cumplimiento de cronograma y autorización técnica son dimensiones separadas. Ningún estado se comunica únicamente por color.

Los tres conceptos visuales propuestos —hero industrial, Control Tower sobria y flujo con activos 3D— se incorporan como entregables de diseño. Las imágenes de esos bocetos no estuvieron disponibles en el material revisado; sus composiciones concretas deberán diseñarse y validarse.

### 14.2 Acciones incorporadas

**A46 Resumen del proyecto como Control Tower — Prioridad alta de producto — P2 E2.1–E2.3**

**Responsable propuesto:** producto y diseño con Commissioning Lead. Organizar la pantalla en contexto persistente, bloqueadores del día, pocos indicadores prioritarios, preparación por sistema, compromisos próximos y actividad relevante. Dar peso a Cat A abiertos, sistemas bloqueados y liberaciones regresadas; mostrar causa, responsable y acceso a resolución. Usar tarjetas de tamaño proporcionado: destacar tres o cuatro decisiones sin desplazar la matriz. Agrupar información densa y reducir texto repetido y gráficos decorativos. Cada cifra tendrá definición, alcance, fecha de actualización y acceso a su detalle cuando corresponda.

**Aceptación:** en una prueba con datos representativos, el líder identifica en 15 segundos qué impide liberar/arrancar, qué sistemas requieren intervención, qué compromiso está amenazado y quién debe actuar. Se documentan aciertos, errores y casos sin información suficiente; si no se alcanza el objetivo, se ajusta y repite. Los bloqueos abren listas filtradas coherentes, con permisos aplicados. Cero bloqueos conocidos no se presenta como autorización para arrancar. **Dependencias:** A08, A18–A23, A50 y reglas del CORE ITR; coordinar A27/A33. **Entregable:** pantalla diseñada, implementada y validada con el protocolo de 15 segundos.

**A47 Matriz de preparación por sistema y fase — Prioridad alta de dominio — P2 diseño y P3 reglas**

**Responsable propuesto:** ingeniería de dominio y diseño con especialistas de comisionamiento. Hacer de la matriz el componente central para el líder. Mostrar sistema, fase o hito evaluado, estado de preparación, causas de bloqueo, ITR requeridos/aprobados, Cat A, responsable y compromiso. Representar sistemas que avanzan en paralelo, sin una fase global ficticia. Diferenciar sin información suficiente, en ejecución, pendiente de revisión, bloqueado, liberado y liberación regresada. Conservar progreso por fase con denominador, significado y etiquetas; no confundir captura con aprobación ni avance físico con preparación técnica.

**Aceptación:** cada celda abre el desglose que explica su estado y concuerda con requisitos/instancias vigentes. Una fila con evidencias faltantes no aparece liberada; alcance desconocido no equivale a 0 pendientes. Revisión y regeneración del estado respetan políticas versionadas y permisos. Cronograma y aceptación técnica se muestran separados. **Dependencias:** A07–A08, A22 y A36–A45 según datos utilizados; A46 para composición. **Entregable:** contrato de estados/denominadores, matriz interactiva y casos de referencia.

**A48 Actividad relevante y próximos siete días — Prioridad media — P2 E2.3 y P3; analítica P4 si aplica**

**Responsable propuesto:** producto e ingeniería de eventos/planificación. Priorizar ITR firmados/rechazados, Punch críticos, regresiones y cambios que requieren decisión. Incorporar filtros por rol/sistema y acceso al registro; evitar un feed de eventos menores que compita con los bloqueadores. Para el look-ahead, mostrar compromisos de siete días, responsable, prerrequisitos, bloqueos y efecto sobre el hito. Distinguir actividad histórica, agenda comprometida y estimación de riesgo; no presentar un calendario como predicción validada. Aprovechar componentes existentes.

**Aceptación:** eventos no se duplican lógicamente, tienen hora y enlace correctos, y respetan acceso. Se muestra antigüedad, sincronización pendiente y degradación del servicio; «en vivo» solo se usa si la implementación ofrece y verifica esa actualización. El look-ahead explica por qué un compromiso está amenazado o que no hay información para evaluarlo. Los estados de carga/error no parecen ausencia de problemas. **Dependencias:** A04, A15, A23, A30 si se añaden estimaciones y A50. **Entregable:** feed priorizado, agenda de siete días y reglas de riesgo documentadas.

**A49 Contexto espacial y lenguaje visual industrial — Prioridad media — P2 E2.2–E2.3 y P4 E4.3**

**Responsable propuesto:** diseño y frontend/visualización. Aplicar la identidad refinada a Resumen, Liberación de sistemas, fichas y Digital Twin. Integrar plano, P&ID, isométrico o activos 3D cuando permitan localizar un sistema/tag, filtrar estado o acceder a evidencia. Ofrecer panel plegable en escritorio y vista dedicada en móvil; la matriz sigue disponible sin el recurso visual. Usar los activos existentes cuando representen correctamente el equipo y su propósito. Evitar efectos dramáticos, sombras fuertes y animaciones que distraigan de alarmas.

**Aceptación:** seleccionar un activo abre el registro correcto; filtros y leyenda coinciden con la matriz. Una ilustración genérica se identifica como tal y no simula posición física o telemetría real. La ausencia del plano no impide operar. Se verifican contraste, teclado, selección táctil, temas y rendimiento en dispositivos objetivo; se fija presupuesto de carga antes de elegir complejidad 3D. **Dependencias:** A24–A27, A17, A46–A47 y datos espaciales disponibles. **Entregable:** contexto visual funcional y guía de aplicación de identidad, con alternativa ligera.

**A50 Demostración realista y recorridos verificables — Prioridad alta de validación — P0 preparación y P2/P5 validación**

**Responsable propuesto:** producto y calidad con especialistas de disciplina. Preparar un proyecto de demostración aislado, reproducible y claramente identificado, con sistemas, tags, señales, plantillas, ITR en distintos estados, Punch A/B, documentos y liberaciones. Incluir casos saludables, bloqueados, regresados, sin información y con datos pendientes de sincronizar. Preparar recorridos de ejecución ITR, fotos/documentos, firma, bloqueo de liberación, cierre permitido y revisión de evidencia. Cubrir los roles inspector, líder, cliente y gerente; usar datos sintéticos o autorizados. Conservar estados vacíos útiles con acciones de crear/importar.

**Aceptación:** se puede restablecer la demostración sin afectar proyectos reales; todos los casos tienen resultado esperado. La evaluación usa registros poblados y no se limita a menús de un proyecto vacío. Capturas y recorridos distinguen lo demostrado, lo simulado y lo pendiente. El entorno sirve a A33/A45/A46 y a materiales comerciales sin exponer datos sensibles. **Dependencias:** A13 para aislamiento; las correcciones funcionales pertinentes para demostrar sus garantías. **Entregable:** conjunto de datos reproducible, guion por rol y registro de resultados.

**A51 Landing con producto visible y diferenciación demostrable — Prioridad media comercial — P2 diseño y P5 validación**

**Responsable propuesto:** producto, diseño y contenido comercial. Renovar el hero con producto reconocible: capturas reales de una versión verificada, contexto industrial mediante fotografía autorizada o activos isométricos adecuados y una propuesta de valor concreta. Crear una sección de flujo de trabajo con los activos 3D donde ayuden a explicar identificación, inspección, evidencia, revisión y liberación. Mostrar Control Tower y ejecución ITR para conectar la promesa con el producto. Presentar diferenciadores frente a procesos con Excel, mensajería y carpetas mediante ejemplos de trazabilidad, evidencia y bloqueo según política. Destacar escaneo QR/NFC cuando esté disponible y probado en los dispositivos previstos.

**Aceptación:** cada capacidad presentada tiene recorrido demostrable y no depende de números ficticios presentados como reales. Los mockups se distinguen de capturas; el material de demo no se presenta como proyecto cliente. Promesas de velocidad —como «en un segundo»— requieren medición. Una afirmación absoluta sobre Cat A debe coincidir con todas las vías y políticas del alcance anunciado; en otro caso se describe su condición. Comparaciones con competidores se verifican antes de publicar. La landing conserva legibilidad, accesibilidad y carga adecuada. **Dependencias:** A24–A27, A50 y garantías verificadas de F11/A07; coordinar A34. **Entregable:** hero, sección de flujo/diferenciadores y capturas coherentes con la app.

**A52 Evidencia de confianza y trayectoria — Prioridad media comercial — P5 E5.2**

**Responsable propuesto:** producto y responsable comercial. Construir al menos un caso piloto documentado y buscar uno o dos testimonios reales; el número es objetivo, no condición que autorice inventarlos. Incluir contexto del proyecto, problema, alcance, resultado medido, límites y quién puede respaldarlo. Desarrollar sección de equipo/trayectoria con experiencia verificable y responsabilidades relevantes. Usar logos, citas, fotografía y nombres de clientes únicamente con autorización. Un caso anónimo o interno debe explicar su naturaleza y preservar confidencialidad.

**Aceptación:** cada métrica tiene fuente, periodo y denominador; cada testimonio/logo tiene permiso registrado. Los placeholders solo se usan en maquetas internas. No se presenta una organización de demostración como cliente satisfecho ni la experiencia de una persona como historial de despliegues del producto. Si falta evidencia, se comunica el estado real y se prioriza obtenerla mediante A34. **Dependencias:** A34 y resultados verificables; A51 para publicación. **Entregable:** caso piloto, testimonios disponibles y sección de equipo con respaldo documental.

**A53 Oferta comprensible y conversión comercial — Prioridad media comercial — P5 E5.2**

**Responsable propuesto:** responsable comercial y producto. Mantener solicitud de demo, añadiendo recorridos de producto, caso de uso o demostración grabada que permitan entender el valor antes de contactar. Explicar a quién sirve CommUp, qué incluye implantación/soporte y cómo se dimensiona una propuesta. Evaluar rangos orientativos aprobados o ejemplos por tipo de proyecto; si todavía no hay precios defendibles, explicar variables de cotización y alcance sin inventar importes. Reducir fricción del contacto y medir calidad de oportunidades, además del número de formularios enviados.

**Aceptación:** un prospecto identifica el alcance de la oferta y el siguiente paso; precios o ejemplos publicados tienen aprobación y condiciones claras. Las llamadas a la acción conducen a destinos funcionales. Se mide la línea base de visita/recorrido/contacto/demo cualificada y se evalúan cambios sin atribuir mejoras no observadas. No se crea una oferta de autoservicio que el producto u operación todavía no pueda sostener. **Dependencias:** A34, A51–A52 y definición comercial. **Entregable:** oferta explicada, recorridos previos a la demo y medición de conversión.

### 14.3 Navegación completa incorporada a A18–A21

| Nivel | Contenido y regla |
|---|---|
| Mi trabajo | Pendientes, asignados y acceso a escaneo; prioridad de campo |
| Proyecto | Resumen/Control Tower, Liberación de sistemas, módulos y contexto de fases MC, precomisionamiento, comisionamiento y puesta en operación; preservación y registros de campo accesibles |
| Portafolio | Proyectos, indicadores entre proyectos y seguimiento postentrega; alcance global inequívoco |
| Administración | Usuarios, plantillas, fases, auditoría e integraciones según permisos; agrupada y plegable |
| Barra superior | Proyecto activo o ámbito global, búsqueda ⌘K, notificaciones, crear y usuario; identidad del registro en contexto |
| Móvil | Propuesta Mi trabajo · Escanear · Crear · Menú; validar acceso a tareas principales sin perder proyecto/fase |

Reducir profundidad de menús sin borrar funciones necesarias. ITR, Punch y documentos mantienen acceso estable entre fases. La variante por rol cambia prioridades, no inventa otra estructura técnica ni elude permisos. Los nombres finales respetan el vocabulario acordado y las traducciones.

### 14.4 Orden de ejecución y entregables visuales

1. **Preparar contexto y datos:** A50, definiciones A08/A22 y fuentes de A47. Las correcciones de integridad continúan en paralelo.
2. **Diseñar Control Tower sobria:** A46/A47, navegación A18–A21 y temas A24–A27. Probar la lectura de 15 segundos antes de añadir recursos pesados.
3. **Integrar información operativa:** A48, estado de sincronización y acceso directo a causas/evidencias; verificar cifras contra el CORE ITR.
4. **Agregar contexto visual útil:** A49 con alternativa ligera y presupuesto de rendimiento.
5. **Mostrar el producto con honestidad:** A51, hero y flujo 3D basados en recorridos verificados. Incorporar A52/A53 conforme exista evidencia y definición comercial.
6. **Validar producto y oferta:** A33/A34 para uso real, percepción, aceptación del receptor y resultados comerciales.

La expansión visual puede diseñarse antes de cerrar todos los defectos, pero sus indicadores y promesas no se consideran validados hasta comprobar las reglas que los alimentan. El objetivo no es aumentar decoración: es mejorar lectura, decisión y confianza sustentada.

### 14.5 Matriz de cobertura de las recomendaciones de Grok

| Recomendación aportada | Incorporación y ajuste |
|---|---|
| Control Tower industrial premium, comprensión en 15 segundos | A46; objetivo medido, no promesa ya conseguida |
| Modo oscuro, navy/charcoal, grises fríos, sombras suaves y tipografía clara | A24–A27/A49; tema claro y preferencia conservados |
| Jerarquía fuerte y tarjetas con peso visual | A46; pocos indicadores prioritarios, matriz visible |
| Densidad agrupada, escaneable y cero gráficos decorativos | A46/A47; cada dato tiene propósito y explicación |
| Bloqueadores del día, Cat A y sistemas regresados | A22/A23/A46; causas, responsables, actualización y acciones |
| Progreso por fase con color | A25/A47; denominador y significado explícitos, sin depender solo del color |
| System readiness matrix como núcleo del líder | A47; estados y evidencias, separación respecto a cronograma |
| Feeds de ITR firmados y punches críticos | A48; relevancia por rol y uso verificable de «en vivo» |
| Look-ahead de próximos siete días | A48; compromisos/prerrequisitos separados de pronóstico |
| Vista de planta/isométrico con tags activos | A49; enlace funcional, panel plegable y alternativa sin plano |
| Activos 3D en producto, Digital Twin y fichas, no solo marketing | A49; representación correcta y coste de carga medido |
| Hero industrial con producto, fotografía y renders | A51; capturas verificadas y recursos autorizados |
| Flujo de trabajo con activos 3D | A51; explicación del recorrido, coherencia con la app |
| Evitar brecha entre marketing atractivo y producto crudo | A27/A49/A51; mismos estados, componentes y capacidades reales |
| Demostración poblada y revisión de ITR/fotos/firmas/bloqueos | A50 y A45; entorno aislado con resultados esperados |
| Conservar estados vacíos útiles y acciones crear/importar | A27/A50; estados vacíos, carga y error diferenciados |
| Menús completos de proyecto, fases y módulos clave | A19/A21 y sección 14.3; no encerrar módulos transversales en MC |
| Top bar con proyecto, búsqueda, notificaciones, crear y usuario | A18/A20/A21; persistencia móvil y ámbito global explícito |
| Bottom bar de campo y administración agrupada | A21 y sección 14.3; validar por rol y dispositivo |
| Portafolio y post-handover para managers | A21 y sección 14.3; indicadores coherentes y alcance autorizado |
| Prueba social, logos y uno o dos testimonios/casos | A52/A34; reales, autorizados y medidos; sin placeholders publicados |
| About/equipo/trayectoria más sólidos | A52; experiencia verificable y distinción entre equipo/producto |
| Precio menos opaco, rangos o ejemplos de proyecto | A53; condiciones aprobadas o variables de cotización explícitas |
| Conversión más allá de solicitar demo | A53; recorrido/caso/grabación y medición de oportunidades cualificadas |
| NFC y bloqueo Cat A como diferenciadores | A51; demostrar capacidades, dispositivos, políticas y alcance de la promesa |
| Comparación con Excel, WhatsApp, carpetas o soluciones genéricas | A51; ejemplos concretos y comparaciones verificadas, sin afirmaciones absolutas infundadas |

No se omiten los aportes de valor por no ser de interfaz: credibilidad, evidencia comercial, trayectoria, oferta y conversión forman parte del plan. Tampoco se adopta una recomendación literalmente cuando puede confundir riesgo con avance o apariencia con garantía; la tabla deja registrada su adaptación.
