-- ══════════════════════════════════════════════════════════════
-- Stage 11.2 — Trigger evaluator on domain_events
-- ══════════════════════════════════════════════════════════════
-- Después de cada INSERT en domain_events, dispara una llamada
-- HTTP async vía pg_net a la edge function `evaluate-workflow`.
-- La función decide qué reglas aplicar y ejecuta las acciones.
--
-- Requisitos:
--   - extension pg_net habilitada
--   - vault secret 'edge_function_url' con URL base de funciones
--   - vault secret 'service_role_key' con la service role key
--
-- Setup previo (una vez):
--   CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
--   SELECT vault.create_secret('https://mdyljpgzvigzjpqluket.supabase.co/functions/v1/evaluate-workflow', 'edge_function_url');
--   SELECT vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
-- ══════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ── Función que dispara la llamada async ──────────────────────
CREATE OR REPLACE FUNCTION dispatch_workflow_evaluator()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url           TEXT;
  v_service_key   TEXT;
BEGIN
  -- Leer secrets del vault (fallo silencioso si faltan para no romper INSERTs)
  BEGIN
    SELECT decrypted_secret INTO v_url
      FROM vault.decrypted_secrets WHERE name = 'edge_function_url';
    SELECT decrypted_secret INTO v_service_key
      FROM vault.decrypted_secrets WHERE name = 'service_role_key';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'workflow evaluator: vault secrets missing';
    RETURN NEW;
  END;

  IF v_url IS NULL OR v_service_key IS NULL THEN
    RAISE WARNING 'workflow evaluator: vault secrets missing';
    RETURN NEW;
  END IF;

  -- Llamada HTTP async (no bloquea el INSERT)
  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body    := jsonb_build_object('event_id', NEW.id),
    timeout_milliseconds := 5000
  );

  RETURN NEW;
END $$;

-- ── Trigger ───────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_dispatch_workflow_evaluator ON domain_events;
CREATE TRIGGER trg_dispatch_workflow_evaluator
  AFTER INSERT ON domain_events
  FOR EACH ROW EXECUTE FUNCTION dispatch_workflow_evaluator();

-- ══════════════════════════════════════════════════════════════
-- Fin Stage 11.2
-- ══════════════════════════════════════════════════════════════
