-- Convert Space.facilities from string[] to { name: string; iconName: string }[]
-- Idempotent: 既に object 化されたレコードは skip
UPDATE spaces
SET facilities = COALESCE(
  (
    SELECT jsonb_agg(jsonb_build_object('name', value, 'iconName', ''))
    FROM jsonb_array_elements_text(facilities)
  ),
  '[]'::jsonb
)
WHERE jsonb_typeof(facilities) = 'array'
  AND jsonb_array_length(facilities) > 0
  AND jsonb_typeof(facilities -> 0) = 'string';
