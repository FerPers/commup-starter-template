-- fn: public.guard_itr_derived()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.guard_itr_derived()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- S05 (C-34/C-10, D7): estado, avance y fecha de completado solo los escriben las funciones confiables
  -- (refresh_itr_status, sign_itr_atomic, reopen…). Antes cualquier miembro, incluso el cliente, los cambiaba
  -- por REST, y el cambio masivo de estado dejaba ITR «completados» sin contenido.
  IF current_user <> pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = 'public.itrs'::regclass))
     AND (NEW.status, NEW.progress_pct, NEW.completed_date) IS DISTINCT FROM (OLD.status, OLD.progress_pct, OLD.completed_date) THEN
    RAISE EXCEPTION 'El estado y el avance del ITR se calculan de su contenido y sus firmas' USING ERRCODE = '42501';
  END IF;
  -- A08 (E2): la devolución la registra solo return_itr_to_executor; la limpian la firma y la reapertura auditada.
  IF current_user <> pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = 'public.itrs'::regclass))
     AND (NEW.returned_at, NEW.returned_by, NEW.return_reason) IS DISTINCT FROM (OLD.returned_at, OLD.returned_by, OLD.return_reason) THEN
    RAISE EXCEPTION 'La devolución del ITR solo la registra «Devolver al ejecutor»' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
