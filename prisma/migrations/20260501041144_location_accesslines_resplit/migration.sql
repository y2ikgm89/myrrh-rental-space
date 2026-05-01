-- Recover from previous migration: accessLines values still contain literal newlines.
-- Re-split each element by [\r\n]+ regex to handle CRLF/LF mixing.

UPDATE "locations"
SET "accessLines" = COALESCE(
  (
    SELECT to_jsonb(array_agg(trimmed))
    FROM (
      SELECT NULLIF(btrim(line), '') AS trimmed
      FROM jsonb_array_elements_text("accessLines") AS elem,
           regexp_split_to_table(elem, E'[\r\n]+') AS line
    ) AS lines
    WHERE trimmed IS NOT NULL
  ),
  '[]'::jsonb
)
WHERE jsonb_array_length("accessLines") > 0;
