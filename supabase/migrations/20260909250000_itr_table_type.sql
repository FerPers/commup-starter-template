-- Tipo de ítem `table` (matriz de registro con columnas declaradas).
-- El valor del enum debe confirmarse antes de usarse: la evaluación y las
-- restricciones van en la migración siguiente (20260909251000).
ALTER TYPE public.itr_item_type ADD VALUE IF NOT EXISTS 'table';
