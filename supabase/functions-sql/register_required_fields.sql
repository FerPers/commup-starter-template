-- fn: public.register_required_fields(text,text)
-- Canónico (S03). Volcado de prod con scripts/sql/canonical-functions.mjs; no editar sin migración.
CREATE OR REPLACE FUNCTION public.register_required_fields(p_kind text, p_status text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(f.key ORDER BY f.key), '{}') FROM (VALUES
    ('temporary', 'category', 'authorized'), ('temporary', 'location', 'authorized'), ('temporary', 'purpose', 'authorized'),
    ('blind', 'blind_type', 'authorized'), ('blind', 'size', 'authorized'), ('blind', 'location', 'authorized'),
    ('blind', 'purpose', 'authorized'), ('blind', 'label_number', 'active'),
    ('reinstatement', 'temporary_condition', 'authorized'), ('reinstatement', 'final_condition', 'authorized'),
    ('bypass', 'protection_function', 'authorized'), ('bypass', 'method', 'authorized'), ('bypass', 'reason', 'authorized'),
    ('bypass', 'risk_mitigation', 'authorized'), ('bypass', 'restoration_check', 'verified'),
    ('energization', 'equipment', 'authorized'), ('energization', 'boundary', 'authorized'), ('energization', 'authority', 'authorized'),
    ('energization', 'certificate', 'active'), ('energization', 'energized_on', 'active'),
    ('test_pack', 'test_type', 'authorized'), ('test_pack', 'medium', 'authorized'), ('test_pack', 'test_pressure', 'authorized'),
    ('test_pack', 'hold_minutes', 'authorized'), ('test_pack', 'achieved_pressure', 'active'), ('test_pack', 'result', 'active'),
    ('test_pack', 'witness', 'active')
  ) f(kind, key, required_for)
  WHERE f.kind = p_kind
    AND array_position(ARRAY['proposed', 'authorized', 'active', 'removed', 'verified'], f.required_for)
        <= array_position(ARRAY['proposed', 'authorized', 'active', 'removed', 'verified'], p_status)
$function$;
