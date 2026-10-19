# CommUp frente a la *Process Commissioning Guide Book* — análisis de brechas y plan

**Fecha:** 2026-10-12 · **Fuente:** *Process Commissioning Guide Book* (M. A. Ahmad), 208 págs. leídas completas. El PDF termina a mitad del cap. 21 (lección 7) y el cap. 19 (Documentación) viene incompleto (solo 19.1–19.6).
**Método:** lectura completa del libro → inventario del producto contra el código y las migraciones (no contra el README) → cruce capítulo por capítulo → plan.

---

## 1. Lo que dice el libro, en una página

La tesis se repite en todos los capítulos:

> **"Plan by system, execute by readiness, progress by evidence and measure by completed functionality."** (7.3)

De ella salen siete ideas que el libro trata como obligatorias:

1. **El % de avance no es readiness.** Un sistema con 99 % pero con la válvula ESD pendiente *no está listo* (7.8, 9.28, 9.29). El tablero debe mostrar *progreso físico* y *readiness funcional* por separado (7.24, 7.63: "No hidden constraints").
2. **Gates y hold points formales.** Hay 8 gates de riesgo creciente: MC → Pre-Comm → Utilities → Functional → Process Introduction → Start-Up → Performance Test → Handover (4.6). Cada hold point tiene prerrequisitos, responsables, documentación, autoridad de aprobación, criterio de punch y evaluación de riesgo (6.7).
3. **Sistematización con dependencias.** Cada sistema tiene límites (battery limits), prioridad P1–P5 y *sistemas habilitantes* (utilities: aire de instrumentos, potencia, N₂…). Hay que distinguir el *límite físico* de la *dependencia funcional* (8.20, 8.21, 14.6).
4. **Evidencia objetiva o no pasó.** "Never close a commissioning record without objective evidence" (4.12). Cerrar un punch exige verificación en campo (9.21). Los registros responden a: qué se probó, contra qué documento, resultado esperado vs real, con qué equipo de prueba y si ese equipo estaba calibrado (13.42).
5. **El estado temporal se controla con registros.** Sin control de lo temporal llegan los incidentes de arranque. Los registros son: instalaciones temporales (6.9), reinstalación (10.15.1), bridas ciegas/spades (16.40), bypasses/overrides (16.34), energización (12.9). "A successful test does not prove a successful reinstatement" (10.30).
6. **Arranque, desempeño y operaciones son etapas propias**, no apéndices: procedimiento de arranque verificado en campo, line-up con verificación independiente, criterios de parada, bitácora de primer hidrocarburo (17.x). Prueba de desempeño con frontera, estabilización, validación de datos y resultado en 5 categorías (18.x). Readiness de operaciones: entrenamiento, competencia, repuestos y traspaso progresivo (16.53–16.61).
7. **Gestión diaria:** look-ahead 90/30/7/diario, registro de restricciones, tracker de acciones, log de decisiones, TQs, escalamiento en 4 niveles, reporte diario, relevo de turno, matriz SIMOPS, MOC (7.12–7.53). También coordinación de vendors con *gate de movilización* (20.7).

---

## 2. Dónde está CommUp hoy (verificado en código)

### Lo que CommUp ya hace igual o mejor que el libro
- **Registro de tags + ITRs por fase con 3 firmas secuenciales** (`sign_itr_atomic`). Cubre el núcleo de MC/Pre-Comm/Comm del cap. 9.
- **Punch A/B/C con bloqueo de certificados y excepción justificada Cat B** (`certificate_punch_exceptions`). Coincide con 9.19.
- **Certificados MC/RFPC/RFC/RFSU** con dossier PDF, y **paquete de handover** firmado con HMAC (19.4, nivel 8).
- **PSSR** con plantilla, estados, firmas, vencimientos y emisión automática de RFSU (cap. 16).
- **Preservación** con planes, registros, vencidos y vínculo a punch. Cubre el registro de 9.26.
- **Ventajas que el libro ni menciona:** señales IIoT (PI/OPC-UA/Modbus/MQTT) que proponen resultados de ITR, ejecución offline, matriz IA tipo de equipo × plantilla, API pública y workflows con webhooks.

### Calificación por capítulo (0 = nada, 5 = cubierto)

| Cap. | Tema | Nota | Comentario |
|---|---|:-:|---|
| 4–6 | Filosofía, gates, hold points | **1** | Las fases son el único "gate". No hay hold points configurables, criterios de evidencia ni autoridad de aprobación por gate. |
| 7 | Planificación y medición | **2** | Work plans con campos P6 y curva S por conteo. Faltan lógica/dependencias, look-ahead, ponderación, restricciones, acciones, decisiones, TQ y reporte diario. |
| 8 | Sistematización | **2** | Jerarquía área→sistema→subsistema→tag OK. Faltan límites, prioridad, tipo (proceso/utility/seguridad), dependencias y markup de límites en el P&ID. |
| 9 | Mechanical Completion | **4** | Fuerte. Faltan verificación de cierre de punch, reinstalación y criticidad funcional del tag. |
| 10–11 | Pre-comm, flushing, secado | **1** | Solo como contenido de ITR. No hay test packs, registro de ciegas, reinstalación ni temporales. |
| 12 | Eléctrico | **2** | Plantillas E existen. Faltan registro/certificado de energización y autoridad de energizar/aislar por límite. |
| 13 | Instrumentación y control | **2** | `loops` e `interlocks` existen pero son **solo lectura**. No hay ejecución de loop check ni prueba C&E, as-found/as-left, registro de equipos de prueba ni registro de bypasses. |
| 14–15 | Utilities y N₂ | **1** | Sin matriz de dependencia de utilities, pruebas de falla/recuperación ni registros de lecturas en el tiempo (O₂, punto de rocío). |
| 16 | PSSR y operaciones | **3** | PSSR sólido. Faltan "Ready / Ready with conditions / Not ready", disposición de punch para el arranque, entrenamiento/competencia, repuestos y traspaso progresivo a operaciones. |
| 17 | Primer hidrocarburo | **0** | Sin procedimiento de arranque, line-up, criterios de parada ni bitácora de eventos. |
| 18 | Prueba de desempeño | **0** | No existe. Es una oportunidad grande porque ya tenemos ingesta de señales. |
| 19 | Documentación | **2** | Dossiers y PDFs buenos. Falta registro maestro de documentos con revisión, estado y vínculo a sistemas (el libro insiste en "uncontrolled revision"). |
| 20 | Vendors | **0** | Sin entidad de empresa/vendor, paquete, gate de movilización, FAT/SAT ni reportes. |

**Lectura honesta:** CommUp hoy es un **sistema de *completions* excelente** (lo que el libro llama "completion database", 9.27). Todavía no es un **sistema de *readiness* de comisionamiento**. La distancia entre ambos es justo la tesis del libro.

### ⚠️ Hallazgo verificado que hay que corregir ya (independiente del plan)
Las reglas de gate **no coinciden entre SQL y TypeScript**, aunque `CLAUDE.md` exige mantenerlas en sync:

| Regla | `compute_system_readiness` (SQL, baseline; lo usa **Control Tower**) | `eligibility.ts` (TS; lo usa la **emisión de certificados**) |
|---|---|---|
| Orden de gates | MC → **RFSU → RFC** (invertido) | MC → RFPC → RFC → RFSU (por fase) |
| RFPC | **no existe** | sí |
| Punch Cat B | **bloquea** RFSU | excepción justificada |
| Punch Cat C | **bloquea** RFC | se ignora |

Efecto: Control Tower puede mostrar un sistema "listo para RFSU" que la página de certificados no deja emitir, y al revés. Este es justo el "dashboard que engaña" contra el que advierte el libro.

---

## 3. Qué incorporar y cómo — la idea central

No proponemos 20 módulos sueltos. El libro se resume en **un motor de readiness** alimentado por **evidencia** y bloqueado por **registros abiertos**. Si construimos esos tres cimientos bien, el resto de los capítulos (energización, N₂, arranque, desempeño, vendors) son *configuración y plantillas* encima, no código nuevo cada vez.

```
            ┌──────────────── MOTOR DE READINESS (gates por sistema) ────────────────┐
 Evidencia ─┤ ITRs aprobados · certificados · PSSR · pruebas C&E · lecturas IIoT       │─► Matriz sistema × gate
 Bloqueos  ─┤ punch críticos · registros abiertos (temporales, ciegas, bypass…)       │   Ready / Ready w/cond / Not ready
 Dependencias┤ sistemas habilitantes (utilities) aguas arriba/abajo                    │   + "qué lo bloquea" (sin % ocultos)
            └────────────────────────────────────────────────────────────────────────┘
```

**Por qué esto lleva a CommUp a ser referente:** ICAPS, WinPCS y OperCom son fuertes en completions (tags, check sheets, punch, certificados), que es donde ya competimos. Ninguno resuelve bien la pregunta del gerente de comisionamiento (7.68): *"¿Dónde estamos? ¿Qué está listo? ¿Qué nos bloquea? ¿Qué sigue? ¿Qué decisión hay que tomar hoy?"*. Hoy eso vive en Excel y en reuniones diarias. Si CommUp lo responde con evidencia, en vivo y desde el campo (offline + IIoT, que ya tenemos), deja de ser "otro completions tool" y pasa a ser la sala de control del comisionamiento.

---

## 4. Plan detallado

Cada fase entrega algo usable por sí misma. Las estimaciones van en sesiones de trabajo como las de los sprints anteriores. Las fases 1–3 son el cimiento y el resto se apoya en ellas.

### Fase 0 — Coherencia de gates (1 sesión) · *corrección, no feature*
- Elegir una sola fuente de verdad. Recomendado: la regla por fase de `eligibility.ts`, reescrita en SQL como `compute_system_readiness` v2 con el orden MC→RFPC→RFC→RFSU y las mismas reglas Cat B/Cat C.
- Control Tower consume la v2. Tests DB en `tests/db/` + unit tests que comparan TS y SQL con los mismos fixtures.
- **Decidido:** Cat C no bloquea; Cat B se maneja como excepción justificada (ver sección 6).

### Fase 1 — Motor de gates y hold points (3–4 sesiones) · *el cimiento*
- **Modelo:**
  - `readiness_gates`: por org, configurable. **Por defecto MC/RFPC/RFC/RFSU** (mapeados a las fases actuales). Los otros gates del libro (4.6) se activan como opcionales por org.
  - `gate_criteria`: tipo + parámetros. Tipos:
    - `itr_phase_approved`
    - `punch_category_closed`
    - `certificate_issued`
    - `pssr_approved`
    - `register_clear(tipo)` (fase 3)
    - `upstream_gate(sistema, gate)` (fase 2)
    - `critical_tags_ready`
    - `manual_attestation` (con adjunto obligatorio)
  - `system_gate_status`: calculado + aprobación con firmas y autoridad por gate (6.7).
- **Resultado del gate en 3 estados** (16.48): *Ready / Ready with conditions* (condiciones registradas y aprobadas) */ Not ready*.
- **UI:**
  - Matriz **sistema × gate** (7.24) con ✓/⚠/✗ y, al hacer clic, la lista exacta de bloqueos con enlace a cada ITR, punch o registro.
  - En Control Tower: "Progreso físico 92 % · Listo para HC: **NO** — LCV-201 prueba funcional pendiente" (7.63).
- **Criticidad de tag:** campo `criticality` (safety-critical / process-critical / normal). Los tags críticos pesan como bloqueo, no como %. Responde a 9.29 ("98 % pero falta la ESD").
- **Reutiliza:** workflows (`block_certificate`), notificaciones y PDF de certificados.

### Fase 2 — Sistematización real (2–3 sesiones)
- En `systems`:
  - `system_type` (proceso / utility / seguridad)
  - `priority` P1–P5 (7.11)
  - `is_enabling`
  - `battery_limits` (texto estructurado: entrada, salida, interfaces eléctricas/instrumentación/utilities, 8.6)
  - `boundary_frozen_at`
- **`system_dependencies`** (upstream / downstream / utility) con la matriz 8.21/14.6 editable e importable desde Excel. Los gates heredan: si el aire de instrumentos no está *Utility Ready*, los sistemas que dependen de él muestran el bloqueo (7.59).
- **Markup de límites en el P&ID:** se extiende `pid_hotspots` a polígonos/colores por sistema (8.10). Así el "explorer" y el "twin" muestran el sistema completo.
- **IA (Claude):** propone dependencias y tipo de sistema a partir de nombres, tags y P&IDs; un humano acepta. Es el mismo patrón de la matriz ITR: la IA sugiere, no decide.

### Fase 3 — Registros controlados de estado temporal (3–4 sesiones) · *diferenciador de seguridad*
- Un **motor genérico de registros** (`field_registers` + `register_items`), no cinco módulos. Tipos sembrados:
  1. **Instalaciones/modificaciones temporales:** mangueras, spools, strainers, alimentación temporal, cambios temporales de software (6.9, 16.35)
  2. **Ciegas/spades** (16.40)
  3. **Reinstalación:** condición temporal → condición final → verificado por (10.15.1)
  4. **Bypasses/overrides** de protecciones: tag, función, motivo, autorización, riesgo, restauración (16.34)
  5. **Energización:** equipo, límite, autoridad, fecha, certificado (12.8–12.9)
- **Ciclo común:** propuesto → autorizado → instalado/activo → retirado/restaurado → **verificado por otra persona**. Cada ítem tiene dueño, sistema/tag, adjuntos y captura offline con QR/NFC (ya existe `/scan`).
- **Bloqueo:** se configura qué ítems abiertos bloquean qué gate. Ej.: un bypass activo bloquea *Process Introduction*; una ciega de prueba sin retirar bloquea *Pre-Comm complete*.
- **Test packs de presión:** las líneas entran como **tags tipo "line"** (coherente con la decisión "todo es tag"). Un test pack agrupa líneas con presión, medio, duración, frontera, manómetros (con su calibración) y ciegas vinculadas, y se ejecuta con su ITR. Así cubre 8.15 y 10.29 sin otra jerarquía.
  - Los packs pueden ser **grandes** (caso Refinería de Cartagena): la relación pack ↔ líneas es N:M y puede cruzar subsistemas.
  - Avance por línea y por pack.
  - Importación masiva desde Excel (line list + asignación a packs).

### Fase 4 — Calidad de evidencia en ITRs y punch (2–3 sesiones)
- **Registro de equipos de prueba** (calibrador, megger, manómetro) con vencimiento de calibración. El ITR registra qué equipo se usó y **advierte o bloquea si está vencido** (13.8, 13.42).
- **Nuevos tipos de ítem:**
  - `as_found / as_left` (13.8)
  - `expected / actual`
  - **serie de lecturas en el tiempo**: tendencia de punto de rocío, O₂ en varios puntos de muestreo, bitácora de prueba. Puede alimentarse de `signal_samples`; ya tenemos la ingesta.
- **Loops e interlocks pasan a ser ejecutables:**
  - Cada lazo genera su ITR de loop check (cadena campo→JB→marshalling→I/O→DCS→HMI, 13.18).
  - Cada fila C&E genera su prueba causa→lógica→elemento final→feedback→reset (13.29).
  - **IA:** importar la matriz C&E desde Excel/PDF y generar las pruebas.
- **Punch:**
  - Paso **"verificado en campo"** antes de cerrar, por otra persona (9.21).
  - Campo **impacto**: seguridad / proceso / equipo / operabilidad / ambiente.
  - **Guía/procedimiento de levantamiento de pendientes**, que es la condición para que Cat C no bloquee:
    - criterios de categoría por impacto funcional, no por tamaño físico (9.20);
    - ayuda contextual en el formulario con ejemplos por disciplina;
    - revisión de la categoría por el supervisor;
    - PDF del procedimiento.
  - En PSSR, **disposición**: "cerrar antes del arranque / puede quedar con controles / mejora a largo plazo" (16.37).

### Fase 5 — Gestión diaria por readiness (3 sesiones)
- **Acciones unificadas** (`actions`), con origen = PSSR / restricción / reunión / TQ / vendor / desempeño. Campos: dueño, fecha, prioridad, método de verificación y evidencia de cierre (16.52, 7.28).
- **Registro de restricciones** con los 8 campos del libro: descripción, sistema, responsable, acción, fecha, impacto, nivel de escalamiento 1–4 y recuperación (7.27, 7.50).
- **Registro de TQ** y **log de decisiones** (7.51, 20.33).
- **Look-ahead 90/30/7 días** derivado de los forecasts de gate + work plans. Distingue **forecast vs compromiso** (7.62).
- **Reporte diario automático en PDF** (7.52): avance, eventos clave, fallas, restricciones y plan del día siguiente. La IA redacta un borrador a partir de los datos y un humano lo edita.
- **Avance ponderado** con pesos configurables por gate (7.23) y **KPIs nuevos** (7.26): éxito de primer arranque, tasa de falla repetida, cierre de TQ, completitud documental y readiness de vendors.
- **Relevo de turno** estructurado (7.53, 16.56): estado, aislamientos, bypasses activos (sale de la fase 3), temporales y pendientes.

### Fase 6 — Arranque y readiness de operaciones (3 sesiones)
- **Biblioteca de procedimientos** con estructura de 15 secciones (6.13 / 17.4.2):
  - pasos con **hold points** y **criterios de parada**
  - revisión controlada
  - marca **"verificado en campo"** (17.4.3)
- **Hojas de line-up ejecutables en móvil:** válvula → posición requerida → verificado por → **verificación independiente** para las críticas (17.16).
- **Bitácora de eventos de arranque:** primera rotación, primer arranque, primer HC, primera operación estable, primer producto on-spec (17.27, 17.33). Hora y parámetros pueden venir de IIoT.
- **Readiness de operaciones** (16.54):
  - matriz de entrenamiento/competencia por persona × sistema
  - repuestos críticos y herramientas especiales (lista ligera)
  - estados de propiedad del sistema: Comisionamiento → Shadowing → Operación conjunta → Operaciones (16.60), con traspaso formal firmado.

### Fase 7 — Prueba de desempeño (2–3 sesiones) · *nadie en el mercado lo hace bien*
- **Definición:** frontera, objetivo, criterios, condiciones, duración, frecuencia de datos, correcciones e incertidumbre (7.22, 18.6).
- **Ejecución:** periodo de **estabilización vs periodo formal**, perturbaciones registradas, captura manual o **directa desde `signal_samples`**, validación de datos (faltantes, picos, unidades) y reconciliación entre medidores (18.30–18.31).
- **Resultado en 5 categorías** (18.35): aceptado / aceptado con desviación / repetir / falló / no concluyente.
- **Certificado** con aceptación de comisionamiento, operaciones y cliente (18.47), más reporte PDF de 14 secciones (18.46).

### Fase 8 — Vendors y control documental (3 sesiones)
- **Entidad empresa/parte** (contratista, vendor, cliente) vinculada a miembros. Habilita la RACI y las firmas "por empresa".
- **Paquetes de vendor:**
  - límites del paquete y matriz de interfaces (20.10, 20.52)
  - **gate de movilización** atado a los gates del sistema (20.7)
  - FAT/SAT con hallazgos
  - reportes diarios/finales y recomendaciones que **no se aplican sin MOC/aprobación** (20.34)
  - checklist de desmovilización (20.55)
- **Registro maestro de documentos** (19.6): número, revisión, estado (Draft → … → As-Built → Final) y sistema. Los ITR/procedimientos referencian una revisión y **avisan si quedó superada** ("never commission against an uncontrolled revision", 13.4). Red-lines como adjuntos versionados.

### Lo que **no** recomiendo construir (integrar en su lugar)
- **Permisos de trabajo / LOTO / SIMOPS / MOC completos.** Las operadoras (Ecopetrol, Geopark) ya tienen su sistema de PTW/MOC con implicaciones legales. Recomendado: **referenciarlos**, con número de permiso/MOC en acciones, registros y gates, y un criterio `manual_attestation` como "aislamientos verificados". Construirlos nos sacaría del foco y compite con sistemas corporativos.
- **Cálculos de ingeniería** (velocidad de flushing, purgas de N₂): útiles como calculadoras dentro del ITR más adelante, pero no mueven la aguja.

---

## 5. Orden recomendado y esfuerzo

| Horizonte | Fases | Sesiones aprox. | Por qué en este orden |
|---|---|---|---|
| **Ahora** | 0 | 1 | Bug de coherencia visible en Control Tower. |
| **Cimiento** | 1 → 2 → 3 | 8–11 | Sin gates, dependencias y registros, todo lo demás queda como formularios sueltos. Con ellos, el producto ya cuenta una historia distinta en una demo. |
| **Profundidad** | 4 → 5 | 5–6 | Mejora la calidad de la evidencia y el uso diario (reunión y reporte diario). Es lo que engancha al gerente de comisionamiento. |
| **Ciclo completo** | 6 → 7 → 8 | 8–9 | Cierra el ciclo hasta handover y operaciones. La fase 7 + IIoT es el argumento comercial más fuerte frente a la competencia. |

Total aproximado: **22–27 sesiones**. Cada fase se puede vender y demostrar por separado. Para Geopark/Ecopetrol, las fases 1 + 3 son las que más resuenan con un HSE y un gerente de proyecto.

## 6. Decisiones (Luis, 2026-10-12)
1. **Cat C no bloquea ningún gate.** La condición es que los pendientes queden bien categorizados desde que se levantan. Por eso se agrega a la **fase 4** una **guía/procedimiento de levantamiento de pendientes**:
   - criterios de categoría por impacto funcional y de seguridad, no por tamaño físico (9.19–9.20, 16.36);
   - ayuda en el formulario de punch con ejemplos por disciplina;
   - revisión de categoría por el supervisor;
   - un PDF de procedimiento para entregar al cliente.

   **Cat B** sigue como hoy en `eligibility.ts`: excepción justificada al emitir. *(Supuesto: confirmar.)*
2. **Gates por defecto = MC / RFPC / RFC / RFSU** (lo que CommUp ya tiene). Los demás gates del libro (Utility Ready, Functional, Process Introduction, Performance Test, Handover) quedan como **opcionales que cada org activa**.
3. **Líneas como tags tipo "line"** para los test packs. Nota de diseño (experiencia en la Refinería de Cartagena): los test packs suelen ser **grandes** y abarcan muchas líneas y a veces varios subsistemas. Entonces:
   - test pack ↔ líneas es **N:M** y no cuelga de un subsistema;
   - el avance se ve por línea y por pack;
   - hace falta importación masiva desde Excel (line list + asignación a packs).
4. **PTW / LOTO / MOC / SIMOPS se integran por referencia.** Cada compañía tiene sus propias reglas y procedimientos.
5. **Sin cambio de prioridad comercial.** El objetivo es **presentar a Geopark en unos meses**. Para la demo, lo ideal es tener listas F0 + F1 + F2 + F3 (la historia del "motor de readiness" con registros); F4–F5 suman si da el tiempo.

## 7. Decisiones de la fase 2 (Luis, 2026-10-15)
1. **Dependencias por fila con valores por defecto.** Cada dependencia dice «A necesita que B tenga aprobado el gate X antes de su gate Y». Defaults por posición (las orgs usan códigos distintos):
   - utility → proveedor en servicio (último gate, o `UTILITY` si la org lo activó) antes de comisionar el dependiente (penúltimo gate);
   - proceso / otro → último gate antes del último gate.

   En los gates aparece un criterio implícito «Sistemas de los que depende» (`dependencies_ready`), como el de gate anterior. Si el proveedor revoca, el dependiente aprobado queda *regresado*. No se permiten ciclos entre sistemas.
2. **P&ID:** en F2 los pines de tags se colorean y filtran por sistema. Los polígonos dibujados a mano quedan para una fase posterior (DEMO no tiene P&IDs cargados).
3. **Congelar límites es informativo + auditoría:** se registra quién y cuándo; los cambios posteriores de subsistemas/tags quedan en `activity_log` y se avisan, sin bloquear.
4. **DEMO para Geopark:** renombrar los 14 sistemas con nombres creíbles, asignar tipo/prioridad y sembrar dependencias.

Sesión 1 (BD) hecha: migración `20261015120000_system_dependencies.sql`, reglas puras en `src/lib/systems/dependencies.ts`, tests `tests/db/dependencies.test.ts`. Siguen la sesión 2 (ficha de sistema, matriz, importación Excel, Control Tower) y la 3 (IA, pines por sistema, datos de DEMO).

## 8. Decisiones de la fase 3 (Luis, 2026-10-15)
1. **Un motor de registros** con tipos de un **catálogo fijo en código** (temporales, ciegas, reinstalación, bypass, energización, test pack). La org activa/desactiva tipos y ajusta qué gate bloquea cada uno; los campos personalizados quedan para después.
2. **El test pack es el registro de prueba:** presión alcanzada, duración, resultado, testigo y firmas viven en el pack (su ciclo hace de firma). Relación pack ↔ líneas N:M (las líneas son tags). Las líneas quedan «probadas» cuando el pack se verifica. No se generan ITR por línea.
3. **Bloqueos por defecto del libro, editables:** ciegas y temporales → RFC (penúltimo gate); bypass y reinstalación → RFSU (último); test pack sin verificar → MC (primero); energización no bloquea. Bloquea todo ítem no verificado ni cancelado del sistema (por `system_id` o por sus tags).
4. **F3 sale online.** Captura offline de registros, después de validar el flujo con usuarios.
5. Ciclo común: propuesto → autorizado → activo → retirado/restaurado → verificado (+ cancelado). Autoriza una persona distinta de quien propuso; verifica una distinta de quien retiró. Escritura solo por RPC.

**Sesión 3 (Luis, 2026-10-15):**
6. **Avance derivado, sin migración:** una línea está *pendiente* hasta que un pack que la contiene se verifica (*probada*); *en prueba* si su pack está activo o retirado. Los packs cancelados no cuentan. El avance del pack es su etapa del ciclo.
7. **Import Excel (hojas *Packs* + *Líneas*):** solo vincula líneas que ya existen como tag; las filas con tags inexistentes se rechazan y se reportan (los tags entran por el import de jerarquía). Crea packs nuevos o actualiza los que siguen abiertos (por número).
8. **Pack ↔ ciegas:** verificar un pack con ciegas vinculadas aún instaladas solo **avisa**; la ciega sigue bloqueando su gate por sí misma.
9. **Etiquetas QR en PDF (pdf-lib):** el QR lleva `https://commup.app/r/<uuid>` (el número se repite entre proyectos); etiqueta suelta o hoja A4 desde la lista filtrada. `/scan` reconoce `/r/…`.

## 9. Avance al cierre del 2026-10-15
| Fase | Estado | Commits |
|---|---|---|
| F0 gates SQL = TS | ✅ en prod | 48842a0 |
| F1 motor de gates + multifirma + storage aislado | ✅ en prod | 2b5c41f, 12bcc83, e5e4338, 83e0760 |
| F2 sistematización (BD, ficha, matriz, Excel, IA, P&ID por sistema) | ✅ en prod; DEMO sistematizado por IA (14 sistemas, 33 dependencias) | e9a0e06, 6f04b96, d4506b0, 1dae918 |
| F3 registros — sesión 1 (BD) | ✅ en prod | 9e0edce |
| F3 registros — sesión 2 (pantallas) | ✅ en prod | 8c55523 |
| F3 registros — sesión 3 (test packs: avance por línea/pack, Excel line list, pack ↔ ciegas; etiquetas QR + /scan) | ✅ hecha; DEMO con TPK-0001 (A100-S01, PL-102/105, vinculado a CIE-0001) y TPK-0002 (OS01-S01, PL-101/103) | 5816c20 |
| F3 registros — sesión 4 (datos de DEMO) | ✅ DEMO con 30 registros (12 test packs, 6 ciegas, 4 temporales, 3 reinstalaciones, 3 bypass, 3 energizaciones) y 39 líneas nuevas; script re-ejecutable `scripts/demo-data/seed_registers_demo.sql` | cd338d2 |
| F4-A sesión 1: punch resuelto → verificado por otra persona (BD + acciones + modales); columnas de impacto, disposición PSSR y revisión de categoría en BD | ✅ migración `20261016120000_punch_evidence` aplicada | c237385, 871078c |
| F4-A sesión 2: revisión de categoría (cola en Mi trabajo), impacto obligatorio en los 3 formularios, guía por disciplina + PDF del procedimiento, disposición en PSSR (bloquea enviar/aprobar) | ✅ sin migración; DEMO: P-0266 (Cat A, A100-S02) bloquea el PSSR-002 por «cerrar antes del arranque» | 69a67eb, 1bb0e2d |
| F4-B equipos de prueba (calibración bloquea la firma del ITR) | ✅ migración `20261016150000_test_equipment`; inventario en /admin/test-equipment, sección en el ITR, PDF; 72 plantillas de DEMO y 44 del Catálogo marcadas | b866abb |
| F4-C tabla v2 (desviación calculada + tolerancia, resultado automático, as found/as left, series con estabilidad) | ✅ migración `20261016180000_itr_table_v2`; 3 presets v2; plantilla DEMO-CAL-V2 + ITR DEMO-CAL-V2/PT-101 | bd0e802 |
| F4-D sesión 1: datos de lazos y matriz C&E (cadena JB → marshalling → I/O → DCS → HMI en señales; import de señales con columnas LAZO y cadena; pantalla de matrices C&E con causas, efectos y cruces directos o con retardo; reemplaza a `interlocks`) | ✅ migraciones `20261016210000_loops_ce_matrix` y `20261016220000_ce_guard_fix` (el trigger evaluaba `signal_id` también en efectos y fallaba toda inserción); DEMO: matriz CE-A100-S02 (C-01 PT-101 HH → E-01 ESDV-7621003, T5s) y lazo L-101 | a24fa94 |
| F4-D sesión 2: ITR de loop check (I29C) y de prueba por causa (I30C) generados con tabla automática (filas `source` + columnas `reference`, foto inmutable); estado por cruce en la matriz y por lazo | ✅ migración `20261016230000_itr_source_rows`; revisiones F4-D en borrador (Catálogo v2, DEMO v3 activadas); DEMO: I29C/L-101 (fila aceptada) e I30C/CE-A100-S02/C-01 (E-01 aprobado) | 00d1df9 |
| F4-D sesión 3: IA para importar matrices C&E (Excel/PDF) con revisión humana; seed DEMO de lazos, señales y matrices | ✅ sin migración; probado con IA real: el PDF y el Excel de ejemplo dan 6×5 y 20/20 cruces (incl. T10), 4 tags en ámbar; DEMO: CE-A300-S01 importada del PDF; scripts `seed_loops_ce_demo.sql` y `make_ce_samples.mjs` | 2411f97 |
| F5 sesión 1: gestión diaria — acciones (ACC), restricciones (RES, escalamiento 1–4), TQ y decisiones (DEC, inmutables); hub `/projects/[id]/daily`, detalle con evidencia y línea de tiempo, Excel; PSSR «no» → acción; criterio `constraints_clear` en gates; colas en Mi trabajo; cron `constraints-overdue` | ✅ migración `20261017120000_daily_management` (probada con rollback: 33 casos) | c8646fc |
| F5 sesión 2: planificación — forecast/compromiso por sistema × gate con historial, look-ahead 90/30/7 (pestaña + grilla de fechas), avance físico ponderado por gate (pesos en /admin/gates; columna en Control Tower), KPIs calculables + curva S (`take_mgmt_snapshot` en el cron diario y en «Tomar snapshot») | ✅ migración `20261017150000_readiness_planning` (probada con rollback: 20 casos); DEMO 3,6 % ponderado | 31aaacc |
| F5 sesión 3: reporte diario (datos del día en SQL, borrador redactado por Claude solo con esos datos, 5 secciones, emisión inmutable con sha256, revisiones R1…, PDF regenerado) y relevo de turno (snapshot del campo, pendientes y notas de seguridad, firma de quien entrega y de quien recibe, cola en Mi trabajo) — **F5 COMPLETA** | ✅ migración `20261017180000_daily_report_handover` (probada con rollback: 27 casos); probado en DEMO con IA real (borrador creado y borrado) | fd1a33f |
| F6 sesión 1: procedimientos (15 secciones, pasos con hold point por capacidad y criterio de parada, revisiones con aprobación por otra persona, «verificado en campo», copiar entre proyectos, PDF) y su ejecución en móvil; hojas de line-up (filas desde válvulas del sistema, verificación independiente de las críticas, panel F3, desactualización); criterio de gate `lineup_verified` (RFSU en DEMO); colas en Mi trabajo | ✅ migración `20261017210000_startup_procedures_lineups` (probada con rollback: 37 casos); probado en DEMO (borradores creados y borrados) | f1df321 |
| F6 offline: ejecuciones y line-ups sin red (decisión §12.19) | ✅ migraciones `20261018090000_startup_offline` y `20261018093000_fix_log_sync_conflict` | d25b8f6 |
| F6 sesión 2: bitácora de arranque (6 hitos por sistema con testigo de capacidad fija, eventos libres, foto IIoT ±5 min con calidad, gráfico −30/+30 min, bloqueo duro de primer arranque/HC por gate RFSU + PSSR, franja en Control Tower, cola en Mi trabajo, eventos en el reporte diario); seed `seed_startup_samples_demo.sql` (1.200 muestras de A100-S02) | ✅ migración `20261018120000_startup_event_log` (probada con rollback: 22 casos); verificado en DEMO (evento de prueba borrado) | 3c56c02 |
| F6 sesión 3: readiness de operaciones — personal y matriz de competencias persona × sistema (niveles 0–4 con vencimiento), repuestos críticos y herramientas especiales, etapa de propiedad por sistema (Comisionamiento → Shadowing → Operación conjunta → Operaciones) con traspaso de dos firmas, checklist con excepciones justificadas y reversión con motivo; al llegar a Operaciones se genera el paquete de handover del sistema; chip en Control Tower y cola en Mi trabajo — **F6 COMPLETA** | ✅ migración `20261018150000_ops_readiness_ownership` (probada con rollback); verificado en DEMO: persona, evaluación, repuesto, pedir/firmar/cancelar traspaso (datos borrados). Después (autorizado por Luis): cadena completa Shadowing → Operación conjunta → Operaciones con la firma de B por SQL y la última en la UI; el traspaso se completa e intenta el paquete; en local falla por falta de `HANDOVER_SIGNING_SECRET` (solo existe como secreto en Cloudflare) y la UI muestra el aviso y «Generar paquete». Falta ver en commup.app el paquete generado con éxito | 6521d5f |
| 📌 Aplazado (Luis, 2026-10-16): tablas de calibración del catálogo → tabla v2; antes, validación campo por campo de los ITR | ⏸ | — |

Otros hechos del día: CI verde otra vez (estaba rojo desde 2026-09-09), `gh` CLI activo, org Ecopetrol borrada (quedan CommUp Catálogo y DEMO), API key de Anthropic rotada, IA migrada a `claude-opus-5-5`.

Pendiente de Luis: probar en commup.app el ciclo de CIE-0001 con dos personas (Outlook propone; `lf.perdomo+smtp` autoriza; verificar con el usuario que no retiró) y confirmar «Sugerir con IA» en producción. → Lista completa y vigente de pendientes en §13.

## 10. Decisiones de la fase 4 (Luis, 2026-10-15)
1. **Orden por bloques: A → B → C → D.** A = punch (verificación, impacto, guía de categorización, disposición PSSR); B = equipos de prueba con calibración; C = nuevos tipos de ítem (as found/as left, esperado/real, serie de lecturas); D = loops e interlocks ejecutables (loop check, pruebas C&E, IA para importar la matriz). Estimación realista: ~5 sesiones.
2. **Verificación en campo con estado «resuelto»** (implementado como sub-estado de `in_progress` con `resolved_at/by`, no como valor nuevo del enum: así gates, certificados, KPIs, API y export lo siguen contando como abierto sin tocar ~40 lugares): abierto → en curso → resuelto (quien lo arregló, con evidencia) → cerrado = verificado por **otra persona**. Un punch resuelto sigue abierto y bloqueando hasta verificarse (9.21).
3. **Calibración vencida bloquea la firma del ITR:** se puede capturar y guardar, pero no firmar ni aprobar hasta reemplazar el equipo. El aviso aparece desde que se elige el equipo.
4. **Revisión de categoría = marca + cola:** el punch cuenta con su categoría desde que se levanta; queda «sin revisar» y entra a la cola del supervisor en Mi trabajo, que confirma o recategoriza (con auditoría). Cat C sigue sin bloquear (§6.1).

**Bloque A, sesión 2 (Luis, 2026-10-15):**
5. **Impacto obligatorio al levantar un punch** desde la app (seguridad / proceso / equipo / operabilidad / ambiente). Los punch anteriores quedan sin impacto; la API y los workflows no lo exigen.
6. **La guía sugiere y avisa, no bloquea:** el impacto sugiere la categoría (seguridad/ambiente → A, proceso/equipo → B, operabilidad → C) y se avisa si se elige otra; se muestran ejemplos de la disciplina del tag. Decide quien levanta y después revisa el supervisor.
7. **La disposición bloquea el PSSR:** para enviar y para aprobar, todo punch abierto del sistema debe tener disposición, y ninguno marcado «cerrar antes del arranque» puede seguir abierto (16.37).
8. **PDF del procedimiento generado** (pdf-lib), con el nombre de la org y en el idioma del usuario: criterios, matriz impacto → categoría, ejemplos por disciplina, flujo resolver → verificar y revisión del supervisor. La versión editable por la org queda para después.

**Bloque B (Luis, 2026-10-15):**
9. **El equipo se registra por ITR** (sección «Equipos de prueba usados», uno o varios), obligatoria si la plantilla lo requiere. Se marcan automáticamente las plantillas que hoy piden el equipo por texto; esos ítems de texto se limpian después en el catálogo ITR v2.
10. **Inventario por organización**, usable en todos sus proyectos (con el contratista dueño del equipo).
11. **Certificado:** obligatorios el n.º de certificado, la fecha de calibración y el vencimiento; el PDF es opcional.
12. **Validez contra la fecha de uso** (13.42): vale si estaba vigente el día que se registró en el ITR. Si vence después, la firma posterior no se bloquea; si se registró ya vencido, bloquea.

**Bloque C (Luis, 2026-10-15):**
13. **Se extiende la tabla de registro (configuración v2, compatible con la v1)** en vez de crear tipos de ítem nuevos: se reutilizan el constructor, la evaluación TS/SQL, el PDF y la captura offline.
14. **Error y resultado calculados y bloqueados:** el inspector captura lo observado; la desviación (absoluta, % del span o % de la lectura) y el ✓/✗ salen de la tolerancia de la plantilla. CommUp y SQL recalculan siempre: lo que mande el cliente no cuenta.
15. **As found fuera de tolerancia solo se marca** (dato para calidad/mantenimiento, en pantalla y PDF); la aceptación se evalúa con as left.
16. **Serie de lecturas manual con criterio de estabilidad** (las últimas N lecturas dentro de [mín, máx]); traerlas de IIoT (`signal_samples`) queda para cuando haya datos.

**Bloque D (Luis, 2026-10-15):**
17. **Loop check y prueba C&E se ejecutan como ITR generado** desde una plantilla (I29C / I30C v3) con su tabla armada automáticamente: heredan firmas, equipo de prueba calibrado, tabla v2, PDF, offline y bloqueo de gates.
18. **C&E: una prueba por causa** (disparo), con una fila por efecto: acción esperada/observada, realimentación, tiempo y reset. Se puede repartir entre cuadrillas.
19. **El loop check se arma desde las señales del lazo:** cadena campo → JB → marshalling → canal I/O → tag DCS → HMI, puntos del rango y disparos de alarma; el técnico registra lo observado.
20. **Importar la matriz C&E con IA desde Excel y PDF:** Claude propone causas, efectos y cruces; una persona revisa y acepta antes de guardar (nunca se guarda sin revisión).
21. **Foto al generar (sesión 2):** las filas del ITR (señales del lazo con su cadena / efectos de la causa con acción y retardo) se copian al crearlo en `itrs.source_rows` y quedan inmutables; si el lazo o la matriz cambian, la pantalla avisa «desactualizado» y se genera una revisión (R2).
22. **Revisiones nuevas de las plantillas:** I29C e I30C «Revisión F4-D» como borradores en el Catálogo (v2) y en DEMO (v3), con la tabla armada desde el lazo (M.1) o la causa (E.1). Activarlas es decisión del editor; en DEMO se activaron para probar.
23. **Generación individual y masiva:** botón por lazo y por causa, y «Generar faltantes» por lista de lazos / por matriz; siempre con inspector (y supervisor opcional). Las plantillas con tabla de lazo/matriz no aparecen en la asignación por tag.
24. **La matriz muestra el resultado por cruce:** cada celda toma el resultado de su efecto en el ITR vigente de la causa (✓ verde / ✗ rojo / pendiente) y una columna «Prueba» muestra número, estado y si quedó desactualizado.
25. **Importar con IA: revisión en pantalla previa (sesión 3):** la IA (Claude) lee la hoja de Excel elegida (como CSV) o el PDF (≤ 4 MB) y propone causas, efectos y cruces; la propuesta se revisa en una grilla editable y nada se guarda hasta «Aceptar y crear matriz» (`source = 'ai'`). Cerrar la página descarta la propuesta.
26. **Tags no encontrados: marcar y seguir:** se emparejan sin mayúsculas/espacios; los que no existen quedan en ámbar y se guardan sin tag, con el número leído en las notas.
27. **Una matriz por archivo:** Excel con hoja elegida; si el documento trae varias, se indica cuál en la indicación para la IA.
28. **Seed DEMO medio + archivos:** 12 lazos con 20 señales y cadena (A100-S02 y A200-S01), CE-A100-S02 (6×5, 19 cruces) y CE-A200-S01 (5×4, 15 cruces); ejemplos `docs/samples/CE-A300-S01-001.xlsx` y `.pdf` (deetanizadora, con tags inexistentes a propósito).

## 11. Decisiones de la fase 5 (Luis, 2026-10-16)
1. **Orden en 3 sesiones: registros → planificación → reporte.** S1 = tracker de acciones unificado + registro de restricciones + TQ + log de decisiones. S2 = forecasts por sistema × gate + look-ahead 90/30/7 + avance ponderado por gate y KPIs nuevos. S3 = reporte diario PDF con borrador IA + relevo de turno.
2. **Modelo: acciones + 3 registros.** Una tabla `actions` con origen polimórfico (PSSR / restricción / reunión / TQ / vendor / desempeño), dueño, fecha, prioridad, método de verificación y evidencia de cierre; tablas propias para restricciones (8 campos del libro, escalamiento 1–4), TQ y decisiones. Restricciones y TQ generan acciones; un ítem PSSR en «no» crea su acción automáticamente.
3. **Forecast manual + compromiso por sistema × gate.** Forecast = mejor estimación (editable libremente); compromiso = fecha firme con historial de cambios y motivo. El look-ahead combina ambas con las fechas planificadas de los work plans.
4. **Reporte diario: borrador IA editable + emisión.** Cada día se genera un borrador (datos + redacción de Claude); el responsable lo edita y lo emite, y queda inmutable en PDF. El relevo de turno es un formulario precargado (bypasses, aislamientos y temporales activos de la F3, más pendientes) que firman quien entrega y quien recibe.

**Sesión 1 — esquema (Luis, 2026-10-16):**
5. **Tablas:** `actions` (ACC), `project_constraints` (RES), `technical_queries` (TQ), `decisions` (DEC, inmutables; solo se reemplazan con `superseded_by`), más `mgmt_events` (línea de tiempo común) y `mgmt_attachments` + bucket `mgmt-evidence` (`<project_id>/<kind>/<entity_id>/…`, inmutable). RLS de solo lectura con `get_my_project_ids()`; escritura solo por RPC SECURITY DEFINER. `client` solo lee, pero puede responder TQ. UI: hub `/projects/[id]/daily` con pestañas, colas en Mi trabajo, bloque en Control Tower y chip en el PSSR.
6. **Restricciones en los gates: condición, no bloqueo.** Una restricción abierta con gate asignado deja el gate en «listo con condiciones»; si es de nivel 4, lo bloquea.
7. **Escalamiento manual con motivo + aviso al vencer:** al pasar la fecha requerida se marca vencida, sale en Mi trabajo y el cron notifica al responsable sugiriendo escalar.
8. **PSSR «no» → acción automática; al verificarse la acción solo se avisa:** el ítem lo pasa a «sí» quien ejecuta el PSSR.
9. **Las acciones las verifica siempre otra persona** distinta de quien las cerró.

**Sesión 2 — planificación (Luis, 2026-10-16):**
10. **Forecast y compromiso por sistema × gate.** El forecast lo edita cualquier rol que no sea client; el compromiso solo líderes o superiores, y cada cambio pide motivo y queda en el historial. Se edita en el detalle del sistema en Control Tower y en bloque desde la grilla del look-ahead.
11. **El look-ahead 90/30/7 muestra todo lo que vence:** gates por forecast y compromiso (con la brecha y el riesgo si no están listos), más acciones, restricciones, TQ e ítems de work plan de la ventana, agrupados por sistema. Va como pestaña «Look-ahead» en Gestión diaria.
12. **Avance ponderado = % de ITR aprobados de la fase del gate × peso del gate** (configurable en /admin/gates, partes iguales por defecto), calculado en SQL. El readiness (gates aprobados) se muestra aparte (7.8).
13. **KPIs ahora: solo los calculables, con snapshot diario por sistema** (para curvas S): cierre de TQ, acciones vencidas y cerradas a tiempo, antigüedad de restricciones por nivel, cumplimiento del compromiso por gate y avance ponderado. Primer arranque, falla repetida, completitud documental y readiness de vendors quedan para las F6–F8.
14. **Esquema S2:** `readiness_gates.weight` (NULL = partes iguales), `system_gate_plans` (forecast/compromiso por sistema × gate) + `system_gate_plan_events` (historial; el motivo es obligatorio al cambiar un compromiso), `system_progress_snapshots` (por sistema y día) y `mgmt_kpi_snapshots` (por proyecto y día), generados por `take_mgmt_snapshot` desde el cron `/api/cron/snapshot`. UI: pestaña Look-ahead (con grilla para editar fechas), forecast y compromiso por gate en Control Tower, columna de avance en la matriz, pesos en /admin/gates y curva S en KPIs.
15. **Avance del proyecto = sistemas ponderados por su cantidad de ITR.**
16. **Un gate con fase pero sin ITR en el sistema cuenta 0 %** y se marca «sin ITR» (progress by evidence).

**Sesión 3 — reporte diario y relevo (Luis, 2026-10-16):**
17. **Un reporte diario por proyecto**, con secciones por sistema solo donde hubo movimiento (se puede filtrar por área al generarlo, pero se emite uno).
18. **El borrador nace de un botón:** los datos del día se calculan en SQL (avance y delta, ITR, punch, gates, restricciones, acciones, TQ, registros F3 activos, look-ahead a 7 días) y Claude redacta el resumen y los eventos clave. Las cifras van en tablas desde los datos; la IA no las inventa.
19. **Edición en 5 secciones fijas** (resumen, eventos clave, fallas/problemas, restricciones, plan del día siguiente), con las tablas congeladas como foto del momento. Al emitir, el reporte queda inmutable y se genera el PDF (pdf-lib) con hash; corregirlo requiere una revisión R1.
20. **El relevo de turno es por proyecto y lleva dos firmas en la app.** Quien entrega lo abre (turno día/noche o libre) con todo precargado: bypasses, aislamientos, ciegas y temporales activos (F3), ITR en curso, punch A y restricciones abiertas, más sus pendientes y notas de seguridad. Firma con su sesión; quien recibe (otra persona) lo revisa y firma, y queda inmutable. Los relevos sin recibir salen en Mi trabajo. Va como pestaña «Relevo» en Gestión diaria.
21. **Esquema S3:** `daily_reports` (RD-<proyecto>-AAAAMMDD[-Rn]; `data` congelado + 5 secciones + `ai_draft`; emitir = inmutable + sha256; las revisiones reemplazan a la anterior) y `shift_handovers` (REL-0001; snapshot precargado en SQL, pendientes y notas, firma de quien entrega y de quien recibe, que debe ser otra persona). RPCs: `daily_report_data` (agregados SQL del día), borrador/edición/emisión/revisión, abrir/entregar/aceptar relevo; `my_work_counts.handovers_to_receive`. La IA (salida estructurada zod) redacta solo con el JSON y nunca pisa lo ya editado; sin clave, el borrador se crea igual.
22. **PDF regenerado desde los datos congelados** (sin storage): lo inmutable son los datos y el hash.
23. **El relevo lo abre y entrega cualquier rol salvo client;** recibe otra persona que tampoco sea client.

## 12. Decisiones de la fase 6 (Luis, 2026-10-16)
1. **Orden en 3 sesiones: procedimientos → arranque → operaciones** (el orden en que ocurre en campo). S1 = biblioteca de procedimientos + hojas de line-up. S2 = bitácora de eventos de arranque con parámetros desde IIoT (`signal_samples`). S3 = readiness de operaciones (matriz de competencias, repuestos críticos) + estados de propiedad del sistema con traspaso firmado.
2. **Procedimientos con motor propio estructurado.** Plantilla de 15 secciones (6.13) con tabla de pasos: acción, responsable, hold point (quién lo libera), criterio de parada y valor esperado. Las revisiones siguen el ciclo borrador → aprobado, como las plantillas ITR, y «verificado en campo» queda como firma tras un walkdown (17.4.3). Cada ejecución por sistema se hace en móvil paso a paso: un hold point no se pasa sin la firma de quien lo libera y un criterio de parada detiene la ejecución.
3. **Line-up como hoja por sistema + criterio de gate.** La hoja se genera con las válvulas y equipos del sistema (por tipo de equipo), con la posición requerida (abierta/cerrada/LO/LC/auto). Se ejecuta en móvil (posición encontrada → verificada por); las críticas exigen verificación independiente de otra persona (17.16). Muestra las ciegas y bypass activos de la F3. Nuevo criterio implícito de gate `lineup_verified` antes del gate de arranque.
4. **Propiedad del sistema por estados con traspaso firmado** (16.60): Comisionamiento → Shadowing → Operación conjunta → Operaciones. Cada paso lo firman Comisionamiento y Operaciones (dos personas) con un checklist de prerrequisitos calculado (gate requerido, competencias ≥ umbral, repuestos críticos, line-up y procedimiento verificados). El paso final puede generar el paquete de handover existente. Se ve en Control Tower.

**Sesión 1 — procedimientos y line-ups (Luis, 2026-10-16):**
5. **Esquema S1:** hub «Arranque» (`/projects/[id]/startup`). `procedures` (PRC-0001) → `procedure_revisions` (15 secciones en jsonb; borrador → en revisión → aprobado → reemplazado; aprueba un líder+ distinto del autor; «verificado en campo» lo firma alguien distinto de quien aprobó; hash al aprobar) → `procedure_steps` (acción, responsable, valor esperado, tag, hold point con la capacidad que lo libera, criterio de parada). `procedure_runs` / `procedure_run_steps`: solo sobre revisiones aprobadas, pasos en orden, hold point detenido hasta su liberación, «Detener» con motivo, reanudar líder+. `lineup_sheets` (LU-0001) / `lineup_items` (filas generadas desde tags de categoría Válvulas + filas manuales; posición requerida/encontrada; las críticas con verificación independiente); panel F3 del sistema; «posiblemente desactualizada» si cambia un registro F3 después de verificar. `readiness_gates.requires_lineup` + criterio implícito `lineup_verified`.
6. **Las 15 secciones son un catálogo fijo en TS:** propósito, alcance y límites, referencias, definiciones, responsabilidades, seguridad y HSE, prerrequisitos, aislamientos y estado temporal, equipos y herramientas, line-up inicial, secuencia (pasos), criterios de parada y contingencias, criterios de aceptación, restitución y estado final, registros y anexos. Las secciones vacías no salen en el PDF.
7. **El hold point lo libera la capacidad indicada en el paso** (Comisionamiento / Operaciones / HSE, roles como en las co-firmas de gates), siempre una persona distinta de quien ejecutó el paso.
8. **Biblioteca por proyecto**, con «Copiar desde otro proyecto», que crea un borrador R0.
9. **Ejecuciones y line-ups en línea en la S1**; el modo offline queda para una sesión aparte (reglas de conflicto para hold points y verificación independiente).

**Sesión 2 — bitácora de arranque (Luis, 2026-10-16):**
10. **Hitos fijos + eventos libres.** Los hitos por sistema (17.27/17.33) van en un catálogo fijo: primera energización, primera rotación, primer arranque, primer HC, primera operación estable y primer producto on-spec. Cada uno se registra una sola vez y lo firma un testigo. Además hay eventos libres (trip, alarma relevante, desviación, parada, observación). Todos llevan hora, sistema, tags, ejecución de procedimiento vinculada y parámetros. Pestaña «Bitácora» del hub Arranque + línea de tiempo en el detalle del sistema en Control Tower.
11. **IIoT: foto al registrar + gráfico.** Se eligen señales del sistema (sugeridas por sus tags); la BD congela la muestra más cercana dentro de ±5 min, con su calidad, y la ficha grafica −30/+30 min desde `signal_samples_1min`. Sin datos, el valor se carga a mano marcado «manual». Las muestras llegan por la API v1 existente. La detección automática de hitos queda para después.
12. **Primer arranque y primer HC con bloqueo duro:** no se registran si el gate de arranque del sistema no está aprobado con todas sus firmas y el PSSR del sistema no está aprobado.
13. **DEMO con curva de arranque simulada:** script re-ejecutable en `scripts/demo-data` con 2 h de muestras por minuto para las señales de A100-S02 (compresor C-103), ingresadas por la API v1 como un PLC.
14. **Esquema S2:** `startup_events` (EVT-0001; hito o libre; un hito no anulado por sistema; testigo; anular con motivo) + `startup_event_tags` + `startup_event_params` (foto IIoT: muestra más cercana dentro de ±5 min con calidad y desfase; `iiot_missing` → carga manual). RPCs `startup_prerequisites`, `record_startup_event`, `witness_startup_event`, `add_startup_event_param`, `void_startup_event`; gráfico −30/+30 min desde `signal_samples_1min`; `my_work_counts.milestones_to_witness`. UI: pestaña Bitácora (franja de 6 hitos por sistema + línea de tiempo), ficha con gráfico, franja en Control Tower.
15. **El gate de arranque es el que exige line-up** (RFSU en DEMO); si una org no marcó ninguno, el último gate activo.
16. **El testigo tiene capacidad fija por hito:** Comisionamiento atestigua la primera energización y la primera rotación; Operaciones, el primer arranque, el primer HC, la operación estable y el producto on-spec. Siempre otra persona, con los roles de `hold_release_roles`.
17. **Seed DEMO por script SQL re-ejecutable** (`scripts/demo-data/seed_startup_samples_demo.sql`, lote `SIMULATOR`, ~720 muestras de A100-S02 fechadas el día en que se corre).
18. **Los eventos del día entran al reporte diario** (`daily_report_data.startup_events_today`); los reportes ya emitidos no cambian.
19. **Offline de ejecuciones y line-ups (sesión aparte, d25b8f6):** sin red se encolan pasos (hecho / N/A / llegar a un hold point), «Detener» y posiciones de line-up; liberar, verificar, reanudar, completar y abortar siguen exigiendo red. Las RPC aceptan `p_captured_at` (hora de campo acotada; `synced_at` marca lo que llegó por sincronización). El line-up usa compare-and-set: un conflicto lo decide el usuario y la misma posición es redundante y no borra una verificación ajena. Los rechazos quedan en una bandeja visible «No sincronizado» (reintentar / aplicar / descartar), y un paso rechazado retiene los posteriores de la misma ejecución.


**Sesión 3 — readiness de operaciones (Luis, 2026-10-16):**
20. **Registro de personal propio por proyecto** (nombre, empresa, cargo, turno), vinculable a un usuario de la app pero sin exigirlo: los operadores de la operadora cuentan aunque no tengan cuenta.
21. **Competencia por persona × sistema en niveles 0–4** (0 sin entrenamiento · 1 en entrenamiento · 2 con supervisión · 3 autónomo · 4 puede entrenar), con evaluador, fecha, evidencia y vencimiento. El umbral por sistema fija cuántas personas en nivel 3 o más hacen falta (por defecto 2).
22. **Prerrequisitos del traspaso: matriz fija + excepción firmada.**
    - A Shadowing: procedimiento de arranque aprobado y verificado en campo, y personal en nivel ≥ 1.
    - A Operación conjunta: gate de arranque aprobado, line-up verificado, «primer arranque» atestiguado y personal en nivel ≥ 2.
    - A Operaciones: umbral de nivel ≥ 3, repuestos críticos disponibles y sin punch Cat A abiertos.
    Si falta algo se puede firmar como excepción justificada, y queda marcado en el traspaso. Lo firman Comisionamiento y Operaciones, dos personas distintas.
    Repuestos y herramientas especiales: lista liviana por sistema (ítem, n.º de parte, tag, crítico, cantidad requerida/disponible, estado, ETA).
23. **Al completarse el traspaso a Operaciones se genera automáticamente el paquete de handover** existente (PDF + JSON con hash), solo para ese sistema, enlazado al traspaso.
24. **Esquema S3:** `ops_personnel`, `competency_records` (historial; el nivel vigente es la última evaluación no vencida; una vencida cuenta como 0; la registra un líder+ o una persona de nivel 4 en el sistema, nunca uno mismo), `system_competency_targets`, `critical_spares`, `system_ownership` (sembrada en `commissioning`) y `ownership_transfers` (TRF-0001; checklist congelado + excepciones justificadas; firma Comisionamiento (líder+) y Operaciones (líder+ o client), dos personas; la segunda firma recalcula el checklist; reversión a una etapa anterior sin checklist y con motivo). RPCs `ownership_checklist`, `request/sign/cancel_ownership_transfer`, `link_transfer_handover`; `my_work_counts.transfers_to_sign`. UI: pestaña «Operaciones» (sistemas, matriz de competencias, personal, repuestos), detalle del traspaso, chip en Control Tower.
25. **El umbral de personal competente se cuenta por turno** (por defecto 2 por cada turno registrado del personal del sistema); sin turnos cargados, en total.
26. **Si un sistema en Operaciones se revierte, su paquete de handover pasa a SUPERSEDED** y se vuelve a generar en el próximo traspaso a Operaciones.

---

## 13. Pendientes consolidados (cierre del 2026-10-16)

Hoy quedaron en prod las **fases 5 y 6 completas** (6 sesiones + offline): c8646fc, 31aaacc, fd1a33f, f1df321, d25b8f6, 3c56c02 y 6521d5f. Del plan readiness están hechas F0–F6.

### 13.1 Fases del plan que faltan (5–6 sesiones)

| Fase | Sesiones | Alcance (ver §4) |
|---|---|---|
| **F7 — Prueba de desempeño** | 2–3 | Definición (frontera, objetivo, criterios, condiciones, duración, frecuencia de datos, correcciones, incertidumbre); ejecución con estabilización vs periodo formal, perturbaciones, datos manuales o desde `signal_samples`, validación y reconciliación entre medidores; resultado en 5 categorías; certificado con aceptación de Comisionamiento, Operaciones y Cliente + PDF de 14 secciones. |
| **F8 — Vendors y control documental** | 3 | Entidad empresa/parte (RACI y firmas por empresa); paquetes de vendor (límites e interfaces, gate de movilización, FAT/SAT con hallazgos, recomendaciones solo con MOC, desmovilización); registro maestro de documentos con revisiones y aviso de revisión superada en ITR/procedimientos. |

### 13.2 Pendientes menores del propio plan

- **F1:** notificaciones de gate (listo para aprobar / pendiente de firma).
- **F5:** ✅ todos los KPIs de §11.13 activos (primer arranque y falla repetida en F7-S3; completitud documental y readiness de vendors en F8-S3).
- **F6-S3:** en local no se puede generar el paquete de handover porque `HANDOVER_SIGNING_SECRET` solo existe en Cloudflare. Opcional: agregar un valor de prueba a `.env.local`.
- **Fechas en pantalla:** algunos detalles (traspaso, bitácora) mezclan el formato del servidor y del navegador (`toLocaleString` con `suppressHydrationWarning`). Cosmético: unificar con un componente de hora local.
- **F4-D:** importación de señales con columnas de la cadena (JB → HMI) no probada de punta a punta en el navegador (subir xlsx).
- **F2:** P&ID coloreado por estado/sistema no verificado visualmente (DEMO no tiene P&IDs cargados).

### 13.3 Pruebas pendientes de Luis en commup.app

- **F6-S3:** completar un traspaso a Operaciones con dos personas y confirmar que el paquete de handover se genera y el PDF descarga. La 2.ª firma, el aviso de fallo y «Generar paquete» ya se verificaron en DEMO (datos borrados).
- **F5:** ciclo de una acción con dos personas (cerrar con evidencia → verificar) y subir evidencia (el navegador integrado no adjunta archivos).
- **F4:** P-0006 y P-0266 (impacto/disposición; PSSR-002 bloqueado), firma de E14-1B/BAT-101 R2 con equipo de prueba, DEMO-CAL-V2/PT-101, revisar y activar las revisiones «F4-D» I29C/I30C, «Importar con IA» (C&E).
- **F3:** ciclo de CIE-0001 con dos personas (Outlook propone; `lf.perdomo+smtp` autoriza; verifica alguien distinto de quien retiró), QR imprimibles y `/scan`.
- **F2:** confirmar «Sugerir con IA» en producción.
- **F6-S1:** PDF de un procedimiento.

### 13.4 Aplazado por decisión de Luis

- **Validación campo por campo de los ITR** → después, pasar las tablas de calibración del catálogo a tabla v2 con tolerancias reales (I10A v3, I05A, I11A, P03A, E32A; y reemplazar por la sección de equipos de prueba las tablas E26A M.2, E49BV-1 M.3/M.5/M.7, I33C T.1). No proponer hasta que Luis lo retome.
- **Plan de migración ITR v2** (`docs/PLAN-MIGRACION-ITR-V2-2026-09-09.md`): activar los borradores v2 por lote en DEMO y re-sincronizar el catálogo; queda detrás de la validación anterior.

### 13.5 Arrastrados de antes del plan readiness (verificar si siguen vigentes)

Del lado de Luis:
- Supabase Pro y, con él, «leaked password protection» (pospuesto hasta la reunión con Geopark; si piden BD propia cambia el plan).
- Regla WAF de Cloudflare para `/api/v1/*` y `/login`: falta la prueba de ráfaga con 429.
- Admin → Plantillas «ES · Traducir faltantes»; revisar la matriz IA; Excel de matriz mental.
- Excel de Geopark (cable schedule, line list, equipos): bloquea los bloques de cables/líneas y la org Geopark.
- Validar en prod el diálogo «Remover» con contexto (699b741) y la barra inferior móvil en el teléfono (33d4048).
- Baja prioridad: push en su navegador, token de Cloudflare Web Analytics, social proof (espera primeros clientes).

Del lado de Claude (proponer antes de codear):
- One-pager para Geopark «dónde vive la BD» (RLS / proyecto Supabase dedicado / self-hosted, costos y garantías).
- «Mi perfil» + avatar + logo de la org; opción B de marca (maqueta primero); etiqueta «(inactivo)» transversal.
- Deuda técnica: componentes grandes (`ItrExecution.tsx`, `TemplateBuilder.tsx`, `TagDetail.tsx`) y casts `as unknown as` residuales.
- Basura en DEMO: 4 plantillas QA-*-20260909 con 1 ITR cada una; M13B nueva inactiva que no está en Catálogo.
- Superusuario de plataforma: pospuesto hasta tener clientes reales.
- CLAUDE.md da la paginación (Sprint E) como pendiente, pero ITRs, tags, punches, KPIs y explorer se paginaron/agregaron en septiembre (641a1fc, 85db944, 2a98b70): revisar qué listados quedan sin paginar y corregir el texto.

## 14. Decisiones de la fase 7 (Luis, 2026-10-17)
1. **Frontera de N sistemas** con un sistema principal (el que se ve en Control Tower y alimenta el gate). Las pruebas de capacidad suelen abarcar una unidad o un tren completo.
2. **Criterios estructurados calculados por la BD:** variable (señal IIoT o captura manual) × estadístico (promedio, mín, máx, % del tiempo dentro de banda, total acumulado) × condición (≥, ≤, entre) con objetivo, unidad e incertidumbre ±. Variables derivadas de dos operandos (+ − × ÷), p. ej. eficiencia = A / B. Sin fórmulas libres.
3. **Definición con revisiones** borrador → en revisión → aprobada → reemplazada (aprueba un líder+ distinto del autor; hash al aprobar), como los procedimientos. Cambiar la definición = revisión nueva; una ejecución en curso sobre la revisión anterior queda marcada. La definición incluye frontera, objetivo, condiciones de proceso, duración de estabilización y del periodo formal, frecuencia mínima de datos, correcciones e incertidumbre (7.22, 18.6).
4. **Ejecución por intentos (R1, R2…):** estabilización (no cuenta) → periodo formal → cierre. Las perturbaciones se registran con su ventana; quien dirige puede marcarlas «excluir del cálculo» con motivo. Si la cobertura válida cae bajo el mínimo, el resultado sugerido es «repetir» o «no concluyente».
5. **Datos congelados en agregados de 1 minuto** (prom/mín/máx/n.º) copiados a una tabla propia al cerrar el periodo formal, porque `signal_samples` se purga a los 90 días. Las capturas manuales entran a la misma serie marcadas «manual».
6. **Validación y reconciliación automáticas, solo informan** (no corrigen): faltantes (cobertura vs frecuencia), calidad ≠ 0, picos (fuera del rango del instrumento o salto > X), unidades (señal ≠ criterio bloquea el cálculo); pares de medidores con diferencia máxima en % (18.30–18.31).
7. **Resultado en 5 categorías (18.35): la BD sugiere, una persona decide.** Todo cumple → aceptado; algún criterio falla solo dentro de la incertidumbre → aceptado con desviación; datos insuficientes → no concluyente; falla fuera de la incertidumbre → falló. «Repetir» es siempre humano. Lo registra un líder+; apartarse de la sugerencia exige motivo. «Falló» y «aceptado con desviación» crean una acción F5 con origen `performance`.
8. **Certificado propio PTC-0001** (no reutiliza `certificates`, que exige fase) con tres firmas de personas distintas: Comisionamiento (líder+), Operaciones (`hold_release_roles`) y Cliente (rol client) (18.47). `readiness_gates.requires_performance` + criterio implícito `performance_accepted`. PDF de 14 secciones (18.46) desde los datos congelados, sha256, inmutable. Cola en Mi trabajo y eventos en el reporte diario.
9. **Tres sesiones:** S1 esquema, definición con revisiones, ejecución con periodos y perturbaciones, captura manual y congelado. S2 validación, cálculo de criterios, resultado, certificado con 3 firmas, PDF y criterio de gate. S3 (corta) DEMO con el simulador (capacidad del compresor C-103 en A100-S02: 1 h de estabilización + 6 h formales, una perturbación y un par de medidores), KPIs F5 pendientes de F7 y chip en Control Tower.
10. **Todo en línea** (sin offline): la prueba se dirige desde sala de control.

**Sesión 1 — definición y ejecución (Luis, 2026-10-17; commits 5221e82, bd09aff):**
11. **Esquema S1** (migración `20261019120000`, aplicada en prod): `performance_tests` (PTT-0001, sistema principal) → `performance_test_revisions` (8 secciones = `PERFORMANCE_SECTIONS` en `src/lib/performance/catalog.ts` = SQL `performance_section_keys()`; duraciones de estabilización y periodo formal, frecuencia mínima, cobertura mínima; procedimiento de prueba opcional; hash al aprobar) + `performance_revision_systems` (frontera) + `performance_variables` (clave A–Z, señal con unidad = `eng_unit`, manual, derivada de dos operandos sin ciclos, salto máximo por minuto) + `performance_criteria` + `performance_meter_pairs`. `performance_runs` (PTT-0001/R1): planned → stabilizing → formal → closed | aborted; `performance_disturbances`; `performance_run_data` (agregados de 1 minuto congelados con `n_good`/`n_bad`, más las lecturas manuales). Escritura solo por RPC; dirigir la prueba y aprobar = líder+ (`performance_is_lead`).
12. **Cierre manual** del periodo formal; antes de la duración definida exige motivo y queda marcado «cierre anticipado». Pasar a formal antes de la estabilización mínima también exige motivo.
13. **Un solo intento vivo por prueba** (índice único parcial); R2 se abre con R1 cerrado o abortado. `refreeze_performance_run` vuelve a traer los datos IIoT tardíos sin tocar las lecturas manuales.
14. Horas reales: no futuras, no anteriores al hito previo, como máximo 48 h atrás. En la UI, una hora del mismo minuto en que empezó la estabilización se ajusta a ese instante (el campo no tiene segundos).

Verificación: escenario SQL de 13 casos con rollback en prod; navegador con Outlook (definición, envío, R1 completo con lectura manual, perturbación excluida, formal y cierre anticipados, re-congelado). R0 la aprobó `lf.perdomo+smtp` por SQL (autorizado por Luis). Queda en DEMO como base para la S3: **PTT-0001 «Capacidad del compresor C-103»** (A100-S02; P = PT-101, F1 = FT-106, F2 = FT-107, KW manual, ESP = KW ÷ F1; criterios prom(F1) ≥ 17,5 ± 1 %, %t(11 ≤ P ≤ 12) ≥ 95 %, prom(ESP) ≤ 90; par F1↔F2 5 %) con **R1 cerrado anticipadamente** (sin datos IIoT: el simulador no tenía muestras recientes).
Siguiente: **S2** — validación (cobertura, calidad, picos, unidades), cálculo de criterios incl. derivadas y pares, resultado sugerido en 5 categorías + decisión, acción F5, certificado PTC con 3 firmas, PDF de 14 secciones, `requires_performance` + `performance_accepted`, cola en Mi trabajo.

**Sesión 2 — evaluación, resultado, certificado y gate (Luis, 2026-10-17):**
15. **Evaluación en SQL como única fuente de verdad** (`evaluate_performance_run`, en vivo hasta registrar el resultado; luego congelada en el intento con hash). Ventana válida = periodo formal menos perturbaciones excluidas. Validación por variable: cobertura (señales por `sample_interval_s`; manuales por un campo nuevo por variable «lectura cada N min», default 60), calidad (`n_bad`), picos (salto > `max_step` o fuera del rango del instrumento) y unidad actual de la señal. Las manuales se sostienen hasta la siguiente lectura para las derivadas.
16. **Estadísticos sobre el promedio de cada minuto** (no sobre mín/máx crudos). Criterio: pasa · dentro de la incertidumbre · falla · no evaluable.
17. **Pares de medidores:** diferencia relativa promedio ≤ máximo; si no, el resultado sugerido es no concluyente.
18. **Resultado sugerido:** no concluyente (cobertura insuficiente, unidad inválida, par fuera, cierre anticipado) → falló → aceptado con desviación → aceptado. Lo registra un líder+; «repetir» es humano; apartarse exige motivo. Registrado = intento inmutable. Falló / aceptado con desviación crean una acción F5 (origen `performance`).
19. **Certificado PTC** con tres firmas de personas distintas: Comisionamiento (líder+), Operaciones (`hold_release_roles('operations')`) y **Cliente estricto (solo rol `client`)**. Un certificado vigente por prueba; revocar con motivo (líder+).
20. **`performance_accepted` aplica solo a sistemas que son principales de alguna prueba**; los demás lo ven «no aplica». `readiness_gates.requires_performance` por defecto false.
21. **Una migración, dos entregas:** S2a (evaluación, resultado, acción, gate) y S2b (certificado, PDF de 14 secciones, Mi trabajo, reporte diario).

**Avance S2a (2026-10-17; commits 9a3a16b y siguiente):** migración `20261019150000` aplicada en prod con toda la BD de la S2 (evaluación, resultado, acción F5, PTC con tres firmas, `requires_performance` + `performance_accepted`, colas `performance_to_decide`/`performance_to_sign` en `my_work_counts`, `performance_today` en `daily_report_data`; estos tres últimos parcheados con `pg_get_functiondef` + ancla única). Escenario SQL con rollback de 5 intentos (aceptado; aceptado con desviación + ACC; falló; no concluyente por cobertura → aceptado al excluir la ventana; no concluyente por par), 3 firmas con «otra persona» y Cliente estricto, gate rojo → verde → rojo al reemplazar el PTC, «no aplica», revocación, colas y reporte diario. UI S2a: panel de evaluación y registro del resultado en la consola, chips de resultado, «lectura cada N min», criterio en Control Tower e interruptor en `/admin/gates` (apagado en todas las orgs). DEMO: PTT-0001/R1 registrado «No concluyente» (sin datos, cierre anticipado).
Sigue **S2b**: UI del certificado PTC (emitir, firmas, revocar), PDF de 14 secciones, colas en `/my-work` y sección en el reporte diario (PDF/IA).

**Avance S2b (2026-10-17; c57a1ab):** UI del certificado PTC en la consola del intento (emitir = firma Comisionamiento; Operaciones y Cliente con «otra persona»; revocar con motivo) y chip del PTC vigente en la ficha; reporte PDF de 14 secciones en `/projects/[id]/startup/performance/runs/[runId]/pdf` (`src/lib/pdf/performance-report.ts`, regenerado desde la evaluación y los datos congelados, gráfico por variable y huellas sha256); colas «por decidir» y «PTC por firmar» en `/my-work`; pruebas de desempeño del día en el reporte diario (hechos de la IA, PDF y panel del editor). Verificado en navegador: tarjeta del PTC sobre R1 (no certificable), PDF 200 y Mi trabajo; PDF revisado visualmente con datos de ejemplo. **No verificado en navegador:** emitir/firmar un PTC real (DEMO no tiene intento aceptado ni usuario `client`; cubierto por el escenario SQL de la S2).
Sigue **S3**: DEMO con el simulador (prueba aceptada de punta a punta, 1 h + 6 h, perturbación y par), invitar o asignar un usuario `client` en DEMO, activar `requires_performance` en el gate que corresponda, KPIs F5 pendientes de F7 y chip en Control Tower.

**Sesión 3 — DEMO, KPIs y chip (Luis, 2026-10-19):**
22. **Gate nuevo PA «Aceptación de desempeño»** (fase PA, orden 50) en DEMO con `requires_performance`; la prueba se hace con la planta arrancada, así que no se exige en RFSU. El gate heredó «ITRs de la fase aprobados» (sin ITR de PA queda rojo): Luis decide si lo quita en `/admin/gates`.
23. **Éxito de primer arranque** = sistema con «primer arranque» atestiguado que llega a «operación estable» atestiguada sin trip/parada entre ambos; falla si hubo trip/parada desde el arranque (antes de la operación estable); pendiente si no hay ninguno.
24. **Falla repetida = dos KPI:** sistemas con 2+ trips/paradas en 30 días (F6) y % de pruebas de desempeño aceptadas al primer intento evaluado (F7; los abortados no cuentan).

**Avance S3 (2026-10-19):** migración `20261020120000_startup_performance_kpis` aplicada en prod (parche de `take_mgmt_snapshot` con ancla única: claves `startup`, `trips`, `performance`; probada con rollback y eventos sintéticos). Tres tarjetas nuevas en `/projects/[id]/kpis`. Chips en el detalle del sistema de Control Tower (prueba de la que es principal: último resultado + PTC vigente). Seed `scripts/demo-data/seed_performance_demo.sql` (re-ejecutable; 7 h simuladas, trip excluido, par F1↔F2 1,5 %, KW manual) → PTT-0001/R2 evaluado «Aceptada» en el navegador y **PTC-0001 emitido** (firma Comisionamiento). Pendiente: firmas de Operaciones (+smtp) y Cliente (+smtp2, a invitar como client en DEMO) → criterio `performance_accepted` en verde. Hallazgo menor: renombrar el certificado de una fase no actualiza el código de su gate (el código del gate PA se corrigió por SQL).
Sigue **F8** (vendors y control documental).

## 15. Decisiones de la fase 8 (Luis, 2026-10-19)
1. **Empresas: catálogo por organización** (operadora/cliente, EPC/contratista, vendor, subcontratista), usable en todos sus proyectos. Miembros, personal de operaciones y equipos de prueba se ligan a una empresa. Las firmas muestran «nombre · empresa» congelado al firmar; **no se exige** empresa para firmar.
2. **Registro maestro de documentos:** cada revisión lleva metadatos (número, revisión, estado Draft → IFR → IFC → As-Built → Final, sistemas) y, opcionalmente, el **PDF en CommUp y/o un enlace al EDMS** de la operadora (en línea con §6.4, integrar por referencia).
3. **Revisión superada = bloqueo duro** hacia adelante: no se firma un ITR ni se aprueba un procedimiento que referencia una revisión superada hasta actualizar la referencia.
4. **Lo ya firmado/aprobado** cuando aparece una revisión nueva queda marcado «revisión superada» y el gate del sistema pasa a **amarillo** (con condiciones) hasta que alguien lo revise: lo da por válido con motivo o lo rehace.
5. **Sin rol vendor nuevo** por ahora: el personal de los vendors usa los roles existentes ligado a su empresa; un rol restringido a su paquete queda para después.
6. **Gate de movilización** del paquete vendor = un gate de un sistema aprobado (configurable por paquete) + checklist fijo (alcance e interfaces acordados, inducción HSE, permisos, equipo calibrado, documentos vigentes); autoriza un líder+.
7. **Hallazgos FAT/SAT:** con tag → punch (Cat A/B/C, origen «paquete vendor»); sin tag → acción de gestión diaria (ACC).
8. **Corrección para organizaciones nuevas:** el gate de arranque (RFSU) nace con «exige line-up» encendido (hoy solo se activó con un backfill único en F6).
9. **Tres sesiones:** S1 empresas + registro de documentos + referencias con bloqueo y criterio de gate; S2 paquetes vendor (límites e interfaces, movilización, FAT/SAT, reportes, recomendaciones con MOC por referencia, desmovilización); S3 KPIs pendientes (completitud documental, readiness de vendors) y DEMO.

**Avance S1 (2026-10-19):** migración `20261021120000_companies_documents` aplicada en prod (probada con rollback, 17 casos) + ajuste `20261021130000` (documents_current solo aparece con referencias superadas; empresa en el JSON de firmas de gate). `companies` (backfill desde los textos de personal y equipos de prueba) + `company_id` en miembros, personal y equipos; empresa congelada en firmas de ITR, gate, PTC y traspasos (trigger `freeze_signer_company`). `documents` → `document_revisions` (vigente = última emitida; PDF en bucket `project-documents` y/o enlace https) + `document_systems` + `document_references` (ITR / revisión de procedimiento). Bloqueo duro en `sign_itr_atomic` y en `transition_procedure_revision` (enviar y aprobar); revalidación de un registro firmado = líder+ con motivo ≥ 10; criterio implícito `documents_current` (condición) en `compute_system_gates`. `seed_default_gate_for_phase`: el gate RFSU / fase SU nace con `requires_lineup`. UI: `/admin/companies`, empresa por usuario en `/admin/users`, `/projects/[id]/documents` (registro con filtros y KPIs) y `/documents/[documentId]` (revisiones, emitir/descartar borrador, dónde se usa), panel «Documentos de referencia» en el ITR y en el procedimiento, criterio en Control Tower, «nombre · empresa» en firmas. Verificado en navegador con DEMO: empresa RLA asignada, PID-A100-001 Rev A → ITR I30C/CE-A100-S02/C-01 referencia Rev A → Rev B emitida → aviso en el ITR → «Actualizar a la vigente». Pendiente para S2/S3: selector de empresa en personal de operaciones y equipos de prueba (hoy siguen con texto, enlazados por el backfill); subida de PDF no probada en el navegador integrado (no adjunta archivos).
Sigue **S2**: paquetes vendor (límites e interfaces, movilización, FAT/SAT → punch/acción, reportes, recomendaciones con MOC por referencia, desmovilización).

**Decisiones de la sesión 2 (Luis, 2026-10-19):**
10. **Recomendaciones del vendor:** un líder+ las aprueba o rechaza (rechazo con motivo). Si cambian diseño o proceso se marcan «requiere MOC» y no pasan a «implementada» sin el número de MOC de la operadora.
11. **Reportes del vendor estructurados y cortos:** fecha, personal en sitio, horas, actividades, problemas/pendientes y adjuntos. El reporte final es único, inmutable al emitirse y requisito de la desmovilización.
12. **Desmovilización:** checklist fijo (reporte final emitido, as-built entregados, herramientas retiradas, permisos cerrados, área limpia) y ningún punch Cat A abierto del paquete; Cat B/C pueden quedar abiertos o transferidos.
13. **El paquete no afecta los gates:** los hallazgos ya bloquean vía punch Cat A y acciones; el estado de los paquetes alimenta el KPI «readiness de vendors» (S3) y un chip en Control Tower.

**Avance S2 (2026-10-19):** migración `20261022120000_vendor_packages` aplicada en prod (probada con rollback, 21 casos). `vendor_packages` (VND-0001; planned → mobilized → demobilized | cancelled) + sistemas y tags del paquete, `vendor_interfaces`, `vendor_checklist` (claves fijas `vendor_checklist_keys()`), `vendor_activities` (FAT/SAT) + `vendor_findings` (con tag → punch `created_via = 'vendor_package'`; sin tag → ACC con origen `vendor` vinculado al paquete), `vendor_reports` (diario/final único, inmutables), `vendor_recommendations` (aprobación líder+, MOC obligatorio para implementar si lo requiere). `vendor_mobilization_status` / `vendor_demobilization_status` calculan lo que falta; adjuntos de reportes y FAT/SAT en `mgmt-evidence`. UI: `/projects/[id]/vendors` (lista con KPIs) y `/vendors/[packageId]` (alcance y límites, interfaces, movilización, FAT/SAT con hallazgos y resultado, reportes, recomendaciones, desmovilización); chip del paquete en Control Tower; menú «Vendors». Verificado en navegador con DEMO: VND-0001 «Skid de instrumentación del C-103» (Instrumentos del Llano, A100-S02) movilizado por checklist, SAT con hallazgo en PT-101 → punch P-0546 Cat C, resultado «Aprobada con hallazgos». Reportes, recomendaciones y desmovilización cubiertos por el escenario SQL (no recorridos en el navegador).
Sigue **S3**: KPIs completitud documental y readiness de vendors (§11.13), selector de empresa en personal de operaciones y equipos de prueba, DEMO.

**Decisiones de la sesión 3 (Luis, 2026-10-19):**
14. **Completitud documental** = documentos ligados a sistemas con revisión vigente As-Built o Final sobre los ligados; detalle: sin revisión emitida y registros firmados/aprobados que usan una revisión superada.
15. **Readiness de vendors** = paquetes activos (movilizados o desmovilizados) sin bloqueos —sin FAT/SAT pendiente o fallida, sin hallazgos abiertos y sin recomendaciones por decidir— sobre los activos; detalle: planificados, desmovilizados y hallazgos abiertos.

**Avance S3 (2026-10-19):** migración `20261023120000_documents_vendors_kpis` aplicada en prod (probada con rollback): claves `documents` y `vendors` en `take_mgmt_snapshot` + trigger `company_link_from_text` que enlaza `company_id` del personal de operaciones y `owner_company_id` de los equipos de prueba cuando el texto coincide con el nombre o nombre corto de una empresa (la UI sugiere el catálogo con un datalist; no cambian las RPC). Tarjetas «Completitud documental» y «Readiness de vendors» en `/kpis`. Seed `scripts/demo-data/seed_documents_vendors_demo.sql` (6 documentos con revisiones en A100-S02 / A200-S01 / U100-S01, empresa vendor CDC y paquete «Compresor C-103 (OEM)» planificado con gate MC, interfaces y FAT). DEMO: completitud 43 % (3 de 7), readiness de vendors 0 de 1 activos (un hallazgo abierto).

### ✅ Plan readiness F0–F8 completo (2026-10-19)
Todas las fases del plan están en producción. Lo que queda son las pruebas de Luis (§13.3), lo aplazado (§13.4) y los pendientes menores de §13.2.

