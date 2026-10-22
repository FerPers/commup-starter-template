# Continuidad por conductor — diseño aprobado y ejecución

Usuario aprobó incorporar agrupación por pares/conductores, terminales origen/destino, resultado por conductor y pantalla, lectura/unidad cuando procedimiento exige; integrado a firmas y PDF. No pedir aprobación de nuevo.

Arquitectura: nuevo tipo de ítem continuity. Captura estructurada JSON en value_text de itr_responses: reutiliza identidad itr/item, bloqueo desde primera firma y snapshot de reapertura. No cambiar relación tag. Enum se añade en migración separada antes del evaluador. Esquema version 1: grouping ('pairs'|'conductors'), count entero 1..500, shields string[] (identificadores únicos no vacíos), measurementRequired boolean, rows [{id,from,to,result,remarks,reading,unit}]. IDs esperados P1-A/P1-B... en pares, C1... en conductores, S:<identificador> en pantallas. Ninguna fila extra/duplicada. from/to obligatorios; result pass/fail/not_applicable; NA exige remarks. Si measurementRequired y no NA, reading finito y unit no vacía. Fail bloquea aceptación independientemente de is_critical. Identificación física se conserva mediante terminales y etiqueta de fila. Configuración es contenido del ITR y se congela con firmas.

- [ ] Validador TypeScript y tests de filas faltantes, pares, pantallas, NA, lecturas y rechazo.
- [ ] SQL equivalente e integración de firma atómica; enum en migración previa.
- [ ] Editor/captura y tipos de datos; cola de guardado existente.
- [ ] Completion, servidor y PDF sin truncar JSON.
- [ ] Pruebas locales/integración, despliegue y QA antes de publicar I01A nueva revisión.

No publicar I01A hasta que captura/validaciones/PDF sean compatibles. Ante cualquier bloqueador conservar v1 activa. No inferir tolerancias eléctricas.

## Cierre de implementación y publicación — 9 septiembre, 17:12 Bogotá

- Campo `continuity` publicado; JSON en respuesta existente, conserva identidad ITR y protección de firmas previa. Captura pares/conductores, pantallas, terminales, resultado, justificación y lectura/unidad cuando procedimiento lo exige.
- Migraciones 20260909210000 y 20260909220000 instaladas y registradas en Supabase autorizado. Evaluación SQL y TS bloquean filas faltantes/duplicadas y rechazo por conductor. Pruebas locales PostgreSQL con rollback y casos Unicode/números finitos.
- 161 pruebas pasan, 11 omitidas; lint/typecheck pasan. Build OpenNext repetido terminó código 0. El rechazo automático inicial del deploy (atribuyó fallo de build) se resolvió mostrando compilación nueva exit 0; publicación posterior exit 0.
- Worker c5061c03-a009-49a5-b40d-378a7510e459.
- QA real a5b9ce42-1622-4161-b428-3ce6a7b08b6f, plantilla inactiva c7caaaf4-9671-40ec-8798-ce73b2e49752. Sin firmas inventadas: queda completed,100%, pendientes las 3 aprobaciones. No certifica equipo real.
- Probado en UI: par P1-A/P1-B y pantalla S:general; sin pantalla completa no permite firma; pantalla fail deja100% diligenciado pero estado rejected y firma bloqueada; exigir lectura sin valores bloquea; tres lecturas0ohm guardadas en DB dan captura completa.
- PDF descargado desde ruta publicada, texto extraído y página renderizada revisada: aparecen tres filas y terminales/lecturas/unidades, firmas pendientes. Archivo insumos-locales/prueba-itr-integridad/qa-continuidad-publicado.pdf.
- I01A v2 activa 21919300-0f71-411e-913b-bfbec7c806ac:28 campos,4secciones,8 selecciones y continuidad. I01A v1 c4d299a5-f4c0-4aac-84ba-a3f789e3db86 inactiva; no se reasignaron ITR anteriores. Confirmado SQL y editor web.
- Límite: la validación comprueba las filas declaradas; la cantidad real y requisitos del procedimiento deben verificarse técnicamente por el inspector. No hay asociación automática a un listado de conductores importado. La QA nueva no recibió firmas manuales; protección general de respuestas firmadas fue validada en la etapa previa. Esto no cierra el resto del catálogo industrial.
