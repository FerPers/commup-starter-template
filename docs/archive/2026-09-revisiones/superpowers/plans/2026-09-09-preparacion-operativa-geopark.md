# CommUp — plan maestro por sesiones para operación con GeoPark

**Objetivo:** dejar CommUp listo para gestionar en operación un proyecto pequeño de GeoPark, hasta 2.000 tags, con registros válidos, firmas autorizadas, estados explicables y expediente aceptable.

**Arquitectura:** conservar Next.js, Supabase y Cloudflare y aprovechar el editor ITR existente. Corregir integridad y uso de capacidades antes de ampliar módulos. Este es un plan maestro de preparación y aceptación; cada sesión técnica se concreta en cambios y pruebas al ejecutarla, después de reproducir el hallazgo.

**Fecha base:** miércoles 9 de septiembre de 2026, Colombia. Hoy y mañana son prioridades propuestas, no una promesa de completar todas las correcciones en dos días. Las sesiones son unidades de cierre, no turnos automáticos ni días de duración garantizada.

## 1. Acuerdo de alcance

El piloto significa uso real, no una demostración ni un entorno para descubrir fallas básicas. Toda preparación, ensayo de carga, prueba negativa, entrenamiento y aceptación de muestra sucede ANTES del primer registro operativo. En operación se medirá utilidad y adopción; la integridad no se difiere al piloto.

Los ITR proceden de la experiencia de Luis como ingeniero. El hallazgo comprobado es que varios perdieron estructura al digitalizarse. Esto no invalida sus originales, ni certifica que todos sean técnicamente correctos: debemos contrastar original, versión digital, documentación aplicable y criterio de disciplina.

Se incluye revisar el catálogo completo observado de 303 ITR. Para arrancar, todos los formatos aplicables al proyecto deben estar aprobados. Los demás podrán seguir en curación, identificados como borradores y fuera de la biblioteca habilitada para GeoPark. No confundir ocultar una opción con impedir su asignación en servidor.

No se implementa ahora 3D, IIoT, microservicios ni nueva analítica predictiva. No son prerrequisitos demostrados para este proyecto.

## 2. Qué hacer hoy y mañana

| Momento | Sesión | Trabajo | Resultado verificable |
|---|---|---|---|
| Hoy, 9 de septiembre | S00 — consolidación | Consolidar las cuatro auditorías y convertirlas en sesiones con dependencias y cierre | Este plan y su tablero inicial: terminado |
| Hoy, siguiente bloque | S01 — alcance y entorno | Definir paquete GeoPark, responsables, fuentes Word, entorno QA y conservación de datos | Ficha de alcance y fuentes; QA separado y restauración de muestra verificable |
| Mañana, 10 de septiembre, primer bloque | S02 — patrón ITR | Contrastar un Word con su versión digital, campo a campo; elegir formato representativo disponible | Un formato patrón revisado y una ficha de mapeo reutilizable |
| Mañana, siguiente bloque | S03 — integridad de captura | Reproducir y corregir completitud y pertenencia ITR–ítem; probar casos vacíos y parciales | Avance y firma dependen de contenido válido, no de contar filas |

Si S01 no dispone aún de Word o datos de GeoPark, avanzar con fixtures sintéticas en S03 y registrar qué validación de negocio falta. No inventar criterios, originales ni alcance. S02 puede preparar el inventario, pero no cerrar el contraste documental sin fuente.

**Horizonte orientativo:** 3–5 semanas de preparación con disponibilidad diaria y fuentes listas; recalibrar tras S02–S03. La curación de los 303 puede extenderse más. El inicio operativo depende de aceptación, no de alcanzar una fecha del calendario.

## 3. Cómo se cierra una sesión

Cada sesión deja una ficha con objetivo, entradas, cambios realizados, pruebas y evidencia, decisiones de Luis/revisor, pendientes y siguiente sesión. Estados: pendiente, en curso, en validación, cerrada o bloqueada por entrada concreta. Una compilación correcta no cierra por sí sola una sesión funcional.

Para correcciones: reproducir en QA → prueba de regresión significativa que falla → cambio mínimo → prueba correcta → revisar impacto → registrar resultado. No modificar documentos históricos firmados. No desplegar una corrección sin validar su migración y recuperación.

Responsabilidades: Codex prepara análisis, mapeos, cambios y pruebas; Luis aporta originales y valida intención técnica; revisor de disciplina valida criterios de su especialidad; responsables designados por GeoPark acuerdan firmas, alcance y aceptación. No asumir que una persona representa todas esas autoridades.

## 4. Sesiones técnicas y de producto

### S01 — alcance, fuentes y entorno de ensayo

**Objetivo:** contar con un lugar seguro y datos suficientes para preparar el producto.

- [ ] Registrar sistemas/subsistemas, disciplinas, máximo de tags, fases e hitos del proyecto menor.
- [ ] Definir usuarios simultáneos esperados, dispositivos, conectividad, receptor y proceso actual de autorización.
- [ ] Localizar los Word originales y establecer código, revisión y propietario de cada fuente. Los Word de estrategia encontrados en la raíz no demuestran que estén los originales ITR.
- [ ] Preparar QA separado, sin notificaciones a usuarios reales; contrastar esquema desplegado con migraciones.
- [ ] Exportar y verificar respaldo de biblioteca y datos; ensayar recuperación de una muestra.

**Cierre:** ficha de alcance, inventario de fuentes y QA reproducible. Depende de entradas de negocio; no de nuevas funciones.

### S02 — patrón de digitalización y matriz de cobertura

**Objetivo:** establecer cómo corregiremos todos los ITR sin perder conocimiento.

- [ ] Elegir un original disponible; priorizar calibración, presión o marcha de bombas por los problemas observados.
- [ ] Comparar cada campo Word con plantilla, vista de campo y exportación.
- [ ] Separar encabezado, dato, comprobación, medición, tabla, evidencia y firma; definir unidad, obligatoriedad, aplicabilidad y origen del criterio.
- [ ] Probar edición con las capacidades existentes. Comprobar soporte real de tablas repetibles; si falta, diseñar grupos acotados o anexo controlado y validar su aceptación.
- [ ] Construir matriz tipo de equipo × fase × ITR requerido; señalar pruebas por tag, lazo, subsistema y paquete.

**Cierre:** formato patrón y matriz de mapeo revisados por Luis. Una nueva revisión solo se publica después del control histórico de S04.

### S03 — validez de respuestas y completitud

**Objetivo:** que ningún registro incompleto se convierta en aprobado por contar respuestas.

- [ ] Resolver la plantilla desde el ITR en servidor y comprobar que cada ítem pertenece a ella y al ámbito autorizado.
- [ ] Validar contenido según tipo, valores requeridos, evidencias y N/A justificado.
- [ ] Separar porcentaje redondeado de completitud exacta y condiciones para firmar.
- [ ] Recalcular de forma coherente al cambiar respuestas y antes de firmar.

**Pruebas de cierre:** observación sin valor no completa una medición; 199 de 200 obligatorios no habilita firma; ítem ajeno se rechaza; evidencia obligatoria ausente bloquea; valor cero válido se conserva; caso conforme sí completa.

**Archivos foco:** `src/app/actions/itr-instances.ts`, componentes de ejecución ITR y políticas de respuestas en migraciones. Crear pruebas de regresión de esas reglas.

### S04 — autoridad de firmas e historia inmutable

**Objetivo:** poder demostrar quién aceptó qué revisión.

- [ ] Definir matriz de autoridad, asignación, orden y excepciones explícitas por proyecto.
- [ ] Aplicarla en servidor y base de datos; comprobar comportamiento por rol real.
- [ ] Vincular firma a contenido/revisión; impedir cambios silenciosos después de aprobación.
- [ ] Editar plantillas publicadas/en uso mediante nueva revisión y preservar definición ejecutada en exportaciones.

**Pruebas de cierre:** miembro no asignado no firma como cliente; doble representación no autorizada se rechaza; editar una nueva revisión no modifica un ITR anterior ni su PDF; revocación y repetición conservan historia.

**Archivos foco:** acciones `itr-instances.ts`, `itr-templates.ts`, `certificates.ts`; rutas PDF y nuevas migraciones de restricciones/versionado.

### S05 — fases, certificados y PSSR

**Objetivo:** una sola decisión de elegibilidad para emisión, reapertura y RFSU.

- [ ] Acordar secuencia y condiciones por fase; conciliar readiness SQL con elegibilidad de aplicación.
- [ ] Comparar alcance requerido con asignado: todo lo asignado aprobado no implica cobertura completa.
- [ ] Hacer transaccional la emisión y sus excepciones; fallar de forma cerrada ante errores de consulta.
- [ ] Revalidar estado PSSR, evidencia, autoridad y pertenencia de sistema/proyecto en la aprobación final.
- [ ] Resolver cambios posteriores: punch reabierto, ITR revocado, certificado sustituido y estado actual frente al de emisión.

**Pruebas de cierre:** todas las rutas bloquean los mismos escenarios; no queda certificado emitido si falla guardar excepciones; no se emite con requisito pendiente ni proyecto cruzado; concurrencia no duplica emisión.

**Archivos foco:** `src/lib/certificates/eligibility.ts`, acciones `certificates.ts` y `pssr.ts`, función SQL de readiness, `tests/db/readiness.test.ts` y `src/lib/certificates/eligibility.test.ts`.

### S06 — campo, sincronización y dispositivos compartidos

**Objetivo:** conservar evidencia e identidad con conectividad intermitente.

- [ ] Particionar cola/caché por usuario y organización; conservar autor y estado de sincronización.
- [ ] Evitar pérdida de adjuntos por reintentos; ofrecer recuperables y resolución explícita de conflictos.
- [ ] Verificar idempotencia y coherencia frente a sesión expirada y reloj local incorrecto.

**Pruebas de cierre:** modo avión, reinicio, sesión expirada, cambio de usuario y dos capturas concurrentes; cada captura se recupera o muestra conflicto explícito, sin atribución incorrecta ni duplicación silenciosa.

**Archivos foco:** `src/lib/offline-queue.ts`, `src/lib/sync/replay.ts`, `public/sw.js`, `src/components/layout/UserMenu.tsx`.

### S07 — tags vivos sobre P&ID

**Objetivo:** ejecutar trabajo desde un plano vigente conservando contexto y trazabilidad.

- [ ] Cargar plano de ensayo autorizado y asociar tags; probar retorno desde ITR con página/zoom/contexto.
- [ ] Modelar revisión documental y verificar/reubicar hotspots al cambiar geometría; no trasladarlos ciegamente.
- [ ] Validar relación documento–proyecto–tag en acciones; limitar archivos al ámbito correcto.
- [ ] Definir qué significa cada color, fase, instante de actualización y datos ausentes.
- [ ] Usar consultas completas/agregadas y probar actualización después de ITR y punch.

**Cierre:** recorrido plano → tag → captura → revisión → estado actualizado y ensayo de nueva revisión del plano sin asociaciones falsas.

**Archivos foco:** acciones `pid-documents.ts`, `pid-hotspots.ts`; página y visor dentro de `projects/[id]/pid-documents/[docId]/viewer`; migraciones documentales.

### S08 — expediente de entrega autocontenido

**Objetivo:** que el receptor pueda verificar la evidencia fuera de la sesión de CommUp.

- [ ] Acordar índice: respuestas completas, revisiones, unidades, anexos, firmas, punches, excepciones y certificados aplicables.
- [ ] Reproducir y corregir posible duplicación de ITR de subsistema en el JOIN de handover.
- [ ] Separar manifiesto/resumen de documentos completos; incluir archivos estables, no solo enlaces que caducan.
- [ ] Exportar muestra y conciliar conteos por tag y subsistema.

**Cierre:** receptor designado abre expediente sin sesión activa y verifica integridad, legibilidad y ausencia de duplicados.

**Archivos foco:** `src/lib/handover/generate.ts`, `types.ts`, `pdf.ts`; función `generate_handover_package`; rutas dossier, ITR y test pack.

### S09 — navegación, lenguaje y trabajo por rol

**Objetivo:** encontrar tareas y bloqueos sin aprender la arquitectura de módulos.

- [ ] Priorizar Mi trabajo, Sistemas y tags, ITR, Punch List, Plan de trabajo, Entrega, Avance y bloqueos.
- [ ] Separar portafolio de proyecto; agrupar Certificados/PSSR/expediente; ubicar importación en configuración.
- [ ] Unificar acceso al tag desde lista/jerarquía/plano; aclarar funciones de Twin y Tag 360.
- [ ] Corregir contador “Bloqueados (Cat A)” y desglosar causas; facilitar acceso a la acción correctiva.
- [ ] Conservar presentación por rol y comprobar móvil, teclado, etiquetas y estados vacíos.

**Cierre:** muestra propuesta de 5–8 usuarios realiza tareas acordadas; objetivo ≥80% sin ayuda y ninguna confusión de proyecto. Registrar resultados, no asumirlos por rediseñar.

**Archivos foco:** `src/components/layout/sidebar.tsx`, `MobileTabBar.tsx`, `Breadcrumbs.tsx`, vistas de certificados y `src/i18n/messages/es.json`.

### S10 — escala del piloto, seguridad y continuidad

**Objetivo:** probar la carga y operación que realmente usará GeoPark.

- [ ] Ensayar 2.000 tags con número representativo de ITR, respuestas, fotos y usuarios acordados; conciliar conteos exactos para detectar truncamiento.
- [ ] Revisar agregados/paginación y errores de consulta en certificados, P&ID y paneles.
- [ ] Ejecutar pruebas negativas entre organizaciones/proyectos y por rol en UI, acciones, API y almacenamiento.
- [ ] Verificar gates de despliegue, runtime Cloudflare, monitoreo, respaldo, restauración y rollback.
- [ ] Definir soporte titular/suplente, horario, contacto y tratamiento de incidente.

**Cierre:** sin fallas críticas de integridad/aislamiento; restauración ensayada; objetivo propuesto p95 ≤3 s para consulta/guardado habitual y ≤5 s visor en condiciones acordadas, midiendo archivos grandes aparte.

**Verificación técnica:** lint, typecheck, pruebas unitarias e integración DB configuradas, build Next y validación de runtime Cloudflare. Las 11 pruebas DB omitidas en la auditoría anterior no cuentan como correctas. Revisar `.github/workflows/lint.yml` y `deploy.yml`.

### S11 — ensayo general y autorización de uso operativo

**Objetivo:** demostrar el flujo completo antes del piloto.

- [ ] Importar datos conciliados del alcance y habilitar solo revisiones aprobadas.
- [ ] Entrenar inspector, supervisor, administrador y receptor con cuentas de rol real.
- [ ] Ejecutar en QA un subsistema representativo con caso conforme, fallo, N/A, retest, offline, bloqueo, firma y expediente.
- [ ] Registrar aceptación de responsables técnicos y receptor; resolver defectos críticos antes de apertura.
- [ ] Hacer despliegue controlado y comprobación final, con recuperación preparada.

**Cierre:** lista de apertura completa y evidencia aceptada. El primer registro real inicia después de este cierre.

## 5. Revisión de TODOS los ITR, por lotes cerrables

### Inventario inicial

| Disciplina | Plantillas observadas | Lotes de referencia, máximo 10 cada uno |
|---|---:|---:|
| Eléctrica | 75 | 8 |
| HVAC | 28 | 3 |
| Instrumentación | 35 | 4 |
| Aislamiento | 7 | 1 |
| Mecánica | 98 | 10 |
| Pintura | 2 | 1 |
| Tubería | 21 | 3 |
| Seguridad | 13 | 2 |
| Telecomunicaciones | 24 | 3 |
| Total | 303 | 35 |

Son lotes de control, no 35 días garantizados. Una matriz compleja puede requerir una sesión exclusiva; reducir tamaño cuando la complejidad lo exija. Volver a contar al obtener exportación actual. Priorizar formatos del piloto sin contabilizarlos dos veces.

### Ficha de contraste por plantilla

Registrar código y revisión, Word fuente y revisión, uso piloto, responsable, páginas/secciones originales, cantidad de campos significativos, campos digitales, unidades, opciones, criterios/referencias, obligatoriedad, condiciones, evidencia, firmas, traducciones, anexos y diferencias. Estado final: aprobada para alcance definido, pendiente de aclaración, duplicada por resolver o retirada de nuevas asignaciones preservando historia.

### Sesión ITR-Lote: repetir hasta cerrar el inventario

1. Leer originales y digitales; identificar pérdida de tablas, encabezados y referencias.
2. Preparar propuesta campo por campo. Mantener intención del ingeniero; marcar cambios técnicos para validación.
3. Revisar con Luis/revisor: corrección semántica, traducción, criterio y aplicabilidad. Consultar documentación primaria vigente cuando haya una cuestión técnica específica, sin inventar tolerancias.
4. Crear borrador de nueva revisión aprovechando el editor. Automatizar solo conversiones inequívocas y verificables.
5. Ensayar conforme, no conforme, incompleto, N/A y exportación. Probar además offline en cada familia de captura relevante.
6. Publicar la revisión aceptada y actualizar matriz de asignación sin alterar instancias históricas.

**Cierre de lote:** todas sus plantillas tienen estado explícito y evidencia de contraste; pendientes no se cuentan como aprobadas. **Cierre de catálogo:** 303/303 clasificadas y contrastadas con fuente o con ausencia de fuente explícita; cada plantilla habilitada tiene revisión técnica y prueba digital aprobadas. Si falta original, no marcar “contrastada con Word”.

**Métricas:** aprobadas aplicables al piloto / total aplicable; clasificadas / total catálogo; originales disponibles; diferencias abiertas por severidad; pendientes de revisión técnica. No usar número de ítems como indicador de calidad.

## 6. Condiciones de apertura GeoPark

- [ ] Alcance de tags y matriz ITR conciliados al 100%.
- [ ] Todos los ITR aplicables revisados y aceptados; los pendientes no son asignables.
- [ ] S03–S05 cerradas: completitud, autoridad, revisión y emisión confiables.
- [ ] Campo y recuperación sin pérdida en los escenarios acordados.
- [ ] P&ID operativo si forma parte del alcance ofrecido; sin presentarlo como probado antes de S07.
- [ ] Expediente aceptado y conteos completos al volumen previsto.
- [ ] Roles, aislamiento, soporte, restauración y despliegue verificados.
- [ ] Ensayo general cerrado y responsables confirman apertura.

No abrir con errores críticos pendientes. Los defectos menores admitidos deben tener impacto, responsable y fecha acordados; no pueden afectar evidencia, autoridad o bloqueo de entrega.

## 7. Landing, oferta y difusión

**S12 — antes de difusión:** corregir cifras estáticas etiquetadas en vivo, enlaces y mezcla de idiomas; mostrar un recorrido real con datos demo identificados. Preparar ficha comercial, precio calculado con soporte/almacenamiento/implantación, alcance y condiciones de salida. Ensayar recepción de contacto en entorno acordado. Cierre: oferta entendible y cada promesa respaldada por prueba.

**S13 — primeras semanas operativas:** medir tiempos de captura/revisión, consolidación de reporte, incidencias, adopción y aceptación documental frente al proceso previo. Recoger feedback sin rediseñar continuamente la operación. Cierre: balance medido y decisión de expansión.

**S14 — difusión con resultados:** preparar caso de estudio solo con autorización de GeoPark para nombre, logo y datos; venta directa a proyectos similares, contenido técnico y demostración breve. Evaluar publicidad pagada después de validar mensaje, seguimiento de leads y economía comercial. Cierre: material verificable y métricas de conversaciones cualificadas, demos y conversión; no ahorros inventados.

## 8. Tablero inicial y orden

| Bloque | Estado al crear este plan | Depende de |
|---|---|---|
| S00 — plan consolidado | Cerrado | Cuatro informes de auditoría |
| S01 — alcance y QA | Pendiente | Fuentes y responsables |
| S02 — patrón ITR | Pendiente | Original representativo y QA |
| S03–S05 — integridad | Pendiente | QA; decisiones de firma/fase |
| Lotes ITR piloto | Pendiente | S02; publicar tras S04 |
| S06–S08 — campo, P&ID y entrega | Pendiente | Integridad estable para cierre integral |
| S09 — navegación | Pendiente | Estructura acordada; puede prepararse con QA |
| S10 — escala y continuidad | Pendiente | Versión candidata integrada |
| S11 — apertura operativa | Pendiente | Todos los criterios de apertura |
| Resto de lotes ITR | Pendiente | Fuentes y revisores por disciplina |
| S12–S14 — comercial | Pendiente | Promesas verificadas; resultados para caso de estudio |

Nada de este tablero implica ejecución automática mañana. Al retomar una sesión, actualizar evidencia y estado antes de avanzar. No se modificaron plantillas, datos de GeoPark ni código al redactar este plan.

## 9. Auditorías consolidadas

- `docs/REVISION-PRODUCTO-GEOPARK-2026-09-09.md`: producto, integridad, seguridad, piloto y marketing.
- `docs/NAVEGACION-PROPUESTA-2026-09-09.md`: estructura por tarea/proyecto/rol y pruebas de uso.
- `docs/ITR-COMPLEMENTOS-PILOTO-2026-09-09.md`: cinco estructuras originales para mejorar cobertura y captura, sujetas a revisión técnica.
- `docs/REVISION-SEGUNDA-PASADA-2026-09-09.md`: muestra ampliada de ITR, contador de bloqueos y hallazgo estático de duplicación de handover.
