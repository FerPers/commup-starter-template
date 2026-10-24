# Plan de salida a producción de CommUp

**Fecha:** 24 de octubre de 2026 · **Base:** commit `14ac137` (backlog anterior cerrado) · **Estado:** propuesta para que Luis decida el orden y las decisiones marcadas.

Este documento traza el [plan integral del 23-oct](PLAN-INTEGRAL-COMMUP-2026-10-23.md) sobre el código real. Cada una de sus 53 acciones se contrastó con el repositorio actual, en lectura y sin tocar la BD. El resultado indica qué ya existe, qué falta y en qué orden conviene hacerlo para la primera salida a producción: los proyectos menores de Geopark. Las fuentes son la [revisión crítica](REVISION-CRITICA-COMMUP-2026-10-23.md) y el [diagnóstico del núcleo ITR](DIAGNOSTICO-CORE-ITR-2026-10-23.md).

## 1 Resultado del cruce

| Estado verificado | Acciones | Cuántas |
|---|---|---|
| Hecho | A16 (un solo camino de deploy, D1 del 2026-10-19), A21 (menú por rol y barra del teléfono, N1), A24 (marca navy/naranja en tokens) | 3 |
| Parcial | A01, A13, A17, A18, A22, A23, A26, A29, A39, A43, A44, A45, A46, A47, A48, A49, A50, A51, A53; A37 tiene el motor hecho y le falta el contenido | 20 |
| Pendiente | A02–A07, A09–A12, A14, A15, A20, A25, A27, A28, A30, A32–A36, A38, A40–A42, A52 | 27 |
| Decisión de producto antes del código | A08 (contrato de estados), A19 (fases frente a módulos), A31 (cuota de IA: aviso o límite) | 3 |

**Qué cambió desde el 23-oct:** A01 quedó resuelto en su núcleo (`f36a053`); el 12 px y el contraste de G-11 (`818d48f`) cubren parte de A26. Los defectos de A02 a A12 siguen en el código **exactamente en las líneas que cita la revisión**: no se corrigieron por otro camino.

**Lo que el plan repite de trabajo ya hecho:** A21 describe el menú N1 y la barra Mi trabajo · Escanear · Crear · Menú tal como existen. A24 pide conservar la paleta que ya está en tokens. A46 y A47 proponen «bloqueadores del día», «próximos 7 días» y la matriz sistema × fase, que existen desde N2a/N2b. Su brecha real es otra: estados que faltan, responsable por bloqueo y fecha de actualización. A29 no sabía de las pruebas de paridad que ya hay para tablas, política de liberaciones y catálogos.

**Corrección de una nota vieja:** `CLAUDE.md` decía que Cloudflare Workers Builds seguía desplegando aparte. El plan de ejecución del 19-oct registra que Luis lo desconectó (D1); la nota quedó corregida. Falta confirmar la protección de rama de `main` (D3), que no se ve desde el repositorio.

## 2 Criterio de salida a producción

CommUp sale a producción con Geopark cuando las **olas 0, 1 y 2** están cerradas con su evidencia. La ola 3 puede solaparse y no bloquea la salida. La ola 4 es el piloto mismo y la ola 5 viene después del piloto o cuando entre un cliente que lo exija.

En términos concretos, salir significa cuatro cosas:

1. Ninguna captura de campo se pierde ni se duplica.
2. Ningún ITR, plantilla o paquete queda a medias.
3. El catálogo del primer lote está homologado y conserva sus requisitos.
4. Los datos reales tienen respaldo restaurable.

## 3 Olas

### Ola 0 — Preparación (corta)

| Acción | Qué hacer | Por qué primero |
|---|---|---|
| A13 inicial | Pasar las pruebas de BD de la CI (`tests/db`, 420 pruebas que hoy se saltan) a la **Supabase local** que ya usa el E2E, con dos organizaciones y los seis roles. Las pruebas que dependen de actores deben fallar si faltan, no saltarse. | Todas las correcciones de la ola 1 necesitan pruebas que distingan antes y después. Ya existe la infraestructura local (G-17); hoy esas pruebas o escriben en prod o no corren. |
| A50 | Unificar `supabase/seed/e2e.sql` + `review.sql` + las semillas de `scripts/demo-data/` en un **proyecto de demostración restablecible** con casos sanos, bloqueados, regresados, sin información y con capturas pendientes. | Sirve a A13, A45, A46 y a la validación de punta a punta. |
| A16 | Confirmar en GitHub la protección de rama de `main` (D3). | Ya no hay segundo camino de deploy; solo falta este control. |
| A45 preparación | Convertir en pruebas las sondas del diagnóstico (`docs/diagnostico-itr-2026-10-23-evidencia/sondas.json`): I30C «No» + conforme, I10A 12/99/0, resultado opcional, continuidad de un conductor. | Antes de corregir el núcleo ITR hay que poder reproducirlo. |

**Salida:** las pruebas de BD corren en la CI sin escribir en prod y sin saltos; hay una demo restablecible; las sondas del ITR fallan como se espera.

### Ola 1 — Integridad del núcleo (bloquea la salida)

| Acción | Qué hacer (verificado en código) |
|---|---|
| A02 | Fotos del ITR con ruta fija por captura e idempotencia, igual que las fotos de punch (`punchPhotoPath`, `outbox.ts:116-126`). Además: `captured_at` = hora del dispositivo y `uploaded_at` aparte, una restricción única por captura, y un fallo de `refresh_itr_status` que no haga reintentar una evidencia ya guardada. |
| A03 | Una RPC transaccional que cree el ITR con sus asignaciones y una clave idempotente. Hoy son dos inserts (`itr-instances.ts:87-112`) y si falla el segundo el ITR queda creado. |
| A04 | Quitar el evento manual de `api/v1/{tags,itrs,punches}`; el trigger ya lo emite. |
| A05 | Esquemas Zod en las rutas de la API v1 (Zod ya está instalado y la API no lo usa) con respuestas 400/422. |
| A10 guard | Un paquete con anexos omitidos no queda `ISSUED`: se marca como parcial y se ve así en la pantalla y en el manifiesto (`generate.ts:128`). |
| A09 parte | `logActivity` debe revisar el `{ error }` de Supabase (`log-activity.ts:15-27`). |
| A01 resto | Exportar las capturas retenidas en «No sincronizado». |
| A40 | Importación de plantillas por la RPC transaccional que ya existe (`clone_itr_template_from_catalog`), extendida para copiar las filas de la matriz. Hoy la pantalla clona sin `required_signatures` ni `requires_test_equipment`, activa un código nuevo antes de tener ítems e ignora errores. Además, la comparación «al día» debe incluir firmas y equipo. |
| A39 código | Congelar `requires_test_equipment` en el ITR al crearlo, como ya se hace con las firmas requeridas. |
| A36 código | Rol de columna «decide la aceptación» en tablas (TS y SQL con paridad); el preset `ce_test` debe tratar «Ejecutó la acción» como resultado; un resultado automático sin desviación calculable se reporta. |
| A44 parte | Guardar el bloque «Datos del tag» en la instancia al firmar; hoy se lee en vivo. |
| A29 | Paridad TS = SQL para lo que falta: `completion.ts` contra `evaluate_itr_capture` y `eligibility.ts` contra `certificate_eligibility`. |
| A30 | Retirar o aislar el código analítico sin consumidores (`src/analytics/*`, `getProjectForecast`, la vista con eventos `itrs.*` viejos). |

**Salida:** cada defecto tiene una prueba que falla con el código anterior; diez reenvíos de una foto dan un adjunto; un fallo en cualquier asignación deja cero ITR; una importación interrumpida no deja plantillas activas a medias; las sondas del ITR pasan.

### Ola 2 — Catálogo, datos y operación para Geopark (bloquea la salida)

| Acción | Qué hacer | Quién decide |
|---|---|---|
| A41 | Seis fichas de homologación de referencia: I04A/I06A, I01A, I10A, I29C e I30C, con cobertura por control, cambios y criterios. | Luis o especialista de disciplina |
| A37 | Criterios de calibración por familia: span, tolerancia, puntos y as found/as left. El motor ya existe; faltan los valores. Es la calibración que estaba pendiente desde el 15-oct. | Luis o especialista |
| A38 | Política de alcance de continuidad: qué hacer mientras no exista listado de conductores estructurado. | Luis |
| A39 contenido | Decidir los 27 códigos que pasaron de exigir equipo de prueba a no exigirlo. | Luis o metrología |
| A42 primer lote | Activar solo el lote que necesitan los primeros proyectos de Geopark, con ficha y verificación de matriz. | Luis |
| A14 | Respaldo y restauración ensayados **de la BD y del Storage** (fotos, planos, paquetes), con objetivos de pérdida máxima y tiempo de recuperación. | Luis (plan de Supabase) |
| A15 mínimo | Alerta cuando un cron falla o una cola envejece (avisos push, outbox, webhooks), y una página de salud. | — |
| A17 medición | Medir con el volumen real de los primeros proyectos (tags, ITR, paquete de un sistema). | — |
| Validación | Organización Geopark nueva, datos reales de ingeniería, borrar DEMO y recorrido de punta a punta por rol (incluye la firma del PTC con la cuenta `+smtp2` y la subida de PDF). | Luis |

**Salida:** primer lote homologado y activo; restauración probada; recorrido completo con datos reales aceptado por Luis.

### Ola 3 — Orientación y lectura (en paralelo, no bloquea la salida)

| Acción | Brecha concreta |
|---|---|
| A08 | Contrato de estados: diligenciado, conforme, aprobado, liberado y entregado. **Decisión de producto**; precede a A25 y A47. |
| A25 | ITR «completado» en verde y «aprobado» en violeta, punch abierto en rojo: ajustar al contrato A08. |
| A47 | La matriz no distingue «sin información» ni «en ejecución» (todo cae en «bloqueado») y no tiene columna de responsable. |
| A46 | «Lo que bloquea hoy» sin responsable ni hora de actualización; con 0 bloqueos el indicador se pone verde, y eso puede leerse como «se puede arrancar». |
| A22 | El chip Cat A del Resumen abre la lista sin filtrar; las regresiones no tienen enlace; la franja solo está en el Resumen. |
| A18 | En el teléfono no se ve el proyecto (las migas se ocultan debajo de 640 px); las pantallas globales no dicen «Todos los proyectos». |
| A20 | Las migas dicen «Tag», «ITR», «Sistema» en vez del código. |
| A23 | Las cifras no dicen cuándo se actualizaron; una página servida sin red no avisa que es vieja. |
| A26 | Quedan tres pares de bajo contraste: gris tenue sobre el navy del menú (~3,5:1), naranja activo sobre la barra blanca (~2,7:1) y blanco sobre `danger-500` (~3,8:1). |
| A43 | El ITR muestra «N pendientes» como salto, no como lista de faltantes y rechazos; no muestra proyecto ni sistema; las tablas anchas no tienen modo por fila en el teléfono; falta el encabezado compacto del teléfono (resto de la maqueta A·A·A). |
| A19 | ITR y Punch cuelgan del grupo de la fase MC en el menú. **Decisión de producto.** |

### Ola 4 — Piloto Geopark

A33 (observar a inspector, líder y representante de la operadora en campo, con línea base de tiempo y errores), A34 (piloto medido: cierre, horas de dossier, capturas recuperadas, aceptación del receptor), A27 (capturas de referencia de pantallas y estados), A21 (validar el menú con usuarios reales) y A42 (siguientes lotes de plantillas según el piloto).

### Ola 5 — Después del piloto o con un cliente que lo exija

A06 membresía por proyecto · A07 políticas de liberación versionadas · A09 historial unificado y retención por contrato · A10/A11 paquete durable, por instantánea y en segundo plano · A12 historial de claves públicas (antes de la primera rotación) · A28 límites de módulos · A31 cuota de IA · A32 configuración por complejidad · A35 alta criticidad · A48 feed de actividad · A49 vista espacial o 3D · A51–A53 landing con capturas reales, casos y oferta (con evidencia del piloto).

## 4 Decisiones que te tocan

| N.º | Decisión | Mi recomendación | Bloquea |
|---|---|---|---|
| 1 | **D2 revisada:** ¿pasar las pruebas de BD de la CI a la Supabase local? Prod seguiría sirviendo para tus pruebas manuales. | Sí. La infraestructura ya existe, cuesta poco y antes de cargar datos reales de Geopark las pruebas no deberían escribir en prod. | Ola 0 |
| 2 | **A06:** para los primeros proyectos de Geopark, ¿basta el acceso por organización? Hoy todo miembro ve todos los proyectos de la org. | Basta si solo entra personal de Geopark y su representante. Si entran contratistas o un cliente que no debe ver otros proyectos, A06 sube a la ola 2. | Ola 2 o 5 |
| 3 | **Primer lote de ITR:** ¿qué familias usan los primeros proyectos? | Empezar por las seis referencias y ampliar solo lo que pidan los proyectos. | Ola 2 |
| 4 | **Criterios de calibración y alcance de continuidad** (A37, A38, los 27 códigos de A39). | Te preparo la ficha de valores y fuentes faltantes por plantilla, y tú decides sobre algo concreto. | Ola 2 |
| 5 | **Respaldo:** pérdida máxima y tiempo de recuperación aceptados; plan de Supabase (copias diarias o recuperación a un punto en el tiempo). | Definirlo antes de cargar datos reales. | Ola 2 |
| 6 | **A08:** contrato de estados. | Te traigo una propuesta con maqueta antes de tocar colores o matriz. | Ola 3 |
| 7 | **A19:** ¿el menú sigue agrupando por fases, o ITR y Punch salen a un acceso estable fuera de las fases? | Propuesta con maqueta junto con A08. | Ola 3 |
| 8 | **A31:** ¿la cuota de IA es un aviso o un límite duro? | Aviso mientras el uso sea interno; límite duro antes de que un cliente use IA. | Ola 5 |

## 5 Orden sugerido de trabajo

1. Ola 0: A13 (CI con BD local y todos los roles), A50 (demo restablecible) y A45 (sondas como pruebas).
2. Ola 1 en este orden, del mayor al menor riesgo:
   - **Pérdida o duplicación de evidencia:** A02, el resto de A01 y el guard de A10.
   - **Operaciones a medias:** A03, A40, A39 código y A44 parte.
   - **Contratos:** A04, A05, A36 código y A29.
   - **Limpieza:** A09 parte y A30.
3. Ola 2 contigo: fichas y criterios (A41, A37, A38, A39), A14 y A15, carga real y recorrido de punta a punta.
4. En paralelo, cuando haya espacio: la propuesta de A08 y A19 con maqueta, y después el resto de la ola 3.

Cada acción se cierra con su prueba en la CI, su verificación en pantalla cuando aplica, commit y CI en verde; las migraciones a prod solo con tu OK y prueba en seco, como hasta ahora.
