# Paso 2 — Aceptación estructurada de selecciones

Estado: implementado y probado localmente; no desplegado ni aplicado a Supabase.

## Implementado

- Cada opción puede ser informativa (sin efecto), aceptación, rechazo o no aplica. El texto de la opción no determina su efecto.
- No aplica exige justificación en observaciones. Los demás requisitos configurados del ítem siguen vigentes.
- Rechazo explícito bloquea el cierre incluso si el ítem no tiene marcada criticidad. Un registro puede estar diligenciado y rechazado.
- Editor, guardado, publicación de versiones, clonación y backup conservan el mapa de efectos. Backups anteriores usan mapa vacío.
- Servidor deriva aceptación desde la opción configurada; no confía en isPassed enviado por el navegador.
- Captura presenta la justificación y comparte evaluación con modo sin conexión.
- SQL evalúa nuevamente las opciones al firmar; las restricciones impiden mapas huérfanos o valores desconocidos.

## Verificación

- 139 pruebas de aplicación pasan; 11 pruebas de Supabase existentes omitidas por falta de entorno de prueba configurado.
- Typecheck y lint pasan.
- Fixture SQL verifica rechazo no crítico, neutralidad de una opción llamada No y no aplica con/sin justificación.
- Migraciones de integridad y selecciones aplicadas juntas en PostgreSQL local; 14 pruebas de integridad y concurrencia siguen pasando.

## Siguiente paso y requisito

Para captura, firma y exportación de extremo a extremo necesitamos Supabase de pruebas con las migraciones aplicadas y usuarios de los tres niveles. El entorno local PostgreSQL no replica Auth, Storage y las políticas desplegadas completas. La CLI no tiene sesión administrativa. No se han aplicado migraciones ni desplegado código a producción.

Pendiente de usuario: indicar si existe proyecto de pruebas o preparar uno separado. No solicitar contraseñas por chat. Mantener código nuevo sin desplegar hasta aplicar y verificar las migraciones correspondientes en el entorno elegido.
