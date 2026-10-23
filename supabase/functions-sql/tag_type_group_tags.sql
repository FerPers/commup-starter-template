-- fn: public.tag_type_group_tags(uuid,text,uuid,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.tag_type_group_tags(p_project_id uuid, p_prefix text, p_discipline_id uuid, p_desc_norm text)
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_project_member(p_project_id) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501'; END IF;
  RETURN COALESCE((
    SELECT array_agg(t.id ORDER BY t.tag_number) FROM tags t
    WHERE t.project_id = p_project_id AND t.equipment_type_id IS NULL
      AND public.tag_number_prefix(t.tag_number) = COALESCE(p_prefix, '')
      AND t.discipline_id IS NOT DISTINCT FROM p_discipline_id
      AND public.tag_desc_norm(t.description) = COALESCE(p_desc_norm, '')), '{}');
END;
$function$;
