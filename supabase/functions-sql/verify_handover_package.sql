-- fn: public.verify_handover_package(text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.verify_handover_package(p_hash text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'package_id',     hp.id,
    'status',         hp.status,
    'version',        hp.version,
    'generated_at',   hp.generated_at,
    'organization',   o.name,
    'project_code',   p.code,
    'project_name',   p.name,
    'systems',        COALESCE((SELECT jsonb_agg(s.code ORDER BY s.code) FROM handover_package_systems hs
                                JOIN systems s ON s.id = hs.system_id WHERE hs.package_id = hp.id), '[]'::jsonb),
    'signature_alg',  COALESCE(hp.signature_alg, 'hmac-sha256'),
    'signature',      hp.signature,
    'key_id',         hp.key_id,
    'files',          COALESCE(hp.manifest -> 'files', '[]'::jsonb),
    'omitted',        COALESCE(hp.manifest -> 'omitted', '[]'::jsonb),
    'complete',       hp.status = 'ISSUED')
  FROM handover_packages hp
  JOIN projects p ON p.id = hp.project_id
  JOIN organizations o ON o.id = hp.org_id
  WHERE p_hash ~ '^[0-9a-f]{64}$' AND hp.signature_hash = p_hash AND hp.status IN ('ISSUED', 'PARTIAL')
  ORDER BY hp.generated_at DESC
  LIMIT 1
$function$;
