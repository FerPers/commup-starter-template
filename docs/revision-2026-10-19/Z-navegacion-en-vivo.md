# Revisión en vivo (navegador, owner DEMO, 2026-10-19)

- Menú del owner: 49 enlaces (Mi trabajo 4 · Proyecto 11 + Ingeniería 4 + Vistas y planificación 5 · Organización 11 · Administración 14). Altura total del menú 2.149 px en 900 px de pantalla.
- Duplicados visibles en el mismo menú: «KPIs» (proyecto y organización), ITRs/«Todos los ITRs», Punch List/«Todos los punches», Certificados/«Todos los certificados», «Planes de Trabajo»/«Todos los planes».
- Idioma mezclado en el menú: «Templates ITR», «Tracking de Ops», «Punch List», «Control Tower», «Handover», «Digital Twin», «Dashboard». La página de Control Tower se titula «Torre de Control» y su subtítulo dice «hitos de completion».
- El bloque «Último proyecto» del menú aparece después de hidratar (salto de layout).
- Dashboard de la organización muestra solo 3 fases (MC, Pre-Comm, Comm) + punch + preservación; el proyecto tiene 5 fases (falta SU y PA) — causa: `src/components/dashboard/widgets/KpiSummaryWidget.tsx:134` hace `.slice(0, 3)`. El resumen del proyecto sí muestra las 5.
- Resumen del proyecto = directorio de tarjetas que repite el menú; no muestra estado de gates/readiness, ni «qué hago ahora», ni los módulos nuevos (documentos, vendors, desempeño). Banner «Digital Twin» ocupa el lugar principal.
- Control Tower vive en «Organización», no en el proyecto; obliga a elegir proyecto + «Cargar» aunque ya se esté en un proyecto. Los gates se ven como chips que envuelven en 2–3 filas (no es una matriz legible a escala).
- Mi trabajo: 13 contadores, la mayoría en 0 (ruido). Buena idea de base.
- Móvil (375 px): la lista de ITRs se desborda (layout de 504 px, tarjetas y tabla cortadas; la tabla no pasa a tarjetas). En la ejecución del ITR la cabecera ocupa casi toda la primera pantalla (título del template en mayúsculas, 3 botones de firma) y el panel «Documentos de referencia» (F8) empuja el checklist hacia abajo → debería ir plegado o después de los ítems.
- Menú móvil (drawer) funciona; en la página de un ITR resalta «Tags» como sección activa.
- En desarrollo, después de cada acción el refresco tarda varios segundos y los controles quedan deshabilitados (clics que se pierden en checklists).
- Confirmaciones con window.confirm en acciones críticas (registrar resultado, emitir PTC, descartar borrador): poco profesional, no se puede probar automáticamente y el navegador integrado las cancela.
