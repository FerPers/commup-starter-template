# Plan manual para completar el catálogo ITR

## 1. Preparar una lista única

Usar CONTROL-CATALOGO.csv: una fila por original inventariado, con código fuente, fase y estado. Conciliar cada fila con la organización, código y revisión reales en CommUp. Un código inferido del nombre no prueba correspondencia. No borrar duplicados sin comprobar asignaciones.

Separar primero los formatos aplicables al piloto GeoPark. Ordenar después por disciplina y fase. No es necesario terminar todo el catálogo para seleccionar un alcance de piloto, pero todos los formatos de ese alcance deben quedar validados.

## 2. Antes de editar cada plantilla

1. Abrir Templates ITR y comprobar organización, código, fase, disciplina y revisión.
2. Exportar JSON y guardarlo con código, revisión y fecha. Guardar el Word original sin cambios.
3. Comprobar si tiene ITR asignados. Una plantilla asignada está protegida: no forzar su edición ni cambiar la revisión de ITR existentes.
4. Trabajar sobre una copia inactiva cuando se necesite conservar histórico. No asumir que «Publicar nueva versión» crea siempre esa copia: sin asignaciones incrementa la versión en el mismo registro; con asignaciones crea una copia activa. Este flujo requiere revisión técnica del software antes de usarlo en masa.
5. Si no encuentras una forma de preparar la copia inactiva, deja el formato como «Preparado, pendiente de publicación». No necesitas SQL ni desactivar protecciones para revisar el contenido.

## 3. Contrastar Word y editor, punto por punto

| Contenido original | Campo recomendado | Comprobación |
|---|---|---|
| Referencia, fabricante, modelo, serie, explicación | Texto | No agrupar información que deba consultarse separadamente |
| Magnitud o lectura | Número/medición | Unidad explícita; límites solo del procedimiento/ingeniería |
| Fecha de prueba o vencimiento | Fecha | Captura real, no checkbox |
| Decisión de aceptación | Selección | Configurar resultado pass/fail/not_applicable, no solo escribir etiquetas |
| Sí/no factual | Sí/no | Una respuesta No puede ser válida; no confundir con rechazo técnico |
| Verificación simple | Checkbox si basta | No usarlo donde haga falta valor, referencia o decisión razonada |
| Evidencia fotográfica | Foto | Requerida y vinculada al ítem cuando corresponda |
| Continuidad | Continuidad por conductor | Modo pares/conductores, cantidad, pantallas, terminales y resultados |
| Firma | Flujo nativo | No crear otra casilla «firma» para reemplazar los roles existentes |

Para continuidad, las lecturas obligatorias se configuran dentro de su registro; no activar el requisito numérico auxiliar genérico. Para otras matrices, conservar identificación de cada fila y columna: entrada/salida/error, antes/después, actuación/reposición o conductor/pantalla, según el ensayo. No reutilizar continuidad como tabla de calibración.

Revisar condiciones: una sección oculta solo deja de ser requerida si la condición es correcta. «No aplica» necesita motivo. Una referencia escrita a un certificado no prueba que el archivo esté adjunto; comprobar ambos cuando el procedimiento lo exija.

## 4. Prueba mínima por formato

- Comparar todo el Word con las secciones y campos digitales; registrar cualquier omisión o adaptación.
- Usar Vista de campo para revisar legibilidad; no confundir preview con ejecución funcional.
- En una asignación de QA: llenar valores representativos, guardar y reabrir para comprobar persistencia.
- Dejar un obligatorio vacío: no debe quedar listo para firma.
- Probar rechazo y No aplica donde existan.
- Comprobar condiciones y tablas particulares; revisar unidades y valores cero.
- Exportar PDF: revisar todas las filas, últimas páginas, observaciones y legibilidad.
- Para el primer caso de cada estructura nueva, probar las firmas nativas y protección tras firma. No volver a ensayar toda la infraestructura en cada formato que use exactamente la misma estructura ya comprobada.
- Marcar revisión técnica conforme solo después de comprobar criterios, alcance y cobertura.

## 5. Publicar con trazabilidad

Cuando esté revisada, activar la nueva revisión y dejar la anterior inactiva. Verificar campos y vínculos en la copia final; comprobar que nuevas asignaciones utilizan la revisión elegida y que las anteriores conservan su propia revisión. El botón actual no garantiza una copia completa en una operación atómica: no dar una publicación por correcta solo porque aparece un mensaje de éxito. Mantener un respaldo JSON previo.

## 6. Orden sugerido

- Sesión inicial: respaldo, conciliación e identificación del alcance GeoPark.
- Bloque 1: revisar I01A/I04A/I06A publicados y sus pendientes concretos; cerrar su validación técnica.
- Bloque 2: completar I10A sin generalizarlo a otros ensayos; I05A y su relación con I10A.
- Bloque 3: resto de instrumentación, empezando por I07A (medición de resistencia) y otros formatos de estructura sencilla.
- Bloques posteriores: eléctricos, mecánicos y restantes, agrupados por estructura y fase.
- Bloque de excepciones: I33C, contradicciones de originales, unidades ausentes y matrices no soportadas. No detener otros formatos por estas excepciones.
- Cierre: cotejar inventario, revisiones activas, PDFs y alcance del piloto.

Trabajar en sesiones de duración que te resulte sostenible y anotar formatos realmente cerrados. Tras los primeros 5–10 medir tiempo por formato sencillo/complejo. Calcular plazo con esa velocidad real; no hay base suficiente para prometer ahora una cantidad fija de jornadas manuales.

## Criterio de terminado

Un formato está terminado cuando tiene correspondencia con su fuente, revisión técnica, captura persistida, PDF revisado y revisión publicada verificada. «Extraído», «mapeado», «editado» y «publicado» son estados distintos.

## Aclaración de Luis: repositorio y uso bajo demanda

El catálogo de plantillas ITR es un repositorio reutilizable, disponible para los proyectos. Cada proyecto utiliza las plantillas que correspondan a su alcance y a los elementos de ingeniería cargados: instrumentos, equipos, señales, cables, tuberías y otros listados. Completar el catálogo significa disponer de formatos técnicamente completos y utilizables bajo demanda; no asignar todos los formatos a todos los proyectos.

Separar tres niveles:
1. Plantilla del repositorio: define alcance, fase, disciplina, campos y revisión.
2. Asignación al proyecto/elemento de ingeniería: selecciona el formato aplicable y conserva la relación nativa con el elemento.
3. ITR ejecutado: contiene respuestas, evidencias y firmas de esa asignación, vinculado a la revisión correspondiente.

Actualizar una plantilla no debe sobrescribir respuestas ni cambiar retrospectivamente la revisión de ITR ya asignados. Las nuevas asignaciones deben usar la revisión vigente que corresponda. No duplicar manualmente tags ni firmas en los campos.

Esta aclaración describe el funcionamiento esperado confirmado por Luis. No certifica que todos los importadores de señales, cables o tuberías realicen hoy una asignación automática: esa cobertura debe verificarse por flujo. Tampoco significa acceso global entre organizaciones.
