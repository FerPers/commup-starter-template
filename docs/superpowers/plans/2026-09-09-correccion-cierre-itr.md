# Corrección del cierre de ITR — ejecución autorizada

Objetivo: separar diligenciamiento válido de aceptación técnica, preservando ITR, revisión, tag y firmas nativas. Reglas acordadas con Luis el 9 de septiembre de 2026.

## Trabajo dividido

- Validación de contenido: función pura y pruebas en `src/lib/itr/completion.ts`. Cero y falso son valores explícitos; vacíos no cuentan; condiciones recursivas; evidencia por ítem; porcentaje menor de 100 mientras falte un requisito.
- Guardado seguro: `upsertResponse` consulta la revisión real del ITR, acceso al proyecto y pertenencia del ítem antes de guardar. La referencia del navegador no define la revisión.
- Firmas: comprobar usuario asignado y orden ejecutor, supervisor, cliente; aprobación por roles válidos, no conteo indiscriminado.
- Integración: reutilizar evaluación en servidor y modo sin conexión; verificar anexos y contenido antes de firmar. Identificar mutaciones posteriores a firma y proteger el contenido revisado.

## Verificación y límites

- [x] Pruebas del modo sin conexión reproducen conteo de vacíos y redondeo incorrecto.
- [x] Pruebas de pertenencia antes de escritura.
- [x] Pruebas del evaluador por tipo y condiciones.
- [x] Integración del cálculo en las acciones y la interfaz.
- [x] Pruebas de usuarios y secuencia de firmas.
- [x] Pruebas de anexos y protección del contenido firmado.
- [x] Typecheck, lint, suite y build del segundo bloque (129 pruebas pasan; 11 DB omitidas). Repetir las comprobaciones afectadas después de nuevos cambios.
- [ ] Captura y exportación representativas antes del piloto.

No publicar masivamente templates por el mero hecho de completar estas pruebas unitarias. Los mapeos documentales requieren cierre semántico propio. No interpretar palabras de rechazo por heurística ni introducir tolerancias industriales universales.

## Histórico del primer bloque — pendientes superados parcialmente por el segundo bloque

Implementados guardado con revisión real, evaluador por tipo/aplicabilidad/evidencia, evaluación fresca al firmar y validación de usuarios/secuencia. El modo sin conexión comparte el evaluador. Suite general: 114 pruebas pasan, 11 de integración se omiten; lint y typecheck pasan. No despliegue ni revisiones masivas.

Lista histórica, no usar como estado actual: actualización del estado después de adjuntos, coherencia de controles visibles de firma, protección de contenido desde la primera firma con reapertura auditada, atomicidad y políticas DB frente a escrituras concurrentes/directas, aceptación estructurada de selecciones, prueba de captura y exportación. En ese momento aún faltaba proteger el contenido después de firmas parciales. El segundo bloque añadió protección en acciones e interfaz; la garantía frente a concurrencia y acceso directo a base de datos sigue pendiente.

## Segundo bloque integrado

Protección de respuestas y anexos desde primera firma; reapertura parcial con motivo y snapshot auditado previo; recálculo después de cambios de evidencia; interfaz con roles/orden y estado actual, y captura bloqueada con firmas. Suite general: 129 pruebas pasan y 11 de base de datos se omiten por falta de configuración del entorno de pruebas. Typecheck pasa.

Persisten como condiciones de publicación: pruebas de concurrencia y refuerzo transaccional/RLS en base de datos, flujo completo de navegador y PDF, aceptación estructurada por opción en templates que la requieran. No se desplegó código ni se publicaron revisiones masivas.

## Lista vigente y orden de cierre

| Orden | Frente | Estado actual | Evidencia para cerrarlo |
|---|---|---|---|
| 1 | Base de datos y concurrencia | Pendiente | Firma y cambio simultáneos no alteran contenido firmado; acceso directo respeta usuario/rol/proyecto; reapertura conserva historial incluso ante fallo. Probar en entorno de pruebas. |
| 2 | Aceptación estructurada de selecciones | Pendiente | Cada opción relevante tiene efecto explícito, independiente del idioma; rechazos y no aplica justificado se comportan según regla aprobada. No convertir toda respuesta No en rechazo. |
| 3 | Adjuntos, controles y reapertura | Implementado y probado localmente; validación integral pendiente | Recorrido real con los tres usuarios y anexos: avance correcto, orden de firma, bloqueo y reapertura con historial. |
| 4 | Captura y exportación | Pendiente | ITR representativos con mediciones, condiciones y evidencias coinciden entre captura, guardado y PDF; firmas y revisión correctas. |
| 5 | Publicación del software | Pendiente | Verificaciones anteriores aprobadas, comprobaciones técnicas del cambio y prueba posterior al despliegue. |
| 6 | Templates | 302 mapeos preliminares | Cerrar matrices, unidades y contradicciones; emitir cada grupo validado preservando histórico. |

La responsabilidad del usuario se limita a criterios técnicos de los originales ambiguos. No se requiere nueva autorización general. No confundir pruebas unitarias con validación de producción ni mapeos con revisiones publicadas.

## Recuperación tras reinicio y avance de selecciones

Se verificó que los archivos persistieron y no quedaron agentes ni procesos de pruebas activos. El reinicio eliminó únicamente la base desechable de /tmp; se reconstruyó desde scripts y se repitió la validación.

Paso 2 implementado localmente: mapa explícito de efectos por opción, justificación no aplica, rechazo sin heurísticas, editor/persistencia/backup y SQL de firma integrados. 139 pruebas de aplicación y 14 de integridad PostgreSQL pasan. Ver paso2-selecciones-resultado.md.

Pendiente operativo para pruebas de extremo a extremo: definir y acceder a un Supabase de pruebas. No hay sesión administrativa CLI y solo está configurada la conexión actual de la app. No desplegar antes de aplicar/verificar migraciones en el entorno correspondiente.
