-- A02: revisión SOLO LECTURA de la evidencia del ITR (objetos de storage frente a filas de itr_attachments).
-- Antes de A02 cada reintento subía con una ruta nueva: puede haber objetos sin adjunto (huérfanos) o el mismo
-- binario dos veces en un ITR. Esto solo cuenta y lista; cualquier limpieza se decide aparte, conservando la
-- evidencia válida. Correr con `supabase db query --linked < scripts/db/itr-evidence-audit.sql` o en la local.
SET statement_timeout = '30s';

SELECT
  (SELECT count(*) FROM public.itr_attachments) AS adjuntos,
  (SELECT count(*) FROM public.itr_attachments WHERE capture_id IS NULL) AS adjuntos_sin_capture_id,
  (SELECT count(*) FROM storage.objects WHERE bucket_id = 'itr-attachments') AS objetos,
  (SELECT count(*) FROM storage.objects o WHERE o.bucket_id = 'itr-attachments'
     AND NOT EXISTS (SELECT 1 FROM public.itr_attachments a WHERE a.file_url = o.name)) AS objetos_huerfanos,
  (SELECT count(*) FROM public.itr_attachments a WHERE NOT EXISTS (
     SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'itr-attachments' AND o.name = a.file_url)) AS adjuntos_sin_objeto,
  (SELECT count(*) FROM (
     SELECT split_part(o.name, '/', 1), o.metadata->>'eTag' FROM storage.objects o
     WHERE o.bucket_id = 'itr-attachments' GROUP BY 1, 2 HAVING count(*) > 1) d) AS binarios_repetidos_por_itr;

-- Detalle de huérfanos (ruta, tamaño, fecha, si su ITR existe).
SELECT o.name, (o.metadata->>'size')::bigint AS bytes, o.created_at,
       EXISTS (SELECT 1 FROM public.itrs i WHERE i.id::text = split_part(o.name, '/', 1)) AS itr_existe
FROM storage.objects o
WHERE o.bucket_id = 'itr-attachments'
  AND NOT EXISTS (SELECT 1 FROM public.itr_attachments a WHERE a.file_url = o.name)
ORDER BY o.created_at
LIMIT 200;
