# CommUp: revisión de producto y preparación del piloto GeoPark

Fecha: 9 de septiembre de 2026. Alcance informado: proyecto menor, hasta 2.000 tags. Documento de evaluación; no se modificó la aplicación ni se emitieron registros en producción.

## Dictamen

CommUp tiene una base real para convertirse en una alternativa comercial seria. Su amplitud funcional y arquitectura justifican invertir en ella. **Todavía no recomendaría presentarla como sustituto equivalente de cualquier CCMS, ni usar sus indicadores como única autorización de entrega o arranque.** Encontré deficiencias en la integridad de ITR, autoridad de firmas y consistencia de certificados que deben cerrarse antes de esa promesa.

Sí recomiendo avanzar con GeoPark: preparación técnica, validación en entorno de prueba y piloto supervisado con alcance y aceptación definidos. La oportunidad inicial más defendible es commissioning de proyectos pequeños y medianos, especialmente equipos que hoy consolidan registros manualmente. Si GeoPark ya utiliza otro CCMS, comparar un paquete equivalente antes de proponer su sustitución.

La prioridad no es aumentar el catálogo de funciones. Es asegurar que cada avance mostrado pueda explicarse con alcance aprobado, pruebas válidas, firmas autorizadas y documentación reproducible.

## Evidencia y límites

- Inspección del repositorio actual: acciones, autorización, migraciones, ITR, certificados, PSSR, P&ID, sincronización, handover, API, navegación y despliegue.
- Navegación autenticada de lectura en la organización demo: dashboard, proyecto, catálogo, I10A y su vista de campo, listado de ITR y un ITR aprobado en móvil. Landing y login públicos inspeccionados.
- Catálogo visible: **303 plantillas**. ELEC 75; HVAC 28; INST 35; INSU 7; MECH 98; PAINT 2; PIPE 21; SAFE 13; TELE 24. Estos números describen esta organización, no todos los clientes ni una certificación de calidad.
- Demo observada: 200 tags, 7 ITR, 146 referencias P&ID, ningún PDF P&ID cargado. No pude verificar interacción sobre un plano real en esta demo.
- `npm run lint`, `npm run typecheck` y `npm run build`: correctos. `npm test`: 73 pruebas correctas y 11 omitidas (base de datos). Build Next.js, no despliegue ni ensayo del runtime Cloudflare.
- No se hicieron pruebas destructivas, de penetración, carga industrial, restauración, conectividad de campo ni un ciclo de emisión real. Los hallazgos de código son verificaciones estáticas; no afirmo haber explotado vulnerabilidades en producción. Falta contrastar migraciones con el esquema desplegado.
- Las notas de AGENTS están desactualizadas en varios puntos: existen tipos Supabase generados, amplia adopción de withAuth, pruebas y snapshots por fase. No basar el roadmap en el backlog antiguo sin cotejar el código.

## Hallazgos que condicionan el piloto

### 1. La digitalización de algunos ITR perdió su estructura técnica — crítico

En I10A, calibración de instrumentos, los 45 ítems aparecen como verificación. La vista de campo convierte información, revisión, rango de entrada, salida, porcentaje de error y fecha de certificación del calibrador en casillas. Encabezados también cuentan como ítems requeridos. No hay una tabla de mediciones estructurada en esa plantilla. Un usuario podría escribir valores en observaciones, pero eso no sustituye campos tipados y criterios comprobables.

El importador de catálogo explica el riesgo: convierte cada fila en texto o checkbox, marca todo requerido y deja todo no crítico, sin medición ni fotografía requerida. Ver [itr-templates.ts](/Users/luisfer/Desarrollo/CommUp-App/src/app/actions/itr-templates.ts:579). No demostré que todas las plantillas sufran el mismo defecto; sí hay evidencia suficiente para auditar la conversión antes de comercializar el catálogo como listo para campo.

**Acción:** clasificar cada fila como encabezado, dato, comprobación, medición, tabla o evidencia. Revisar primero las 15–25 plantillas aplicables al piloto. Cada una necesita responsable técnico, criterios, revisión y prueba de ejecución. Hay plantillas de 91, 147 y hasta 207 ítems: el número puede reflejar filas de una tabla aplanada y no cobertura superior.

### 2. El servidor confunde respuesta existente con ítem completado — crítico

[upsertResponse](/Users/luisfer/Desarrollo/CommUp-App/src/app/actions/itr-instances.ts:218) calcula avance contando filas de respuestas y dividiendo por los ítems del template recibido del cliente. No valida ahí el contenido requerido, las condiciones de aplicabilidad, la fotografía obligatoria ni la relación completa ITR–plantilla–ítem. Guardar solo observaciones puede crear una fila que cuenta para avance. Con 200 ítems, 199 respuestas redondean a 100%, activando la rama de completado.

**Acción:** obtener plantilla desde el ITR en servidor; validar pertenencia del ítem; calcular completitud exacta por tipo y aplicabilidad; separar porcentaje visual de elegibilidad. No permitir firma con datos vacíos, críticos fallidos o evidencias pendientes. Repetir la validación al firmar, dentro de la misma transacción.

### 3. Tres roles firmados no garantizan tres autoridades válidas — crítico

[signItr](/Users/luisfer/Desarrollo/CommUp-App/src/app/actions/itr-instances.ts:337) acepta el rol indicado por el cliente y cuenta tres firmas para aprobar. No verifica asignación a ese rol ni separación de funciones. La política de inserción de firmas revisada exige pertenencia al proyecto, no correspondencia del firmante con la asignación. [signCertificate](/Users/luisfer/Desarrollo/CommUp-App/src/app/actions/certificates.ts:426) también acepta el rol elegido sin comprobar representación de cliente/autoridad.

**Acción:** matriz de firma por proyecto y tipo de documento, identidad autenticada, asignación, orden y delegación trazable. Definir si una persona puede cubrir dos roles: una excepción deliberada, nunca la consecuencia de un selector. La firma debe vincularse a la revisión exacta del contenido.

### 4. Hay caminos diferentes para emitir y reabrir certificados — crítico

La emisión normal verifica ITR y punches, lo cual es una buena base. Sin embargo:

- [reopenCertificate](/Users/luisfer/Desarrollo/CommUp-App/src/app/actions/certificates.ts:338) vuelve a `issued` sin recalcular elegibilidad.
- [approvePssrAndIssueRfsu](/Users/luisfer/Desarrollo/CommUp-App/src/app/actions/pssr.ts:345) exige una firma y crea un RFSU, pero no vuelve a comprobar respuestas PSSR, estado de revisión, ITR ni punches bloqueantes en ese punto.
- En emisión normal, certificado y excepciones Cat B se guardan por separado; el error de inserción de excepciones no se comprueba. Una emisión podría quedar sin sus excepciones.
- Las políticas SQL revisadas permiten insertar/actualizar certificados por rol editor; no vi un trigger que imponga los gates al escribir directamente.

**Acción:** una operación transaccional autoritativa para emitir, reemitir, firmar y revocar; reglas por fase; bloqueo también en base de datos. Revalidar cuando se reabre un punch o se revoca un ITR aguas arriba. Diferenciar borrador, pendiente de firma, emitido, revocado y sustituido.

### 5. Readiness no equivale todavía a secuencia industrial completa — alto

`compute_system_readiness` agrega ITR de todas las fases y deriva MC/RFSU/RFC quitando sucesivamente punches A/B/C. La emisión usa subsistema y fase. No son la misma pregunta. Además, en el proyecto demo RFC corresponde a commissioning y RFSU a arranque; el SQL calcula RFC después de RFSU. Esto debe reconciliarse con la nomenclatura y metodología aprobada del cliente.

**Acción:** definir explícitamente alcance requerido por fase, prerrequisitos, certificados precedentes, dependencias entre sistemas, excepciones y autoridad. Mostrar “sin alcance definido” cuando no hay ITR, no un cero ambiguo. La cobertura debe comparar ITR requeridos contra asignados: aprobar todo lo asignado no prueba que se asignó todo lo necesario.

### 6. El historial depende de plantillas editables — alto

Existe publicación de nuevas versiones, pero [updateItem](/Users/luisfer/Desarrollo/CommUp-App/src/app/actions/itr-templates.ts:186) permite modificar el ítem original sin comprobar uso por ITR. La generación de PDF consulta la plantilla actual. Cambiar una descripción o tolerancia puede cambiar lo que parece que se inspeccionó históricamente.

**Acción:** bloquear revisiones publicadas/en uso, editar en una nueva revisión y congelar definición y evidencia firmada. Verificar que volver a exportar un documento aprobado conserva su contenido original.

### 7. Offline necesita preservar identidad y evidencia — alto

La cola `commup-offline` no lleva usuario/organización en sus entradas; el replay usa la sesión activa. El logout revisado no limpia o separa cola y cachés. En un dispositivo compartido, un cambio pendiente podría enviarse bajo otra identidad si esta tiene acceso al mismo proyecto. Es un riesgo derivado del código, pendiente de reproducción controlada.

El replay también resuelve respuestas por reloj local/remoto y descarta fotos/punches/firmas tras ciertos rechazos. El registro del descarte de foto conserva metadatos, no el archivo.

**Acción:** particionar por usuario y organización, preservar autor original, impedir replay entre identidades, usar versión de servidor para conflictos y conservar una bandeja de recuperables. Probar modo avión, cierre del navegador, sesión expirada, cambio de usuario, dos técnicos sobre un mismo ítem y reinicio del dispositivo.

### 8. Hasta 2.000 tags ya exige consultas completas — alto

El visor P&ID obtiene tags, ITR y punches de todo el proyecto sin paginación y calcula estados con esas filas. También hay lecturas no paginadas en elegibilidad. Supabase documenta un máximo predeterminado de 1.000 filas; no comprobé el límite configurado de esta instancia. El riesgo es un resultado incompleto y un color erróneo, además de lentitud. [Documentación Supabase](https://supabase.com/docs/reference/javascript/v1/select).

**Acción:** agregados SQL y búsqueda paginada, ámbito limitado al plano, errores explícitos y comprobación contra conteos exactos. Ensayar 2.000 tags con el número realista de ITR, respuestas, fotos y usuarios; los tags solos no representan la carga.

### 9. Handover requiere aceptación documental, no solo exportación — alto

Hay PDF, JSON y firma HMAC del paquete: buena base de portabilidad. El paquete agregado consultado incluye estados y firmas de ITR, pero no sus respuestas completas ni toda la evidencia adjunta. El dossier de certificado también es un resumen; existen rutas separadas de ITR/test pack. No asumir que un solo botón entrega el expediente contractual completo.

**Acción:** acordar índice con GeoPark y producir un ejemplo que contenga ITR completos, revisiones, valores, fotografías, firmas, punches y anexos. El receptor debe verificarlo sin necesitar acceso permanente a CommUp. HMAC del paquete no equivale a aprobación del cliente.

### 10. El despliegue no espera explícitamente los controles de calidad — medio

Los workflows revisados ejecutan despliegue y lint/tests por separado en push a main. No hay dependencia entre ambos en esos archivos; las protecciones de rama remotas no se inspeccionaron.

**Acción:** bloquear despliegues si falla validación y establecer rollback, monitoreo y restauración ensayada. Antes del piloto, nombrar responsable y respaldo de soporte; evitar que toda la continuidad dependa de una persona.

## ¿Cumple el propósito industrial?

| Frente | Evaluación |
|---|---|
| Desglose proyecto/área/sistema/subsistema/tag | Base apropiada para organizar completions |
| ITR por fase, evidencias y revisión | Funcionalidad real; validez y calidad de formularios requieren corrección |
| Punch list y excepciones | Núcleo valioso; vincular todas las rutas con los mismos gates |
| Certificación y entrega | Implementado, pero no suficientemente blindado para ser autoridad única |
| Loops e interlocks | Información útil; la vista revisada de interlocks es un registro causa/efecto, no una ejecución completa de matriz con resultados y testigos |
| PSSR | Módulo presente; cerrar validación final y relación con RFSU |
| KPIs/S-curves | Existen snapshots por fase y vistas; validar denominador, baseline y cambios de alcance |
| P&ID/tag vivo | Buena apuesta; revisión documental, actualización y demostración pendientes |
| Campo | Vista móvil usable; formularios largos, semántica y offline importan más que el número de pantallas |
| Empresa | Aislamiento y roles como base; faltan pruebas de campo y operativas para promesas enterprise |

El software puede gestionar registros de commissioning; la siguiente etapa es asegurar que guía qué puede hacerse, quién puede validarlo y qué bloquea el siguiente hito. Mantendría el monolito modular. No hay evidencia aquí que justifique microservicios o 3D.

OPERCOM es una metodología, ICAPS la herramienta asociada; no son competidores equivalentes entre sí. TotalEnergies pone énfasis en preparación, ejecución y desglose por sistemas. Hexagon describe cobertura del ciclo, movilidad, pruebas, preservación y entrega. Esas son referencias de alcance, no evidencia de precios ni de superioridad. [TotalEnergies](https://icaps.mobiweb.totalenergies.com/our-methodology-0), [Hexagon](https://aliresources.hexagon.com/videos-podcasts/driving-configurability-and-mobility-to-smart-completions).

## Tags vivos y P&ID: dónde apostar

La idea merece inversión porque sitúa el trabajo sobre un contexto que el técnico ya conoce. Su promesa debería ser: **“Toca un equipo en el plano, conoce qué falta y abre la evidencia que lo demuestra.”** No basta con que un punto tenga color.

Hoy el código ofrece PDF, hotspots por página, posición proporcional, enlace al tag y enriquecimiento con ITR/punches. Los puntos se inicializan con datos cargados; no encontré suscripción a cambios en el visor. “Vivo” debe distinguir información relacionada de actualización instantánea.

Riesgos concretos:

- Subir el mismo número de plano hace upsert sobre el documento; no hay modelo de revisión en la tabla revisada. Si cambia la geometría, pueden conservarse puntos sobre otra ubicación.
- Verde considera aprobación de ITR y ausencia de Cat A, sin representar por sí solo fase, PSSR, preservación o autorización de arranque. Definir leyenda y estado “desconocido/desactualizado”.
- La demo no permite demostrarlo: carece de PDFs cargados.
- Posicionar manualmente 2.000 tags, a 30–60 segundos por tag, serían aproximadamente 17–33 horas. Es un escenario de planificación, no una medición del producto.

Orden recomendado: revisión vigente y supersedida; hotspots por revisión y validación al reemplazar; filtros por fase y bloqueador; panel con próximo trabajo/responsable; actualización y fecha de última sincronización; búsqueda y carga por plano. Después, asistencia para localizar etiquetas en PDFs vectoriales/OCR con aprobación humana. Nunca activar automáticamente asociaciones dudosas.

## Practicidad y excesos

La organización por Mi trabajo, Proyecto y Organización mejora la orientación. Aun así, owner ve demasiadas entradas simultáneamente y conviven dashboard, KPIs, Control Tower, explorador, twin y detalle de tag.

Para el piloto dejaría tres recorridos principales: **Mi trabajo → ejecutar; Sistema → desbloquear; Entrega → revisar y aceptar.** P&ID y QR son entradas al mismo tag. Unificar panel de tag, tag 360 y panel del plano; no mantener experiencias divergentes para la misma entidad.

Ocultar por configuración del proyecto IA predictiva, IIoT, seguimiento post-handover, integraciones y personalización avanzada cuando no se necesiten. Conservar la arquitectura, reducir exposición. Preservación y PSSR no sobran: se activan según alcance. No publicitar un registro de interlocks como sustituto de toda una herramienta de validación SIS.

En móvil observé cabecera estrecha, título muy fragmentado, selector de organización truncado y barra fija inferior. Hay botones grandes y acceso directo a punch/foto: bien. Falta ensayo con guantes, sol y mala conexión; no se puede inferir de un screenshot.

La demo debe tener una historia consistente. El ITR LCT-FT/FT-102 aparece aprobado al 100%, con firmas y valores vacíos en la vista consultada. Puede ser siembra de prueba; no lo atribuyo automáticamente al flujo normal. Corregir o explicar esos datos antes de una demostración.

## Landing y mensaje comercial

La estética industrial, el contraste del CTA y la identificación del producto funcionan. El contenido prioriza módulos y tecnología; falta demostrar qué decisión facilita y cómo se implementa.

Cambios propuestos:

1. Hero: **“Controla qué sistemas están listos para entregar.”** Subtítulo: “Conecta tags, ITR, pendientes y evidencias para preparar y revisar cada etapa del commissioning.”
2. Demo de 90 segundos: P&ID → tag → ITR con medición → punch bloqueante → cierre verificado → certificado → expediente. Datos claramente identificados como demostración.
3. Cambiar “En vivo” sobre cifras fijas por “Proyecto de demostración”. El hero contiene números estáticos. Evitar ambigüedad.
4. Sustituir “multi-tenant” por beneficios entendibles: acceso por empresa, proyecto y responsabilidad. Precisar offline y actualización en tiempo real según lo probado.
5. Reducir la exposición inicial a todos los sectores; una landing centrada en el primer segmento, con pruebas, es más convincente.
6. Un solo CTA principal: “Agenda una demo de tu flujo de commissioning”. Añadir qué se recibe, duración propuesta y acompañamiento.
7. Explicar el modelo de precio por proyecto/duración y qué incluye, sin inventar ahorros o una tarifa no calculada. Hoy solicitar cotización no demuestra por sí mismo que sea accesible.
8. Corregir mezcla ES/EN en mockups, vínculos “Blog” hacia contacto y demo hacia login. Etiquetas visibles y accesibles en formulario.
9. Ensayar recepción y seguimiento de leads: el código guarda el contacto y la notificación push depende de configuración. No se envió un lead de prueba.

## Piloto GeoPark: propuesta revisable

**Objetivo:** probar control y entrega de un paquete real con hasta 2.000 tags. Propuesta de 6–8 semanas, sujeta a calendario real. La preparación técnica es requisito previo, no algo que debe descubrir GeoPark en operación.

| Etapa | Entregable |
|---|---|
| Preparación | Alcance, jerarquía, disciplinas, matriz de ITR, revisiones P&ID, autoridad de firma y expediente esperado aprobados |
| Validación QA | Casos negativos de firma/certificación, aislamiento, restauración, offline y carga representativa superados |
| Semana 1 | Importación conciliada; 15–25 plantillas aplicables curadas; entrenamiento por rol |
| Semanas 2–3 | Primer subsistema de 100–300 tags; medición de tiempos y problemas; ajustes controlados |
| Semanas 4–6 | Extensión hasta el alcance acordado; entrega completa de uno o dos sistemas |
| Semanas 7–8 si aplica | Aceptación del expediente, evaluación económica y decisión de expansión |

Roles necesarios: sponsor del cliente, líder de commissioning, administrador de datos, inspectores por disciplina, supervisor/revisor y receptor de operaciones. Número de usuarios, dispositivos y conectividad pendientes de acordar.

**Criterios propuestos, no resultados obtenidos:**

- 100% de tags del alcance conciliados; tags sin matriz o plano visibles como brecha.
- Cero emisiones permitidas en escenarios bloqueantes de la batería acordada.
- Ninguna aprobación sin identidad/autoridad/evidencia verificable; ninguna pérdida de captura offline.
- Expediente de muestra aceptado por receptor antes de ampliar.
- Consulta/guardado habituales p95 ≤3 segundos y visor ≤5 segundos en red/dispositivo acordados; archivos grandes medidos aparte.
- Reducción objetivo ≥30% del tiempo administrativo por ITR y ≥50% de consolidación del reporte, frente a baseline medido. Medir tiempos de registro/revisión, no atribuir al software la duración física de pruebas.
- ≥80% de usuarios de campo completan su tarea principal sin asistencia al cerrar la segunda semana, sobre una muestra definida.

Si fallan integridad o recuperación, detener expansión y corregir. Mantener el proceso formal de autorización del cliente durante validación. No convertir un piloto pequeño en promesa de 50.000 tags.

## Publicidad y venta

Empezaría por venta directa técnica y demostraciones a responsables de commissioning, construcción, QA/QC y operaciones. La publicidad amplifica una historia demostrada; todavía hace falta construir esa historia.

**Primeros 30 días:** preparar demo consistente, ficha de una página, biblioteca piloto curada y propuesta comercial. Seleccionar 20 cuentas concretas de operadores/EPC/contratistas con proyectos de alcance comparable. Acordar cómo GeoPark evalúa y acepta el piloto.

**Días 31–60:** documentar resultados reales del piloto; publicar dos piezas semanales de contenido técnico propio (errores de handover, cómo justificar readiness, recorrido P&ID–ITR). Preparar un webinar de 20 minutos con un problema y una demostración. Medir conversaciones cualificadas → demos → pilotos, no likes.

**Días 61–90:** convertir el piloto en caso de estudio con autorización del cliente; incluir alcance, punto de partida, métricas y límites. Ofrecer el mismo paquete a proyectos similares. Ensayar publicidad pagada solo con mensaje/CTA y seguimiento ya probados; presupuesto según economía de adquisición, no una cifra arbitraria.

Propuesta de oferta: implantación inicial + licencia por proyecto y duración + soporte definido + exportación de salida. Precisar usuarios incluidos, almacenamiento, capacitación, cambios de plantilla y soporte fuera de horario. No competir únicamente por precio: migración, tiempo del cliente y soporte también cuestan.

GeoPark publica un marco de cadena de valor/proveedores; coordinar con el sponsor el proceso real de incorporación, sin asumir que aceptar la demo resuelve la contratación. [GeoPark — Cadena de valor](https://www.geo-park.com/es/sostenibilidad/cadena-de-valor/).

## Orden de inversión

1. Integridad: ITR, firmas, gates, transacciones y revisiones inmutables.
2. Biblioteca piloto: convertir correctamente los formularios que sí se usarán.
3. P&ID y campo: revisión documental, datos completos, sincronización recuperable.
4. Entrega: expediente aceptado, restauración y soporte.
5. Demo/landing y venta con evidencia.
6. Escalar módulos y segmentos según resultados.

**Mi recomendación:** continuar, con ambición y disciplina. La base merece el esfuerzo. El próximo hito comercial es que GeoPark acepte una entrega real y quiera repetir; ese resultado vale más que otra docena de funcionalidades.
