# Demo local restablecible (A50)

**Fecha:** 24 de octubre de 2026 · **Estado:** ola 0 del [plan de salida](PLAN-SALIDA-PRODUCCION-2026-10-24.md).

Una sola semilla sirve a tres usos: la demo para revisar en pantalla, el recorrido E2E (Playwright) y las pruebas de BD (`tests/db`). Corre solo en la Supabase local; ningún script de esta demo acepta una URL que no sea `127.0.0.1` o `localhost`. Todos los datos son sintéticos.

## Restablecer

```bash
colima start
SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io supabase start
npm run demo:reset
npm run e2e -- --serve
```

El primer comando levanta Docker, el segundo la Supabase local, el tercero borra la BD y la vuelve a sembrar (baseline, migraciones, `supabase/seed/*.sql` y el PDF del P&ID) y el último sirve la app en `http://127.0.0.1:3100` (configuración «local» de `.claude/launch.json`). Si la app ya está compilada contra la local, `--no-build` evita recompilar.

## Capas de la semilla

| Archivo | Qué siembra |
|---|---|
| `supabase/seed/00_actors.sql` | Dos organizaciones, los seis roles, disciplina «I» y fases A–D, cada una con su liberación |
| `supabase/seed/10_e2e.sql` | Proyecto E2E: tag PT-E2E-001 e ITR E2E-0001 del recorrido sin red |
| `supabase/seed/20_demo.sql` | Colas de «Mi trabajo» por rol, casos de liberación, planificación del skyline, equipos de prueba y P&ID PID-E2E-001 |
| `supabase/seed/90_db_tests.sql` | Proyecto «Pruebas de BD» (TDB), aparte para que las suites no muevan las cifras de la demo |

## Actores

Contraseña de todos: la de `E2E_PASSWORD` en `e2e/fixtures.ts`.

| Usuario | Rol | Para qué |
|---|---|---|
| `inspector@e2e.commup.test` | Inspector | Ejecuta ITR, levanta y resuelve punch |
| `leader@e2e.commup.test` | Líder | Supervisa ITR, emite TQ |
| `client@e2e.commup.test` | Cliente | Firma como testigo, responde TQ, verifica su punch |
| `architect@e2e.commup.test` | Arquitecta | Co-firma HSE, reabre ITR, revisa red-lines |
| `owner@e2e.commup.test` | Owner | Aprueba liberaciones como Comisionamiento |
| `admin@e2e.commup.test` | Admin | Co-firma Operaciones |
| `outsider@e2e.commup.test` | Owner de la org B | No ve nada de la org A |

## Casos y resultado esperado

Proyecto E2E, liberación A (Completamiento mecánico). Los casos se siembran con las RPC de la app y la identidad de cada actor, así que cumplen las mismas reglas que la pantalla.

| Sistema | Caso | Estado esperado hoy |
|---|---|---|
| A200-S01 Aire de instrumentos | Sano: ITR aprobados, liberación aprobada con las tres firmas | `approved` |
| A200-S02 Agua de servicio | Listo: ITR aprobados, falta aprobar | `ready` (cola de owner/admin/arquitecta) |
| A200-S03 Gas combustible | Aprobado por Comisionamiento y Operaciones, falta HSE | `pending_signatures` |
| A200-S04 Nitrógeno | Aprobado con las tres firmas y después se reabrió un ITR | `regressed` |
| A100-S01 Sistema E2E | ITR sin aprobar y un punch Cat A abierto | `not_ready` · Bloqueado (`work_state = blocked`) |
| A200-S05 Drenajes cerrados | Sin tags ni ITR: alcance desconocido | `not_ready` · Sin información (`work_state = nodata`) |

Desde A47 (E4, migración `20261231120000`) la matriz distingue los dos últimos casos: el primero se ve «Bloqueado» y el segundo «Sin información». Las fases B–D de la demo no tienen ITR, así que también salen «Sin información».

Además: dos TQ (una por responder del cliente y una respondida), dos acciones, cuatro punch (A, B y C en distintos pasos), una preservación vencida, un ITR esperando la firma del cliente, fechas de plan vencidas, de esta semana, futuras, solo pronóstico y sin fecha, y tres equipos de prueba (vigente, por vencer y vencido).

## Lo que falta

- **Capturas pendientes de sincronizar:** viven en el IndexedDB del dispositivo y no se pueden sembrar en SQL. Se reproducen con el recorrido E2E (`e2e/itr-offline.spec.ts`) o a mano, cortando la red en el ITR.
- **Módulos de `scripts/demo-data/`:** lazos y C&E, desempeño, registros controlados, documentos y vendors, y la curva de arranque siguen apuntando a la org DEMO de prod (Planta GLP), que se borra en la ola 2. Dependen de su jerarquía de unos 200 tags y de registros creados a mano; se traen aquí cuando una acción los necesite.
- **Demo alojada para revisores externos:** esta demo es local. Para que alguien de afuera la vea hace falta un ambiente aparte (proyecto Supabase y Worker propios), con cuenta temporal. Es una decisión pendiente.
