-- A02 (ola 1, revisión 2026-10-23 hallazgo 2): identidad y fechas de la evidencia del ITR.
--
-- Cada captura (foto o PDF) lleva un UUID que genera el dispositivo al tomarla (`capture_id`) y una ruta de
-- storage fija derivada de él: reenviar la misma captura N veces da un objeto y un adjunto. `captured_at` pasa a
-- ser la hora del dispositivo (acotada como en itr_responses: no antes de crear el ITR ni después de ahora,
-- `capture_clamped` marca el ajuste) y `uploaded_at` la hora en que la BD la recibió.
--
-- Antes de A02 `captured_at` era la hora del servidor al insertar: es exactamente la hora de subida de esas
-- filas, así que se copia a `uploaded_at` (con los triggers apagados: el guard rechaza tocar ITR firmados).

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.itr_attachments
  ADD COLUMN IF NOT EXISTS capture_id uuid,
  ADD COLUMN IF NOT EXISTS uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS capture_clamped boolean NOT NULL DEFAULT false;

ALTER TABLE public.itr_attachments DISABLE TRIGGER USER;
UPDATE public.itr_attachments SET uploaded_at = captured_at WHERE uploaded_at IS NULL;
ALTER TABLE public.itr_attachments ENABLE TRIGGER USER;

ALTER TABLE public.itr_attachments
  ALTER COLUMN uploaded_at SET DEFAULT now(),
  ALTER COLUMN uploaded_at SET NOT NULL;

COMMENT ON COLUMN public.itr_attachments.capture_id IS 'A02: UUID de la captura generado en el dispositivo; único (reenviar no duplica). NULL = adjunto anterior a A02.';
COMMENT ON COLUMN public.itr_attachments.captured_at IS 'A02: hora de captura declarada por el dispositivo, acotada a [creación del ITR, recepción]. Antes de A02 = hora del servidor.';
COMMENT ON COLUMN public.itr_attachments.uploaded_at IS 'A02: hora en que la BD recibió el adjunto (la fija el trigger).';
COMMENT ON COLUMN public.itr_attachments.capture_clamped IS 'A02: true si la hora del dispositivo quedó fuera del rango y se ajustó.';

CREATE UNIQUE INDEX IF NOT EXISTS itr_attachments_capture_id_key ON public.itr_attachments (capture_id);

CREATE OR REPLACE FUNCTION public.itr_attachment_times()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_floor timestamptz; v_declared timestamptz;
BEGIN
  -- La identidad y las horas de una evidencia no cambian después de recibirla.
  IF TG_OP = 'UPDATE' THEN
    NEW.capture_id := OLD.capture_id;
    NEW.captured_at := OLD.captured_at;
    NEW.uploaded_at := OLD.uploaded_at;
    NEW.capture_clamped := OLD.capture_clamped;
    RETURN NEW;
  END IF;
  NEW.uploaded_at := now();
  v_declared := COALESCE(NEW.captured_at, now());
  SELECT created_at INTO v_floor FROM itrs WHERE id = NEW.itr_id;
  NEW.captured_at := LEAST(now(), GREATEST(v_declared, COALESCE(v_floor, v_declared)));
  NEW.capture_clamped := NEW.captured_at <> v_declared;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.itr_attachment_times() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS itr_attachments_times ON public.itr_attachments;
CREATE TRIGGER itr_attachments_times
  BEFORE INSERT OR UPDATE ON public.itr_attachments
  FOR EACH ROW EXECUTE FUNCTION public.itr_attachment_times();
