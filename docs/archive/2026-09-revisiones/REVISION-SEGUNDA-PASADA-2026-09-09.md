# CommUp — segunda pasada de revisión

9 de septiembre de 2026. Continuación de la revisión de producto, navegación e ITR para el piloto GeoPark de hasta 2.000 tags. Sesión owner en organización demo; navegación y lectura de código, sin modificar datos operativos.

## Resultado

La ampliación de muestra refuerza una prioridad: corregir la calidad del registro antes de ampliar el catálogo. Los formatos abarcan actividades pertinentes, pero varias estructuras de documentos originales se han convertido en casillas independientes. Esto conserva texto y pierde relaciones entre variables, valores, unidades, tiempos y aceptación.

El constructor tiene capacidades más amplias que las utilizadas por estos formatos. El hallazgo afecta al contenido cargado y su importación; no demuestra que la plataforma sea incapaz de soportar mediciones.

## Nuevos formatos revisados en la aplicación

| Formato | Evidencia observada | Consecuencia |
|---|---|---|
| P04A — registro de prueba de presión | 15 ítems, una sección; todos identificados como Verificación. Temperatura inicial, fecha/hora, presión final, identificación de manómetros y medio de prueba son casillas. | Se puede confirmar una etiqueta sin capturar el valor que describe. La aceptación necesita valores y referencias verificables. |
| M09C — registro de marcha mecánica de bombas | 147 ítems, una sección y 147 filas Verificación. Fabricante, potencia, presión, RPM, horas y unidades aparecen separados como casillas. | Se perdió la matriz variable × instante. El operador enfrenta una lista extensa sin una tabla útil de tendencias o mediciones. |
| I30C — comprobación de enclavamientos | 15 ítems, una sección; todos Verificación, requeridos y sin marca de crítico/foto. Opciones A/B, documento C&E, procedimiento, entradas, salidas y resultados se presentan como ítems independientes. | El registro no estructura cada caso de prueba ni distingue claramente las alternativas de procedimiento. |

Identificadores de templates observados: P04A `3763be8a-3c67-4f45-bf9b-0287d031b31e`; M09C `33edb8c8-d20b-433b-a573-3a10d176bc64`; I30C `9b03e963-0ed6-48de-9bfd-ad61749688ed`.

Estos tres casos se suman al I10A de calibración revisado antes. Es una muestra dirigida por riesgo, no una auditoría individual de los 303 templates ni una estimación estadística de su calidad.

### Calidad editorial y aplicabilidad

En M09C observé una traducción truncada en el punto 5.3 y una traducción de “Rated Differential Head [ft]” como “Índice de Flujo Diferencial [ft]”. También contiene tiempos de prueba por potencia incorporados en el texto. P04A conserva una referencia específica a CBI QA/QC y espacios de nombre/firma dentro de una casilla.

Antes del piloto cada formato seleccionado necesita un responsable de disciplina que revise traducción, aplicabilidad al equipo, referencias y criterios del proyecto. La aplicación no debería presentar una instrucción heredada como criterio universal. Esta revisión no valida técnicamente las instrucciones de operación de estos formatos.

### Acción concreta

Preparar una biblioteca aprobada exclusivamente para el alcance del piloto. Separar encabezados informativos, verificaciones, identificación documental, mediciones, tablas repetibles y firmas. Las referencias al fabricante y al procedimiento aprobado deben quedar asociadas a su revisión. Las alternativas deben tener lógica de aplicabilidad y el N/A debe conservar su justificación cuando corresponda.

Usar los cinco diseños originales del documento ITR-COMPLEMENTOS-PILOTO como estructuras para mejorar formatos existentes. Añadir otra copia de una prueba ya cubierta multiplicaría el problema de mantenimiento.

## Certificados: el contador describe una causa incorrecta

En la fase MC de la demo, el resumen muestra 40 “Bloqueados (Cat A)”, un elegible y dos certificados emitidos. Las filas muestran cero Cat A, muchos subsistemas “Sin ITRs” y otros con ITR pendientes.

Código corroborante:

- `src/app/(dashboard)/projects/[id]/certificates/CertificatesView.tsx:113` cuenta todos los resultados `eligible === 'red'`.
- `src/lib/certificates/eligibility.ts` clasifica rojo tanto Cat A como ausencia de ITR o ITR sin aprobar.
- `src/i18n/messages/es.json:528` etiqueta ese conjunto como “Bloqueados (Cat A)”.

La mejora mínima es llamarlo “No elegibles”. La mejora operativa es desglosar causas: alcance sin asignar, ITR pendientes, Cat A abiertos, excepciones pendientes y firmas pendientes. Un mismo subsistema puede tener varias causas; no sumarlas como si fueran subsistemas distintos.

La fila OS01-S01-SS03 presenta un certificado emitido junto a estado actual bloqueado y 1/2 ITR aprobados. Esto no prueba una emisión indebida: puede ser dato demo o una modificación posterior. Sí evidencia la necesidad de distinguir estado al emitir y estado actual, con fecha de corte, historial y tratamiento de cambios posteriores.

## Handover: comprobar cobertura y evitar duplicados

La función `generate_handover_package` de la migración base, desde la línea 1094, enlaza un ITR sin tag y con subsistema contra cada tag de ese subsistema. Por la condición del JOIN, un subsistema con tres tags y un ITR de subsistema puede producir tres filas del mismo ITR, con distintos números de tag. Es un hallazgo estático; no ejecuté esa función sobre un caso de prueba en base de datos.

No encontré otra definición de esa función en las migraciones del repositorio. Falta verificar la definición desplegada y reproducir con una fixture de QA antes de afirmar impacto real en expedientes existentes.

El contrato `src/lib/handover/types.ts` incluye estado, progreso y metadatos de firmas de ITR; no incluye las respuestas y adjuntos completos. Es útil como manifiesto/resumen, pero esa estructura por sí sola no demuestra un expediente autocontenido de toda la prueba.

Prueba de aceptación propuesta: exportar un subsistema con ITR por tag y por subsistema, mediciones, fotos, firma y excepción. El receptor debe poder abrir la evidencia después de cerrar sesión, identificar la revisión ejecutada, y reconciliar sin duplicados los conteos con el alcance. Esta prueba de exportación integral queda pendiente; no se generaron paquetes ni certificados nuevos en producción.

## Implicación para navegación y demostración comercial

Mantengo el diagnóstico de navegación: el menú representa bien los módulos del software, pero obliga al usuario a conocer demasiadas diferencias entre pantallas. El recorrido de entrega añade una razón para agrupar Certificados, PSSR y expediente bajo Entrega, y ofrecer desde cada bloqueo el acceso a la tarea que lo resuelve.

Para presentar a GeoPark, demostrar un recorrido completo: trabajo asignado → tag/plano → captura real → revisión → bloqueo explicado → aceptación → expediente. La demostración debe contener valores y evidencia coherentes; una biblioteca grande y un tablero verde no bastan.

Orden recomendado para preparar el piloto:

1. Curar los ITR que realmente se ejecutarán, con revisión técnica de disciplina.
2. Cerrar integridad de completitud, firmas y gates de emisión descritos en el informe principal.
3. Asegurar que el receptor obtiene toda la evidencia sin duplicados.
4. Corregir etiquetas de bloqueo y reducir navegación a trabajo, activos y entrega.
5. Probar P&ID con un plano cargado y una revisión posterior, más sincronización y volumen representativos.

Esta pasada no cambia el veredicto comercial: CommUp tiene una base seria y una oportunidad razonable en un piloto acotado. Todavía faltan pruebas para prometer sustitución universal de un CCMS consolidado. La prioridad es demostrar confianza en lo registrado y entregado.
