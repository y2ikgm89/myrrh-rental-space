-- Migrate Location.access (String, newline-separated) to Location.accessLines (Json string array).
-- Public side already split by newline at render time; this migration removes the semantic gap.

ALTER TABLE "locations"
  ADD COLUMN "accessLines" JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE "locations"
SET "accessLines" = COALESCE(
  (
    SELECT to_jsonb(array_agg(trimmed))
    FROM (
      SELECT NULLIF(btrim(line), '') AS trimmed
      FROM regexp_split_to_table("access", E'
') AS line
    ) AS lines
    WHERE trimmed IS NOT NULL
  ),
  '[]'::jsonb
)
WHERE "access" IS NOT NULL;

ALTER TABLE "locations" DROP COLUMN "access";
