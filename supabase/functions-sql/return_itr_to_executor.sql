-- fn: public.return_itr_to_executor(uuid, text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.return_itr_to_executor(p_itr_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v itrs; v_org uuid; v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), ''); v_sigs jsonb; v_exec uuid; v_role text;
BEGIN
  -- S05 (C-23): quien debe firmar después del ejecutor (supervisor o cliente asignado) devuelve el ITR con
  -- observaciones: se retiran las firmas puestas, el ejecutor corrige y vuelve a firmar. Auditado y notificado.
  SELECT * INTO v FROM itrs WHERE id = p_itr_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.is_project_member(v.project_id) THEN RAISE EXCEPTION 'ITR unavailable'; END IF;
  IF v.status = 'approved' THEN RAISE EXCEPTION 'Un ITR aprobado se reabre con la reapertura auditada' USING ERRCODE = 'P0001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM itr_signatures WHERE itr_id = p_itr_id AND role = 'executor') THEN
    RAISE EXCEPTION 'El ejecutor todavía no firmó: no hay nada que devolver' USING ERRCODE = 'P0001';
  END IF;
  SELECT a.role::text INTO v_role FROM itr_assignments a
   WHERE a.itr_id = p_itr_id AND a.user_id = auth.uid() AND a.role::text <> 'executor' AND a.role::text = ANY (v.required_signatures)
   LIMIT 1;
  IF v_role IS NULL THEN RAISE EXCEPTION 'Solo el supervisor o el cliente asignado devuelve el ITR' USING ERRCODE = '42501'; END IF;
  IF v_reason IS NULL OR length(v_reason) < 10 THEN RAISE EXCEPTION 'Explica qué hay que corregir (mínimo 10 caracteres)' USING ERRCODE = '22023'; END IF;

  SELECT org_id INTO v_org FROM projects WHERE id = v.project_id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('role', role, 'user_id', user_id, 'signed_at', signed_at)), '[]') INTO v_sigs FROM itr_signatures WHERE itr_id = p_itr_id;
  DELETE FROM itr_signatures WHERE itr_id = p_itr_id;
  -- A08 (E2): el ITR queda «Devuelto», con quién y por qué, hasta la siguiente firma o una reapertura.
  UPDATE itrs SET returned_at = now(), returned_by = auth.uid(), return_reason = v_reason WHERE id = p_itr_id;
  INSERT INTO activity_log (org_id, user_id, entity_type, entity_id, action, payload)
  VALUES (v_org, auth.uid(), 'itr', p_itr_id, 'returned', jsonb_build_object('reason', v_reason, 'byRole', v_role, 'previousSignatures', v_sigs));
  SELECT user_id INTO v_exec FROM itr_assignments WHERE itr_id = p_itr_id AND role = 'executor';
  IF v_exec IS NOT NULL AND v_exec <> auth.uid() THEN
    INSERT INTO notifications (org_id, recipient_user_id, kind, title, body, link_url, payload)
    VALUES (v_org, v_exec, 'itr_returned', 'ITR devuelto: ' || v.itr_number, left(v_reason, 280),
            '/projects/' || v.project_id || COALESCE('/tags/' || v.tag_id || '/itrs/' || p_itr_id, '/itrs'),
            jsonb_build_object('itrId', p_itr_id, 'projectId', v.project_id, 'reason', v_reason));
  END IF;
  RETURN jsonb_build_object('project_id', v.project_id, 'tag_id', v.tag_id, 'itr_number', v.itr_number);
END;
$function$;
