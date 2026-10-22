# Actualización de plantillas industriales — avance verificado

## Alcance

302 originales; mapeos narrativos no importables. No se debe convertir automáticamente cada celda en checkbox ni aplicar el esquema I10A a otras disciplinas. Organización intervenida: la del proyecto abc47484-59d3-4f51-8966-7fb4f1174ba8 (DEMO Refinería Los Andes AUTOTEST). No se replicaron cambios en otras organizaciones.

## Publicado en este bloque

- I06A v2 c5e1d373-b8db-431b-b12b-6624b3da8700 activa. V1 e22e7f1b-67b5-410b-8364-df301f5665c0 inactiva. 17 controles originales representados como selecciones estructuradas, referencia documental requerida y observaciones opcionales: 19 campos/3 secciones. Redacción bilingüe propia; comprobaciones 15/16 explícitamente visuales; entradas de reserva obturadas y cables sujetos. Revisión independiente de cobertura realizada.
- I04A v2 a76d37e3-e858-4e61-a66d-fecbd1c337bf activa. V1 5b128c13-344b-4448-ae25-8eff9d2b8ca1 inactiva. 8 controles originales, referencia documental requerida, fecha de prueba requerida y observaciones opcionales: 11 campos/3 secciones. No se especificaron cargas/torques/tolerancias nuevos: se remite a ingeniería aplicable. No sustituye ensayo de ajuste de PSV.

Selecciones: Conforme=pass, No conforme=fail, No aplica=not_applicable (justificación requerida por controles ya probados). Misma fase/disciplina/tipo de equipo/organización que la plantilla anterior. Tag y firmas nativos conservados, no se recrean como ítems. No se reasignaron ITR existentes. Creación inactiva, comprobación de campos persistidos, activación y desactivación anterior en transacción SQL. Consultas posteriores confirman estados de ambas revisiones.

Los respaldos anteriores y scripts de preparación están en insumos-locales/revision-itr/publicacion. La UI del editor I06A fue inspeccionada. No se ejecutaron/fimaron instancias industriales de estas nuevas plantillas; el flujo de tipos se verificó previamente con QA sintético. No dar por validado técnicamente un proyecto real ni por terminado el catálogo.

## Pendientes

I01A: matriz por conductor y pantalla; no una casilla general. I05A: calibración condicional vinculada a I10A, matriz de nueve puntos y correcciones. I07A: resistencia con unidad y referencia de aceptación, no checkbox. I02A/I03A/I08A/I09A: detalle en informe independiente. El informe insumos-locales/revision-itr/publicacion/instrumentos-revision.md detalla nueve formatos y distingue propuestas de bloqueos. I10A v2 anterior aún requiere contraste de cobertura completa. Resto de disciplinas sigue con mapeos preliminares y excepciones técnicas sin resolver. No se ha hecho publicación masiva.

### I01A publicado tras incorporar continuidad estructurada

Revisión2 activa: 21919300-0f71-411e-913b-bfbec7c806ac. Revisión1 inactiva c4d299a5-f4c0-4aac-84ba-a3f789e3db86. 28campos/4secciones, preserva referencias, características, ocho verificaciones de instalación, continuidad detallada, equipo de prueba y observaciones. Pares no equivalen a conductores; modo y cantidades explícitos dentro captura. Evidencia y límites en plan 2026-09-09-continuidad-conductores.md. No actualización masiva del catálogo.
