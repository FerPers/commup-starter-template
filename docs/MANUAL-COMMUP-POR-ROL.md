# Manual de CommUp — Guía por rol y por fase

**Versión:** 2026-10-19 · **Aplica a:** commup.app (producción)
**Para quién:** cualquier persona que empieza a usar CommUp en un proyecto de completions y comisionamiento.

> **Cómo leer este manual.** La parte 1 explica los conceptos. La parte 2 te deja entrando y moviéndote. La parte 3 recorre el proyecto **fase por fase** (qué se hace, quién y dónde). La parte 4 es la **guía por rol**: busca la tuya y sigue el «día típico». La parte 5 tiene los **procedimientos paso a paso** de cada módulo, para consultar cuando los necesites. Al final: trabajo sin conexión, matriz de quién hace qué y limitaciones conocidas.
>
> Los avisos marcados con **⚠** describen comportamientos actuales que están en corrección; síguelos mientras tanto.

---

## Índice

1. [Qué es CommUp y conceptos clave](#1-qué-es-commup-y-conceptos-clave)
2. [Primeros pasos](#2-primeros-pasos)
3. [El proyecto fase por fase](#3-el-proyecto-fase-por-fase)
4. [Guía por rol](#4-guía-por-rol)
5. [Procedimientos paso a paso por módulo](#5-procedimientos-paso-a-paso-por-módulo)
6. [Trabajo sin conexión](#6-trabajo-sin-conexión)
7. [Matriz de quién hace qué](#7-matriz-de-quién-hace-qué)
8. [Limitaciones conocidas (mientras se corrigen)](#8-limitaciones-conocidas-mientras-se-corrigen)
9. [Errores frecuentes y qué hacer](#9-errores-frecuentes-y-qué-hacer)

---

## 1. Qué es CommUp y conceptos clave

CommUp es la plataforma para gestionar el **completamiento y el comisionamiento** de una planta industrial, desde que se instala el primer equipo hasta que la operación recibe el sistema. Todo avanza **por evidencia**: un sistema solo pasa de una etapa a la siguiente cuando sus registros (ITR, punch, certificados, PSSR, pruebas) lo demuestran y las personas autorizadas lo firman.

### Glosario

| Término | Qué es |
|---|---|
| **Organización** | Tu empresa en CommUp. Sus datos no los ve ninguna otra organización. |
| **Proyecto** | Una obra o planta. Dentro de una organización, todos los miembros ven todos sus proyectos. |
| **Área → Sistema → Subsistema** | La jerarquía del proyecto. El **sistema** es la unidad que se entrega (p. ej. «A100-S02 Compresión de gas»); el subsistema es la unidad de completamiento. |
| **Tag** | Un equipo o instrumento físico (PT-101, C-103, XV-102). Es la unidad atómica: los ITR, punch y preservación cuelgan de un tag. |
| **Fase** | Etapa configurable de la organización. Por defecto: **A** Mechanical Completion (certificado MC), **B** Pre-Commissioning (RFPC), **C** Commissioning (RFC), **SU** Start-Up (RFSU). Se pueden agregar otras (p. ej. **PA** Aceptación de desempeño). |
| **ITR** | *Inspection & Test Record*: el formulario de inspección o prueba que se ejecuta sobre un tag (o un lazo, o una causa C&E), creado a partir de una plantilla. Se firma y queda inmutable. |
| **Plantilla ITR** | El modelo del ITR (código tipo E13B, ítems, criterios). Tiene revisiones; una revisión usada no se modifica. |
| **Punch** | Una deficiencia encontrada. **Cat A** bloquea el certificado y los gates; **Cat B** se puede transferir con excepción justificada; **Cat C** es menor y nunca bloquea. |
| **Certificado** | Documento formal de completitud por subsistema y fase (MC, RFPC, RFC, RFSU). Se emite solo si no hay bloqueos. |
| **Gate (hold point)** | Punto de control por sistema (uno por fase y los opcionales). Se calcula solo con sus criterios y lo aprueba quien tiene autoridad; puede exigir co-firmas de Operaciones y HSE. |
| **Control Tower** | La matriz sistema × gate: dónde está cada sistema y qué lo bloquea. |
| **Registro controlado** | Un estado temporal en campo que hay que controlar y revertir: temporales, ciegas, reinstalaciones, bypass, energizaciones, test packs. Mientras está activo puede bloquear gates. |
| **PSSR** | *Pre-Startup Safety Review*: revisión de seguridad previa al arranque. Su aprobación emite el RFSU y habilita el primer arranque. |
| **Procedimiento** | Instrucción de arranque, parada u operación con secuencia de pasos y **hold points** que libera otra persona. |
| **Line-up** | Hoja de alineación de válvulas (posición requerida vs encontrada) con verificación independiente. |
| **Hito de arranque** | Primera energización, primera rotación, primer arranque, primer HC, operación estable, producto en especificación. Lo atestigua otra persona. |
| **Prueba de desempeño (PTT) y certificado PTC** | Demostración de capacidad con datos (IIoT o manuales), evaluada por el sistema, aceptada con tres firmas. |
| **Traspaso (TRF)** | Cambio de dueño del sistema: Comisionamiento → Shadowing → Operación conjunta → Operaciones. |
| **Gestión diaria** | Acciones (ACC), restricciones (RES), consultas técnicas (TQ), decisiones (DEC), look-ahead, reporte diario (RD) y relevo de turno (REL). |
| **Documento** | Entrada del registro maestro (P&ID, hoja de datos, plano…) con revisiones. Un ITR o procedimiento puede referenciar una revisión; si sale una más nueva, se bloquea la firma hasta actualizar. |
| **Paquete de vendor (VND)** | El alcance de un vendor: interfaces, movilización, FAT/SAT, reportes, recomendaciones y desmovilización. |
| **«Otra persona»** | Regla del sistema: quien verifica, libera o co-firma tiene que ser una persona distinta de quien hizo el trabajo. Se comprueba en la base de datos. |

---

## 2. Primeros pasos

### 2.1 Acceso
1. Recibes un **correo de invitación** de CommUp (lo envía un admin u owner de tu empresa).
2. El enlace te lleva a **«Fija tu contraseña»** (mínimo 8 caracteres). No existen contraseñas temporales.
3. Entra en **commup.app** con tu correo y contraseña. Si olvidaste la contraseña: **«¿Olvidaste tu contraseña?»** en la pantalla de acceso.
4. Si perteneces a varias organizaciones, cambia de una a otra desde el **menú de usuario** (arriba a la derecha). ⚠ Hazlo desde Mi trabajo o el Dashboard: dentro de un proyecto puedes ver «página no encontrada».

### 2.2 Instalar la aplicación (recomendado para campo)
- **Android (Chrome/Edge):** abre commup.app, inicia sesión y acepta «Instalar CommUp», o menú ⋮ → «Instalar aplicación».
- **iPhone/iPad (Safari):** botón Compartir → «Agregar a pantalla de inicio». En iOS **solo la app instalada** recibe notificaciones.
- **Escritorio:** ícono de instalación en la barra de direcciones de Chrome/Edge.
- Activa las notificaciones del dispositivo en **Notificaciones** (menú lateral). En Brave para macOS hay que habilitarlas en la configuración del navegador.
- ⚠ La app instalada abre en el Dashboard; si eres inspector o líder, toca **Mi trabajo**.

### 2.3 Idioma y tema
- Menú de usuario → **ES / EN** y **tema claro/oscuro**. La preferencia queda en ese navegador.
- ⚠ Algunas pantallas de administración, importadores y mensajes de error siguen en español aunque elijas inglés.

### 2.4 Cómo está organizada la pantalla
- **Barra superior:** migas de pan (dónde estás), 🔔 campana (avisos recientes; «Ver todo» abre la Bandeja) y menú de usuario.
- **Menú lateral** en cuatro bloques:
  1. **Mi trabajo** — *Mi trabajo* (todo lo que te toca, con número de pendientes), *Bandeja* (historial de avisos), *Escanear QR/NFC*, *Notificaciones* (activar avisos en este dispositivo).
  2. **Proyecto** — aparece al entrar a un proyecto (o muestra el último visitado): *Resumen, Tags, ITRs, Punch List, Registros, Gestión diaria, Arranque, Documentos, Vendors, Certificados, KPIs*; **Ingeniería** (*Señales, Loops, Matrices C&E, P&IDs*) y **Vistas y planificación** (*Explorador, Digital Twin, Planes de trabajo, PSSR, Importar*).
  3. **Organización** — vistas de todos los proyectos: *Dashboard, Proyectos, Control Tower, KPIs, Todos los ITRs / punches / certificados, Preservación, Todos los planes, Tracking de Ops* (punch después del handover) y *Handover* (paquetes de entrega).
  4. **Administración** (se despliega) — plantillas, configuración, gates, registros controlados, equipos de prueba, usuarios, empresas, integraciones, calidad de datos y auditoría.
- Cada persona ve solo lo que su rol permite.
- **Móvil/tablet:** el botón ☰ abre el menú; en roles de campo hay una barra inferior (Mi trabajo, Escanear, Bandeja, Menú). El punto ámbar o rojo en «Menú» indica pendientes por sincronizar o sin conexión.

### 2.5 Consejos de navegación
- **Cambiar de proyecto:** *Organización › Proyectos* → elige uno; el menú lo recordará como «Último proyecto».
- **Buscar un tag:** escanea su QR, o *Proyecto › Tags* y escribe en el buscador.
- **Control Tower:** *Organización › Control Tower* → elige el proyecto arriba → «Cargar». Toca un sistema para ver sus gates.
- **PDF y Excel:** en cada ITR, certificado, PSSR, reporte diario, procedimiento, prueba de desempeño, y en *KPIs* y listas de punch.

---

## 3. El proyecto fase por fase

Esta es la secuencia típica de un proyecto. Cada fase termina en un **gate por sistema**: el sistema avanza cuando su gate está aprobado y firmado.

### 3.0 Preparación (antes del primer ITR)

| Qué | Quién | Dónde |
|---|---|---|
| Crear la organización y el primer proyecto (asistente) | Owner | `/setup` (primer ingreso) |
| Revisar fases, disciplinas y tipos de equipo | Admin | Administración › Configuración |
| Configurar gates: criterios, quién aprueba, co-firmas, «exige line-up», «exige desempeño», pesos | Admin | Administración › Gates |
| Activar tipos de registro controlado y qué gate bloquea cada uno | Architect | Administración › Registros controlados |
| Invitar usuarios y asignarles rol y empresa | Admin | Administración › Usuarios / Empresas |
| Importar jerarquía y tags (Excel) | Architect | Proyecto › Importar |
| Importar el índice de señales y lazos (Excel) | Architect | Proyecto › Señales › Importar señales |
| Revisar sistemas, prioridades, límites y **dependencias** entre sistemas | Leader / Architect | Proyecto › Resumen › Sistemas y dependencias |
| Plantillas ITR (crear, importar del catálogo, activar revisiones) y matriz tipo de equipo × plantilla (con IA) | Architect / Leader | Administración › Templates ITR › Matriz |
| Plantillas de preservación y PSSR | Leader | Administración › Templates |
| Inventario de equipos de prueba calibrados | Leader | Administración › Equipos de prueba |
| Registro de documentos (P&ID, hojas de datos…) y sus revisiones | Leader | Proyecto › Documentos |
| Paquetes de vendor | Leader | Proyecto › Vendors |
| Planes de preservación por tag | Leader | Ficha del tag › Preservación |

**Resultado esperado:** cada tag en su subsistema, plantillas activas, usuarios con rol, gates configurados.

### 3.1 Completamiento mecánico (fase A → certificado MC)
1. **Asignar ITR de fase A** a cada tag (ejecutor, supervisor y cliente — ver ⚠ en §5.2).
2. Los **inspectores ejecutan** los ITR en campo (con o sin red) y **levantan punch** cuando encuentran defectos.
3. Los **supervisores revisan** la categoría de los punch y firman los ITR como supervisor.
4. Se **resuelven y verifican** los punch (verifica otra persona).
5. Se mantiene la **preservación** de los equipos instalados.
6. Se controlan los **registros de campo** (ciegas, temporales…).
7. Con todos los ITR A aprobados y sin Cat A abiertos, un líder **emite el certificado MC** por subsistema, y se firma.
8. En **Control Tower**, el gate MC del sistema queda «Listo»: quien tiene autoridad lo **aprueba** y, si se exige, Operaciones y HSE lo **co-firman**.

### 3.2 Pre-comisionamiento (fase B → RFPC)
1. ITR de fase B (pruebas en frío, flushing, energización controlada…).
2. **Loop checks** generados desde *Loops* (una tabla con la cadena campo → JB → marshalling → I/O → DCS → HMI).
3. Registros de **energización** y **test packs** según corresponda.
4. Certificado RFPC y gate RFPC (requiere MC aprobado si el gate lo exige).

### 3.3 Comisionamiento (fase C → RFC)
1. ITR de fase C (pruebas funcionales).
2. **Pruebas C&E**: desde *Matrices C&E* se genera una prueba por causa, con una fila por efecto; cada celda muestra el resultado.
3. Restricciones y TQ de la fase en Gestión diaria.
4. Certificado RFC y gate RFC.

### 3.4 Arranque (fase SU → RFSU y primer arranque)
1. **Procedimientos** de arranque redactados, revisados, aprobados por otra persona y **verificados en campo** (walkdown).
2. **PSSR** del sistema: llenar ítems, enviar, firmar, aprobar → se emite el **RFSU**.
3. **Line-up** del sistema ejecutado y verificado por otra persona (el gate de arranque lo exige).
4. **Gate RFSU** aprobado con todas sus firmas.
5. **Ejecución del procedimiento** con hold points liberados por la capacidad correspondiente.
6. **Bitácora de arranque**: registrar los hitos (primera energización, rotación, **primer arranque**, **primer HC**, operación estable, producto en especificación) con sus parámetros IIoT y el **testigo**. Primer arranque y primer HC solo se permiten con gate de arranque aprobado y PSSR más reciente aprobado.

### 3.5 Desempeño (fase PA → PTC)
1. **Definir la prueba** (frontera, variables, criterios, incertidumbre, duraciones), revisarla y aprobarla.
2. **Ejecutar el intento**: estabilización → periodo formal → cierre; registrar perturbaciones y lecturas manuales.
3. **Evaluación automática** y **registro del resultado** (aceptado, aceptado con desviación, repetir, falló, no concluyente).
4. **Certificado PTC** con tres firmas: Comisionamiento, Operaciones y Cliente.
5. Si el gate PA «exige desempeño», queda en verde con el PTC aceptado.

### 3.6 Traspaso a Operaciones y handover
1. **Personal de operaciones** y **matriz de competencias** (niveles 0–4) por sistema; **repuestos críticos**.
2. **Traspasos** por etapa: Shadowing → Operación conjunta → Operaciones, cada uno con su checklist y dos firmas de personas distintas.
3. Al completar el paso a Operaciones se genera el **paquete de handover** del sistema.
4. Los punch Cat B pendientes se **transfieren a Operaciones** y se siguen en *Tracking de Ops*.

### 3.7 Transversal: gestión diaria
Todos los días, durante todo el proyecto:
- **07:00 reunión diaria** con el look-ahead (7 días) y Control Tower: gates en riesgo, restricciones nivel ≥ 3, acciones vencidas.
- **Acciones, restricciones, TQ y decisiones** en *Proyecto › Gestión diaria*.
- **Forecast y compromiso** por gate en el *Look-ahead*.
- **Reporte diario** al cierre del día (borrador con IA, edición, emisión por un líder).
- **Relevo de turno** entre turnos.

---

## 4. Guía por rol

Roles de la organización: **owner, admin, architect, leader, inspector, client**. En este manual, **«líder+»** = owner, admin, architect o leader; **«no-client»** = cualquiera menos client.

### 4.1 Inspector (técnico de campo)

**Quién eres:** quien ejecuta inspecciones y pruebas en terreno, normalmente con la app instalada en una tablet o teléfono.
**Empiezas en:** **Mi trabajo** (toca «Mi trabajo» si la app abre en el Dashboard).

**Día típico**
1. Antes de salir a campo, con red: abre **Mi trabajo** y entra a cada ITR que vas a ejecutar hoy (así quedan disponibles sin red).
2. En campo: abre el ITR, registra el **equipo de prueba** si lo pide, completa los ítems, toma fotos. Se guarda solo.
3. Si encuentras un defecto: botón ⚑ del ítem o «Punch». ⚠ Hoy el inspector no puede crear punch (ver §8): **anótalo en las observaciones del ítem y avisa a tu supervisor**, o pídele que lo levante.
4. Al terminar el contenido: **Firmar** como ejecutor enseguida (⚠ el ITR desaparece de «por ejecutar» al completar el contenido aunque falte tu firma).
5. Revisa en Mi trabajo: **punches asignados** (resolver con descripción y fotos), **punches por verificar** (de otros), **preservación vencida**, **holds** y **filas de line-up**.
6. Al volver la red, comprueba que el pie no muestre «N pendientes». **No cierres sesión ni prestes la tablet con pendientes.**

**Lo que puedes hacer**
- Ejecutar y firmar los ITR donde estás asignado (como ejecutor; o como supervisor/cliente si te asignaron así).
- Resolver punch con evidencia y verificar punch resueltos por otra persona.
- Ejecutar preservación (⚠ ver §8: hoy la finalización por inspector no queda registrada; avisa a tu líder).
- Proponer y retirar registros de campo (ciegas, bypass, temporales…).
- Crear acciones, restricciones y TQ.
- Redactar y enviar procedimientos; ejecutar pasos; detener una ejecución; posicionar line-ups; verificar procedimientos en campo.
- Registrar eventos de arranque, parámetros, perturbaciones y lecturas manuales de pruebas de desempeño.
- Pedir traspasos.

**Lo que no puedes:** asignar ITR, emitir certificados, aprobar procedimientos o gates, liberar hold points, atestiguar hitos, firmar traspasos ni PTC.

### 4.2 Leader (supervisor de disciplina / líder de sistema)

**Quién eres:** supervisor de disciplina, líder de sistema o líder de comisionamiento.
**Empiezas en:** **Mi trabajo** — ITR por revisar o firmar, punches por clasificar, acciones y restricciones tuyas, holds por liberar, traspasos y PTC por firmar.

**Día típico**
1. **07:00 reunión diaria:** *Gestión diaria › Look-ahead* (7 días) + *Control Tower*.
2. **Asignar trabajo:** ITR a inspectores desde la ficha del tag o la lista de ITR («Asignar a» para reasignar en lote); **planes de trabajo** del día.
3. **Revisar punch nuevos:** confirmar o recategorizar (con motivo) los que levantaron otros.
4. **Firmar ITR** como supervisor cuando el ejecutor ya firmó.
5. **Certificados:** cuando un subsistema queda en verde, emitir el certificado de la fase (justificando los Cat B si los hay).
6. **Gestión diaria:** acciones, restricciones (escalar con motivo), TQ, decisiones; **compromisos** de fecha por gate (cambiarlos exige motivo).
7. **Arranque:** aprobar procedimientos de otros, liberar hold points, reanudar o abortar ejecuciones, atestiguar hitos, dirigir pruebas de desempeño y emitir PTC.
8. **Cierre del día:** revisar y **emitir el reporte diario**.

**También puedes:** crear y editar plantillas ITR, PSSR y preservación; matrices C&E y lazos; sistemas y dependencias; documentos y revisiones; paquetes de vendor (movilizar, desmovilizar, decidir recomendaciones); evaluar competencias; firmar traspasos como Comisionamiento u Operaciones; co-firmar gates.

**No puedes:** importar o editar tags (aunque veas «Importar»), configurar la organización o los gates, aprobar gates salvo que el admin te incluya entre los aprobadores, reabrir ITR aprobados.

### 4.3 Gerente de comisionamiento / planner (funciones)

CommUp no tiene un rol «gerente» ni «planner»: normalmente son **architect** o **admin** (gerente) y **leader** (planner).

**Gerente — día típico**
1. *Organización › Control Tower* → proyecto → revisar gates por aprobar, pendientes de firma y en regresión. Aprobar los listos (§5.8).
2. *Proyecto › KPIs*: avance ponderado, readiness, cumplimiento de compromisos, TQ y acciones a tiempo, restricciones por nivel, primer arranque, desempeño, completitud documental, readiness de vendors, curva S.
3. *Gestión diaria*: restricciones nivel 3–4, decisiones, TQ abiertas.
4. *Reporte diario*: revisar el borrador, completar y emitir (o pedirlo al líder).
5. Entrega: *Arranque › Operaciones* (traspasos) y *Organización › Handover* (paquetes).

**Planner — día típico**
1. *Gestión diaria › Look-ahead*: ventanas de 7, 30 y 90 días; base forecast o compromiso; «Editar» para cambiar fechas en bloque (los compromisos exigen motivo).
2. *Vistas y planificación › Planes de trabajo*: listas de trabajo diarias o semanales por disciplina.
3. *KPIs*: curva S del avance ponderado.

### 4.4 Architect (ingeniería de completions / configuración)

**Quién eres:** quien prepara el proyecto: estructura, tags, plantillas, integraciones.
**Empiezas en:** Dashboard.

**Tareas**
- Crear y editar proyectos.
- **Importar** jerarquía y tags (§5.1) e índice de señales (§5.17); editar tags.
- **Plantillas ITR**: crear, importar del catálogo, activar revisiones, traducciones; **matriz** tipo de equipo × plantilla con IA.
- **Tipos de registro controlado** y qué gate bloquea cada uno.
- **P&ID** con hotspots; lazos y matrices C&E (también importación con IA).
- **Aprobar gates** (es aprobador por defecto); reabrir ITR aprobados; revocar o reabrir certificados.
- **Integraciones:** API keys, webhooks, workflows; calidad de datos; paquetes de handover.

**No puedes:** configurar fases, disciplinas, usuarios ni gates (eso es del admin).

### 4.5 Admin

**Quién eres:** administrador funcional de la plataforma en tu empresa.
**Tareas**
1. **Usuarios:** *Administración › Usuarios › Invitar* → correo y rol; asignar **empresa** a cada persona (las firmas muestran «nombre · empresa»). Quitar personas (el sistema muestra qué deja pendiente).
2. **Empresas:** *Administración › Empresas* — operadora/cliente, EPC, vendors, subcontratistas.
3. **Configuración:** fases (con su nombre de certificado: MC, RFPC…), disciplinas, tipos de equipo, logo, glosario de traducción, límite de Cat B abiertos por subsistema.
4. **Gates:** criterios, aprobadores, co-firmas requeridas, «exige line-up», «exige desempeño», pesos del avance. ⚠ Los cambios aplican de inmediato a todos los proyectos y no dejan historial: anótalos.
5. **Auditoría** y **exportación** de proyectos a Excel.

**No puedes:** borrar proyectos ni cambiar o quitar owners.

### 4.6 Owner

Todo lo del admin, y además: borrar proyectos, elegir el catálogo de plantillas de la organización, invitar, cambiar o quitar a otros owners. Siempre debe quedar al menos un owner.

### 4.7 Client (representante de la operadora / dueño)

**Quién eres:** personal del dueño de la planta que atestigua, verifica y acepta.
**Empiezas en:** Dashboard (widget de firmas pendientes).

**Tareas**
- **Consultar** todo el avance de los proyectos de la organización (Control Tower, KPIs, certificados, PSSR, documentos).
- **Firmar ITR** como cliente donde estés asignado.
- **Verificar punch en campo** (resueltos por otra persona).
- **Responder TQ** dirigidas a ti (*Gestión diaria › TQ*), con adjuntos.
- **Co-firmar gates** como Operaciones o HSE si la organización lo configura: *Control Tower* → proyecto → sistema → «Firmar como…». ⚠ Hoy no aparece en Mi trabajo: tu gerente te avisará.
- **Liberar hold points** de Operaciones/HSE, **verificar filas de line-up**, **atestiguar hitos** de Operaciones.
- **Firmar traspasos** como Operaciones y el **PTC** como Operaciones o como **Cliente** (exclusivo de tu rol). Mi trabajo › «PTC por firmar» y «Traspasos por firmar».

**No puedes:** ejecutar ITR ni pasos de procedimiento, registrar eventos, crear acciones o restricciones. ⚠ Hoy tampoco puedes firmar certificados MC/RFC como Cliente (ver §8).

---

## 5. Procedimientos paso a paso por módulo

### 5.1 Importar jerarquía y tags (architect, admin, owner)
1. *Proyecto › Importar* → subir .xlsx/.xls. La app elige la hoja y detecta la fila de encabezados.
2. Columnas: **TAG** (obligatoria), DESCRIPCIÓN, DISCIPLINA (o una para todo el archivo), AREA_CODE/NAME, SYSTEM_CODE/NAME, SUBSYSTEM_CODE/NAME, TIPO DE EQUIPO, P&ID, FABRICANTE, MODELO, SERIE, PRESERVACIÓN (SI/YES), DATASHEET y revisión, RANGO MIN/MAX, UNIDAD, CAJA DE CONEXIONES, CRITICIDAD, SIL.
3. Vista previa (30 filas, marca las existentes) → **Importar**: crea las nuevas y actualiza las existentes. La jerarquía se crea sola; sin código, el tag va a GENERAL / GEN-SYS / GEN-SUB.
4. Errores comunes: disciplina inexistente → fila omitida; tags repetidos → gana la última fila.
5. ⚠ **Reimporta siempre el archivo completo:** un Excel parcial borra fabricante, modelo, serie, P&ID y preservación de los tags existentes y puede moverlos de subsistema. ⚠ Más de ~10.000 tags: importa por partes.

### 5.2 Plantillas ITR y asignación (líder+)
**Plantillas**
1. *Administración › Templates ITR*: crear, clonar del catálogo público u otra organización, o restaurar respaldo.
2. Encabezado: código (p. ej. E13B), título ES/EN, disciplina, fase, tipo de equipo, «requiere equipo de prueba».
3. Ítems: casilla, sí/no, texto, número, medición (mín/máx/unidad), selección (con resultado), foto, fecha, documento PDF, continuidad, tabla (fija, variable o desde lazo/C&E). Marcas: crítico, obligatorio, requiere foto/documento, condición.
4. **Activar** la revisión. Una revisión usada no se edita: «Nueva revisión» → editar → activar.
5. *Templates ITR › Matriz*: la IA propone tipo de equipo × plantilla con motivo; acepta o rechaza. La matriz ordena las sugerencias en la ficha del tag.

**Asignar**
1. **Por tag:** ficha del tag › ITR › «+ Asignar ITR» (o «✦ Sugerir con IA») → plantilla → **inspector, supervisor y cliente** → fecha → Asignar. Número `CÓDIGO/TAG` (R2, R3… si se repite).
2. **Por lazo o causa C&E:** *Loops* o *Matrices C&E* → seleccionar → Generar ITR (hasta 200).
3. **Reasignar ejecutor en lote:** lista de ITR → seleccionar → «Asignar a».
4. ⚠ **Asigna siempre los tres roles** (ejecutor, supervisor y cliente): hoy el ITR solo queda aprobado con las tres firmas y no se pueden agregar después. ⚠ No hay generación masiva por subsistema. ⚠ Asignar una revisión nueva de plantilla a un tag que ya tenía el ITR puede dar «duplicate key»: avisa al architect.

### 5.3 Ejecutar y firmar un ITR (inspector y asignados)
1. Entra desde **Mi trabajo**, la ficha del tag o escaneando su QR.
2. Cabecera: número, plantilla y revisión, datos del tag (desplegable), avance, firmas. ES/EN cambia el idioma de los ítems.
3. **Documentos de referencia** (si los hay): deben estar «vigentes»; si aparece un aviso rojo de revisión superada, pulsa «Actualizar a la vigente» antes de firmar.
4. **Equipo de prueba:** regístralo si la plantilla lo exige; vencido en la fecha de uso bloquea la firma.
5. Completa los ítems: se guardan al salir del campo (texto, número, fecha) o al tocar (casilla, sí/no, selección, tabla). Fotos con la cámara; documentos PDF hasta 10 MB (con red). El micrófono dicta observaciones (⚠ puede estar bloqueado).
6. Un **ítem crítico en falla** deja el ITR **rechazado**: corrige o levanta punch.
7. **Firmar:** con el ITR completado → Firmar → rol habilitado → firma en el recuadro → Confirmar. Orden: ejecutor → supervisor → cliente. Con las tres → **aprobado** → PDF disponible.
8. **Reabrir** (owner, admin, architect): «Revocar» con motivo; se anulan las firmas y queda la copia en la auditoría.
- ⚠ Los ITR de loop check y C&E hoy no habilitan el botón Firmar: avisa al architect.
- ⚠ No cierres la app con un campo de texto abierto (se guarda al salir del campo).

### 5.4 Punch list
1. **Levantar** (líder+; ⚠ hoy no el inspector): desde el ITR (⚑ o «Punch») o ficha del tag › Punch › «+». Categoría A/B/C, **impacto** (seguridad, ambiente, proceso, equipo, operabilidad), descripción, fecha y responsable. Número P-0001 consecutivo.
2. **Revisar la categoría** (líder+, otra persona): confirmar o recategorizar con motivo (Mi trabajo › «Categorías por revisar»).
3. **Disposición para el arranque** (cerrar antes del arranque / con controles / largo plazo): la exige el PSSR para todo punch abierto del sistema.
4. **Resolver** (no-client): describir qué se hizo (mín. 5 caracteres) y subir fotos (ficha del tag › Punch › detalle, con red).
5. **Verificar en campo** (cualquier miembro, incluido el cliente, distinto de quien resolvió): aceptar = cerrado; rechazar = vuelve a «en curso» con motivo.
6. **Cat B a Operaciones:** *Tracking de Ops* → transferir a una persona de operaciones con fecha y notas → seguimiento post-handover (en curso, diferido, resuelto, verificado, cierre final).
- ⚠ No canceles un Cat A sin acuerdo del supervisor: hoy «Cancelar» es un clic sin motivo y lo saca del bloqueo.

### 5.5 Preservación
1. **Procedimientos** (líder+): *Administración › Templates Preserv.*: ítems, frecuencia e intervalo en días, foto requerida.
2. **Plan** (líder+): ficha del tag › Preservación → procedimiento, fecha de inicio y responsable → próxima fecha = inicio + intervalo.
3. **Ejecutar** (cualquier miembro): abrir el plan → responder ítems → fotos → resultado (NOK si hay falla crítica) → «Levantar punch» opcional → **Finalizar**.
4. Vencidos: en Mi trabajo y en *Organización › Preservación*; aviso diario al responsable.
- ⚠ Si ejecuta un inspector, hoy la fecha no avanza y el registro no queda finalizado aunque se vea ✓: pide a un líder que finalice. ⚠ Si ejecuta un líder, la fecha avanza al primer toque: no abras un plan «para ver».

### 5.6 PSSR
1. Plantillas (líder+): *Administración › Templates PSSR* (viene sembrada una estándar de 22 ítems).
2. **Crear la revisión** (líder+): *Proyecto › PSSR* → sistema + plantilla.
3. **Llenar** (cualquier miembro): cada ítem Sí / No / NA con responsable, acciones y fecha. Un «No» crea una acción en Gestión diaria.
4. **Enviar a aprobación**: exige todos los ítems en Sí o NA y disposición en todo punch abierto del sistema (y ninguno «cerrar antes del arranque» abierto).
5. **Firmar** (una firma por persona; indica tu disciplina).
6. **Aprobar** (líder+) → se emite el **RFSU** del sistema. **Rechazar** con motivo.
- ⚠ Aplica por procedimiento interno: aprobar solo PSSR enviados, con todos los ítems en Sí/NA y con las firmas de Operaciones, HSE y Mantenimiento (hoy el sistema no lo exige).

### 5.7 Certificados (MC, RFPC, RFC, RFSU)
1. *Proyecto › Certificados* → subsistema × fase → elegibilidad:
   - **Rojo:** sin ITR en la fase, algún ITR sin aprobar, Cat A abierto o Cat B por encima del límite (3 por defecto).
   - **Amarillo:** Cat B dentro del límite → cada uno exige justificación al emitir.
2. **Emitir** (líder+): notas + justificaciones → número `TIPO/SUBSISTEMA`.
3. **Firmar** (líder+): completion, client y authority, uno por rol.
4. **Revocar** o **reabrir** (architect+, con motivo).
- ⚠ Que firmen tres personas distintas (hoy el sistema no lo impide). ⚠ Si después aparece un Cat A, revisa el certificado: no se invalida solo.

### 5.8 Gates y Control Tower
**Cómo se calcula** (automático): para cada sistema y gate, en orden: gate anterior aprobado con firmas · sistemas de los que depende · registros controlados que bloquean · restricciones del gate (abierta = condición; nivel 4 = bloqueo) · line-up (si se exige) · documentos vigentes · prueba de desempeño (si se exige) · criterios configurados (ITR de la fase por subsistema, certificados, PSSR, tags críticos, declaraciones con evidencia). Resultado: **verde, amarillo o rojo**.

**Estados:** No listo · Listo · Listo con condiciones · Pendiente de firmas · Aprobado · Aprobado con condiciones · Regresión (estaba aprobado y hoy está en rojo).

**Leer Control Tower**
- Tarjetas: sistemas, avance, gates aprobados por tipo, punch A/B.
- Tabla: un badge por gate (✓ aprobado, ✓! con condiciones, ✎ pendiente de firmas, ● listo, ◐ listo con condiciones, ○ no listo, ↺ regresión, ⛓ bloqueado por un sistema proveedor).
- ⚠ La columna «bloqueo principal» viene del cálculo general de ITR y punch; para saber qué bloquea de verdad un gate, **entra al sistema**.
- Detalle del sistema: etapa de propiedad, chips de pruebas de desempeño y vendors, dependencias, hitos, restricciones y acciones vivas, y por gate: forecast/compromiso, criterios con enlaces y bloque de aprobación.

**Aprobar y co-firmar**
1. **Comisionamiento** (rol aprobador): gate **Listo** → condiciones opcionales y notas → «Aprobar». En **Listo con condiciones** escribe al menos una condición.
2. Si exige co-firmas, queda **Pendiente de firmas** y todavía no habilita al siguiente gate.
3. **Operaciones** y **HSE** (dos personas distintas entre sí y del aprobador): «Firmar como…» con comentario opcional.
4. **Declaraciones manuales** (editores): subir la evidencia con comentario en el criterio; no se puede borrar.
5. **Revocar** (autoridad, con motivo): los gates siguientes y los dependientes aprobados pasan a Regresión.
- ⚠ Hoy nadie recibe aviso de gates por aprobar o firmar: coordínalo en la reunión diaria.

### 5.9 Registros controlados (temporales, ciegas, bypass, energización, test packs)
1. *Proyecto › Registros* → «Nuevo»: tipo, sistema, tags y datos del tipo (p. ej. función de protección del bypass, duración máxima, retiro previsto).
2. Ciclo: **propuesto** → **autorizado** (líder+, otra persona que quien propuso) → **activo** → **retirado** → **verificado** (otra persona que quien retiró). Cancelar con motivo (líder+).
3. Mientras está propuesto, autorizado, activo o retirado sin verificar, bloquea los gates que su tipo indique.
4. **Etiquetas QR** de registros para colgar en campo (*Registros › Etiquetas*).
- ⚠ No hay alarma de bypass o temporales vencidos: revisa la lista «activos» en la reunión diaria.

### 5.10 Gestión diaria (acciones, restricciones, TQ, decisiones)
*Proyecto › Gestión diaria* — pestañas Acciones · Restricciones · TQ · Decisiones, más Look-ahead, Reportes y Relevo.
- **Acciones (ACC):** dueño, fecha, prioridad, método de verificación (campo, documento, prueba, revisión). Abierta → en curso → **hecha** (con nota y evidencia, salvo «revisión») → **verificada por otra persona** (o rechazada con motivo). Nacen también de restricciones, TQ, PSSR («No»), vendors y desempeño.
- **Restricciones (RES):** sistema, responsable, fecha requerida, impacto, plan de recuperación y gate afectado. Escalamiento 1–4 con motivo (1 equipo · 2 gerente de comisionamiento · 3 gerente de proyecto · 4 cliente/sponsor). Abierta → resuelta → cerrada. Las vencidas reciben aviso diario.
- **TQ:** borrador → emitida → respondida (el cliente puede responder; se marca «cambio de diseño» y n.º de MOC) → cerrada, o reemitida.
- **Decisiones (DEC):** contexto, decisión, fundamento, quién decidió, asistentes. Inmutables: para corregir se reemplazan.
- **Exportar** a Excel: *Gestión diaria › Exportar*.

### 5.11 Look-ahead y planificación
1. *Gestión diaria › Look-ahead*: ventanas 7/30/90 días; base forecast o compromiso. Agrupa por sistema los gates que vencen (brecha forecast − compromiso, «en riesgo» si no están listos), acciones, restricciones, TQ y planes.
2. «Editar»: cambiar forecast y compromisos en grilla; el compromiso lo fija un líder+ y cambiarlo exige motivo; todo queda en el historial.
3. También en el detalle del sistema (Control Tower), por gate.

### 5.12 Reporte diario (RD-PROYECTO-AAAAMMDD)
1. *Gestión diaria › Reportes › Nuevo reporte* (fecha y área opcional). La base de datos arma los datos del día: avance, ITR, punch, gates, restricciones, acciones, TQ, registros en campo, eventos de arranque, pruebas, próximos 7 días.
2. «Redactar con IA»: escribe las 5 secciones solo con esos datos, sin pisar lo ya editado.
3. Editar; «Actualizar datos» mientras sea borrador.
4. **Emitir** (líder+): queda inmutable con huella sha256; PDF desde los datos congelados. Para corregir: **revisión R1** con motivo.
- ⚠ Revisa las cifras antes de emitir: hoy el día se corta en hora UTC y las listas se cortan en 30.

### 5.13 Relevo de turno (REL)
1. Quien entrega lo abre (día, noche u otro): viene precargado con registros activos, ITR en curso, Cat A abiertos, restricciones y acciones vencidas.
2. Escribe pendientes y notas de seguridad → «Entregar» (firma).
3. **Otra persona** lo recibe desde Mi trabajo › «Relevos por recibir», comenta y acepta. Queda inmutable.

### 5.14 Procedimientos y ejecuciones con hold points
**Procedimiento (PRC)**
1. **Crear** (no-client): título, tipo, sistema → PRC-0001 R0 borrador (o «Copiar desde otro proyecto»).
2. **Redactar** las 15 secciones; en «Secuencia», pasos con acción, responsable, valor esperado, tag, criterio de parada y **hold point** con la capacidad que lo libera (Comisionamiento / Operaciones / HSE).
3. **Documentos de referencia** de la revisión (panel): deben estar vigentes para enviar y aprobar.
4. **Enviar a revisión** → **Aprobar** (líder+ distinto del autor y de quien envió) o **Devolver** con motivo.
5. **Verificado en campo** (no-client distinto de quien aprobó) tras el walkdown.
6. **Nueva revisión** con motivo. ⚠ Vuelve a agregar las referencias a documentos.
7. **PDF** con línea de firma en cada hold point.

**Ejecución**
1. **Iniciar** (no-client) desde el procedimiento aprobado → PRC-0001-R1-E1.
2. **Paso a paso** 📴: valor real y comentario → «✓ Hecho» (N/A con comentario obligatorio).
3. **Hold point:** la ejecución queda «En hold» hasta que **otra persona** con la capacidad lo **libere** (requiere red; Mi trabajo › «Hold points por liberar»).
4. **Detener** 📴 con el criterio de parada; **Reanudar** (líder+, con motivo); **Completar**; **Abortar** (líder+, con motivo).
5. Bandeja **«No sincronizado»**: reintentar o descartar lo que el servidor rechazó.

### 5.15 Line-up
1. **Crear** (no-client): sistema, título, propósito (arranque / prueba / otro), procedimiento opcional → «Generar filas» (válvulas del sistema; críticas las ESDV/XV/SDV/BDV/PSV).
2. **Borrador:** posición requerida de cada fila; «Emitir».
3. **Ejecutar** 📴: por fila, la posición encontrada. Si otra persona cambió la fila: «Conflicto» → «Aplicar la mía» o «Descartar».
4. **Verificar** (otra persona, también el cliente; con red) las filas alineadas; las críticas lo exigen.
5. **Completar** → «Verificada». El gate que «exige line-up» queda en verde; se desactualiza si un registro controlado del sistema cambia después.
- Usa el propósito «arranque» para la hoja que habilita el gate de arranque.

### 5.16 Bitácora de arranque e hitos (EVT)
1. **Registrar** (no-client): sistema, tipo (hito o libre: trip, alarma, desviación, parada, observación), hora real, título, tags, ejecución vinculada y señales. Se congela la muestra IIoT más cercana (±5 min); sin dato, se carga a mano.
2. **Primer arranque y primer HC** exigen gate de arranque aprobado con todas sus firmas y el PSSR más reciente aprobado.
3. **Testigo** (otra persona): energización y rotación las atestigua Comisionamiento; los demás, Operaciones. Mi trabajo › «Hitos por atestiguar».
4. Ficha con gráfico ±30 min; **anular** (líder+, con motivo).

### 5.17 Señales, lazos y C&E
**Señales y lazos** (importa architect+; genera ITR líder+)
1. Excel del índice: TAG INSTRUMENTO, TAG DE SEÑAL, DESCRIPCIÓN, TIPO (AI/AO/DI/DO/PI/PO), DISCIPLINA, rango, unidad, alarmas, P&ID, diagramas, N° LAZO, JB, MARSHALLING, TARJETA y CANAL I/O, TAG DCS, DESPLIEGUE HMI, AREA/SISTEMA/SUBSISTEMA.
2. *Proyecto › Importar señales* → vista previa → Importar (crea jerarquía, tags de instrumento que falten, señales y lazos).
3. ⚠ Reimporta siempre el índice completo: las columnas ausentes se vacían y los lazos se desvinculan.
4. *Loops* → plantilla con tabla de lazo (I29C) → «Generar» por lazo o «Generar faltantes». Si el lazo cambia después, el ITR aparece «desactualizado» y se genera R2.

**Matrices C&E** (líder+)
1. *Matrices C&E* → «Nueva matriz» o **«Importar con IA»** (Excel o PDF ≤ 4 MB): la IA propone causas, efectos y cruces; revisa en la grilla (tags inexistentes en ámbar) → «Aceptar y crear».
2. Editor: causas, efectos y celdas (directa o con N segundos).
3. Generar pruebas con la plantilla I30C: una por causa; cada celda muestra el resultado.
- ⚠ No borres una matriz con pruebas generadas.

**P&ID** (architect+): *P&IDs* → subir el PDF con su número de plano → en el visor, colocar los pines de los tags. ⚠ Subir el mismo número reemplaza el archivo sin historial; para control de revisiones usa el Registro de documentos.

### 5.18 Registro de documentos y referencias
1. *Proyecto › Documentos › + Nuevo* (líder+): número único, tipo, título, disciplina, empresa emisora, sistemas.
2. Ficha › **+ Nueva revisión**: revisión (A, B, 0, 1…), estado (borrador, IFR, IFA, IFC, As-Built, Final), fecha, archivo (PDF, DWG, DXF, imagen, ≤ 50 MB) y/o enlace https al EDMS. Una revisión emitida pasa a ser la **vigente**. ⚠ Carga el historial en orden cronológico (la vigente es la última registrada).
3. Un borrador se emite eligiendo su estado o se descarta (uno por documento).
4. **«Dónde se usa»** muestra cada ITR o procedimiento que lo referencia y con qué revisión.
5. **Referenciar** (no-client): en el ITR o en la revisión borrador del procedimiento, panel «Documentos de referencia» → elegir → Agregar.
6. Al salir una revisión nueva:
   - ITR sin firmar / procedimiento en borrador: aviso rojo; **la firma o el envío quedan bloqueados** hasta «Actualizar a la vigente».
   - ITR firmado / procedimiento aprobado: el gate del sistema queda en amarillo («Documentos vigentes») hasta que un líder+ pulse **«Revalidar»** con motivo (≥ 10 caracteres) o se rehaga el registro.

### 5.19 Paquetes de vendor (VND)
1. **Crear** (líder+): *Proyecto › Vendors › Nuevo paquete* → empresa, título, sistemas; después en la ficha: alcance, límites, tags del paquete, **gate de movilización** (sistema + gate) y fecha prevista.
2. **Interfaces:** contraparte, descripción, responsable, estado (abierta, acordada, cerrada). Ninguna abierta para movilizar.
3. **Checklist de movilización:** alcance e interfaces acordados, inducción HSE, permisos, equipo calibrado, documentos vigentes.
4. **Movilizar** (líder+): verifica gate aprobado con firmas, checklist e interfaces. Un paquete planificado se puede **cancelar** con motivo.
5. **FAT/SAT:** crear la actividad; registrar **hallazgos** mientras esté pendiente (con tag → punch Cat A/B/C; sin tag → acción ACC con responsable); adjuntar evidencia; **resultado** (líder+): aprobada, aprobada con hallazgos o fallida (las dos últimas exigen hallazgos). Para repetir, crea una actividad nueva.
6. **Reportes** (con el vendor movilizado): diarios (fecha, personal, horas, actividades, problemas, adjuntos) y un **final único**; inmutables.
7. **Recomendaciones:** proponer (con «requiere MOC» si cambia diseño o proceso) → líder+ aprueba o rechaza con motivo → implementar (con número de MOC si lo requiere).
8. **Desmovilizar** (líder+): exige reporte final, checklist (as-built, herramientas, permisos cerrados, área limpia) y ningún Cat A abierto del paquete.
9. Seguimiento: chip en Control Tower y KPI «Readiness de vendors».

### 5.20 Operación: personal, competencias, repuestos y traspasos
1. **Personal** (no-client): *Arranque › Operaciones › Personal* (nombre, empresa, cargo, turno; usuario opcional).
2. **Competencias** (líder+ o persona de nivel 4; nunca uno mismo): matriz persona × sistema, nivel 0–4 (0 sin entrenamiento · 1 en entrenamiento · 2 con supervisión · 3 autónomo · 4 puede entrenar), evidencia, fecha y vencimiento.
3. **Umbral** (líder+): personas de nivel ≥ 3 por turno (por defecto 2).
4. **Repuestos críticos:** ítem, n.º de parte, tag, cantidades requerida/disponible, estado, ETA.
5. **Pedir traspaso** (cualquier miembro) a la etapa siguiente; el checklist se calcula solo:
   - Shadowing: procedimiento de arranque aprobado y verificado en campo; personal nivel ≥ 1.
   - Operación conjunta: gate de arranque, line-up verificado, primer arranque atestiguado, nivel ≥ 2.
   - Operaciones: nivel ≥ 3 por turno, repuestos críticos disponibles, sin Cat A abiertos.
   - Cada falta exige una justificación (≥ 10 caracteres). La reversión exige motivo.
6. **Firmar** (dos personas distintas): Comisionamiento (líder+) y Operaciones (líder+ o client). Mi trabajo › «Traspasos por firmar».
7. Al completar el paso a **Operaciones** se genera el **paquete de handover** (si falla, «Generar paquete» en el detalle).

### 5.21 Prueba de desempeño y PTC
1. **Definir** (líder+): *Arranque › Desempeño › Nueva prueba* → PTT-0001 R0: 8 secciones, duraciones de estabilización y periodo formal, frecuencia de muestreo, cobertura mínima, frontera, **variables** (señal, manual o derivada), **criterios** (estadístico × condición × objetivo ± incertidumbre) y **pares de medidores**.
2. **Revisión:** enviar → aprobar (líder+ distinto del autor).
3. **Intento** (líder+): «Nuevo intento» → «Iniciar estabilización» → «Iniciar periodo formal» → durante: **perturbaciones** y **lecturas manuales** (no-client); un líder+ excluye perturbaciones del cálculo con motivo → «Cerrar» (antes de la duración = cierre anticipado con motivo) → datos congelados.
4. **Evaluación** automática: cobertura, calidad, picos, unidades, resultado por criterio, pares, resultado sugerido.
5. **Registrar resultado** (líder+): apartarse de la sugerencia exige motivo; el intento queda inmutable. «Falló» o «aceptado con desviación» crean una acción.
6. **PTC:** «Emitir PTC» (líder+, firma Comisionamiento) → **Operaciones** (líder+ o client) y **Cliente** (solo rol client) firman, tres personas distintas → «Aceptado».
7. **PDF de 14 secciones** desde la consola del intento.

### 5.22 Reportes
| Reporte | Dónde | Formato |
|---|---|---|
| Ejecutivo imprimible | *KPIs › Reporte* | HTML para imprimir / PDF |
| Completitud por sistema, avance por fase, KPIs por área | *KPIs* (botones) | PDF |
| Exportación de KPIs | *KPIs › Exportar* | Excel |
| Test pack de ITR | *ITRs* (botón) | PDF |
| ITR individual (bilingüe, firmas, equipos) | ITR › PDF | PDF |
| Punch list | *Punch List* › PDF / Exportar; lista global | PDF, Excel, CSV |
| Certificado y dossier | Certificado › PDF / Dossier | PDF |
| PSSR, reporte diario, relevo, procedimiento, prueba de desempeño, preservación | En cada módulo | PDF |
| Gestión diaria | *Gestión diaria › Exportar* | Excel |
| Etiquetas QR de registros | *Registros › Etiquetas* | PDF |
| Paquete de handover | *Organización › Handover* o automático al traspasar | PDF + JSON firmados |

### 5.23 Integraciones (admin, architect)
- **API keys:** *Administración › API Keys* → nombre, permisos (`tags`, `itrs`, `punches`, `certificates`, `systems`, `events`, `handover`, `signals`), expiración. La clave se muestra **una sola vez**; guárdala en un gestor de secretos. Da acceso a todos los proyectos de la organización. Se envía como `Authorization: Bearer sk_live_…`.
- **Webhooks:** URL https pública y eventos; cada envío lleva `X-CommUp-Signature: sha256=<HMAC>` con el secreto mostrado al crear; reintentos automáticos.
- **Workflows:** reglas «cuando ocurre X → hacer Y».
- ⚠ Antes de depender de un webhook o workflow en producción, pruébalo con el equipo de CommUp: hay nombres de eventos en corrección.

---

## 6. Trabajo sin conexión

**Funciona sin red** (app instalada y la pantalla **abierta antes** de perder la conexión):
- ITR: responder ítems, fotos, firmar.
- Arranque: pasos de procedimiento (hecho, N/A, llegar a hold, Detener) y posiciones de line-up.

Todo queda en una **bandeja de salida** del dispositivo y se envía al volver la red. Si el servidor rechaza algo, aparece en **«No sincronizado»** para reintentar o descartar.

**Necesita conexión:** liberar holds, verificar, reanudar, completar o abortar ejecuciones; punch list general, certificados, gestión diaria, administración, reportes, importaciones y la navegación entre pantallas.

**Reglas de oro**
1. Abre con red los ITR y ejecuciones que vas a usar ese día.
2. **No cierres sesión ni prestes el dispositivo** con pendientes: hoy se envían con la sesión de quien esté conectado.
3. No recargues la página sin red: las respuestas encoladas no se muestran hasta sincronizar.
4. Ten la hora automática activada en el dispositivo.

---

## 7. Matriz de quién hace qué

✓ = puede · ✗ = no puede · ◐ = con condición (asignado, otra persona o configuración) · ⚠ = ver §8.

| Acción | Owner | Admin | Architect | Leader | Inspector | Client |
|---|---|---|---|---|---|---|
| Invitar usuarios, configurar organización y gates | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Crear proyectos, importar tags y señales | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Plantillas ITR/PSSR/preservación, matriz IA | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Asignar ITR, planes de trabajo | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Ejecutar ITR | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Firmar ITR (rol asignado) | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ |
| Reabrir ITR aprobado | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Levantar punch | ✓ | ✓ | ✓ | ✓ | ⚠ | ✗ |
| Resolver punch | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Verificar punch (otra persona) | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ |
| Revisar categoría de punch | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Ejecutar preservación | ✓ | ✓ | ✓ | ✓ | ⚠ | ⚠ |
| Aprobar PSSR / emitir RFSU | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Emitir y firmar certificados | ✓ | ✓ | ✓ | ✓ | ✗ | ⚠ |
| Aprobar gate (Comisionamiento) | ✓ | ✓ | ✓ | ◐ | ✗ | ✗ |
| Co-firmar gate (Operaciones / HSE) | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ |
| Registros: proponer, retirar / autorizar, cancelar | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✗ | ✗/✗ |
| Acciones, restricciones, TQ, decisiones | ✓ | ✓ | ✓ | ✓ | ✓ | TQ |
| Emitir reporte diario | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Relevo de turno | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Redactar / aprobar procedimiento | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✗ | ✗/✗ |
| Ejecutar pasos / liberar hold | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✗ | ✗/◐ |
| Line-up: ejecutar / verificar | ✓/◐ | ✓/◐ | ✓/◐ | ✓/◐ | ✓/◐ | ✗/◐ |
| Registrar hito / atestiguar | ✓/◐ | ✓/◐ | ✓/◐ | ✓/◐ | ✓/✗ | ✗/◐ |
| Firmar traspaso (Comisionamiento / Operaciones) | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | ✗/✗ | ✗/✓ |
| Dirigir prueba de desempeño, emitir PTC | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Firmar PTC como Cliente | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Documentos y revisiones | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Referenciar documentos en ITR/procedimientos | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Paquetes de vendor (crear, movilizar, decidir) | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Vendors: interfaces, FAT/SAT, reportes | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Empresas | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| API keys, webhooks, workflows | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Auditoría | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |

---

## 8. Limitaciones conocidas (mientras se corrigen)

Están identificadas en la revisión integral del 2026-10-19 y en la hoja de ruta de corrección. Mientras tanto:

| Situación | Qué hacer |
|---|---|
| Un ITR solo se aprueba con firma de ejecutor, supervisor **y** cliente, y no se pueden agregar después. | Asigna siempre los tres roles al crear el ITR. |
| Los ITR de loop check y C&E no habilitan «Firmar». | Avisa al architect; se corrige en la primera semana. |
| El inspector no puede levantar punch (el botón aparece pero falla; sin red se descarta). | Anota el defecto en las observaciones del ítem y pide al supervisor que lo levante. |
| Preservación finalizada por un inspector no avanza la fecha ni queda registrada. | Que un líder finalice el registro. |
| El ITR sale de «por ejecutar» al completar el contenido aunque falte tu firma. | Firma inmediatamente después de completar. |
| Nadie recibe aviso de gates por aprobar o co-firmar, registros por autorizar o TQ respondidas. | Revisa Control Tower y las listas en la reunión diaria. |
| El reporte diario corta el día en hora UTC y cuenta como máximo 30 ITR aprobados y 30 punch nuevos. | Revisa las cifras antes de emitir. |
| En proyectos de más de 1.000 ITR o punch, algunos KPIs y la elegibilidad de certificados pueden quedar incompletos. | Confirma con la lista paginada antes de emitir un certificado. |
| Cerrar sesión no borra la cola sin conexión. | No cierres sesión con pendientes; no prestes el dispositivo. |
| Reimportar un Excel parcial borra datos de tags o la cadena de lazos. | Reimporta siempre el archivo completo. |
| El PDF de punch list falla si una descripción tiene saltos de línea; Ω y Δ salen como «?». | Evita saltos de línea en descripciones; escribe «Mohm». |
| Una misma persona puede firmar varios roles de un certificado; el cliente no puede firmar certificados MC/RFC. | Que firmen tres personas distintas; el representante del cliente firma por fuera hasta la corrección. |
| La revisión vigente de un documento es la última registrada. | Carga el historial de revisiones en orden cronológico. |
| La app instalada abre en el Dashboard. | Toca «Mi trabajo». |
| Cambiar de organización dentro de un proyecto puede dar «página no encontrada». | Cambia desde Mi trabajo o el Dashboard. |

---

## 9. Errores frecuentes y qué hacer

| Mensaje | Significa | Qué hacer |
|---|---|---|
| «User not assigned to signing role» | No estás asignado a ese rol del ITR. | Pide al líder que te asigne o firma el rol que te corresponde. |
| «Previous signature required» | Falta la firma anterior (orden ejecutor → supervisor → cliente). | Espera la firma previa. |
| «Applicable content incomplete or rejected» | Faltan ítems obligatorios o hay una falla crítica. | Completa o corrige; levanta punch si corresponde. |
| Equipo de prueba vencido | La calibración vence antes de la fecha de uso. | Usa otro equipo registrado o actualiza su certificado. |
| «Revisión de documento superada…» | Un documento referenciado tiene una revisión más nueva. | «Actualizar a la vigente» en el panel de documentos. |
| «El gate de movilización del sistema no está aprobado con todas sus firmas» | El paquete de vendor depende de un gate que aún no está firmado. | Completa el gate o quita la exigencia del paquete. |
| «Sin permisos» | Tu rol no permite la acción. | Revisa la matriz §7 y pide a la persona habilitada. |
| «duplicate key value…» al asignar un ITR | Choque de número con una revisión anterior de la plantilla. | Avisa al architect. |
| Pantalla «Sin conexión» | Página no disponible sin red. | Vuelve a intentar con señal; abre con red lo que usarás sin red. |

---

*Manual elaborado a partir de la revisión integral del 2026-10-19 (`docs/REVISION-INTEGRAL-2026-10-19.md` y sus anexos). Se actualizará a medida que se corrijan las limitaciones de la §8.*
