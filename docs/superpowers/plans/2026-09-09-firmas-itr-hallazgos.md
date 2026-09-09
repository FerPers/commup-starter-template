# Auditoría de firmas ITR — 9 septiembre 2026

Alcance: código y migraciones locales; no se consultó ni modificó producción. Las políticas SQL citadas están verificadas en repositorio, no se ha comprobado que coincidan con las aplicadas actualmente en Supabase.

## Hallazgos

- `src/app/actions/itr-instances.ts:337`: signItr comprueba completed y porcentaje, pero no asignación del firmante ni secuencia. Cuenta tres filas. El enum y UNIQUE(itr_id, role) restringen a tres roles distintos en el esquema (`baseline.sql:214,3945`), pero no garantizan que pertenezcan a usuarios asignados.
- `supabase/migrations/20260903200000_rls_set_based_policies.sql:124`: INSERT de firma comprueba pertenencia al proyecto; no compara user_id con auth.uid ni rol/asignación. Corregir solo la acción no protege una escritura directa autorizada por esa política.
- `itr-instances.ts:155`: respuestas se bloquean únicamente al llegar a approved; con una o dos firmas aún se pueden cambiar. Adjuntos (`:265,303`) no comprueban estado ni firmas. Esto deja evidencia modificable tras firmar.
- `itr-instances.ts:413`: revocación requiere rol privilegiado, motivo y proyecto real, pero solo admite approved. Borra firmas y luego cambia estado en operaciones separadas. Una caída entre operaciones puede dejar estado inconsistente; historial guarda usuario/rol/fecha, no imagen de firma ni instantánea completa del contenido.
- `src/app/actions/itr-assign.ts:19-44`: reasignación elimina/inserta sin transacción, sin comprobar firmas existentes ni membresía del destinatario en proyecto/organización. No tocar durante una revisión firmada sin flujo explícito.
- `.../ItrExecution.tsx:486` y `.../SignModal.tsx:105`: selector permite cualquier rol pendiente; la página `page.tsx:63` excluye el rol de organización client de canEdit, que también gobierna firma. Usuario asignado como cliente puede quedar sin botón si tiene ese rol organizacional.

## Corrección mínima y límites

1. Resolver ITR real y verificar proyecto activo mediante checkProjectAccess; rechazar rutas incompatibles. Mantener identidad ctx.userId y withAuthOnly.
2. Exigir asignación exacta del usuario al rol y roles en secuencia executor → supervisor → client. Validar las firmas previas contra asignaciones; aprobar por conjunto completo, no conteo.
3. Root integra evaluación fresca de requisitos. Bloquear cambios desde primera firma; ofrecer reapertura auditada también parcial, con preservación de evidencia anterior. No borrar silenciosamente firmas.
4. Separar permiso de firmar de permiso de editar UI; mostrar solo rol asignado y siguiente nivel.
5. Para garantía frente a concurrencia y acceso directo, implementar transacción/RPC bloqueando ITR y políticas/trigger equivalentes. Validación de aplicación sola tiene ventana check-then-write; no presentarla como cierre definitivo.
6. No se impone nueva regla de tres personas distintas: se conserva asignación por rol. Una separación obligatoria de personas sería una política adicional a definir.

## Casos de prueba

Rechazar ITR ajeno a organización, ruta de otro proyecto/tag, rol inválido en runtime, usuario sin asignación, supervisor sin ejecutor, cliente sin supervisor y firma previa de usuario distinto al asignado. Aceptar ejecutor asignado; aprobar solo con cadena completa válida. Manejar errores de lectura/escritura sin anunciar éxito. Probar posteriormente edición y adjuntos tras una firma, reapertura parcial y total, reasignación, replay offline y carreras concurrentes con DB real aislada. No probar contra datos del cliente.

## Implementación local acotada

Se corrigió únicamente signItr y se añadió import checkProjectAccess. Se mantienen las firmas nativas y withAuthOnly; ningún bypass administrador. Ocho pruebas de acción con DB simulada: antes del cambio, seis fallaron por aceptar solicitudes indebidas; después, ocho pasan. `src/app/actions/itr-signatures.test.ts` también pasa ESLint. La evaluación fresca de completitud y protección de adjuntos/respuestas se integran en otros bloques. Las pruebas no demuestran RLS ni atomicidad y no se ha desplegado a producción.
