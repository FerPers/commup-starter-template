# Biblioteca de formatos ITR — organización catálogo + clonación (Fase 6)

Modelo decidido por Luis (2026-09-09, decisión 7 del plan): una organización **catálogo** publica los formatos y cada organización cliente **clona** los que necesita; el administrador o arquitecto trae los formatos requeridos desde `Admin → Plantillas → Importar de otra org`.

## Piezas

| Pieza | Dónde | Qué hace |
|---|---|---|
| Marca de catálogo | `organizations.settings.is_template_catalog` (toggle owner en Admin → Configuración, acción `setOrgTemplateCatalog`) | Las plantillas ITR, PSSR, procedimientos de preservación, disciplinas, fases, tipos de equipo y (desde hoy) la matriz equipo×ITR de esa org son legibles por cualquier usuario autenticado (políticas `*_select_catalog`, `is_catalog_org`). Nada más de la org se expone. |
| Org «CommUp Catálogo» | slug `commup-catalogo`, owner Luis | Creada el 2026-09-10 con `scripts/itr-v2/sincronizar-catalogo.mjs --crear-catalogo --apply`: disciplinas (9), fases (A/B/C/SU) y 76 tipos de equipo copiados de DEMO por código; una revisión activa por código. |
| Huella de contenido | `src/lib/itr/clone.ts` → `templateContentHash` | Hash de secciones e ítems (textos, tipos, opciones, resultados, unidades, criterios, condiciones) independiente de ids y org. Dos plantillas con la misma huella son intercambiables; sirve para no duplicar y para mostrar «Actualizable». |
| Importar / actualizar | `cloneTemplateToActiveOrg`, `cloneTemplatesToActiveOrg`, modal `ImportFromOrgModal` | Código nuevo → v1 activa (con `title_es`, tipo de equipo por código, condiciones re-mapeadas y filas de la matriz cuyo tipo exista). Código existente con huella distinta → revisión **inactiva** v(max+1) marcada «Importada de …»; el editor la revisa y pulsa «Activar esta revisión» (la matriz se re-apunta sola). Huella idéntica → «Al día», no se toca. Re-ejecutable. |
| Sincronización por script | `scripts/itr-v2/sincronizar-catalogo.mjs` | Mismas reglas con clave de servicio, para lotes: `--from <slug> --to <slug> [--apply] [--seed-config]`. Si el destino es el catálogo, la revisión nueva se activa de inmediato y se copia la matriz; en una org cliente queda inactiva. Ignora los códigos `QA-*`. CSV en `docs/CATALOGO-SYNC-<fecha>-<origen>-<destino>.csv`. |

## Flujo mientras dura la migración v2

1. Luis revisa y activa los borradores v2 **en DEMO** (informes `docs/ITR-FASE2-LOTE-2026-09-09.md` y `docs/ITR-FASE2-MANUAL-2026-09-10.md`).
2. Tras cada lote: `node scripts/itr-v2/sincronizar-catalogo.mjs --apply` → el catálogo recibe las revisiones activadas (se activan allí sin pasar por el editor).
3. Ecopetrol: `node scripts/itr-v2/sincronizar-catalogo.mjs --from commup-catalogo --to morelco --apply` crea revisiones inactivas en Ecopetrol conservando sus v1 (primera corrida 2026-09-10: LCT-FT nueva + 90 revisiones, `docs/CATALOGO-SYNC-2026-09-10-commup-catalogo-morelco.csv`); o bien un editor de Ecopetrol usa «Importar nuevos y actualizar todos» en la app. En ambos casos las v1 siguen activas hasta que alguien active cada revisión.
4. Organizaciones nuevas (Geopark): crear la org desde `/setup` con los códigos de disciplina/fase del catálogo y pulsar «Importar nuevos y actualizar todos» en Admin → Plantillas; luego revisar la matriz equipo×ITR importada.

Al terminar la migración, la maestra pasa a ser el catálogo: se edita allí con «Nueva revisión (borrador)» / «Activar esta revisión» y las orgs cliente actualizan desde la app. El script queda solo para lotes.

## Reglas

- Nunca se modifica una plantilla de origen ni una revisión local existente; solo se añaden revisiones.
- Una org cliente siempre activa a mano (puede tener ITRs en ejecución con la revisión anterior).
- Una plantilla del catálogo sin disciplina o fase equivalente por código en la org destino no se importa (mensaje claro); los tipos de equipo faltantes solo dejan la plantilla sin tipo y sin filas de matriz.
- El campo `is_global` de `itr_templates` no se usa (0 filas); el modelo es la marca de catálogo por organización.
