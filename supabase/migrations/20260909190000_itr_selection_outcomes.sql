-- Explicit selection acceptance. Existing options remain string arrays and start neutral.
ALTER TABLE public.itr_template_items
  ADD COLUMN option_outcomes jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE FUNCTION public.itr_option_outcomes_valid(p_options jsonb, p_outcomes jsonb)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE entry record;
BEGIN
  IF p_outcomes IS NULL OR jsonb_typeof(p_outcomes) <> 'object' THEN RETURN false; END IF;
  IF p_options IS NOT NULL AND p_options <> 'null'::jsonb THEN
    IF jsonb_typeof(p_options) <> 'array' THEN RETURN false; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_options) value WHERE jsonb_typeof(value) <> 'string') THEN RETURN false; END IF;
  END IF;
  FOR entry IN SELECT key, value FROM jsonb_each(p_outcomes) LOOP
    IF jsonb_typeof(entry.value) <> 'string' OR entry.value #>> '{}' NOT IN ('pass', 'fail', 'not_applicable') THEN RETURN false; END IF;
    IF p_options IS NULL OR p_options = 'null'::jsonb OR NOT (p_options ? entry.key) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END;
$$;

ALTER TABLE public.itr_template_items
  ADD CONSTRAINT itr_template_items_option_outcomes_valid
  CHECK (public.itr_option_outcomes_valid(options, option_outcomes));

COMMENT ON COLUMN public.itr_template_items.option_outcomes IS
  'Exact option to pass/fail/not_applicable mapping; absent entries are neutral. Not applicable requires response remarks. Assigned revisions remain frozen by itr_items_frozen.';
