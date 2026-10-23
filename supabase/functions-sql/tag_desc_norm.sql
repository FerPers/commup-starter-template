-- fn: public.tag_desc_norm(text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.tag_desc_norm(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- Primero se quitan las palabras con dígitos («P-101», «2"»), después los signos.
  SELECT btrim(left(btrim(regexp_replace(array_to_string(ARRAY(
    SELECT w FROM regexp_split_to_table(
      translate(lower(COALESCE(p, '')), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc'), '\s+') WITH ORDINALITY AS x(w, n)
    WHERE w !~ '[0-9]' ORDER BY n), ' '), '[^a-z0-9]+', ' ', 'g')), 120))
$function$;
