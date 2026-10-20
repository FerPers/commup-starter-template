-- S18 sesión 2 (C-35 / B-16 / E-27): hora de captura en campo y compare-and-set de las respuestas de ITR.
--
-- Antes: el replay comparaba el reloj del teléfono con el `responded_at` que ponía el Worker, y el ITR guardaba la
-- hora de sincronización, no la de la inspección. Ahora:
--   - `responded_at` = hora de escritura en la BD (now(), siempre; nadie lo fija desde el cliente). Es la versión de
--     la fila: el cliente la manda de vuelta como «lo que vi» y la escritura solo procede si no cambió (la condición
--     va en el mismo UPDATE: chequeo y escritura atómicos).
--   - `captured_at` = hora de campo declarada por el dispositivo, acotada entre la creación del ITR y now()
--     (= startup_field_time de F6); `capture_clamped` marca si hubo que recortarla (reloj del equipo desfasado).
--   - `responded_by` = quien escribe (auth.uid()) cuando hay sesión: la respuesta no se atribuye a otra persona.

ALTER TABLE public.itr_responses
  ADD COLUMN IF NOT EXISTS captured_at timestamptz,
  ADD COLUMN IF NOT EXISTS capture_clamped boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.itr_responses.captured_at IS 'S18: hora de captura en campo (declarada por el dispositivo, acotada a [creación del ITR, now()]).';
COMMENT ON COLUMN public.itr_responses.capture_clamped IS 'S18 (E-27): la hora declarada estaba fuera de rango y se recortó.';

-- Filas existentes: la hora de captura conocida es la de escritura. Solo metadatos de una columna nueva: se apaga
-- el guard de contenido (rechaza tocar ITR firmados) únicamente para esta sentencia.
ALTER TABLE public.itr_responses DISABLE TRIGGER itr_responses_integrity;
UPDATE public.itr_responses SET captured_at = responded_at WHERE captured_at IS NULL AND responded_at IS NOT NULL;
ALTER TABLE public.itr_responses ENABLE TRIGGER itr_responses_integrity;

CREATE OR REPLACE FUNCTION public.itr_response_times()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_floor timestamptz; v_declared timestamptz;
BEGIN
  NEW.responded_at := now();
  IF auth.uid() IS NOT NULL THEN NEW.responded_by := auth.uid(); END IF;
  -- Un UPDATE que no trae hora de captura nueva cuenta como capturado ahora.
  IF TG_OP = 'UPDATE' AND NEW.captured_at IS NOT DISTINCT FROM OLD.captured_at THEN
    v_declared := now();
  ELSE
    v_declared := COALESCE(NEW.captured_at, now());
  END IF;
  SELECT created_at INTO v_floor FROM itrs WHERE id = NEW.itr_id;
  NEW.captured_at := LEAST(now(), GREATEST(v_declared, COALESCE(v_floor, v_declared)));
  NEW.capture_clamped := NEW.captured_at <> v_declared;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.itr_response_times() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS itr_responses_times ON public.itr_responses;
CREATE TRIGGER itr_responses_times
  BEFORE INSERT OR UPDATE ON public.itr_responses
  FOR EACH ROW EXECUTE FUNCTION public.itr_response_times();
