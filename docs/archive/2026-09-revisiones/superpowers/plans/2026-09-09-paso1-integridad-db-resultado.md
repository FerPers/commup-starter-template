# Paso 1 — Integridad del ITR en base de datos

Estado: implementado y validado en PostgreSQL 17 local. No aplicado a Supabase ni desplegado.

## Cambios

- Firma y reapertura mediante RPC con bloqueo de la fila ITR compartido por guardado, evidencias y asignaciones.
- Firma verifica contenido actual en SQL, membresía, usuario y secuencia. La última firma actualiza aprobación, plan de trabajo y auditoría dentro de la misma transacción.
- Reapertura privilegiada conserva motivo, firmas, respuestas y referencias de evidencias en auditoría antes de revocar; todo revierte si falla la auditoría.
- Contenido y asignaciones bloqueados desde primera firma. Identidad de ITR inmutable y revisión congelada desde asignación; activación/inactivación histórica permitida.
- Escritura directa de firmas retirada a roles API; aprobación directa bloqueada. Relaciones casilla/revisión, sección, condición y evidencia comprobadas.
- Evidencias autenticadas inmutables en Storage. Retirar adjunto elimina vínculo, no binario. Limpieza de huérfanos queda diferida a una política de retención.
- Aplicación integrada con RPC; tipos añadidos y pruebas de contrato actualizadas.

## Evidencia

- 14 pruebas PostgreSQL reales pasan: escritura directa, actor/orden, contenido incompleto, edición firmada, plantilla congelada, reversión al fallar auditoría, snapshot, evidencia y dos órdenes de concurrencia firma/respuesta.
- Fixture SQL del evaluador pasa: vacíos, 199/200, cero/falso, condiciones, ciclos, fotos, fechas, opciones, límites numéricos recalculados sin confiar en is_passed enviado.
- Instalación completa desde cero en segunda base local verificada.
- Suite aplicación: 122 pasan; 11 pruebas Supabase preexistentes omitidas por configuración ausente. La reducción del conteo frente al bloque anterior responde al traslado de reglas de firma a pruebas SQL y contratos RPC.
- Lint y typecheck pasan. Compilación comprobada en el registro de ejecución.

## Condición para publicar

El entorno local usa columnas extraídas del baseline y políticas de prueba; no es una réplica íntegra del Supabase desplegado. Antes de producción hay que contrastar políticas y datos existentes (incluido Storage), probar la migración en un entorno equivalente y coordinar su aplicación antes del código que invoca las RPC. No se ha demostrado funcionamiento publicado.

El paso siguiente es aceptación estructurada de selecciones. La validación SQL actual no interpreta palabras como Rechazado; la configuración explícita de efectos se aborda en ese paso.
