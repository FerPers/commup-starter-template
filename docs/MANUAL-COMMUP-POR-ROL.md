# Manual de CommUp — Guía por rol y por fase

**Versión:** 2026-10-22 · **Aplica a:** commup.app (producción), con la navegación por fase y por rol
**Para quién:** cualquier persona que empieza a usar CommUp en un proyecto de completions y comisionamiento.

> **Cómo leer este manual.** La parte 1 explica los conceptos. La parte 2 te deja entrando y moviéndote. La parte 3 recorre el proyecto **fase por fase** (qué se hace, quién y dónde). La parte 4 es la **guía por rol**: busca la tuya y sigue el «día típico». La parte 5 tiene los **procedimientos paso a paso** de cada módulo, para consultar cuando los necesites. Al final: trabajo sin conexión, matriz de quién hace qué y errores frecuentes.
>
> Dentro de la app, este manual está en **menú de usuario › Ayuda**, y **«Ayuda de esta página»** abre la sección de la pantalla donde estás. Los avisos marcados con **⚠** describen límites vigentes; síguelos.

---

## Índice

1. [Qué es CommUp y conceptos clave](#1)
2. [Primeros pasos](#2)
3. [El proyecto fase por fase](#3)
4. [Guía por rol](#4)
5. [Procedimientos paso a paso por módulo](#5)
6. [Trabajo sin conexión](#6)
7. [Matriz de quién hace qué](#7)
8. [Limitaciones conocidas](#8)
9. [Errores frecuentes y qué hacer](#9)

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
| **Plantilla ITR** | El modelo del ITR (código tipo E13B, ítems, criterios, firmas requeridas). Tiene revisiones; una revisión usada no se modifica. |
| **Punch** | Una deficiencia encontrada. **Cat A** bloquea el certificado y las liberaciones; **Cat B** se puede transferir con excepción justificada; **Cat C** es menor y nunca bloquea. |
| **Certificado** | Documento formal de completitud por subsistema y fase (MC, RFPC, RFC, RFSU). Se emite solo si no hay bloqueos y se bloquea solo si la base cambia. |
| **Liberación** | Punto de control por sistema (una por fase y las opcionales; p. ej. «aprobar la liberación MC del sistema»). Se calcula sola con sus criterios y la aprueba quien tiene autoridad; puede exigir co-firmas de Operaciones y HSE. En inglés, *milestone*. |
| **Liberación de sistemas** | La matriz sistema × liberación de un proyecto: dónde está cada sistema, cuál es su siguiente liberación y qué la frena. En inglés, *System readiness*. |
| **Firmantes designados** | Las personas que firman por una capacidad (Comisionamiento, Operaciones, HSE, Representante del cliente) en un proyecto. Sin designados, firman los roles por defecto. |
| **Registro controlado** | Un estado temporal en campo que hay que controlar y revertir: temporales, ciegas, reinstalaciones, bypass, energizaciones, test packs. Mientras está activo puede bloquear liberaciones. |
| **PSSR** | *Pre-Startup Safety Review*: revisión de seguridad previa al arranque. Su aprobación emite el RFSU y habilita el primer arranque. |
| **Procedimiento** | Instrucción de arranque, parada u operación con secuencia de pasos y **puntos de espera** (*hold points*) que libera otra persona. |
| **Line-up** | Hoja de alineación de válvulas (posición requerida, encontrada y dejada) con verificación independiente. |
| **Hito de arranque** | Primera energización, primera rotación, primer arranque, primer HC, operación estable, producto en especificación. Lo atestigua otra persona. |
| **Prueba de desempeño (PTT) y certificado PTC** | Demostración de capacidad con datos (IIoT o manuales), evaluada por el sistema, aceptada con tres firmas. |
| **Traspaso (TRF)** | Cambio de dueño del sistema: Comisionamiento → Shadowing → Operación conjunta → Operaciones. |
| **Gestión diaria** | Acciones (ACC), restricciones (RES), consultas técnicas (TQ), decisiones (DEC), reporte diario (RD) y relevo de turno (REL). |
| **Documento** | Entrada del registro maestro (P&ID, hoja de datos, plano…) con revisiones. Un ITR o procedimiento referencia una revisión; si sale una más nueva, se bloquea la firma hasta actualizar. Un P&ID es un documento de tipo P&ID, con visor y pines de tags. |
| **Paquete de vendor (VND)** | El alcance de un proveedor: interfaces, movilización, FAT/SAT, reportes, recomendaciones y desmovilización. |
| **«Otra persona»** | Regla del sistema: quien verifica, libera o co-firma tiene que ser una persona distinta de quien hizo el trabajo. Se comprueba en la base de datos. |

### Cómo leer los estados

Todo avanza por seis preguntas, en orden. Cada registro responde la suya, y que una esté al 100 % no dice nada de la siguiente: un ITR diligenciado no está aprobado, y un sistema sin bloqueos conocidos no está liberado.

| Pregunta | Qué significa | Dónde se ve |
|---|---|---|
| **Alcance** | ¿Está identificado lo que hay que hacer? | Registro de requisitos ITR |
| **Diligenciado** | ¿Se capturó todo lo aplicable? | Ejecución del ITR |
| **Conforme** | ¿El resultado cumple el criterio? | Ejecución del ITR (una falla crítica = «No conforme») |
| **Aprobado** | ¿Lo revisó y firmó otra persona con capacidad? | ITR, certificado, PSSR |
| **Liberado** | ¿El sistema pasó el punto de espera y sigue vigente? | Liberación de sistemas |
| **Entregado** | ¿Operaciones lo recibió con su paquete? | Operación y traspaso |

Cada color tiene un solo significado, y siempre va con texto e ícono:

| Color | Significa | Ejemplos |
|---|---|---|
| Gris | No empezó, o no aplica | Sin iniciar · Punch abierto · Pendiente |
| Rayado | No se sabe: nunca cuenta como «0 pendientes» | Sin información |
| Azul | En trabajo: le toca a quien lo tiene | En progreso · Devuelto · En proceso |
| Violeta | Espera a otra persona: firmar, verificar o aprobar | Diligenciado · por firmar 1/3 · Resuelto · por verificar · Emitido · firmas 2/3 · Listo para aprobar |
| Verde | Aceptado y vigente | Aprobado · Cerrado · Emitido |
| Verde sólido | Solo Liberado y Entregado a Operaciones (nivel sistema) | Liberado · Entregado a Operaciones |
| Ámbar | Aceptado con condiciones, o desactualizado | Liberado con condiciones · Por revisar · Paquete parcial |
| Rojo | Bloquea o falló | No conforme · Cat A · Bloqueado · En regresión · Revocado |

Un ITR **devuelto** por el supervisor o el cliente muestra el motivo en la lista y en la ejecución, hasta que el ejecutor corrige y vuelve a firmar. En el punch, el estado no usa rojo: la gravedad la dice la categoría (Cat A en rojo porque bloquea).

---

## 2. Primeros pasos

### 2.1 Acceso
1. Recibes un **correo de invitación** de CommUp (lo envía un administrador o el propietario de tu empresa).
2. El enlace te lleva a **«Fija tu contraseña»** (mínimo 8 caracteres). No existen contraseñas temporales.
3. Entra en **commup.app** con tu correo y contraseña. Si olvidaste la contraseña: **«¿Olvidaste tu contraseña?»** en la pantalla de acceso.
4. Entras a tu inicio: **Mi trabajo** (inspector y líder) o **Portafolio** (los demás roles).
5. Si perteneces a varias organizaciones: menú de usuario › **Cambiar organización**; vuelves al inicio de tu rol.

### 2.2 Instalar la aplicación (recomendado para campo)
- **Android (Chrome/Edge):** abre commup.app, inicia sesión y acepta «Instalar CommUp», o menú ⋮ → «Instalar aplicación».
- **iPhone/iPad (Safari):** botón Compartir → «Agregar a pantalla de inicio». En iOS **solo la app instalada** recibe notificaciones.
- **Escritorio:** ícono de instalación en la barra de direcciones de Chrome/Edge.
- Activa los avisos del dispositivo en menú de usuario › **Preferencias de notificación**. En Brave para macOS hay que habilitarlos en la configuración del navegador.
- La app instalada abre en tu inicio (Mi trabajo o Portafolio).

### 2.3 Idioma y tema
- Menú de usuario › **Preferencias**: **ES / EN** y **tema claro/oscuro**. La preferencia queda en ese navegador.
- ⚠ Algunas pantallas de administración, importadores y mensajes de error siguen en español aunque elijas inglés. Este manual está en español.

### 2.4 Cómo está organizada la pantalla
- **Barra superior:** migas de pan (dónde estás), **Buscar (⌘K)**, **＋ Crear**, 🔔 campana (avisos recientes; «Ver todos» abre la Bandeja) y menú de usuario (organización, preferencias, Ayuda, cerrar sesión).
- **Menú lateral**, armado según tu rol:
  1. **Mi trabajo** — todo lo que te toca, con el número de pendientes. Inspector y líder tienen además **Escanear QR/NFC**.
  2. **Proyecto** (o «Último proyecto») — con el selector **Cambiar de proyecto** (búsqueda y recientes). Cada rol ve primero lo suyo:
     - **Inspector:** Resumen · Tags y equipos · ITRs · Punch · Preservación · Registros de campo · Arranque.
     - **Líder:** Resumen · Liberación de sistemas, y debajo los mismos grupos fijos que gerencia con lo suyo: *Trabajo* (Sistemas, Tags y equipos, ITRs, Punch, Documentos) · *Campo y cierre* (Preservación, Registros de campo, Certificados, PSSR) · *Arranque y operación* (Arranque) · *Gestión* (Gestión diaria) · *Configuración del proyecto* plegada (Proveedores) · **Por fase**, plegado, con los atajos de cada fase.
     - **Arquitecto:** Resumen · Liberación de sistemas · Planificación · Sistemas · Gestión diaria · KPIs.
     - **Propietario y administrador:** Resumen · Liberación de sistemas y los módulos fijos por tipo de trabajo: *Trabajo* (Sistemas, Tags y equipos, ITRs, Punch, Documentos) · *Campo y cierre* (Preservación, Registros de campo, Certificados, PSSR, Señales y lazos) · *Arranque y operación* (Arranque, Desempeño (PTC), Operación y traspaso) · *Gestión* (Gestión diaria, Planificación, KPIs) · *Configuración del proyecto* plegada (Alcance, Proveedores, Firmantes, Importar). Debajo, **Fases**: una sección plegable por fase de tu organización, con cuántos sistemas tiene liberados (por ejemplo «4/20») y tres atajos: *ITR de la fase*, *Punch de la fase* y *Sistemas por liberar*. Cada atajo abre la lista de siempre ya filtrada. Se abre sola la fase que más sistemas tienen como siguiente liberación; si abres otras, el menú lo recuerda en ese dispositivo.
     - **Cliente:** Resumen · Liberación de sistemas · Documentos · Punch · Certificados · PSSR · Desempeño (PTC) · Operación y traspaso · Gestión diaria.
  3. **Portafolio** (propietario y administrador) — Proyectos · Portafolio (KPIs y la tabla de liberación por proyecto) · Post-handover · Paquetes de entrega.
  4. **Más…** — todo lo demás que tu rol puede abrir (se recuerda abierto o cerrado).
  5. **Administración** (se despliega; líder+) — Organización (Usuarios, Empresas, Configuración, Liberaciones y criterios) · Plantillas (ITR, preservación, PSSR, Tipos de registro) · Recursos (Equipos de prueba) · Integración (Automatizaciones, Claves de API, Webhooks) · Control (Calidad de datos, Registro de auditoría). Cada persona ve solo lo que su rol permite.
- **Teléfono y tablet:** ☰ abre el menú. En roles de campo hay una barra inferior: **Mi trabajo · Escanear · ＋ Crear · Menú** (la campana sigue arriba). El punto ámbar o rojo en «Menú» indica pendientes por sincronizar o sin conexión.

### 2.5 Consejos de navegación
- **Buscar cualquier cosa:** **Buscar (⌘K)** o Ctrl+K y escribe un tag, ITR, punch, sistema o código (TQ-0042, ACC-0003, PRC-0001, VND-0002…). Dentro de un proyecto busca en «Este proyecto» o en «Todos». Un número exacto sale primero: Enter lo abre. Con la caja vacía ves lo último que abriste en ese dispositivo.
- **Crear sin navegar:** **＋ Crear** → Punch, Acción, Restricción, TQ, Evento de arranque o Registro de campo (el inspector ve Punch, Registro y Evento; el cliente, TQ). Se precargan el proyecto y, si estás en la ficha de un tag o de un sistema, ese tag o sistema.
- **Cambiar de proyecto:** selector «Cambiar de proyecto» en el encabezado del bloque Proyecto.
- **Un tag:** escanea su QR, búscalo con ⌘K, o *Tags y equipos* (modos Lista · Árbol · Tarjetas).
- **Dónde está cada sistema:** Proyecto › **Liberación de sistemas** → fila del sistema → su **ficha** (pestañas Liberaciones · Avance y plan · Dependencias · Arranque · Traspaso · Vendors y desempeño · Datos del sistema). Varios proyectos: la tabla de liberación por proyecto del *Portafolio*.
- **Listas de todos los proyectos:** en ITRs, Punch, Certificados, Preservación y Planes de trabajo, el selector **«Este proyecto / Todos los proyectos»**.
- **PDF y Excel:** en cada ITR, certificado, PSSR, reporte diario, procedimiento, prueba de desempeño, y en *KPIs*, *Liberación de sistemas* y las listas de punch.

---

## 3. El proyecto fase por fase

Esta es la secuencia típica de un proyecto. Cada fase termina en una **liberación por sistema**: el sistema avanza cuando su liberación está aprobada y firmada. El **Resumen** del proyecto es un tablero por fases: cuántos sistemas hay en cada una y qué los frena.

### 3.0 Preparación (antes del primer ITR)

| Qué | Quién | Dónde |
|---|---|---|
| Crear la organización y el primer proyecto (asistente) | Propietario | `/setup` (primer ingreso) |
| Revisar fases, disciplinas y tipos de equipo | Administrador | Administración › Configuración |
| Configurar liberaciones: criterios, quién aprueba, co-firmas, «exige line-up», «exige desempeño», pesos, política de regresión | Administrador | Administración › Liberaciones y criterios |
| Activar tipos de registro controlado y qué liberación bloquea cada uno | Arquitecto | Administración › Tipos de registro |
| Invitar usuarios y asignarles rol y empresa | Administrador | Administración › Usuarios / Empresas |
| Designar firmantes por capacidad del proyecto | Propietario / Administrador | Proyecto › Firmantes |
| Importar jerarquía y tags (Excel) | Arquitecto | Proyecto › Importar (o «+ Importar tags» en Tags y equipos) |
| Importar el índice de señales y lazos (Excel) | Arquitecto | Señales y lazos › Importar señales |
| Revisar sistemas, prioridades, límites y **dependencias** entre sistemas | Líder / Arquitecto | Proyecto › Sistemas → ficha › Dependencias |
| Plantillas ITR (crear, importar del catálogo, activar revisiones) y matriz tipo de equipo × plantilla (con IA) | Arquitecto / Líder | Administración › Plantillas ITR › Matriz |
| Tipo de equipo de los tags (por grupos con IA o uno a uno) | Arquitecto | ITR › Requisitos ITR › Clasificar sin tipo · ficha del tag › ITRs |
| Plantillas de preservación y PSSR | Líder | Administración › Plantillas |
| Inventario de equipos de prueba calibrados | Líder | Administración › Equipos de prueba |
| Registro de documentos (P&ID, hojas de datos…) y sus revisiones | Líder | Proyecto › Documentos |
| Paquetes de vendor | Líder | Proyecto › Proveedores |
| Planes de preservación por tag | Líder | Ficha del tag › Preservación |

**Resultado esperado:** cada tag en su subsistema, plantillas activas, usuarios con rol, firmantes designados, liberaciones configuradas.

### 3.1 Completamiento mecánico (fase A → certificado MC)
1. **Asignar ITR de fase A** por tag, o en masa con ITRs › **Generar ITR** (alcance × fase, responsables por disciplina), con los firmantes que pide la plantilla.
2. Los **inspectores ejecutan** los ITR en campo (con o sin red) y **levantan punch** cuando encuentran defectos.
3. Los **supervisores revisan** la categoría de los punch y firman los ITR como supervisor.
4. Se **resuelven y verifican** los punch (verifica otra persona).
5. Se mantiene la **preservación** de los equipos instalados.
6. Se controlan los **registros de campo** (ciegas, temporales…).
7. Con todos los ITR A aprobados y sin Cat A abiertos, un líder **emite el certificado MC** por subsistema, y se firma.
8. En **Liberación de sistemas**, la liberación MC del sistema queda «Lista»: quien tiene autoridad la **aprueba** y, si se exige, Operaciones y HSE la **co-firman** (les llega aviso y aparece en su Mi trabajo).

### 3.2 Pre-comisionamiento (fase B → RFPC)
1. ITR de fase B (pruebas en frío, flushing, energización controlada…).
2. **Loop checks** generados desde *Señales y lazos › Lazos* (una tabla con la cadena campo → JB → marshalling → I/O → DCS → HMI).
3. Registros de **energización** y **test packs** según corresponda.
4. Certificado RFPC y liberación RFPC (requiere la MC aprobada si la liberación lo exige).

### 3.3 Comisionamiento (fase C → RFC)
1. ITR de fase C (pruebas funcionales).
2. **Pruebas C&E**: desde *Señales y lazos › Matrices C&E* se genera una prueba por causa, con una fila por efecto; cada celda muestra el resultado.
3. Restricciones y TQ de la fase en Gestión diaria.
4. Certificado RFC y liberación RFC.

### 3.4 Arranque (fase SU → RFSU y primer arranque)
1. **Procedimientos** de arranque redactados, revisados, aprobados por otra persona y **verificados en campo** (walkdown).
2. **PSSR** del sistema: llenar ítems, enviar, firmar, aprobar → se emite el **RFSU**.
3. **Line-up** del sistema ejecutado y verificado por otra persona (la liberación de arranque lo exige).
4. **Liberación RFSU** aprobada con todas sus firmas.
5. **Ejecución del procedimiento** con puntos de espera liberados por la capacidad correspondiente.
6. **Bitácora de arranque**: registrar los hitos (primera energización, rotación, **primer arranque**, **primer HC**, operación estable, producto en especificación) con sus parámetros IIoT y el **testigo**. Primer arranque y primer HC solo se permiten con la liberación de arranque aprobada y el PSSR más reciente aprobado.

### 3.5 Desempeño (fase PA → PTC)
1. **Definir la prueba** (frontera, variables, criterios, incertidumbre, duraciones), revisarla y aprobarla.
2. **Ejecutar el intento**: estabilización → periodo formal → cierre; registrar perturbaciones y lecturas manuales.
3. **Evaluación automática** y **registro del resultado** (aceptado, aceptado con desviación, repetir, falló, no concluyente).
4. **Certificado PTC** con tres firmas: Comisionamiento, Operaciones y Cliente.
5. Si la liberación PA «exige desempeño», queda en verde con el PTC aceptado.

### 3.6 Traspaso a Operaciones y handover
1. **Personal de operaciones** y **matriz de competencias** (niveles 0–4) por sistema; **repuestos críticos**.
2. **Traspasos** por etapa: Shadowing → Operación conjunta → Operaciones, cada uno con su checklist y dos firmas de personas distintas.
3. Al completar el paso a Operaciones se genera el **paquete de handover** del sistema, firmado digitalmente y verificable en `/verify`.
4. Los punch Cat B pendientes se **transfieren a Operaciones** y se siguen en *Post-handover*.

### 3.7 Transversal: gestión diaria
Todos los días, durante todo el proyecto:
- **07:00 reunión diaria** con el look-ahead (7 días) de *Planificación* y *Liberación de sistemas*: liberaciones en riesgo, restricciones nivel ≥ 3, acciones vencidas.
- **Acciones, restricciones, TQ y decisiones** en *Proyecto › Gestión diaria*.
- **Forecast y compromiso** por liberación en *Planificación › Look-ahead* o en la ficha del sistema › Avance y plan.
- **Reporte diario** al cierre del día (borrador con IA, edición, emisión por un líder).
- **Relevo de turno** entre turnos.

---

## 4. Guía por rol

Roles de la organización: **propietario, administrador, arquitecto, líder, inspector, cliente**. En este manual, **«líder+»** = propietario, administrador, arquitecto o líder; **«no-clientee»** = cualquiera menos cliente. Quién firma por una **capacidad** (Comisionamiento, Operaciones, HSE, Representante del cliente) lo deciden los **firmantes designados** del proyecto (Proyecto › Firmantes); si no hay designados, firman los roles por defecto.

### 4.1 Inspector (técnico de campo)

**Quién eres:** quien ejecuta inspecciones y pruebas en terreno, normalmente con la app instalada en una tablet o teléfono.
**Empiezas en:** **Mi trabajo** (columnas Ejecutar · Verificar · Firmar · Decidir).

**Día típico**
1. Antes de salir a campo, con red: Mi trabajo › **«Preparar para trabajar sin red»** (deja listos hasta 30 ITR).
2. En campo: abre el ITR, registra el **equipo de prueba** si lo pide, completa los ítems, toma fotos. Se guarda solo. El pie muestra el avance y «Siguiente pendiente».
3. Si encuentras un defecto: botón ⚑ del ítem o «Punch» al pie del ITR (también sin red). Para un defecto fuera de un ITR: **＋ Crear › Punch** desde la ficha del tag.
4. Al terminar el contenido: **Firmar** como ejecutor.
5. Revisa en Mi trabajo: **punches asignados** (resolver con descripción y fotos), **punches por verificar** (de otros), **preservación vencida**, **puntos de espera** y **filas de line-up**.
6. Al volver la red, comprueba que el pie no muestre «N pendientes». Al cerrar sesión con pendientes, elige «Sincronizar y salir».

**Lo que puedes hacer**
- Ejecutar y firmar los ITR donde estás asignado.
- Levantar punch, resolverlos con evidencia y verificar punch resueltos por otra persona.
- Ejecutar y finalizar preservación.
- Proponer y retirar registros de campo (ciegas, bypass, temporales…).
- Crear acciones, restricciones y TQ.
- Redactar y enviar procedimientos; ejecutar pasos; detener una ejecución; posicionar line-ups; verificar procedimientos en campo.
- Registrar eventos de arranque, parámetros, perturbaciones y lecturas manuales de pruebas de desempeño.

**Lo que no puedes:** asignar ITR, emitir certificados, aprobar procedimientos o liberaciones, pedir o firmar traspasos ni PTC. Liberar puntos de espera o atestiguar hitos, solo si te designan como firmante de esa capacidad.

### 4.2 Líder (supervisor de disciplina / líder de sistema)

**Quién eres:** supervisor de disciplina, líder de sistema o líder de comisionamiento.
**Empiezas en:** **Mi trabajo** — ITR por revisar o firmar, punches por clasificar, acciones y restricciones tuyas, puntos de espera por liberar, liberaciones por aprobar o co-firmar, traspasos y PTC por firmar.

**Día típico**
1. **07:00 reunión diaria:** *Planificación › Look-ahead* (7 días) + *Liberación de sistemas* (filtra «Siguiente: MC» o «Bloqueados»).
2. **Asignar trabajo:** ITR por tag, en masa con «Generar ITR», o reasignar en lote desde la lista de ITR («Asignar a»); **planes de trabajo** del día en *Planificación*.
3. **Revisar punch nuevos:** confirmar o recategorizar (con motivo) los que levantaron otros.
4. **Firmar ITR** como supervisor cuando el ejecutor ya firmó.
5. **Certificados:** cuando un subsistema queda en verde, emitir el certificado de la fase (justificando los Cat B si los hay).
6. **Gestión diaria:** acciones, restricciones (escalar con motivo), TQ, decisiones; **compromisos** de fecha por liberación (cambiarlos exige motivo).
7. **Arranque:** aprobar procedimientos de otros, liberar puntos de espera, reanudar o abortar ejecuciones, atestiguar hitos, dirigir pruebas de desempeño y emitir PTC.
8. **Cierre del día:** revisar y **emitir el reporte diario**.

**También puedes:** crear y editar plantillas ITR, PSSR y preservación; matrices C&E y lazos; sistemas y dependencias; documentos y revisiones; paquetes de vendor (movilizar, desmovilizar, decidir recomendaciones); evaluar competencias; pedir traspasos y firmarlos como Comisionamiento (u Operaciones si te designan); co-firmar liberaciones con tu capacidad.

**No puedes:** importar tags, configurar la organización o las liberaciones, aprobar liberaciones salvo que el administrador te incluya entre los aprobadores, reabrir ITR aprobados.

### 4.3 Gerente de comisionamiento / planner (funciones)

CommUp no tiene un rol «gerente» ni «planner»: normalmente son **arquitecto** o **administrador** (gerente) y **líder** o **arquitecto** (planner).

**Gerente — día típico**
1. *Portafolio* (liberación por proyecto) → abre el proyecto → **Liberación de sistemas**: liberaciones por aprobar, pendientes de firma y en regresión. Aprueba los listos desde la ficha del sistema (§5.8).
2. *KPIs*: avance ponderado, liberación de sistemas, cumplimiento de compromisos, TQ y acciones a tiempo, restricciones por nivel, primer arranque, desempeño, completitud documental, vendors listos, curva S.
3. *Gestión diaria*: restricciones nivel 3–4, decisiones, TQ abiertas.
4. *Reporte diario*: revisar el borrador, completar y emitir (o pedirlo al líder).
5. Entrega: *Operación y traspaso* (traspasos) y *Paquetes de entrega*.

**Planner — día típico**
1. *Planificación › Look-ahead*: ventanas de 7, 30 y 90 días; base forecast o compromiso; «Editar» para cambiar fechas en bloque (los compromisos exigen motivo).
2. *Planificación › Planes de trabajo*: listas de trabajo diarias o semanales por disciplina.
3. *KPIs*: curva S del avance ponderado.

### 4.4 Arquitecto (ingeniería de completions / configuración)

**Quién eres:** quien prepara el proyecto: estructura, tags, plantillas, integraciones; a menudo también planifica.
**Empiezas en:** Portafolio.

**Tareas**
- Crear y editar proyectos.
- **Importar** jerarquía y tags (§5.1) e índice de señales (§5.17); editar tags.
- **Plantillas ITR**: crear, importar del catálogo, activar revisiones, traducciones; **matriz** tipo de equipo × plantilla con IA; **Generar ITR** en masa.
- **Tipos de registro controlado** y qué liberación bloquea cada uno.
- **P&ID** (documentos tipo P&ID con visor y pines); lazos y matrices C&E (también importación con IA).
- **Aprobar liberaciones** (es aprobador por defecto); reabrir ITR aprobados; revocar o reabrir certificados.
- **Integraciones:** claves de API, webhooks, automatizaciones; calidad de datos; paquetes de entrega.

**No puedes:** configurar fases, disciplinas, usuarios ni liberaciones (eso es del administrador).

### 4.5 Administrador

**Quién eres:** administrador funcional de la plataforma en tu empresa.
**Tareas**
1. **Usuarios:** *Administración › Usuarios › Invitar* → correo y rol; asignar **empresa** a cada persona (las firmas muestran «nombre · empresa»). En el menú **⋯** de cada persona: acceso con vencimiento, suspender, **enviar enlace para restablecer la contraseña** (le llega el mismo correo de «¿Olvidaste tu contraseña?»; nadie fija ni ve la contraseña de otro) o quitar (el sistema muestra qué deja pendiente).
2. **Empresas:** *Administración › Empresas* — operadora/cliente, EPC, vendors, subcontratistas.
3. **Firmantes designados** por proyecto: *Proyecto › Firmantes* (Comisionamiento, Operaciones, HSE, Representante del cliente).
4. **Configuración:** fases (con su nombre de certificado: MC, RFPC…), disciplinas, tipos de equipo, logo, glosario de traducción, límite de Cat B abiertos por subsistema.
5. **Liberaciones y criterios:** criterios, aprobadores, co-firmas requeridas, «exige line-up», «exige desempeño», pesos del avance, política de regresión, ítems de traspaso no dispensables. Cada cambio queda en la auditoría. ⚠ Los cambios aplican de inmediato a todos los proyectos de la organización.
6. **Auditoría** y **exportación** de proyectos a Excel.

**No puedes:** borrar proyectos ni cambiar o quitar propietarios.

### 4.6 Propietario

Todo lo del administrador, y además: borrar proyectos, elegir el catálogo de plantillas de la organización, invitar, cambiar o quitar a otros propietarios. Siempre debe quedar al menos un propietario.

### 4.7 Cliente (representante de la operadora / dueño)

**Quién eres:** personal del dueño de la planta que atestigua, verifica y acepta.
**Empiezas en:** Portafolio (widget de firmas pendientes) y Mi trabajo.

**Tareas**
- **Consultar** el avance de los proyectos de la organización (Liberación de sistemas, KPIs, certificados, PSSR, documentos, punch por categoría).
- **Firmar ITR** como cliente donde la fase lo exige y estás asignado.
- **Verificar punch en campo** (resueltos por otra persona).
- **Levantar TQ** (**＋ Crear › TQ** o *Gestión diaria › TQ › + Nuevo TQ*) y gestionar las tuyas: editar, emitir, reemitir si la respuesta no basta, cerrar o borrar el borrador.
- **Responder TQ** dirigidas a ti (*Gestión diaria › TQ*), con adjuntos.
- **Firmar certificados** como Cliente (Representante del cliente).
- **Co-firmar liberaciones** como Operaciones o HSE si te designaron (o si no hay designados): Mi trabajo › «Liberaciones por co-firmar» → ficha del sistema › «Firmar como…».
- **Liberar puntos de espera** de Operaciones/HSE y **atestiguar hitos** de Operaciones si tienes esa capacidad.
- **Firmar traspasos** como Operaciones y el **PTC** como Operaciones o como **Cliente**. Mi trabajo › «Certificados PTC por firmar» y «Traspasos de custodia por firmar».

**No puedes:** ejecutar ITR ni pasos de procedimiento, registrar eventos, crear acciones o restricciones, cancelar TQ, verificar filas de line-up.

---

## 5. Procedimientos paso a paso por módulo

### 5.1 Importar jerarquía y tags (arquitecto, administrador, propietario)
1. *Proyecto › Importar* (o «+ Importar tags» en Tags y equipos) → subir .xlsx/.xls. La app elige la hoja y detecta la fila de encabezados.
2. Columnas: **TAG** (obligatoria), DESCRIPCIÓN, DISCIPLINA (o una para todo el archivo), AREA_CODE/NAME, SYSTEM_CODE/NAME, SUBSYSTEM_CODE/NAME, TIPO DE EQUIPO, P&ID, FABRICANTE, MODELO, SERIE, PRESERVACIÓN (SI/YES), DATASHEET y revisión, RANGO MIN/MAX, UNIDAD, CAJA DE CONEXIONES, CRITICIDAD, SIL.
3. Vista previa (marca las existentes y los cambios) → **Importar**: crea las nuevas y actualiza las existentes, por lotes con progreso; los errores se descargan en un reporte. La jerarquía se crea sola; sin código, el tag va a GENERAL / GEN-SYS / GEN-SUB.
4. Las columnas ausentes o las celdas vacías no se tocan; un tag con ITR o punch no cambia de subsistema por importación (la vista previa lo avisa).
5. Errores comunes: disciplina inexistente → fila omitida; tags repetidos → gana la última fila.

### 5.2 Plantillas ITR y asignación (líder+)
**Plantillas**
1. *Administración › Plantillas ITR*: crear, clonar del catálogo público u otra organización, o restaurar respaldo.
2. Encabezado: código (p. ej. E13B), título ES/EN, disciplina, fase, tipo de equipo, «requiere equipo de prueba», **firmas requeridas**.
3. Ítems: casilla, sí/no, texto, número, medición (mín/máx/unidad), selección (con resultado), foto, fecha, documento PDF, continuidad, tabla (fija, variable o desde lazo/C&E). Marcas: crítico, obligatorio, requiere foto/documento, condición.
4. **Activar** la revisión. Una revisión usada no se edita: «Nueva revisión» → editar → activar.
5. *Plantillas ITR › Matriz*: la IA propone tipo de equipo × plantilla con motivo; acepta o rechaza. Las filas aceptadas son las que usa «Generar ITR».
6. **Tags sin tipo:** un tag sin tipo de equipo no recibe ningún ITR. *ITR › Requisitos ITR › Clasificar sin tipo* los agrupa por firma (prefijo + disciplina + descripción) y propone un tipo: gratis cuando el prefijo es un código del catálogo, coincide con lo ya tipado en la organización o la descripción es el nombre de un tipo; para el resto, «Clasificar con IA» (muestra el costo antes). «Aceptar para N tags» aplica a todo el grupo con vista previa (cuántos ITR gana y cuántos quedan fuera de requisitos); «Otro tipo…» elige otro o crea uno nuevo (un tipo sin reglas sirve para elementos sin ITR propio, como un spool). Un tag suelto se cambia en su ficha › ITRs › «Cambiar tipo». Cambiar el tipo nunca borra ITR: si alguno queda fuera de requisitos se pide un motivo. Lo deciden Propietario, Administrador y Arquitecto.
7. **Ajustes con IA:** *ITR › Requisitos ITR › Ajustes con IA*. La matriz da la base de cada tipo; la IA revisa cada firma (tipo + prefijo + disciplina + descripción) y propone solo **agregar** o **excluir** códigos, con motivo y confianza (solo en tipos con reglas aceptadas). Correr la revisión (Propietario, Administrador, Arquitecto) muestra el costo antes; se puede pausar y reanudar. Cada propuesta se acepta o rechaza (Líder en adelante): aceptar crea la excepción en los tags de la firma, con origen «IA», sin tocar lo que una persona decidió a mano. Si cambia la base del tipo, la firma queda «desactualizada» y se puede revisar otra vez.

**Asignar**
1. **Por tag:** ficha del tag › ITRs › «+ Asignar ITR» (o «✦ Sugerir con IA») → plantilla → firmantes que pide la plantilla (por defecto ejecutor + supervisor; cliente si la fase lo exige) → fecha → Asignar. Número `CÓDIGO/TAG` (R2, R3… si se repite). Un rol sin firmar se puede completar o cambiar después.
2. **En masa:** ITRs › **Generar ITR** → alcance (área, sistema, subsistema) × fase → vista previa con responsables por disciplina → Generar.
3. **Por lazo o causa C&E:** *Señales y lazos › Lazos* o *Matrices C&E* → seleccionar → Generar ITR (hasta 200).
4. **Reasignar ejecutor en lote:** lista de ITR (filtros por área, sistema, subsistema y responsable) → seleccionar → «Asignar a».

### 5.3 Ejecutar y firmar un ITR (inspector y asignados)
1. Entra desde **Mi trabajo**, la ficha del tag, **⌘K** o escaneando su QR.
2. Cabecera: número, plantilla y revisión, datos del tag (desplegable), avance, firmas. ES/EN cambia el idioma de los ítems.
3. Completa los ítems: se guardan al salir del campo (texto, número, fecha) o al tocar (casilla, sí/no, selección, tabla). Fotos con la cámara; documentos PDF hasta 10 MB (con red). El micrófono dicta observaciones. En los ITR de loop check y C&E la tabla trae una fila por señal o por efecto, tomadas al generar el ITR.
4. **Equipo de prueba** (debajo de los ítems): regístralo si la plantilla lo exige; vencido en la fecha de uso bloquea la firma.
5. **Documentos de referencia** (debajo de los ítems, si los hay): deben estar «vigentes»; si aparece un aviso rojo de revisión superada, pulsa «Actualizar a la vigente» antes de firmar.
6. Un **ítem crítico en falla** deja el ITR **rechazado**: corrige o levanta punch.
7. **Firmar:** con el ITR completado → Firmar → rol habilitado → firma en el recuadro → Confirmar. En el orden de la plantilla; con todas las firmas requeridas → **aprobado** → PDF disponible.
8. **Reabrir** (propietario, administrador, arquitecto): «Revocar» con motivo; se anulan las firmas y queda la copia en la auditoría.
- Si otra persona cambió una respuesta mientras trabajabas sin red, el ITR te muestra el **conflicto** para que elijas.
- ⚠ No cierres la app con un campo de texto abierto: se guarda al salir del campo.

### 5.4 Punch
1. **Levantar** (no-cliente): desde el ITR (⚑ o «Punch», también sin red), desde la ficha del tag › Punch › «+ Nuevo punch», o con **＋ Crear › Punch** (página de alta con el tag precargado). Categoría A/B/C, **impacto** (seguridad, ambiente, proceso, equipo, operabilidad), descripción, prioridad, fecha y responsable. Número P-0001 consecutivo.
2. Cada punch tiene **su página** con la historia completa (alta, cambios, comentarios, fotos); los avisos y Mi trabajo abren ahí.
3. **Revisar la categoría** (líder+, otra persona): confirmar o recategorizar con motivo (Mi trabajo › «Categoría de punch por revisar»).
4. **Disposición para el arranque** (cerrar antes del arranque / con controles / largo plazo): la exige el PSSR para todo punch abierto del sistema.
5. **Resolver** (no-cliente): describir qué se hizo (mín. 5 caracteres) y subir fotos.
6. **Verificar en campo** (cualquier miembro, incluido el cliente, distinto de quien resolvió): aceptar = cerrado; rechazar = vuelve a «en curso» con motivo.
7. **Cancelar** (líder+, distinto de quien lo levantó, motivo ≥ 10 caracteres): queda en la historia del punch.
8. **Cat B a Operaciones:** *Post-handover* → transferir a una persona de operaciones con fecha y notas → seguimiento (en curso, diferido, resuelto, verificado, cierre final).

### 5.5 Preservación
1. **Procedimientos** (líder+): *Administración › Plantillas de preservación*: ítems, frecuencia e intervalo en días, foto requerida.
2. **Plan** (líder+): ficha del tag › Preservación → procedimiento, fecha de inicio y responsable → próxima fecha = inicio + intervalo.
3. **Ejecutar** (no-cliente): abrir el plan → responder ítems → fotos → resultado → **Finalizar**. La próxima fecha avanza al finalizar, con cualquier resultado; un NOK exige categoría y levanta su punch.
4. Vencidos: en Mi trabajo y en *Proyecto › Preservación* («Todos los proyectos» para la vista global); aviso diario al responsable.

### 5.6 PSSR
1. Plantillas (líder+): *Administración › Plantillas PSSR* (viene sembrada una estándar de 22 ítems) con sus firmas requeridas.
2. **Crear la revisión** (líder+): *Proyecto › PSSR* → sistema + plantilla.
3. **Llenar** (cualquier miembro): cada ítem Sí / No / NA con responsable, acciones y fecha. Un «No» crea una acción en Gestión diaria.
4. **Enviar a aprobación**: exige todos los ítems en Sí o NA y disposición en todo punch abierto del sistema (y ninguno «cerrar antes del arranque» abierto). Al enviar, los ítems se bloquean.
5. **Firmar** con tu capacidad (por defecto Operaciones y HSE), una firma por persona.
6. **Aprobar** (Comisionamiento, distinto de quien envió y de los firmantes) → se emite el **RFSU** del sistema. **Rechazar** con motivo.

### 5.7 Certificados (MC, RFPC, RFC, RFSU)
1. *Proyecto › Certificados* → subsistema × fase → elegibilidad:
   - **Rojo:** sin ITR en la fase, algún ITR sin aprobar, Cat A abierto, Cat B por encima del límite (3 por defecto) o fase anterior sin certificar.
   - **Amarillo:** Cat B dentro del límite → cada uno exige justificación al emitir.
2. **Emitir** (líder+): notas + justificaciones → número `TIPO/SUBSISTEMA`.
3. **Firmar:** completion, client y authority, cada rol con su capacidad y una persona distinta por rol.
4. Si cambia la base (punch, ITR, excepción) el certificado queda **Bloqueado** con el motivo y se desbloquea solo cuando vuelve a cumplir; bloqueado no se firma.
5. **Revocar** o **reabrir** (arquitecto o superior, con motivo).

### 5.8 Liberaciones y matriz de Liberación de sistemas
**Cómo se calcula** (automático): para cada sistema y liberación, en orden: liberación anterior aprobada con firmas · sistemas de los que depende · registros controlados que bloquean · restricciones de la liberación (abierta = condición; nivel 4 = bloqueo) · line-up (si se exige) · documentos vigentes · ITR requeridos generados (los que pide el registro de requisitos para la fase; por defecto condición, la org puede hacerlo bloqueo o apagarlo en *Liberaciones y criterios*) · prueba de desempeño (si se exige) · criterios configurados (ITR de la fase por subsistema, certificados, PSSR, tags críticos, declaraciones con evidencia). Resultado: **verde, amarillo o rojo**.

**Estados:** No listo · Listo · Listo con condiciones · Pendiente de firmas · Aprobado · Aprobado con condiciones · Aprobado, revisar · Regresión (estaba aprobado y hoy está en rojo).

**Leer Liberación de sistemas** (*Proyecto › Liberación de sistemas*)
- Una fila por sistema con un badge por liberación (✓ aprobado, ✓! con condiciones, ✎ pendiente de firmas, ● listo, ◐ listo con condiciones, ○ no listo, ↺ regresión, ⛓ bloqueado por un sistema proveedor), su **siguiente liberación** y qué la frena.
- Filtros en la dirección de la página (se aplican solos): siguiente liberación, solo bloqueados, área. Excel con «Exportar».
- Toca un sistema para abrir su **ficha**: pestaña *Liberaciones* con la siguiente liberación abierta (criterios con enlaces al punch, ITR o restricción que falla, y el bloque de aprobación), *Avance y plan* (forecast y compromiso por liberación), *Dependencias*, *Arranque*, *Traspaso*, *Vendors y desempeño* y *Datos del sistema*.
- Varios proyectos: la tabla de liberación por proyecto del *Portafolio* → el número de liberaciones abre la del proyecto.

**Aprobar y co-firmar**
1. **Comisionamiento** (aprobador): liberación **Lista** → condiciones opcionales y notas → «Aprobar». En **Listo con condiciones** escribe al menos una condición (cada una queda como acción).
2. Si exige co-firmas, queda **Pendiente de firmas** y todavía no habilita la liberación siguiente.
3. **Operaciones** y **HSE** (dos personas distintas entre sí y del aprobador): «Firmar como…» con comentario opcional.
4. **Declaraciones manuales** (editores): subir la evidencia con comentario en el criterio; no se puede borrar.
5. **Revocar** (autoridad, con motivo): las liberaciones siguientes y las de los sistemas dependientes aprobadas pasan a Regresión.
- Las liberaciones por aprobar, co-firmar o en regresión llegan como aviso (campana y push) y a Mi trabajo.

### 5.9 Registros controlados (temporales, ciegas, bypass, energización, test packs)
1. *Proyecto › Registros de campo* → «Nuevo» (o **＋ Crear › Registro de campo**): tipo, sistema, tags y datos del tipo (p. ej. función de protección del bypass, duración máxima, retiro previsto).
2. Ciclo: **propuesto** → **autorizado** (líder+, otra persona que quien propuso) → **activo** → **retirado** → **verificado** (otra persona que quien retiró). Cancelar con motivo (líder+).
3. Mientras está propuesto, autorizado, activo o retirado sin verificar, bloquea las liberaciones que su tipo indique.
4. **Etiquetas QR** de registros para colgar en campo (*Registros de campo › Etiquetas QR*).
- Los bypass que exceden su duración y los temporales vencidos generan aviso diario.

### 5.10 Gestión diaria (acciones, restricciones, TQ, decisiones)
*Proyecto › Gestión diaria* — pestañas Acciones · Restricciones · TQ · Decisiones, con enlaces a Look-ahead (en Planificación), Reportes y Relevo. Altas también desde **＋ Crear**.
- **Acciones (ACC):** dueño, fecha, prioridad, método de verificación (campo, documento, prueba, revisión). Abierta → en curso → **hecha** (con nota y evidencia, salvo «revisión») → **verificada por otra persona** (o rechazada con motivo). Nacen también de restricciones, TQ, PSSR («No»), condiciones de liberaciones, vendors y desempeño.
- **Restricciones (RES):** sistema, responsable, fecha requerida, impacto, plan de recuperación y liberación afectada. Escalamiento 1–4 con motivo (1 equipo · 2 gerente de comisionamiento · 3 gerente de proyecto · 4 cliente/sponsor). Abierta → resuelta → cerrada. Las vencidas reciben aviso diario.
- **TQ:** borrador → emitida → respondida (se marca «cambio de diseño» y n.º de MOC) → cerrada, o reemitida. El cliente también las levanta y gestiona las suyas, y puede responder cualquiera; cancelar es de líder+.
- **Decisiones (DEC):** contexto, decisión, fundamento, quién decidió, asistentes. Inmutables: para corregir se reemplazan.
- **Exportar** a Excel: *Gestión diaria › Exportar*.

### 5.11 Look-ahead y planificación
1. *Proyecto › Planificación › Look-ahead (liberaciones)*: ventanas 7/30/90 días; base forecast o compromiso. Agrupa por sistema las liberaciones que vencen (brecha forecast − compromiso, «en riesgo» si no están listas), acciones, restricciones, TQ y planes.
2. «Editar»: cambiar forecast y compromisos en grilla; el compromiso lo fija un líder+ y cambiarlo exige motivo; todo queda en el historial.
3. También en la ficha del sistema › Avance y plan, por liberación.
4. *Planificación › Planes de trabajo (ITR)*: listas de trabajo diarias o semanales por disciplina.

### 5.12 Reporte diario (RD-PROYECTO-AAAAMMDD)
1. *Gestión diaria › Reportes › Nuevo reporte* (fecha y área opcional). La base de datos arma los datos del día en la zona horaria del proyecto: avance, ITR, punch, liberaciones, restricciones, acciones, TQ, registros en campo, eventos de arranque, pruebas, próximos 7 días.
2. «Redactar con IA»: escribe las 5 secciones solo con esos datos, sin pisar lo ya editado.
3. Editar; «Actualizar datos» mientras sea borrador.
4. **Emitir** (líder+): queda inmutable con huella sha256; PDF desde los datos congelados. Para corregir: **revisión R1** con motivo.

### 5.13 Relevo de turno (REL)
1. Quien entrega lo abre (día, noche u otro): viene precargado con registros activos, ITR en curso, Cat A abiertos, restricciones y acciones vencidas.
2. Escribe pendientes y notas de seguridad → «Entregar» (firma).
3. **Otra persona** lo recibe desde Mi trabajo › «Relevos de turno por recibir», comenta y acepta. Queda inmutable.

### 5.14 Procedimientos y ejecuciones con puntos de espera
**Procedimiento (PRC)**
1. **Crear** (no-cliente): *Arranque* → título, tipo, sistema → PRC-0001 R0 borrador (o «Copiar desde otro proyecto»).
2. **Redactar** las 15 secciones; en «Secuencia», pasos con acción, responsable, valor esperado (mín/máx/unidad), tag, criterio de parada y **punto de espera** con la capacidad que lo libera (Comisionamiento / Operaciones / HSE).
3. **Documentos de referencia** de la revisión (panel): deben estar vigentes para enviar y aprobar.
4. **Enviar a revisión** → **Aprobar** (líder+ distinto del autor y de quien envió) o **Devolver** con motivo.
5. **Verificado en campo** (no-cliente distinto de quien aprobó) tras el walkdown.
6. **Nueva revisión** con motivo (copia las referencias a la revisión vigente).
7. **PDF** con línea de firma en cada punto de espera.

**Ejecución**
1. **Iniciar** (no-cliente) desde el procedimiento aprobado → PRC-0001-R1-E1.
2. **Paso a paso** 📴: valor real y comentario → «✓ Hecho» (N/A con comentario obligatorio; un valor fuera de rango exige motivo).
3. **Punto de espera:** la ejecución queda «En punto de espera» hasta que **otra persona** con la capacidad lo **libere** (requiere red; Mi trabajo › «Puntos de espera por liberar»).
4. **Detener** 📴 con el criterio de parada; **Reanudar** (líder+, con motivo); **Completar**; **Abortar** (líder+, con motivo). Todo queda en la línea de tiempo de la ejecución.
5. Bandeja **«No sincronizado»**: reintentar o descartar lo que el servidor rechazó.

### 5.15 Line-up
1. **Crear** (no-cliente): sistema, título, propósito (arranque / prueba / otro), procedimiento opcional → «Generar filas» (válvulas del sistema según su tipo de equipo; las críticas, marcadas).
2. **Borrador:** posición requerida de cada fila; «Emitir».
3. **Ejecutar** 📴: por fila, la posición **encontrada** y la **dejada**; si queda LO/LC, número de candado o sello. Si otra persona cambió la fila: «Conflicto» → «Aplicar la mía» o «Descartar».
4. **Verificar** (otra persona no-cliente, con red) las filas alineadas; las críticas lo exigen.
5. **Completar** → «Verificada». La liberación que «exige line-up» queda en verde; se desactualiza si un registro controlado del sistema cambia después.
- Usa el propósito «arranque» para la hoja que habilita la liberación de arranque.

### 5.16 Bitácora de arranque e hitos (EVT)
1. **Registrar** (no-cliente): *Arranque › Bitácora* → «Registrar» (o **＋ Crear › Evento de arranque**): sistema, tipo (hito o libre: trip, alarma, desviación, parada, observación), hora real, título, tags, ejecución vinculada y señales. Se congela la muestra IIoT más cercana (±5 min); sin dato, se carga a mano. Más de 7 días atrás: líder+ con motivo.
2. **Primer arranque y primer HC** exigen la liberación de arranque aprobada con todas sus firmas y el PSSR más reciente aprobado (a la hora del hito).
3. **Testigo** (otra persona): energización y rotación las atestigua Comisionamiento; los demás, Operaciones. Mi trabajo › «Hitos de arranque por atestiguar».
4. Ficha con gráfico ±30 min; **anular** (líder+, con motivo).

### 5.17 Señales, lazos y C&E
Todo en *Proyecto › Señales y lazos* (pestañas Señales · Lazos · Matrices C&E · Importar señales).

**Señales y lazos** (importa arquitecto o superior; genera ITR líder+)
1. Excel del índice: TAG INSTRUMENTO, TAG DE SEÑAL, DESCRIPCIÓN, TIPO (AI/AO/DI/DO/PI/PO), DISCIPLINA, rango, unidad, alarmas, P&ID, diagramas, N° LAZO, JB, MARSHALLING, TARJETA y CANAL I/O, TAG DCS, DESPLIEGUE HMI, AREA/SISTEMA/SUBSISTEMA.
2. Pestaña *Importar señales* → vista previa → Importar (crea jerarquía, tags de instrumento que falten, señales y lazos). Las columnas ausentes no se tocan; la cadena se corrige también en el detalle de la señal.
3. Pestaña *Lazos* → plantilla con tabla de lazo (I29C) → «Generar» por lazo o «Generar faltantes». Si el lazo cambia después, el ITR aparece «desactualizado» y se genera R2.

**Matrices C&E** (líder+)
1. Pestaña *Matrices C&E* → «Nueva matriz» o **«Importar con IA»** (Excel o PDF ≤ 4 MB): la IA propone causas, efectos y cruces; revisa en la grilla (tags inexistentes en ámbar) → «Aceptar y crear».
2. Editor: causas, efectos y celdas (directa o con N segundos).
3. Generar pruebas con la plantilla I30C: una por causa; cada celda muestra el resultado.
- Una matriz, causa o efecto con pruebas generadas no se puede borrar.

**P&ID** (líder+): *Documentos* → «+ Nuevo», tipo P&ID, con su número de plano → nueva revisión con el PDF → **«Visor»** para poner los pines de los tags. Al pasar a vigente una revisión nueva, los pines se copian marcados «por revisar» hasta confirmarlos o moverlos.

**Límites de sistema en el P&ID** (líder+ y arquitecto, en escritorio): en el visor, la barra de la izquierda tiene **Resaltar línea** (elige el sistema arriba; cada clic agrega un vértice, que se ajusta a 90°; doble clic o Enter termina), **Límite** (clic sobre la línea en el punto de aislamiento; elige el sistema de cada lado o «límite de batería») y **Etiqueta** (el código del sistema donde hagas clic). **Elegir** abre una marca para cambiar su sistema, redibujarla o borrarla; **Deshacer** revierte lo último. La derecha lista los **sistemas en esta hoja** con su color del proyecto; «Aislar» atenúa los demás. Si el sistema ya tiene una liberación aprobada, editar sus marcas no se bloquea pero queda registrado. Con una revisión nueva vigente, las marcas se copian «por revisar»: confírmalas o redibújalas. **En tableta** (P3): un dedo dibuja (al soltar se pone el vértice; mientras arrastras ves el tramo) y dos dedos mueven y hacen zoom; abajo aparecen **Deshacer · Cancelar · Terminar tramo**. Con **Elegir**, los vértices de la marca elegida se arrastran (en una línea, con ajuste a 90°). La leyenda se pliega con «›» y vuelve con «Sistemas (N)»; **Ver** aísla y encuadra un sistema en la hoja. **Por estado** colorea las marcas con el estado de la liberación siguiente de su sistema (regresión, bloqueado, esperando firmas, listo, todo aprobado) y los pines con el de su tag. En el teléfono el plano solo se ve. El filtro «P&ID (con visor)» muestra también los planos citados por tags que aún no tienen documento.

**Conectores entre hojas:** donde el recorrido de un sistema sale de la hoja, la herramienta **Conector** pone la flecha «fuera de hoja» con el P&ID (y la página) donde sigue. Elegir un conector muestra **Abrir la hoja destino**: abre esa hoja en el conector de vuelta, o en la página destino con el sistema aislado si todavía no lo tiene. Un conector cuya otra hoja no tiene un conector del mismo sistema que vuelva queda **sin par** (contorno ámbar). **Controles de esta hoja** (a la derecha) lista los conectores sin par, los que llegan de otra hoja sin conector de vuelta aquí y los **pines cruzados**: el pin de un tag que cae sobre el resalte de otro sistema y no sobre el suyo (anillo ámbar). Al colocar un pin en esa situación el visor lo avisa, pero se puede confirmar igual: un instrumento puede estar dibujado junto a una línea ajena.

**Pestaña Planos de la ficha del sistema:** hojas P&ID del sistema en su revisión vigente (tags del sistema en la hoja, cuántos con pin, estado de los límites), planos citados sin documento y los tags sin pin. «Abrir en el plano» abre el visor con el sistema aislado y encuadrado; «ubicar en …» abre el visor con «Pin de tag» y ese tag elegido. **Descargar planos de límites** (en otros proyectos se les llama *LOSH*, «Limit Of System Highlight»): PDF con portada bilingüe (hojas incluidas, marcas por revisar, pines cruzados y conectores sin par) y cada página vigente del P&ID donde el sistema tiene marcas, con solo sus marcas encima y un sello; el mismo PDF va en el paquete de handover (`anexos/<sistema>/limites/`). **Controles de límites** repite los avisos de todas las hojas del sistema, con enlace al punto del plano.

### 5.18 Registro de documentos y referencias
1. *Proyecto › Documentos › + Nuevo* (líder+): número único, tipo, título, disciplina, empresa emisora, sistemas.
2. Ficha › **+ Nueva revisión**: revisión (A, B, 0, 1…), estado (borrador, IFR, IFA, IFC, As-Built, Final), fecha, archivo (PDF, DWG, DXF, imagen, ≤ 50 MB) y/o enlace https al EDMS. La **vigente** es la de fecha de emisión más reciente; una revisión mal cargada se anula con motivo.
3. Un borrador se emite eligiendo su estado o se descarta (uno por documento).
4. **«Dónde se usa»** muestra cada ITR o procedimiento que lo referencia y con qué revisión. Al crear un ITR, sus documentos se referencian solos; también se pueden agregar en masa desde la ficha del documento.
5. **Referenciar** (no-cliente): en el ITR o en la revisión borrador del procedimiento, panel «Documentos de referencia» → elegir → Agregar.
6. Al salir una revisión nueva:
   - ITR sin firmar / procedimiento en borrador: aviso rojo; **la firma o el envío quedan bloqueados** hasta «Actualizar a la vigente».
   - ITR firmado / procedimiento aprobado: la liberación del sistema queda en amarillo («Documentos vigentes») hasta que un líder+ pulse **«Revalidar»** con motivo (≥ 10 caracteres) o se rehaga el registro.

### 5.19 Paquetes de vendor (VND)
1. **Crear** (líder+): *Proyecto › Proveedores › Nuevo paquete* → empresa, título, sistemas; después en la ficha: alcance, límites, tags del paquete, **liberación de movilización** (sistema + liberación) y fecha prevista.
2. **Interfaces:** contraparte, descripción, responsable, estado (abierta, acordada, cerrada). Ninguna abierta para movilizar.
3. **Checklist de movilización:** alcance e interfaces acordados, inducción HSE, permisos, equipo calibrado, documentos vigentes.
4. **Movilizar** (líder+): verifica la liberación aprobada con firmas, checklist e interfaces. Un paquete planificado se puede **cancelar** con motivo.
5. **FAT/SAT:** crear la actividad; registrar **hallazgos** mientras esté pendiente (con tag → punch Cat A/B/C; sin tag → acción ACC con responsable); adjuntar evidencia; **resultado** (líder+): aprobada, aprobada con hallazgos o fallida (las dos últimas exigen hallazgos). Para repetir, crea la re-prueba.
6. **Reportes** (con el vendor movilizado): diarios (fecha, personal, horas, actividades, problemas, adjuntos) y un **final único**; inmutables.
7. **Recomendaciones:** proponer (con «requiere MOC» si cambia diseño o proceso) → líder+ aprueba o rechaza con motivo → implementar (con número de MOC si lo requiere).
8. **Desmovilizar** (líder+): exige reporte final, checklist (as-built, herramientas, permisos cerrados, área limpia) y ningún Cat A abierto del paquete.
9. Seguimiento: ficha del sistema › Vendors y desempeño, y KPI «Vendors listos».

### 5.20 Operación: personal, competencias, repuestos y traspasos
1. **Personal** (no-cliente): *Operación y traspaso › Personal* (nombre, empresa, cargo, turno; usuario opcional).
2. **Competencias** (líder+ o persona de nivel 4; nunca uno mismo): matriz persona × sistema, nivel 0–4 (0 sin entrenamiento · 1 en entrenamiento · 2 con supervisión · 3 autónomo · 4 puede entrenar), evidencia, fecha y vencimiento. Un registro equivocado se anula con motivo.
3. **Umbral** (líder+): personas de nivel ≥ 3 por turno (por defecto 2).
4. **Repuestos críticos:** ítem, n.º de parte, tag, cantidades requerida/disponible, estado, ETA.
5. **Pedir traspaso** (líder+) a la etapa siguiente; el checklist se calcula solo:
   - Shadowing: procedimiento de arranque aprobado y verificado en campo; personal nivel ≥ 1.
   - Operación conjunta: liberación de arranque, line-up verificado, primer arranque atestiguado, nivel ≥ 2.
   - Operaciones: nivel ≥ 3 por turno, repuestos críticos disponibles, sin Cat A abiertos.
   - Cada falta exige una justificación (≥ 10 caracteres); algunos ítems no se pueden dispensar (los define el administrador). La reversión exige motivo.
6. **Firmar** (dos personas distintas, cada una reconoce cada excepción): Comisionamiento (líder+) y Operaciones (capacidad Operaciones). Mi trabajo › «Traspasos de custodia por firmar».
7. Al completar el paso a **Operaciones** se genera el **paquete de handover** (si falla, «Generar paquete» en el detalle).

### 5.21 Prueba de desempeño y PTC
1. **Definir** (líder+): *Desempeño (PTC) › Nueva prueba* → PTT-0001 R0: 8 secciones, duraciones de estabilización y periodo formal, frecuencia de muestreo, cobertura mínima, frontera, **variables** (señal, manual o derivada), **criterios** (estadístico × condición × objetivo ± incertidumbre) y **pares de medidores**.
2. **Revisión:** enviar → aprobar (líder+ distinto del autor).
3. **Intento** (líder+): «Nuevo intento» → «Iniciar estabilización» → «Iniciar periodo formal» → durante: **perturbaciones** y **lecturas manuales** (no-cliente); un líder+ excluye perturbaciones del cálculo con motivo → «Cerrar» (antes de la duración = cierre anticipado con motivo) → datos congelados.
4. **Evaluación** automática: cobertura, calidad, picos, unidades, resultado por criterio, pares, resultado sugerido (con y sin exclusiones).
5. **Registrar resultado** (líder+): apartarse de la sugerencia exige motivo; si las exclusiones cambian el resultado, el representante del cliente debe reconocerlas antes. El intento queda inmutable. «Falló» o «aceptado con desviación» crean una acción.
6. **PTC:** «Emitir PTC» (líder+, firma Comisionamiento) → **Operaciones** y **Cliente** (Representante del cliente) firman, tres personas distintas → «Aceptado».
7. **PDF de 14 secciones** desde la consola del intento.

### 5.22 Reportes
| Reporte | Dónde | Formato |
|---|---|---|
| Ejecutivo imprimible | *KPIs › Reporte* | HTML para imprimir / PDF |
| Completitud por sistema, avance por fase, KPIs por área | *KPIs* (botones) | PDF |
| Exportación de KPIs | *KPIs › Exportar* | Excel |
| Liberación de sistemas (sistema × liberación) | *Liberación de sistemas › Exportar* | Excel |
| Test pack de ITR | *ITRs* (botón) | PDF |
| ITR individual (bilingüe, firmas, equipos) | ITR › PDF | PDF |
| Punch list | *Punch* › PDF / Exportar | PDF, Excel, CSV |
| Certificado y dossier | Certificado › PDF / Dossier | PDF |
| PSSR, reporte diario, relevo, procedimiento, ejecución, line-up, evento, prueba de desempeño, preservación | En cada módulo | PDF |
| Gestión diaria | *Gestión diaria › Exportar* | Excel |
| Etiquetas QR de tags y de registros | *Tags y equipos › Etiquetas* · *Registros de campo › Etiquetas QR* | PDF |
| Paquete de handover | *Paquetes de entrega* o automático al traspasar | ZIP con JSON, PDF y firma digital (verificable en `/verify`) |

### 5.23 Integraciones (administrador, arquitecto)
- **Claves de API:** *Administración › Claves de API* → nombre, permisos (`tags`, `itrs`, `punches`, `certificates`, `systems`, `events`, `handover`, `signals`), expiración. La clave se muestra **una sola vez**; guárdala en un gestor de secretos. Da acceso a todos los proyectos de la organización. Se envía como `Authorization: Bearer sk_live_…`.
- **Webhooks:** URL https pública y eventos del catálogo; cada envío lleva `X-CommUp-Signature: t=<unix>,v1=<hmac>` (HMAC de `<unix>.<cuerpo>` con el secreto mostrado al crear) y `X-CommUp-Event-Id` para descartar repetidos. Se entregan con hasta un minuto de demora y con reintentos.
- **Automatizaciones:** reglas «cuando ocurre X → hacer Y».

---

## 6. Trabajo sin conexión

**Funciona sin red** (app instalada y la pantalla **preparada o abierta antes** de perder la conexión):
- ITR: responder ítems, fotos, levantar punch, firmar.
- Arranque: pasos de procedimiento (hecho, N/A, llegar a un punto de espera, Detener) y posiciones de line-up.

Todo queda en una **bandeja de salida** del dispositivo y se envía al volver la red, a nombre de quien lo capturó. Si el servidor rechaza algo, aparece en **«No sincronizado»** para reintentar o descartar; si otra persona cambió lo mismo, se te muestra el conflicto para decidir.

**Necesita conexión:** liberar puntos de espera, verificar, reanudar, completar o abortar ejecuciones; punch list general, certificados, gestión diaria, administración, reportes, importaciones y la búsqueda.

**Reglas de oro**
1. Con red, usa Mi trabajo › **«Preparar para trabajar sin red»** para los ITR del día.
2. Al cerrar sesión con pendientes, elige **«Sincronizar y salir»** o **«Descartar y salir»**; lo capturado por otra persona no se envía con tu sesión (queda retenido hasta que esa persona entre).
3. Ten la hora automática activada en el dispositivo.

---

## 7. Matriz de quién hace qué

✓ = puede · ✗ = no puede · ◐ = con condición (asignado, otra persona, capacidad designada o configuración).

| Acción | Propietario | Administrador | Arquitecto | Líder | Inspector | Cliente |
|---|---|---|---|---|---|---|
| Invitar usuarios, configurar organización y liberaciones | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Designar firmantes del proyecto | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Crear proyectos, importar tags y señales | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Plantillas ITR/PSSR/preservación, matriz IA | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Asignar y generar ITR, planes de trabajo | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Ejecutar ITR | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Firmar ITR (rol asignado) | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ |
| Reabrir ITR aprobado | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Levantar punch | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Resolver punch | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Verificar punch (otra persona) | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ |
| Revisar categoría / cancelar punch | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Ejecutar preservación | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Aprobar PSSR / emitir RFSU | ◐ | ◐ | ◐ | ◐ | ✗ | ✗ |
| Emitir certificados | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Firmar certificados (por capacidad) | ◐ | ◐ | ◐ | ◐ | ✗ | ◐ |
| Aprobar liberación (Comisionamiento) | ✓ | ✓ | ✓ | ◐ | ✗ | ✗ |
| Co-firmar liberación (Operaciones / HSE) | ◐ | ◐ | ◐ | ◐ | ◐ | ◐ |
| Registros: proponer, retirar / autorizar, cancelar | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✗ | ✗/✗ |
| Acciones y restricciones | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Levantar y responder TQ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Registrar decisiones | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Emitir reporte diario | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Relevo de turno | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Redactar / aprobar procedimiento | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✓ | ✓/✗ | ✗/✗ |
| Ejecutar pasos / liberar punto de espera | ✓/◐ | ✓/◐ | ✓/◐ | ✓/◐ | ✓/◐ | ✗/◐ |
| Line-up: ejecutar / verificar | ✓/◐ | ✓/◐ | ✓/◐ | ✓/◐ | ✓/◐ | ✗/✗ |
| Registrar hito / atestiguar | ✓/◐ | ✓/◐ | ✓/◐ | ✓/◐ | ✓/◐ | ✗/◐ |
| Pedir traspaso | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Firmar traspaso (Comisionamiento / Operaciones) | ✓/◐ | ✓/◐ | ✓/◐ | ✓/◐ | ✗/◐ | ✗/◐ |
| Dirigir prueba de desempeño, emitir PTC | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Firmar PTC como Cliente | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Documentos y revisiones | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Referenciar documentos en ITR/procedimientos | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Paquetes de vendor (crear, movilizar, decidir) | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Vendors: interfaces, FAT/SAT, reportes | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Empresas | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Claves de API, webhooks, automatizaciones | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Auditoría | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |

---

## 8. Limitaciones conocidas

Límites vigentes y qué hacer mientras se corrigen:

| Situación | Qué hacer |
|---|---|
| Algunas pantallas de administración, importadores y mensajes de error están solo en español. | Usa la interfaz en español para esas pantallas. |
| Los campos de texto, número y fecha de un ITR se guardan al salir del campo. | No cierres la app con un campo abierto. |
| Los cambios de configuración de liberaciones aplican a todos los proyectos de la organización a la vez. | Coordínalos con los gerentes de cada proyecto; quedan en la auditoría. |
| No hay resumen diario por correo. | Revisa la campana y Mi trabajo. |
| En PDF, los alfabetos no latinos salen como «?». | Usa caracteres latinos en descripciones que irán a PDF. |

---

## 9. Errores frecuentes y qué hacer

| Mensaje | Significa | Qué hacer |
|---|---|---|
| «User not assigned to signing role» | No estás asignado a ese rol del ITR. | Pide al líder que te asigne o firma el rol que te corresponde. |
| «Previous signature required» | Falta la firma anterior (en el orden de la plantilla). | Espera la firma previa. |
| «Applicable content incomplete or rejected» | Faltan ítems obligatorios o hay una falla crítica. | Completa o corrige; levanta punch si corresponde. |
| Equipo de prueba vencido | La calibración vence antes de la fecha de uso. | Usa otro equipo registrado o actualiza su certificado. |
| «Revisión de documento superada…» | Un documento referenciado tiene una revisión más nueva. | «Actualizar a la vigente» en el panel de documentos. |
| «La liberación de movilización del sistema no está aprobada con todas sus firmas» | El paquete de vendor depende de una liberación que aún no está firmada. | Completa la liberación o quita la exigencia del paquete. |
| «Sin permisos» o aviso «Esta página requiere…» | Tu rol (o tu capacidad en el proyecto) no permite la acción. | Revisa la matriz §7 y pide a la persona habilitada. |
| Certificado «Bloqueado» | La base cambió después de emitirlo (punch, ITR o excepción). | Resuelve lo que indica el motivo; se desbloquea solo. |
| Pantalla «Sin conexión» | Página no disponible sin red. | Vuelve a intentar con señal; prepara con red lo que usarás sin red. |

---

*Manual mantenido junto con la app: es la fuente de la Ayuda (`/ayuda`) y de la guía pública (`/guia`). Última revisión: glosario definitivo (liberación, punto de espera, roles en español) y Portafolio unificado (2026-10-22).*
