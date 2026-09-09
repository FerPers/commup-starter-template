# CommUp — entrega y estado al 9 de septiembre de 2026

Este documento consolida el avance para que Luis continúe manualmente. No presupone que el catálogo esté validado. Los documentos anteriores son registros cronológicos: sus pendientes pueden haber sido resueltos después. Para el estado de cierre, usar esta entrega y las evidencias enlazadas.

## Resultado real

Se inventariaron 302 Word originales y se prepararon extracciones y mapeos preliminares. Estos mapeos NO son plantillas listas para importar ni equivalen a revisión técnica aprobada. Sigue pendiente conciliar la diferencia con las 303 plantillas mencionadas en la aplicación y los nombres/códigos excepcionales.

| Formato | Estado documentado | Qué se comprobó | Qué falta |
|---|---|---|---|
| I06A v2 | Publicada, 19 campos/3 secciones | Cobertura de 17 controles, selecciones y persistencia; editor inspeccionado | Ejecución y exportación de esta plantilla concreta; revisión técnica final |
| I04A v2 | Publicada, 11 campos/3 secciones | Ocho controles de instalación PSV, referencias y fecha; persistencia | Ejecución y exportación de esta plantilla concreta; revisión técnica final |
| I01A v2 | Publicada, 28 campos/4 secciones | Editor real; nuevo tipo continuidad probado en ITR QA y PDF | Validación técnica del I01A completo en una asignación representativa |
| I10A v2 | Publicada según historial de esta tarea | Diseño revisado con Luis y configuración inicial | Contraste integral de puntos, ajuste, interruptores y soportes; no usar como patrón universal validado |
| Resto | Preparación preliminar | Originales extraídos y propuestas de campos | Contraste individual, edición, pruebas y publicación |

No hay evidencia suficiente para afirmar que cuatro plantillas completas hayan pasado de extremo a extremo una validación industrial. Las publicaciones de I06A/I04A/I01A pertenecen a la organización del proyecto DEMO-GLP, no se replicaron en todas las organizaciones.

Enlaces:
- I01A: https://commup.app/admin/templates/21919300-0f71-411e-913b-bfbec7c806ac
- I06A: https://commup.app/admin/templates/c5e1d373-b8db-431b-b12b-6624b3da8700
- I04A: https://commup.app/admin/templates/a76d37e3-e858-4e61-a66d-fecbd1c337bf

## Software corregido y publicado

- Completitud según contenido y tipo de campo, pertenencia de respuesta a ITR/revisión, condiciones aplicables y porcentaje separado del cierre.
- Selecciones con resultado estructurado; No aplica requiere justificación y rechazo bloquea aceptación.
- Secuencia de firmas nativas, contenido protegido desde la primera firma y reapertura con motivo e historial.
- Controles en DB para respuestas, adjuntos y asignaciones; bloqueo de edición de plantillas ya asignadas; serialización de operaciones con firmas.
- Recálculo después de adjuntos y conservación del objeto histórico al retirar un adjunto tras reapertura.
- Cola de autoguardado para evitar perder ediciones consecutivas.
- PDF con respuestas completas, paginación y trazos de firmas.
- Campo continuidad por pares/conductores y pantallas, terminales, resultados, justificación, lectura/unidad por procedimiento y tabla PDF.

Última publicación registrada: Worker c5061c03-a009-49a5-b40d-378a7510e459. Migraciones 20260909180000 a 20260909220000 instaladas. Última verificación registrada: 161 tests aprobados, 11 omitidos; lint/typecheck y build correctos. Son evidencias de esa ejecución, no una certificación universal de ausencia de errores.

## Límites y pendientes de software

1. Validar segregación de firmas con usuarios distintos: la QA de tres roles usó un mismo usuario.
2. Validar evidencia fotográfica dentro del PDF; la prueba de foto cubrió carga, bloqueo, retiro y trazabilidad, no su reproducción documental.
3. Revisar seguridad y atomicidad de «Publicar nueva versión»: el código actual incrementa en sitio si no hay ITR asignados; con asignados crea copia activa y desactiva anterior antes de finalizar toda la copia. No equivale al procedimiento controlado de publicación usado en esta tarea.
4. Confirmar que la copia conserva toda la metadata de cabecera, condiciones y campos. La rama de copia revisada no incluye title_es/equipment_type_id en la inserción de cabecera.
5. Continuidad comprueba la cantidad declarada; el inspector debe contrastarla con ingeniería. No existe enlace automático al listado detallado de conductores importados.
6. Matrices de otros ensayos no quedan resueltas por continuidad. Cada una debe conservar filas, columnas y unidades propias.
7. En I01A revisar si el campo numérico de calibre permite las designaciones usadas realmente; no forzar una designación alfanumérica a número.
8. El código local tiene cambios sin commit. El respaldo de esta entrega conserva el estado; no se realizó push nuevo a GitHub ni un respaldo integral de Supabase.

## Decisiones técnicas ya dadas por Luis

- I10A pertenece a construcción y soporta aseguramiento para completamiento mecánico. Incluye transmisores de presión/temperatura/nivel/flujo, transductores e interruptores con captura adecuada a cada familia.
- Procedimiento del contratista basado en fabricante; ejemplo de presión 0–100 psi, sin imponerlo a otros instrumentos.
- Inspector del contratante acepta técnicamente, incluso cuando no hay ajuste. Conservar patrón y soporte de calibración de fábrica.
- Tag y firmas son relaciones nativas: no duplicarlos como casillas manuales. Fabricante/modelo/P&ID no se autocompletaban en ejecución en la revisión realizada.
- I33C representa prueba de lazo completo de válvula: distinguir mando DCS, indicación HMI, posición real y retorno si existe.
- Multicables de instrumentación normalmente por pares. Un par no equivale a un conductor.
- Revisiones anteriores se conservan inactivas; no borrar registros ni firmas históricos.

## Archivos conservados

- Originales: insumos-locales/itr-word-originales/
- Inventario: insumos-locales/revision-itr/inventario-originales.json
- Extracciones, tablas y mapeos: insumos-locales/revision-itr/lote-completo/
- Propuestas y respaldos de plantillas: insumos-locales/revision-itr/publicacion/
- QA y PDFs: insumos-locales/prueba-itr-integridad/
- Auditorías de producto/navegación y plan previo: docs/ y docs/superpowers/plans/

Los originales conservan su procedencia. No se modificaron para atribuir una autoría no comprobada.

## Pendiente de Luis

Resolver las contradicciones técnicas por formato, escoger los ITR realmente aplicables al piloto GeoPark de hasta 2.000 tags y completar la revisión manual con el registro adjunto. No falta otra autorización general para lo ya solicitado. Las estimaciones previas de 8–12 jornadas no fueron medidas con un lote y no deben considerarse compromiso ni presupuesto fiable.

## Aclaración de Luis: repositorio y uso bajo demanda

El catálogo de plantillas ITR es un repositorio reutilizable, disponible para los proyectos. Cada proyecto utiliza las plantillas que correspondan a su alcance y a los elementos de ingeniería cargados: instrumentos, equipos, señales, cables, tuberías y otros listados. Completar el catálogo significa disponer de formatos técnicamente completos y utilizables bajo demanda; no asignar todos los formatos a todos los proyectos.

Separar tres niveles:
1. Plantilla del repositorio: define alcance, fase, disciplina, campos y revisión.
2. Asignación al proyecto/elemento de ingeniería: selecciona el formato aplicable y conserva la relación nativa con el elemento.
3. ITR ejecutado: contiene respuestas, evidencias y firmas de esa asignación, vinculado a la revisión correspondiente.

Actualizar una plantilla no debe sobrescribir respuestas ni cambiar retrospectivamente la revisión de ITR ya asignados. Las nuevas asignaciones deben usar la revisión vigente que corresponda. No duplicar manualmente tags ni firmas en los campos.

Esta aclaración describe el funcionamiento esperado confirmado por Luis. No certifica que todos los importadores de señales, cables o tuberías realicen hoy una asignación automática: esa cobertura debe verificarse por flujo. Tampoco significa acceso global entre organizaciones.
