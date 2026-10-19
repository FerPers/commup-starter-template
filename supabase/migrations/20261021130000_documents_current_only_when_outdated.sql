-- Fase 8, sesión 1 (ajuste): el criterio implícito documents_current solo aparece cuando hay referencias superadas,
-- igual que constraints_clear (sin filas, no se lista). Parche con anclas únicas sobre el cuerpo vigente.
DO $patch$
DECLARE v_def text;
  a1 text := E'    v_crit := v_crit || jsonb_build_array(jsonb_build_object(\n      ''criterion_id'', NULL, ''kind'', ''documents_current''';
  a2 text := E'''outdated_count'', v_failn)));\n    IF v_failn > 0 AND v_level = ''green'' THEN v_level := ''yellow''; END IF;';
BEGIN
  v_def := pg_get_functiondef('public.compute_system_gates(uuid)'::regprocedure);
  IF (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 OR (length(v_def) - length(replace(v_def, a2, ''))) / length(a2) <> 1 THEN
    RAISE EXCEPTION 'compute_system_gates: ancla documents_current no encontrada o repetida';
  END IF;
  v_def := replace(v_def, a1, E'    IF v_failn > 0 THEN\n' || a1);
  v_def := replace(v_def, a2, E'''outdated_count'', v_failn)));\n    END IF;\n    IF v_failn > 0 AND v_level = ''green'' THEN v_level := ''yellow''; END IF;');
  EXECUTE v_def;
END;
$patch$;

-- Firma «nombre · empresa» (§15.1): el JSON de aprobación y firmas de cada gate incluye la empresa congelada.
DO $patch$
DECLARE v_def text;
  a1 text := E'''approved_by'', a.approved_by, ''approved_role'', a.approved_role,';
  a2 text := E'''capacity'', s.capacity, ''user_id'', s.user_id, ''user_role'', s.user_role,';
BEGIN
  v_def := pg_get_functiondef('public.compute_system_gates(uuid)'::regprocedure);
  IF (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 OR (length(v_def) - length(replace(v_def, a2, ''))) / length(a2) <> 1 THEN
    RAISE EXCEPTION 'compute_system_gates: ancla de firmas no encontrada o repetida';
  END IF;
  v_def := replace(v_def, a1, a1 || E' ''approved_company'', a.approved_company,');
  v_def := replace(v_def, a2, a2 || E' ''signer_company'', s.signer_company,');
  EXECUTE v_def;
END;
$patch$;
