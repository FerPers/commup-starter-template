# Propuesta de navegación y menús de CommUp — 2026-10-19

**Base:** revisión H (anexo `docs/revision-2026-10-19/H-navegacion.md`, 24 hallazgos y mapa de las 104 páginas) y revisión en vivo (anexo Z).
**Objetivo:** que cada persona encuentre **en menos de 3 toques** lo que le toca hoy, que el menú siga el **ciclo del proyecto** y que ninguna firma o decisión dependa de que alguien avise por fuera.

---

## 1. Diagnóstico en cifras

| Métrica | Hoy | Meta |
|---|---|---|
| Entradas de menú del inspector | 33 | **≤ 9** |
| Entradas de menú del leader | 39 | ≤ 17 |
| Entradas de menú del cliente | 33 | ≤ 10 |
| Entradas de menú de owner/admin | 49 (menú de 2.149 px en una pantalla de 900) | ~25, colapsadas por bloque |
| Objetos con dos entradas (proyecto + «Todos los…») | 6 (ITRs, Punch, Certificados, KPIs ×2, Planes, Preservación sin vista de proyecto) | 0 |
| Resúmenes que muestran «avance» con cálculos distintos | 5 (Dashboard, Control Tower, KPIs org, Resumen de proyecto, KPIs de proyecto) | 2 cifras canónicas en todas partes |
| Firmas y decisiones con cola en Mi trabajo | Las de F6–F7. Faltan: gates por aprobar o co-firmar, registros, reporte diario, TQ | Todas |
| Páginas sin entrada de menú que son centrales | Sistemas, Desempeño (PTC), Preservación por proyecto | 0 |
| Páginas de error y carga propias | 0 (`not-found`, `error`, `loading`) | En todos los grupos de rutas |
| Aprobar un gate | 3–5 clics, sin aviso | 2 clics desde un aviso |
| Co-firmar un gate (cliente / Operaciones / HSE) | 4–6 clics, sin aviso | 2 clics desde Mi trabajo |

**Por qué pasa:** el menú creció por **objeto** (un ítem por tabla nueva) y no por **tarea** ni por **fase**. Además, lo global y lo de proyecto conviven como menús paralelos.

---

## 2. Principios

1. **Cada uno entra a lo suyo.** `/`, la app instalada, la invitación y el cambio de organización pasan todos por `/home`, que redirige según el rol.
2. **Primero la tarea, después el objeto.** Mi trabajo es la puerta principal de **todos** los roles (incluidos gerente y cliente) y muestra **todo** lo que espera una acción de la persona.
3. **Un proyecto a la vez, ordenado por fases.** El proyecto es el contexto principal: se elige con un selector y su menú sigue MC → Pre-com/Com → Arranque → Desempeño → Traspaso.
4. **Un objeto, una entrada.** La vista de todos los proyectos es un **alcance** dentro de la misma lista, no otro ítem de menú.
5. **Un solo nombre.** La etiqueta del menú es igual al título de la página y a la miga de pan, con un glosario único.
6. **Encontrar sin navegar.** Búsqueda global (⌘K), botón «＋ Crear» con el contexto precargado y el escáner QR siempre a mano.
7. **Mostrar según la relevancia, no solo según el permiso.** Lo que el rol puede ver pero usa poco va a «Más…» plegado. Nada queda inaccesible.

---

## 3. Estructura propuesta

### 3.1 Barra superior (todos los roles)

```
[☰]  Proyecto ▾ CO-LLA-JAC · Jacana     Migas › de › la › página        🔍 Buscar (⌘K)   ＋ Crear ▾   🔔 3   (LP) ▾
```

- **Selector de proyecto** (también en el encabezado del bloque Proyecto): búsqueda, recientes y «Todos los proyectos».
- **🔍 Buscar (⌘K):** tags, sistemas, ITR, punch y cualquier número con prefijo (P-, ACC-, RES-, TQ-, DEC-, TMP-, PRC-, EVT-, TRF-, RD-, REL-, PTT-, PTC-, VND-) dentro del alcance permitido.
- **＋ Crear:** Punch · Acción · Restricción · TQ · Evento de arranque · Registro de campo. Hereda el contexto actual: proyecto, y además el tag o el sistema si la página los tiene.
- **🔔:** avisos (eventos) con «Ver todo» → Bandeja. *La Bandeja sale del menú lateral en escritorio.*
- **Menú de usuario:** organización ▸, preferencias de notificación (sale de `/admin/notifications`), idioma, tema, guía, cerrar sesión.

### 3.2 Menú lateral

```
MI TRABAJO
  ✓ Mi trabajo                 (badge = todo lo que espera mi acción)
  ⌖ Escanear QR/NFC

PROYECTO ▾  CO-LLA-JAC · Jacana
  ▣ Resumen                    tablero por fases (§5)
  ◎ Readiness                  matriz sistema × gate de ESTE proyecto (hoy Control Tower)
  ▸ Preparación
      Sistemas                 sistematización, prioridad, límites, dependencias
      Tags y equipos           lista + modos Árbol / Tarjetas 360 (fusiona Explorador y Twin)
      Documentos               registro + pestaña «Visor P&ID» (fusiona P&IDs)
      Vendors                  paquetes de vendor
  ▸ Completamiento (MC)
      ITRs
      Punch list
      Preservación             NUEVO: vista por proyecto
      Registros de campo       temporales, ciegas, bypass, energización, test packs
  ▸ Pre-com / Comisionamiento
      Señales y lazos          pestañas: Señales · Lazos · Matrices C&E
      Certificados
      PSSR
  ▸ Arranque y desempeño
      Arranque                 pestañas: Procedimientos · Ejecuciones · Line-ups · Bitácora
      Desempeño (PTC)          sale de la pestaña de Arranque
      Operación y traspaso     personal, competencias, repuestos, traspasos, paquetes de entrega
  ▸ Gestión
      Gestión diaria           acciones, restricciones, TQ, decisiones, reporte diario, relevo
      Planificación            look-ahead y forecast + planes de trabajo
      KPIs

PORTAFOLIO                     (solo con >1 proyecto o roles de gestión)
  Proyectos
  Panorama                     Dashboard + KPIs de org + readiness multi-proyecto
  Post-handover                (hoy «Tracking de Ops»)

ADMINISTRACIÓN ▸               (solo editores en adelante; plegado)
  Organización   Usuarios · Empresas · Configuración · Gates
  Plantillas     ITR (+ matriz IA) · Preservación · PSSR · Tipos de registro
  Recursos       Equipos de prueba
  Integración    Workflows · API Keys · Webhooks
  Control        Calidad de datos · Auditoría
```

- Las secciones de fase van **plegadas**, salvo la **fase activa** del proyecto: la de más actividad, o la que el usuario abrió por última vez.
- **Importar** deja de ser ítem de menú: es un botón dentro de Tags, Sistemas y Señales, visible solo para quien puede usarlo.
- El encabezado «Proyecto ▾» es el selector.

### 3.3 Menú por rol (dentro de un proyecto)

**Inspector — 9 entradas** (antes 33)
```
Mi trabajo · Escanear
Proyecto: Resumen · Tags y equipos · ITRs · Punch list · Preservación · Registros de campo · Arranque*
Más… (plegado): Documentos · Señales y lazos · PSSR · Gestión diaria
```
\* Solo si tiene ejecuciones, holds o line-ups en el proyecto.

**Leader (supervisor de disciplina) — 16 entradas** (antes 39)
```
Mi trabajo · Escanear
Proyecto: Resumen · Readiness · Sistemas · Tags y equipos · Documentos · Vendors · ITRs · Punch list ·
          Preservación · Registros de campo · Certificados · PSSR · Arranque · Gestión diaria
Más…: Señales y lazos · Desempeño · Operación y traspaso · Planificación · KPIs
Administración ▸ Plantillas · Equipos de prueba
```

**Planner (hoy leader o architect) — 10 entradas**
```
Mi trabajo
Proyecto: Resumen · Readiness · Planificación (primero) · Sistemas · Gestión diaria · KPIs
Portafolio: Panorama
Más…: el resto del proyecto
```

**Gerente de comisionamiento (architect / admin) — ~20 visibles, por fases y plegadas**
```
Mi trabajo
Proyecto: Resumen · Readiness · las 5 fases (plegadas; la activa abierta)
Portafolio: Proyectos · Panorama · Post-handover
Administración ▸
```

**Cliente / representante de la operadora — 10 entradas** (antes 33)
```
Mi trabajo (firmas, PTC, gates por co-firmar, TQ por responder, holds, hitos, traspasos)
Proyecto: Resumen · Readiness · Certificados · PSSR · Desempeño (PTC) · Operación y traspaso ·
          Gestión diaria (TQ y decisiones) · Documentos · Punch list
```

**Owner / admin — ~25 visibles**: lo del gerente más Administración completa (plegada por grupos).

**Implementación:** cada ítem declara `roles` (permiso, desde una **fuente única** de roles) y `audience` (`field`, `lead`, `plan`, `mgmt`, `client`). Lo que el rol puede ver pero no le corresponde por audiencia va a «Más…». Un test recorre la configuración y comprueba que los `roles` de cada ítem coinciden con el guard de su página.

---

## 4. Mi trabajo rediseñado (el centro de la app)

Hoy son 13–18 contadores sin agrupar, la mayoría en 0, y faltan las colas de gates y registros. Así quedaría:

```
Hola, Luis — lunes 19 · 12 pendientes                   [Proyecto: todos ▾]  [Todo · Ejecutar · Verificar · Firmar · Decidir]

EJECUTAR (5)              VERIFICAR (3)               FIRMAR (2)                   DECIDIR (2)
ITR por ejecutar      4   Punch por verificar     2   ITR por firmar          1    Gates listos para aprobar  1
Punch asignados       1   Acciones por verificar  1   Gates por co-firmar     1    Pruebas por decidir        1
Preservación vencida  0   Filas de line-up        0   Traspasos por firmar    0    Reporte diario por emitir  0
Holds por liberar     0   Registros por verificar 0   PTC por firmar          0    Recomendaciones de vendor  0
                          Hitos por atestiguar    0   Certificados por firmar 0    Categorías de punch        0
```

- **Se ocultan los contadores en 0**; un grupo vacío muestra «Al día ✓».
- **Colas nuevas:** gates listos para aprobar, gates por co-firmar, gates en regresión, registros por autorizar y por verificar, reporte diario por emitir, TQ por responder, recomendaciones de vendor por decidir.
- **Colas por siguiente firma pendiente.** El ITR sigue en «por ejecutar» hasta que el ejecutor firma, aparece al supervisor después de esa firma y al cliente después de la del supervisor.
- **Cada fila abre el objeto** con la pestaña correcta (`?tab=`), nunca una lista sin filtrar. «Ver todos» lleva a la lista con `?assignee=me`.
- **Un solo cálculo** para el badge del menú y para el encabezado de la página.
- **Filtro de proyecto** para quien trabaja en varios.

---

## 5. Resumen del proyecto = tablero por fases

Hoy es un directorio de tarjetas que repite el menú, con el Digital Twin como banner principal. Así quedaría:

```
DEMO Planta GLP — Fase 2            Avance ponderado 41,2 %   Readiness 3 / 14 gates   Hoy: 4 bloqueos · 2 firmas pendientes

FASE            READINESS      AVANCE ITR   BLOQUEOS                         PRÓXIMO COMPROMISO        ACCIÓN
MC              ███████░ 9/14  78 %         2 Cat A · 1 restricción N4      A200-S01 · 24-oct         Ver sistemas →
Pre-com (RFPC)  ███░░░░ 4/14   35 %         5 ITR B sin aprobar             U100-S01 · 30-oct         Ver sistemas →
Com (RFC)       █░░░░░░ 1/14   12 %         —                               A100-S02 · 08-nov         Ver sistemas →
Arranque (RFSU) ░░░░░░░ 0/14    0 %         PSSR pendiente · line-up        A100-S02 · 20-nov         Ver sistemas →
Desempeño (PA)  ░░░░░░░ 0/1     —           PTC-0001 pendiente de firmas    A100-S02 · 30-nov         Ver prueba →
Traspaso        Comisionamiento 12 · Shadowing 2 · Operación conjunta 0 · Operaciones 0               Ver traspasos →

LO QUE BLOQUEA HOY (top 10, con enlace)              PRÓXIMOS 7 DÍAS (look-ahead)
• A100-S02 · MC · Cat A P-0546 (PT-101) abierto     • 24-oct  A200-S01 MC (compromiso)
• U100-S01 · RFPC · Bypass TMP-0004 activo           • 26-oct  FAT compresor C-103 (VND-0002)
• …                                                  • …
```

- Cada fila de fase abre **Readiness** filtrado por esa fase.
- Explorador y Twin pasan a ser un modo de **Tags y equipos** y dejan de ocupar el lugar principal.

---

## 6. Readiness (hoy Control Tower) dentro del proyecto

- **Ruta:** `/projects/[id]/readiness`, que ya trae el contexto del proyecto; sin selector ni botón «Cargar». `/control-tower` queda como vista multi-proyecto del Portafolio y abre el último proyecto usado.
- **Una fila por sistema:** siguiente gate · su estado · **primer bloqueo real con enlace** (no el cálculo viejo de ITR) · forecast / compromiso / brecha · etapa de propiedad · avance ponderado. Los badges de los demás gates van en una franja compacta.
- **Filtros en la URL:** área, tipo, prioridad, estado del siguiente gate, «solo con bloqueo», «comprometido en ≤ 30 días» y «cambió desde ayer». Orden por riesgo. Exportación a Excel.
- **Ficha de sistema única** (`/projects/[id]/systems/[systemId]`), con pestañas: Gates · Avance y plan · Dependencias · Arranque (hitos) · Traspaso · Vendors y desempeño. Los gates aprobados van plegados y se abre el siguiente. Reemplaza las dos fichas actuales.

---

## 7. Ficha del tag, punch y rutas profundas

- **Ficha del tag con pestañas en la URL** (`?tab=itrs|punch|preservation|docs`), para que Mi trabajo, Escanear y las notificaciones abran la pestaña correcta.
- **Página propia del punch** (`/projects/[id]/punches/[punchId]`) con fotos, historia, resolver y verificar. Hoy no existe, y por eso los avisos llevan a una lista.
- **Migas declarativas** con nombres reales («Proyectos › DEMO › Tags › PT-101 › ITR I30C/…») y `next/link` (sin recargar la app).
- **Escáner:** el QR abre la ficha del tag con acciones rápidas: «Mis ITR de este tag», «＋ Punch», «Preservación vencida».

---

## 8. Móvil y tablet

- **Barra inferior para todos los roles:**
  - Campo: **Mi trabajo · Escanear · ＋ · Proyecto · Menú**.
  - Gerente y cliente: **Mi trabajo · Readiness · Proyecto · Menú**.
- **Manifest:** `start_url: "/home"` y accesos directos (Mi trabajo, Escanear, Nuevo punch).
- **Ejecución del ITR en el teléfono:**
  - Cabecera compacta de una línea (número + estado + avance) con «Detalles ▾» desplegable.
  - **Primero los ítems.** Documentos de referencia, equipos de prueba y firmas en secciones plegadas, con un aviso rojo arriba solo si algo bloquea la firma.
  - Barra fija inferior con la acción principal («Firmar» o «Siguiente pendiente») y un menú ⋯.
  - Áreas táctiles de 44 px o más; `inputMode="decimal"` en números.
- **Listas en tarjetas** por debajo de 640 px, en vez de tablas recortadas.
- Menú (drawer) con el menú del rol: 9–17 entradas, sin scroll en un iPad vertical.

---

## 9. Glosario único (nombre en menú = título = miga)

Regla: el término en inglés se usa solo cuando es estándar de la industria (ITR, Punch, MC, RFPC, RFC, RFSU, PSSR, PTC, P&ID, C&E, Look-ahead, FAT/SAT). El resto va en español.

| Hoy | Propuesto |
|---|---|
| Dashboard | Panorama |
| Control Tower / Torre de Control | Readiness (en el proyecto) · Readiness de portafolio |
| Todos los ITRs / punches / certificados / planes | (desaparecen; alcance «Todos los proyectos» en la lista) |
| Tracking de Ops | Post-handover |
| Handover (paquetes) | Paquetes de entrega |
| Relevo / Handover (EN) | Relevo de turno / Shift handover |
| Traspasos | Traspaso de custodia |
| Registros (proyecto) · Registros controlados (admin) | Registros de campo · Tipos de registro |
| Templates ITR / Templates Preserv. / Templates PSSR | Plantillas ITR / de preservación / PSSR |
| Notificaciones (menú) | Preferencias de notificación (menú de usuario) |
| Digital Twin / Explorador | Tags y equipos (modos Árbol y Tarjetas) |
| P&IDs + Documentos | Documentos (pestaña Visor P&ID) |
| Señales · Loops · Matrices C&E | Señales y lazos (3 pestañas) |
| Vistas y planificación | (desaparece; Planificación queda en Gestión) |
| CMS Platform (subtítulo del logo) | Completions & Commissioning |

---

## 10. Fusiones, bajas y redirecciones

| Acción | De | A | Redirección |
|---|---|---|---|
| Borrar | `src/app/admin/page.tsx` (prototipo público) | — | — |
| Fusionar | `/itrs`, `/punch-list`, `/certificates`, `/work-plans`, `/preservation` | Listas de proyecto con alcance «Todos los proyectos» | rutas viejas → `?scope=all` |
| Fusionar | `/dashboard` + `/kpis` | `/portfolio` (Panorama) | sí |
| Mover | `/control-tower` (matriz) | `/projects/[id]/readiness` | `/control-tower` → último proyecto |
| Fusionar | `/control-tower/[systemId]` + `/projects/[id]/systems/[systemId]` | Ficha de sistema única con pestañas | sí |
| Fusionar | `…/explorer` + `…/twin` | Tags y equipos (modos) | sí |
| Fusionar | `…/signals` + `…/loops` + `…/ce-matrices` | Señales y lazos | no hace falta (pestañas) |
| Vincular | `…/pid-documents` | Documentos › Visor P&ID (un P&ID = un documento tipo `pid`) | sí |
| Mover | `/admin/handover` | Operación y traspaso › Paquetes de entrega | sí |
| Mover | `/admin/notifications` | `/settings/notifications` (menú de usuario) | sí |
| Promover | `…/startup/performance` | Desempeño (PTC), entrada propia | — |
| Agrupar | `…/daily/lookahead` + `…/work-plans` | Planificación | sí |
| Crear | — | `(dashboard)/not-found.tsx`, `error.tsx`, `loading.tsx`; `…/punches/[punchId]` | — |
| Renombrar | `/tag_360/[id]` | `/t/[id]` (simétrico con `/r/[id]`) | conservar alias |

---

## 11. Clics antes y después

| Tarea | Hoy | Propuesto |
|---|---|---|
| Inspector abre la app y ejecuta su ITR | 3 (Dashboard → Mi trabajo → ITR) | **1** (abre en Mi trabajo → ITR) |
| Inspector levanta un punch con el equipo delante | 4 + 2 redirecciones | **2** (Escanear → ＋ Punch) |
| Inspector levanta un punch sin QR | 4–6 | **2** (＋ Crear → Punch, tag por búsqueda) |
| Leader aprueba un gate | 3–5, sin aviso | **2** (aviso o Mi trabajo › Decidir → Aprobar) |
| Cliente / Operaciones / HSE co-firma un gate | 4–6, sin aviso | **2** (Mi trabajo › Firmar → Firmar como…) |
| Planner actualiza el forecast | 4 (escondido en Gestión diaria) | **2** (Planificación → Editar) |
| Gerente revisa y emite el reporte diario | 3–4 | **2** (Mi trabajo › Decidir → Emitir) |
| Ejecutar un plan de preservación vencido desde la lista global | 5+ | **2** (Preservación → fila → plan) |
| Encontrar «TQ-0042» o «320-PT-1201A» | Saber el módulo y el proyecto + buscar | **1** (⌘K) |
| Cambiar de proyecto | 2–3 (Organización › Proyectos › proyecto) | **1** (selector) |

---

## 12. Implementación por etapas

### N0 — Arreglos rápidos (≤ 1 día, sin cambiar la estructura)
| # | Cambio | Archivos | Listo cuando |
|---|---|---|---|
| 1 | Inicio por rol en la raíz, la PWA, set-password y el cambio de organización | `src/app/page.tsx`, `public/manifest.json` (`start_url`, `shortcuts`), `src/app/auth/set-password/page.tsx`, `UserMenu.tsx` (`router.push('/home')`) | el inspector abre la app y cae en Mi trabajo |
| 2 | Borrar el prototipo `/admin` | `src/app/admin/page.tsx`, `src/app/robots.ts` | `/admin` → 404 propio |
| 3 | Páginas propias de error, 404 y carga | `src/app/(dashboard)/not-found.tsx`, `error.tsx`, `loading.tsx`, `projects/[id]/loading.tsx` | un ID inválido muestra el menú y «Ir a Mi trabajo» |
| 4 | «Importar» solo para quien puede | `sidebar.tsx` (`PRIVILEGED_ROLES`) | el leader no lo ve |
| 5 | «Sistemas» y «Desempeño (PTC)» en el menú del proyecto | `sidebar.tsx`, `es/en.json` | visibles |
| 6 | Control Tower abre el proyecto actual | `sidebar.tsx` (`?projectId=`), `control-tower/page.tsx` (usa `lastProject`) | estando en B, abre B |
| 7 | Migas completas y en español, con `Link` | `Breadcrumbs.tsx` (diccionarios + `next/link`) | ninguna miga en inglés en la UI en español |
| 8 | Denegaciones con mensaje | `redirect('/home?denied=…')` + aviso | el leader ve «Necesitas rol architect» |
| 9 | Badges muertos | `layout.tsx` / `sidebar.tsx` (calcular `blockers` y `certsPending` o quitarlos; quitar la consulta de punches sin uso) | cero consultas sin uso en el layout |
| 10 | Glosario aplicado a etiquetas y títulos | `es.json` / `en.json`, h1 de las páginas | menú = h1 |
| 11 | «Ver todos» de Mi trabajo filtrado | `my-work/page.tsx` (`?assignee=me`), listas globales | abre solo lo mío |
| 12 | Dashboard con todas las fases | `KpiSummaryWidget.tsx:134` | se ven las 5 fases |

### N1 — Mi trabajo y estructura (1–2 semanas)
1. Mi trabajo agrupado (Ejecutar · Verificar · Firmar · Decidir), sin ceros, con colas nuevas de gates, registros, reporte y TQ (requiere `my_work_counts` y notificaciones, del plan de integridad).
2. Menú por fases y por rol, con `audience` y «Más…»; fuente única de roles y test de paridad entre el menú y las páginas.
3. Selector de proyecto en la barra superior y en el bloque Proyecto.
4. Preservación por proyecto; ficha del tag con `?tab=`; página del punch.
5. Ejecución del ITR adaptada al teléfono (§8) y barra inferior para todos los roles.

### N2 — Readiness y fusiones (2–3 semanas)
1. Readiness dentro del proyecto con filtros y exportación; ficha de sistema única.
2. Resumen del proyecto como tablero por fases.
3. Listas globales como alcance; fusión de Explorador y Twin; Señales y lazos; Planificación.
4. Documentos con el Visor P&ID (requiere el modelo: P&ID = documento tipo `pid`).

### N3 — Encontrar sin navegar (1–2 semanas)
1. ⌘K con la RPC `search_everything(q, project)` sobre RLS.
2. ＋ Crear con el contexto precargado.
3. Guía en la app regenerada desde el manual.

### Cómo medir el éxito
- Entradas de menú por rol (meta del §1) verificadas por un test.
- Clics por tarea (§11) en las pruebas E2E de Playwright.
- Tiempo desde «gate listo» hasta «aprobado con firmas» (debe bajar al haber colas y avisos).
- Porcentaje de sesiones de campo que empiezan en Mi trabajo.
