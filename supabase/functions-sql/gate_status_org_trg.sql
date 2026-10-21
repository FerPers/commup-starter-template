-- fn: public.gate_status_org_trg()
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.gate_status_org_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_org uuid;
BEGIN
  -- Por ramas: plpgsql falla al leer un campo que la tabla no tiene, aunque la expresión no lo use.
  IF TG_TABLE_NAME = 'organizations' THEN
    v_org := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    v_org := OLD.org_id;
  ELSE
    v_org := NEW.org_id;
  END IF;
  PERFORM public.gate_status_mark(ARRAY(SELECT st.system_id FROM system_gate_status st WHERE st.org_id = v_org));
  RETURN NULL;
END;
$function$;
