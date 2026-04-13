-- Stage 7.2 — Conditional Logic entre Items
-- Run in Supabase SQL Editor

ALTER TABLE itr_template_items
  ADD COLUMN IF NOT EXISTS condition_item_id UUID REFERENCES itr_template_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS condition_value   TEXT;

COMMENT ON COLUMN itr_template_items.condition_item_id IS
  'If set, this item is only shown/required when the referenced item has condition_value';
COMMENT ON COLUMN itr_template_items.condition_value IS
  'Expected value of condition_item for this item to be visible. For yes_no/checkbox: ''true'' or ''false''. For select: exact option value. For text/number: exact string match.';

CREATE INDEX IF NOT EXISTS idx_itr_template_items_condition
  ON itr_template_items(condition_item_id)
  WHERE condition_item_id IS NOT NULL;
