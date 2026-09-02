-- La importación de señales hace upsert con ON CONFLICT (tag_id, signal_tag),
-- pero la tabla nunca tuvo esa restricción: cada fila fallaba con
-- "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification". La tabla está vacía en prod, así que el índice se crea sin
-- riesgo de colisiones.

create unique index if not exists signals_tag_id_signal_tag_key
  on public.signals (tag_id, signal_tag);
