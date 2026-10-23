-- Extensiones de plataforma que usan las migraciones (2026-10-22). En prod ya estaban (se activaron desde el panel);
-- un proyecto nuevo no trae pg_cron ni pg_net, y `cron.schedule` (20261107120000) y `net.http_post` (outbox, S21)
-- fallarían. Mismos esquemas que en prod. supabase_vault viene activa en todo proyecto.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
