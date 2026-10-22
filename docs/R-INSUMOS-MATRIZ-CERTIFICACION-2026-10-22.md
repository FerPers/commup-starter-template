# Insumos para el bloque R (requisitos ITR por tag con IA) — matriz de certificación de referencia

Fecha: 2026-10-22. Fuente: dos Excel que Luis usaba para armar el plan de precomisionamiento y comisionamiento de una planta. Los archivos (datos de un cliente) están en `insumos-locales/plan-comisionamiento-referencia/`, carpeta que git ignora:

- **«Tabla de Formatos Comisionamiento»** (2010): el listado oficial de formatos del operador.
- **«Matriz de certificación PGC» Rev 3** (2011): el plan de certificación de una planta de gas.

Este documento resume su estructura y lo que enseñan para diseñar el agente que propone los ITR. Es complemento del bloque R de [`PLAN-REFERENTE-2026-10-22.md`](PLAN-REFERENTE-2026-10-22.md).

---

## 1. Tabla de formatos (catálogo del operador)

- **Columnas:** código del operador (`ECP-GTD-F-1xx`) · código del contratista (`FE 07A`, `FI 2A`, `COMCHK2`, `FM 01`…) · nombre.
- **Agrupada por tipo de actividad y disciplina:**
  - Certificado de entrega del expediente (HC-1).
  - Chequeos preliminares (COMCHK1).
  - Pruebas de funcionamiento:
    - eléctricas: FE 01–22, protección catódica;
    - instrumentación: FI 2A–13, SAT, SC1;
    - telecomunicaciones: FC 01;
    - pre-arranque de tuberías: FP 01 secado, FP 02 inertización, FP 05 junta presenciada, FP 09 fugas, FP 10 limpieza química;
    - civiles: CW 11–13.
  - Operacionales por equipo rotativo, en pareja **chequeo preoperacional + prueba operacional**:
    - bomba centrífuga: COMCHK2 → FM 01;
    - compresor centrífugo: COMCHK4 → FM 03;
    - máquina diésel: COMCHK6 → FM 05;
    - grúa/hoist: COMCHK7 → FM 06.
- **Lección:** el nombre del formato ya dice el **tipo de equipo** («Motor eléctrico de bajo voltaje», «Bomba centrífuga», «ESV/BDV/XV»). Es justo la llave del agente, porque tipo de tag → formatos.

## 2. Matriz de certificación (el plan de una planta)

Cuatro hojas.

| Hoja | Qué es | Equivalente en CommUp |
|---|---|---|
| Reporte gerencial | Requeridos · ejecutados · % · faltantes por disciplina (Tubería, Mecánica, Eléctrica, Control, Civil) | KPIs del Portafolio y del Resumen |
| Resumen | Sistema → subsistema (con código) × disciplina × etapa: n.º de certificados de **precomisionamiento** (completamiento mecánico) y de **comisionamiento** (pruebas funcionales). Total de la planta: 5.705 + 1.618 | `tag_requirements_summary` (R2) y su Excel |
| Resumen por sistemas y disciplinas | Lo mismo, desglosado | Árbol del registro «Requisitos ITR» |
| Resumen certificados (6.600 filas) | Por subsistema, con **límites DESDE/HASTA en texto**: por disciplina, cada **elemento** con sus certificados de las dos etapas. Por cada uno: código, cantidad requerida, fecha programada, ejecutados, fecha de ejecución y % | El registro por tag (R2) y los límites del sistema (P) |

### Qué es un «elemento» en la matriz (no siempre es un tag)

- **Tubería:** el elemento es el **paquete de prueba** (`HT+00101` = hidrostática), con sus líneas (`16"-PG-14088-K2AL-VA`), planos y límites DESDE/HASTA.
  - Precomisionamiento: QC05, QP-01, P-2, P-2A, P-3, P-6, P-7, P-15.
  - Comisionamiento: FP-05 (junta presenciada, **cantidad = n.º de juntas**, p. ej. ×11) y FP-09 (fugas).
- **Mecánica:** el elemento es el equipo o skid (`ME-00301` = scrubber V-2701).
  - Precomisionamiento: M-1A, M-2, M-3, M-7, PM-1, PID-1, H-1…3, MH-1/2 y FAT.
  - Comisionamiento: COMCHKn + FMnn y SAT.
- **Instrumentación y control:** el elemento es el grupo de instrumentos (`IN-00201` = TIT-2425).
  - Precomisionamiento: I-01…I-09, CHK-IN-0x y FAT.
  - Comisionamiento: FI-02A/03/05/07/08/13 (lazos, F&G, ESD) y SAT.
- **Eléctrica:** el elemento es el equipo, y aparece la **cadena por tipo de equipo**:
  - Motor de bajo voltaje: `CHK-EL-07B` (chequeo) → `E-07` (prueba de precomisionamiento) → `FE-07B` (prueba funcional).
  - Puesta a tierra: `CHK-EL-22` → `E-22` → `FE-22`.
  - Contactores: `E-04` → `FE-04`. Transformador: `CHK-EL-06` → `E-06` → `FE-06`.
- **Civil y estructuras:** el elemento es la estructura o fundación (`CV-01201` = placa del cooler).
  - Precomisionamiento: CW-1…10, S-1, S-2.
  - Comisionamiento: CW-11/12 (aceptación de área y obras).

## 3. Qué nos enseña para el agente de IA (ajustes al bloque R)

1. **La unidad de propuesta es una cadena por tipo y etapa, no un ITR suelto.**
   - Para cada tipo de equipo, el agente propone la secuencia A → B → C: chequeo/completamiento mecánico → precomisionamiento → comisionamiento funcional. En nuestra nemotecnia: `E07A` → `E07B` → `E07C`.
   - La matriz `equipment_type_templates` ya lo permite (una fila por plantilla y fase).
   - En la vista previa del registro, mostrar la cadena completa y avisar cuando a un tipo le falta un eslabón (p. ej., hay A y C pero no B).
2. **El elemento no siempre es un tag.**
   - Tubería se certifica por **paquete de prueba** (en CommUp: registros `test_pack`, prefijo TPK, con tags de rol `line`).
   - Civil se certifica por **estructura o fundación**.
   - R2 debe dejar abierto el «objetivo» del requisito: tag hoy; paquete de prueba (y luego estructura) como segunda clase. Decidirlo en la maqueta.
3. **Cantidad requerida.**
   - Algunos certificados se exigen N veces por elemento: juntas por paquete, cables, circuitos.
   - El requisito necesita `cantidad` (por defecto 1) y la generación/avance debe contarla.
   - Hoy un ITR = tag × plantilla, una vez.
4. **Código del cliente por plantilla.**
   - Cada formato tiene su número del operador (`ECP-GTD-F-132`) y el del contratista (`FE 07B`).
   - Agregar un alias por org o proyecto (código del cliente) que salga en el PDF, el Excel del registro y el dossier. Va bien con E2 (logos en PDF).
5. **Fecha programada por certificado.**
   - La matriz planifica cada certificado. Nosotros planificamos por sistema × liberación.
   - Futuro: fecha objetivo opcional por requisito o por paquete, para un skyline más fino. No es para R1–R2.
6. **El Excel del registro debe parecerse a esta matriz:**
   - hoja de reporte gerencial (requeridos, ejecutados, % y faltantes por disciplina);
   - resumen sistema → subsistema × disciplina × etapa;
   - detalle por elemento.
   Es el formato que el cliente ya reconoce.
7. **Límites DESDE/HASTA por subsistema y paquete.** Es texto hoy (como `systems.battery_limits`). Conecta con el bloque P (límites dibujados en el P&ID).
8. **Importar una matriz histórica para sembrar la matriz.**
   - Un Excel como este, de un proyecto anterior, es el mejor entrenamiento.
   - Feature candidata para R3/R4: «Importar plan de certificación anterior». La IA mapea sus códigos (CHK-EL-07B, E-07, FE-07B) a las plantillas del catálogo usando los nombres de la tabla de formatos. Propone filas tipo de equipo × plantilla × fase que un editor acepta en `/admin/templates/matrix`.
   - Ya existe `importMatrixRows`; falta el mapeo de códigos con IA.
9. **Disciplinas del plan:** Tubería · Mecánica · Civil y Estructuras · Instrumentación y Control · Eléctrica (+ Telecom). Confirma R1: el proyecto elige sus disciplinas y eso filtra las plantillas.

## 4. Preguntas para la sesión de maquetas (M)

- ¿El registro de requisitos arranca solo con tags, o con tags + paquetes de prueba desde el principio?
- ¿Cantidad requerida en R2, o después?
- ¿Código del cliente por org (un solo operador) o por proyecto (varios operadores)?
- ¿El Excel del registro replica las tres vistas de esta matriz?
