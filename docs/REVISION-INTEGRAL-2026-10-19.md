# Revisión integral de CommUp — 2026-10-19

**Alcance:** todo el producto en `main` (922b861 → fa6277e): 614 archivos fuente (113 mil líneas TypeScript), 53 migraciones (23 mil líneas SQL), 104 páginas, 61 módulos de acciones, 24 rutas de API, edge functions, crons, PWA y CI.
**Método:** nueve revisiones independientes, línea por línea y de solo lectura, una por área (A seguridad · B datos y rendimiento · C completions · D readiness y gestión · E arranque y operación · F ingeniería, documentos y vendors · G frontend y calidad · H navegación · I roles e integraciones), más una revisión en vivo de menús y navegación en el navegador (escritorio y móvil). Los hallazgos críticos se **verificaron contra producción** (políticas, grants y funciones vigentes) antes de incluirlos aquí.
**Anexos:** el detalle completo, con archivo:línea, evidencia, impacto, recomendación y esfuerzo por hallazgo, está en [`docs/revision-2026-10-19/`](revision-2026-10-19/) (A–I + Z). Este documento resume, prioriza y propone.
**Documentos derivados:** propuesta concreta de menús y navegación en [`PROPUESTA-NAVEGACION-2026-10-19.md`](PROPUESTA-NAVEGACION-2026-10-19.md); plan de ejecución definitivo (estado, decisiones, briefs por sesión y cobertura de los 293 hallazgos) en [`PLAN-EJECUCION-REVISION-2026-10-19.md`](PLAN-EJECUCION-REVISION-2026-10-19.md) y [`PLAN-EJECUCION-COBERTURA-2026-10-19.md`](PLAN-EJECUCION-COBERTURA-2026-10-19.md).

---

## 1. Veredicto

CommUp tiene **el mejor modelo conceptual de readiness que se ve en el mercado**: la lógica vive en SQL como única fuente de verdad, la escritura de las fases F1–F8 pasa solo por funciones que validan rol, estado y «otra persona», la evidencia es inmutable, y conceptos como gates con multifirma, registros controlados, prueba de desempeño evaluada en SQL o bloqueo por revisión superada no existen así en ICAPS ni WinPCS. La integridad del ITR (firma atómica, revisiones congeladas, reapertura auditada) es de primer nivel.

Pero hoy **no está listo para un cliente industrial grande**, por cinco razones de fondo:

1. **Dos capas de seguridad que no coinciden.** Los módulos nuevos (F1–F8) son sólidos; los heredados (API keys, miembros, punches, PSSR, certificados, preservación, webhooks, auditoría) confían en reglas que solo existen en la aplicación, y la base de datos deja a cualquier miembro hacer por la API REST lo que la pantalla le prohíbe. Hoy se corrigieron los casos más graves (§2), pero el patrón sigue.
2. **El flujo diario se corta en casos comunes.** Un ITR sin cliente asignado nunca se aprueba (y sin ITR aprobados no hay certificados); los ITR de lazo y C&E no se pueden firmar desde la pantalla; el inspector no puede levantar punch; la preservación ejecutada por un inspector no avanza.
3. **No escala a 50 mil tags.** Muchas pantallas, el snapshot nocturno y la elegibilidad de certificados cuentan trayendo filas y se cortan en 1.000 en silencio; Control Tower recalcula todo el motor en cada carga; cada cambio en 8 tablas núcleo dispara 3 llamadas HTTP.
4. **El sistema no avisa.** Gates listos o pendientes de co-firma, registros por autorizar, TQ respondidos, reporte por emitir: nada genera notificación ni aparece en Mi trabajo. La regla de «otra persona» depende de que alguien lo pida por fuera.
5. **La navegación no acompaña al usuario.** El owner ve 49 enlaces; hay listas duplicadas (proyecto y organización), idioma mezclado, Control Tower fuera del proyecto, y el resumen del proyecto es un directorio de enlaces en vez de un tablero por fase.

**La buena noticia:** casi todo lo grave es de esfuerzo S o M, está localizado y tiene un patrón de solución ya probado dentro del mismo producto (el de F1–F8). Con 4–6 semanas de trabajo enfocado, CommUp pasa de «demo sólida» a «producto defendible en una licitación».

### Calificación por área (0–5)

| Área | Hoy | Comentario |
|---|---|---|
| Modelo de readiness (gates, criterios, multifirma) | **4,5** | Diferenciador real. Falta coherencia en Control Tower, notificaciones y designación de firmantes. |
| Integridad del ITR | **4** | Excelente en BD; el flujo (3 firmas fijas, firma de lazo/C&E) lo deja en 4. |
| Seguridad multi-tenant | **3** (era 2 antes de hoy) | Aislamiento entre organizaciones razonable tras los hotfix; autorización por rol dentro de la org débil en módulos heredados. |
| Escala / rendimiento | **2** | Truncamientos a 1.000, cálculo en vivo, índices faltantes, amplificación de eventos. |
| Completions de campo (ITR, punch, preservación) | **3** | Funciona, pero con cortes y poca ergonomía móvil. |
| Arranque, operación, desempeño (F6–F7) | **4** | Muy bien razonado; falta designación de capacidades y dossier. |
| Documentos y vendors (F8) | **3** | Backend sólido; referencias manuales y P&ID duplicado restan valor práctico. |
| Navegación y UX | **2,5** | Demasiados ítems, duplicados, sin «qué me toca» para firmas y decisiones. |
| Calidad de ingeniería (CI, pruebas, i18n, design system) | **2,5** | CI en rojo desplegando igual; sin páginas de error; i18n a medias. |
| Integraciones (API, webhooks, push, ERP) | **2** | Eventos con nombres que no coinciden; push casi inoperante; sin SSO ni conectores. |

---

## 2. Lo que ya se corrigió hoy (en producción)

Durante la revisión se encontraron vulnerabilidades activas. Con autorización, se aplicaron dos hotfix probados con ROLLBACK y verificados en producción:

| Commit | Hallazgo | Qué se corrigió |
|---|---|---|
| `7eb0a7c` (`20261024120000`) | A-01 / I-01 **Crítico** | Cualquier miembro (incluso inspector o cliente) podía crearse una API key con acceso total a la organización por la API REST. Se eliminó la política; las keys solo se crean por la pantalla de administración. |
| `7eb0a7c` | A-07 | `get_org_member_emails` devolvía los emails de cualquier organización a cualquier usuario autenticado; `ingest_signal_samples` aceptaba muestras IIoT para cualquier organización. |
| `7eb0a7c` | A-10 / I-11 | El secreto HMAC de los webhooks era legible por cualquier miembro; ahora solo editores. |
| `7eb0a7c` | A-03 / C-04 (parcial) | `update_punch_ops_status('closed_final')` cerraba cualquier punch (incluso Cat A no transferido) sin verificación. Ahora solo opera sobre punches transferidos a Operaciones. |
| `fa6277e` (`20261024130000`) | I-13 **Escritura entre organizaciones** | La regla de alta de proyectos comparaba una columna consigo misma: un owner/admin/architect de cualquier organización podía crear proyectos dentro de otra. Reproducido y corregido. |

**Correcciones a los informes** (verificadas en producción): la limpieza de muestras IIoT de 90 días **sí** está programada (`pg_cron`, 03:00 UTC; B-12 queda solo en partición e índice); el reintento de webhooks **sí** tiene un cron (`webhook-dispatcher-retry`, cada 5 min), aunque no está versionado en el repo (I-08 queda en nombres de eventos y despacho duplicado). `anon` no puede ejecutar las funciones de punch Ops (A-03 queda acotado a miembros autenticados, ya corregido).

---

## 3. Los 20 problemas que más importan

Ordenados por impacto real en un proyecto. «✔» = verificado en el código o en producción durante esta revisión.

| # | ID | Problema | Impacto | Esf. |
|---|---|---|---|---|
| 1 | G-01 ✔ | **La CI lleva 18 pushes en rojo y producción se despliega igual** (`deploy.yml` sin `needs:`). Los últimos pushes fallidos son de esta misma serie de sesiones. | La red de seguridad no protege nada. | S |
| 2 | C-01 ✔ | **Un ITR solo se aprueba con 3 firmas** (ejecutor + supervisor + cliente) aunque supervisor y cliente son opcionales al asignar; los ITR de lazo y C&E nunca llevan cliente; no hay pantalla para agregarlos después. | ITR imposibles de aprobar → certificados imposibles. | M |
| 3 | C-02 ✔ | **Los ITR de loop check y C&E no se pueden firmar desde la pantalla** (`localItrStatus` no recibe `sourceRows`). Regresión de F4-D. | Toda la funcionalidad de lazos/C&E queda sin cierre. | S |
| 4 | C-03 / A-15 / I-02 | **El inspector no puede levantar punch** (la acción exige editor) aunque ve el botón; sin red, el punch se descarta a los 3 intentos. | Se pierden deficiencias en campo. | S |
| 5 | A-02, A-04, A-05, A-06, I-04, C-11, C-12, C-34 | **Reglas de módulos heredados solo en la aplicación:** un admin puede hacerse owner; cualquier miembro puede aprobar un PSSR, firmar certificados a nombre de otros, cancelar o bajar de categoría un Cat A, o cambiar estados de ITR por la API REST. | Se saltan controles de seguridad de procesos que el producto vende. | M |
| 6 | A-09 / C-08 / E-01 / G-02 | **La cola offline no guarda quién capturó** y el cierre de sesión no limpia cachés ni cola. | En una tablet compartida, firmas y punches de A quedan a nombre de B. | M |
| 7 | B-01, B-02, D-08, F-04 | **Conteos que se cortan en 1.000 filas:** snapshot nocturno de KPIs, elegibilidad de certificados, reporte imprimible. | Curvas S y estados «verde» falsos en proyectos grandes. | S–M |
| 8 | D-06 ✔ | **El reporte diario inmutable dice «30 ITR aprobados hoy»** cuando fueron más (`LIMIT 30` + `.length`). Igual con punch levantados. | Cifras falsas en un documento sellado con hash. | S |
| 9 | D-04 / H-02 / I-09 | **El motor no notifica nada**: gates listos o por co-firmar, regresiones, registros por autorizar, TQ respondidos, reporte por emitir. Tampoco hay colas en Mi trabajo. El push escucha eventos que nunca se emiten. | Gates parados días; la «otra persona» se coordina por WhatsApp. | M–L |
| 10 | D-03 / E-02 / I-07 | **Las capacidades de firma son nominales**: Operaciones y HSE las puede firmar cualquier líder; un operador real con rol inspector no puede. | Las multifirmas no prueban independencia ante un auditor. | M |
| 11 | D-01 / D-18 | **Control Tower contradice al motor**: el «bloqueo principal» y la barra salen del cálculo viejo (todas las fases), y hay 3–4 cifras de avance que no cuadran entre pantallas. | El gerente no sabe qué número reportar. | M |
| 12 | B-04 / D-07 / B-05 | **Control Tower calcula todo en vivo**, con ~30 índices faltantes (incluido `org_members(user_id)`) y bajo RLS; a escala industrial superará el timeout y mostrará la matriz vacía. | La pantalla principal deja de funcionar en el proyecto real. | L |
| 13 | B-03 ✔ / I-08 | **Cada cambio de fila en 8 tablas núcleo dispara 3 llamadas HTTP**, dos duplicadas al mismo dispatcher; los nombres de eventos (plural) no coinciden con los del catálogo de webhooks (singular). | Una importación de 50k tags ≈ 150k peticiones; webhooks que nunca llegan o llegan dobles. | M |
| 14 | D-05 / E-15 / G-13 | **No hay zona horaria del proyecto**: el día del reporte, vencimientos y snapshots se cortan en UTC (19:00 en Colombia). | Reporte firmado con datos corridos de turno. | M |
| 15 | D-02 | **Una regresión no bloquea al gate siguiente ni a los sistemas dependientes.** | Verde falso en un punto de seguridad (p. ej. aire de instrumentos). | S |
| 16 | E-04 / B-18 ✔ | **La ingesta IIoT resuelve la señal por nombre en toda la organización** (`LIMIT 1`). | Muestras en el proyecto equivocado alimentando un PTC. | S |
| 17 | C-05 / I-03 | **Preservación ejecutada por inspector no avanza la fecha ni queda finalizada** (sin error visible); ejecutada por editor, avanza al primer toque. | Planes «al día» sin registro real. | M |
| 18 | C-14 | **No hay generación masiva de ITR** (solo uno por tag), aunque la matriz tipo de equipo × plantilla ya existe. | Inviable con 5.000–50.000 tags. | M–L |
| 19 | E-05 / F-22 | **El paquete de handover no incluye nada de F1–F8** (gates, procedimientos, line-ups, hitos, traspaso, PTC, documentos, vendors). | El entregable que el cliente paga queda vacío de evidencia. | M |
| 20 | H-01, H-03, H-04 ✔, H-05 | **Navegación:** la PWA abre en Dashboard y no en Mi trabajo; 33–49 ítems de menú; página `/admin` vieja pública; ningún `error.tsx`/`not-found.tsx`/`loading.tsx` en toda la app. | Adopción de campo y percepción de calidad. | S |

Otros destacados (detalle en anexos): C-15 choque de número de ITR al usar una revisión nueva de plantilla; C-16 reimportar tags borra datos maestros; F-06 reimportar señales borra la cadena del loop check; F-01 el PDF de punch list falla con saltos de línea; F-03 la revisión vigente de un documento es la última registrada, no la más reciente; A-12 XSS almacenado en el detalle de certificado; D-11 el criterio PSSR del gate y los prerrequisitos de arranque usan reglas distintas; E-06 la consola de desempeño mezcla datos congelados y en vivo; G-05 la cabecera `Permissions-Policy` bloquea el dictado por voz.

---

## 4. Temas transversales y cómo atacarlos

### 4.1 Una sola autoridad: la base de datos
El patrón de F1–F8 (sin políticas de escritura en tablas sensibles; todo por RPC `SECURITY DEFINER` con rol, estado y «otra persona» en SQL) es el correcto. Falta aplicarlo a **api_keys, org_members, punches, PSSR, certificados, preservación, ITR (estados), activity_log, notifications y webhooks**. Acompañarlo de una **suite de autorización rol × tabla × operación** en CI (hoy ningún test prueba permisos dentro de la org; los tests de BD están rotos en CI) y de `supabase db lint` / advisors de seguridad bloqueando el merge. Versionar los GRANT y las políticas de storage (hoy no están en ninguna migración).

### 4.2 Firmas que prueban algo
- **Firmas requeridas configurables** por plantilla o fase (C-01): p. ej. `{ejecutor, supervisor}` por defecto, cliente solo donde aplique; pantalla para completar asignaciones antes de firmar.
- **Designación de firmantes por proyecto** (D-03/E-02): quién firma como Comisionamiento, Operaciones, HSE, Cliente (persona o empresa de F8), usada en gates, hold points, testigos, traspasos, PTC, ITR y certificados.
- **Independencia**: una persona no firma dos capacidades del mismo registro (A-08, C-13).
- **Firma con reautenticación** (PIN, contraseña u OTP) para acercarse a firma electrónica avanzada (21 CFR Part 11 / eIDAS simple).

### 4.3 Escala: «cero filas para contar» y readiness materializada
- Regla: ninguna pantalla, cron ni reporte trae filas para contarlas; catálogo de agregados SQL y un chequeo en CI que marque `.from(...).select(...)` sin límite.
- **Estado de gates materializado** (`system_gate_status`) mantenido por triggers que marcan el sistema «sucio» + recálculo incremental. Resuelve rendimiento de Control Tower, look-ahead, reporte diario y Mi trabajo, **y a la vez** es la fuente de las notificaciones (cada transición emite un evento).
- **Bus de eventos tipo outbox** en lugar de HTTP por fila: `domain_events` con `dispatched_at`, un dispatcher por lotes con cursor, modo masivo para importaciones, catálogo de eventos versionado y con nombres consistentes.
- Crear los índices faltantes (el anexo B trae el DDL `CREATE INDEX CONCURRENTLY`), particionar `signal_samples` y servir los gráficos IIoT con una RPC de series reducida.
- Convertir la prueba de carga del 2026-09-03 en un banco reproducible con presupuesto en ms para las 15 consultas más calientes.

### 4.4 Campo sin red, de verdad
Cola ligada a `userId`/`orgId`, purga de cachés y cola al cerrar sesión (con «sincronizar o descartar»), hora de captura acotada en lugar de comparar relojes, mezclar respuestas encoladas al recargar, y un **«paquete de campo»**: el inspector descarga sus ITR del día antes de salir.

### 4.5 Que el sistema avise
Colas nuevas en Mi trabajo — gates por aprobar, por co-firmar, en regresión; registros por autorizar y por verificar; reporte diario por emitir; TQ por responder — agrupadas en **Ejecutar · Verificar · Firmar · Decidir**, con el mismo cálculo en el badge y en la página. Toda RPC que cree una obligación para otra persona inserta una notificación; el push se alimenta de esos eventos. Digest diario por correo.

### 4.6 Calidad de ingeniería
`needs:` en el deploy + protección de rama; arreglar los 2 tests rotos; `error.tsx`/`not-found.tsx`/`loading.tsx` por grupo de rutas; reemplazar los 56 `window.confirm` por un `ConfirmDialog` (en firmas y emisiones especialmente); `cache()` en `getActiveMembership`; i18n en los 52 componentes sin traducir y en los mensajes de error de las acciones; adoptar de verdad `src/components/ui` (hoy hay 74 primitivas redefinidas y 2.842 colores literales) con tokens de estado que cumplan contraste AA; Playwright en CI para los recorridos de campo.

### 4.7 Tiempo
`projects.timezone` como dato de primera clase, usado en reporte diario, vencimientos, relevos, snapshots, horas de hitos y PDFs.

---

## 5. Menús y navegación: diagnóstico y propuesta

### Diagnóstico
- **Demasiados ítems y por objeto, no por tarea:** inspector y cliente ven 33; owner/admin, 49 (Mi trabajo 4 · Proyecto 20 · Organización 11 · Administración 14). El menú mide más del doble de la pantalla.
- **Duplicados en el mismo menú:** «KPIs» dos veces; ITRs / «Todos los ITRs», Punch List / «Todos los punches», Certificados / «Todos los certificados», Planes de trabajo / «Todos los planes»; Explorer y Digital Twin; dos fichas de sistema; P&IDs y Documentos sin vínculo.
- **Lo importante no está donde se trabaja:** Control Tower vive en Organización (obliga a elegir proyecto y «Cargar» y abre el primero por código); Sistemas, base del readiness, no está en el menú; Preservación no tiene vista por proyecto; el forecast está escondido en Gestión diaria.
- **Inicio incorrecto:** la PWA instalada, la raíz `/` y la aceptación de invitación mandan a `/dashboard`; el inspector no aterriza en Mi trabajo.
- **Idioma y nombres:** «Templates ITR», «Tracking de Ops», «Control Tower» (la página dice «Torre de Control»), «Handover» con tres significados; migas en inglés («Daily», «Startup»).
- **Lo que funciona bien:** las tareas de campo una vez dentro (ejecutar un ITR: 2 toques; punch dentro del ITR: 2), el drawer móvil, Mi trabajo como concepto.
- **Lo que falla:** las firmas y decisiones de F1–F8 (aprobar un gate 3–5 clics, co-firmarlo 4–6) **sin ningún aviso**.

### Propuesta (resumen; la propuesta completa —menú por rol, Mi trabajo, Resumen por fases, glosario, fusiones y etapas N0–N3— está en [`PROPUESTA-NAVEGACION-2026-10-19.md`](PROPUESTA-NAVEGACION-2026-10-19.md))

```
MI TRABAJO      Mi trabajo (todo lo que me toca: ejecutar · verificar · firmar · decidir) · Escanear
PROYECTO ▾      [selector con búsqueda y recientes]
  Resumen       tablero por fases: readiness, avance, bloqueos de hoy, próximos hitos
  Readiness     (la matriz de Control Tower de este proyecto)
  Preparación   Sistemas · Tags y equipos · Documentos (+ visor P&ID) · Vendors
  MC            ITRs · Punch list · Preservación · Registros de campo
  Pre-com/Com   Señales y lazos (señales · lazos · C&E) · Certificados · PSSR
  Arranque      Arranque (procedimientos, line-ups, bitácora) · Desempeño (PTC) · Operación y traspaso
  Gestión       Gestión diaria · Planificación (look-ahead + planes) · KPIs
PORTAFOLIO      Proyectos · Panorama (dashboard + KPIs + Control Tower multi-proyecto) · Post-handover
ADMINISTRACIÓN  Organización · Plantillas · Recursos · Integración · Control
Topbar          Migas · 🔍 Buscar (⌘K) · ＋ Crear (punch, acción, restricción, TQ, evento) · 🔔 · Usuario
```

- **Menú por rol** (con «Más…» para lo permitido pero poco frecuente): inspector ~9 ítems, leader 15–17, cliente ~10, gerente ~20 colapsados, owner/admin ~25 colapsados.
- **Las listas globales pasan a ser un alcance** («Todos los proyectos») dentro de la misma lista; las rutas viejas redirigen.
- **Barra inferior móvil para todos los roles** y manifest con `start_url: /home` y accesos directos (Mi trabajo, Escanear, Nuevo punch).
- **Un glosario único**: etiqueta del menú = título de la página = miga.

---

## 6. Qué propondría para que CommUp sea una gran opción industrial

Además de corregir lo anterior, estas son las capacidades que deciden licitaciones frente a ICAPS, WinPCS, SmartCompletions u OperCom, en orden de retorno:

1. **Motor de generación de alcance:** reglas «tipo de equipo × fase → plantilla» (la matriz ya existe) por sistema o subsistema, con vista previa de diferencias, generación idempotente y regeneración cuando cambia la ingeniería. Es lo primero que evalúa un comprador.
2. **Control Tower v2 «siguiente gate»:** una fila por sistema con el siguiente gate, su estado, el primer bloqueo real con enlace, forecast/compromiso/brecha, etapa de propiedad y avance; filtros, orden por riesgo, «qué cambió desde ayer», exportación. Es la vista de la reunión de las 07:00.
3. **RACI y membresía por proyecto:** `project_members` (rol por proyecto, disciplinas, áreas), designación de firmantes, roles `viewer`, `vendor` y `client_rep`. Desbloquea EPC con varios clientes en una misma organización y vendors cargando datos directamente.
4. **Dossier compilado por sistema:** un PDF firmado (HMAC) con índice, ITR reales, certificados, PSSR, PTC, punch list, traspaso y revisiones vigentes de documentos, generado en segundo plano. Es el entregable que el cliente paga en MC y RFSU.
5. **Registro documental único:** `documents` absorbe los P&ID; los ITR heredan automáticamente sus documentos (por plano del tag, diagrama del lazo, documento C&E); MDR/VDRL con importación y exportación; transmittals ligeros; red-lines de campo sobre el visor.
6. **Punch de primer nivel:** foto con marcado, voz a texto, ubicación en el P&ID, responsable por empresa, recorrido rápido del subsistema con cámara continua.
7. **Paquete de campo offline** (§4.4) vendible como «tablet compartida en campo».
8. **Identidad empresarial:** SSO SAML/OIDC por organización (Entra ID es lo habitual en operadoras), MFA obligatorio para aprobadores, SCIM.
9. **Integraciones:** exportación CFIHOS/ISO 14224 al traspasar (SAP PM / Maximo), P6 oficial por API (sin service key), API EDMS para revisiones y webhooks `document.revision_issued`, conector PI Web API para el historian, digest por correo.
10. **IIoT serio:** series particionadas y reducidas, ingesta con alcance de proyecto y, después, detección automática de hitos («primera rotación» cuando la velocidad pasa de X) propuesta como borrador para que el testigo confirme.
11. **Panel de sala de control** en tiempo real (Realtime en lugar de recargar): ejecuciones con hold actual, hitos por atestiguar, prueba de desempeño en curso, traspasos pendientes.
12. **Programa de confianza:** pentest externo anual, camino a SOC 2 / ISO 27001, IEC 62443 para la ingesta OT↔IT, «Trust Center» con la documentación.

---

## 7. Hoja de ruta propuesta

> Esta hoja de ruta quedó reemplazada por el plan de ejecución definitivo: [`PLAN-EJECUCION-REVISION-2026-10-19.md`](PLAN-EJECUCION-REVISION-2026-10-19.md).

### Semana 1 — Estabilizar (todo S, alto impacto)
- CI: `needs:` en deploy, protección de rama, arreglar `tests/db/daily-report.test.ts` (G-01).
- C-02 (firma de ITR de lazo/C&E), C-03 (inspector levanta punch), C-17 (colas de Mi trabajo por siguiente firma pendiente).
- D-06 (reporte diario con conteos reales), B-01/B-02/D-08/F-04 (conteos en SQL, sin truncar).
- D-02 (regresión bloquea siguiente gate y dependientes), D-11 (regla PSSR única).
- E-04/B-18 (ingesta IIoT por proyecto), F-01 (PDF punch list), A-12 (XSS en certificado), A-18 (redirección abierta).
- H-01 (inicio por rol en PWA y raíz), H-04 (borrar `/admin`), H-05 (`error`/`not-found`/`loading`), H-07 (Importar a quien puede), `KpiSummaryWidget` con todas las fases.
- Mover el panel «Documentos de referencia» del ITR debajo de los ítems o plegado (regresión de F8 en móvil).

### Semanas 2–3 — Cerrar los atajos de integridad
- Llevar a RPC + trigger de guarda: miembros y roles (A-02), punches (A-06/C-11: cancelar y bajar de categoría con motivo), PSSR (A-04/C-12/C-32), certificados (A-05/C-13), preservación (C-05/C-06), estados de ITR (C-10/C-34).
- C-01: firmas requeridas configurables por plantilla/fase + pantalla para completar asignaciones; migrar ITR existentes.
- Offline por usuario y purga al cerrar sesión (A-09/C-08/E-01).
- Suite de autorización rol × tabla × operación en CI.

### Semanas 3–5 — Que el sistema avise y se entienda
- Notificaciones y colas de F1–F8 (D-04/H-02); digest por correo.
- Zona horaria del proyecto (D-05).
- Control Tower coherente con el motor (D-01/D-18) + filtros, orden, exportación (D-19) y dentro del proyecto (H-12).
- Navegación por fases y por rol (§5), glosario único, migas declarativas.
- Índices faltantes (B-05) y `cache()` de membresía (G-07).
- Nombres de eventos consistentes y despacho único (I-08/B-03 primera parte).

### Trimestre — Ventaja competitiva
- Readiness materializada + bus de eventos outbox (§4.3).
- Designación de firmantes, `project_members`, roles vendor/viewer (§6.3).
- Generación masiva de ITR (§6.1), dossier compilado (§6.4), registro documental único (§6.5).
- Paquete de campo offline, punch con foto y marcado, SSO/MFA, integraciones CMMS/P6/EDMS/historian.
- Migración «canónica» que reúna el SQL central hoy repartido en parches por ancla (D-09/B-19).

---

## 8. Conteo de hallazgos por anexo

| Anexo | Área | Crít. | Alto | Medio | Bajo | Total |
|---|---|---|---|---|---|---|
| [A](revision-2026-10-19/A-seguridad.md) | Seguridad y multi-tenancy | 1 | 6 | 10 | 13 | 30 |
| [B](revision-2026-10-19/B-datos-rendimiento.md) | Datos, SQL y rendimiento | 4 | 9 | 13 | 4 | 30 |
| [C](revision-2026-10-19/C-completions.md) | Completions (ITR, punch, preservación, PSSR, certificados) | 4 | 13 | 18 | 9 | 44 |
| [D](revision-2026-10-19/D-readiness-gestion.md) | Readiness y gestión diaria | 0 | 9 | 18 | 11 | 38 |
| [E](revision-2026-10-19/E-arranque-operacion.md) | Arranque, operación y desempeño | 0 | 5 | 21 | 11 | 37 |
| [F](revision-2026-10-19/F-ingenieria-docs-vendors.md) | Ingeniería, documentos, vendors y reportes | 0 | 6 | 17 | 13 | 36 |
| [G](revision-2026-10-19/G-frontend-calidad.md) | Frontend y calidad de ingeniería | 1 | 6 | 12 | 7 | 26 |
| [H](revision-2026-10-19/H-navegacion.md) | Menús y navegación | 0 | 5 | 12 | 7 | 24 |
| [I](revision-2026-10-19/I-roles-integraciones.md) | Roles e integraciones | 1 | 11 | 10 | 6 | 28 |
| | **Total (con solapamientos entre áreas)** | **11** | **70** | **131** | **81** | **293** |

Cada anexo incluye además una sección «Funcionamiento para el manual», base del [Manual de CommUp por rol](MANUAL-COMMUP-POR-ROL.md).
