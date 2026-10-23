-- Recuperada de prod (2026-10-22): se aplicó como versión 20260909230616 «itr_option_outcomes_list_shape» (supabase_migrations.schema_migrations)
-- sin archivo en el repo. Texto tal cual del registro; va en el lugar que tuvo en prod, entre
-- 20260909251000_itr_table_capture y 20260910120000_equipment_type_templates_select_catalog.

CREATE OR REPLACE FUNCTION public.itr_option_outcomes_valid(p_options jsonb, p_outcomes jsonb)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE entry record;
BEGIN
  IF p_outcomes IS NULL OR jsonb_typeof(p_outcomes) <> 'object' THEN RETURN false; END IF;
  -- A list must always be a string array; an empty map is otherwise neutral.
  IF jsonb_typeof(p_options) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(p_options) value WHERE jsonb_typeof(value) <> 'string') THEN RETURN false; END IF;
  IF p_outcomes = '{}'::jsonb THEN RETURN true; END IF;
  IF p_options IS NOT NULL AND p_options <> 'null'::jsonb AND jsonb_typeof(p_options) <> 'array' THEN RETURN false; END IF;
  FOR entry IN SELECT key, value FROM jsonb_each(p_outcomes) LOOP
    IF jsonb_typeof(entry.value) <> 'string' OR entry.value #>> '{}' NOT IN ('pass', 'fail', 'not_applicable') THEN RETURN false; END IF;
    IF p_options IS NULL OR p_options = 'null'::jsonb OR NOT (p_options ? entry.key) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END;
$$;
