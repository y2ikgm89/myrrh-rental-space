-- Canonicalize notification recipients to PostgreSQL text[] / Prisma String[].
-- notificationStaffIds was nullable JSONB and notificationEmailAddresses was
-- nullable comma-separated TEXT. This migration is the one-way legacy-storage
-- cutover: after it runs, runtime code accepts and writes arrays only.
-- Intentional destructive clean-break verified by architecture tests:
-- runtime/form/query code no longer reads or writes legacy JSONB or comma text.
-- squawk-ignore-file changing-column-type, adding-not-nullable-field

CREATE OR REPLACE FUNCTION "_jsonb_string_array_to_text_array"(value jsonb)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(array_agg(element #>> '{}' ORDER BY ordinality), ARRAY[]::text[])
  FROM jsonb_array_elements(
    CASE
      WHEN value IS NULL OR jsonb_typeof(value) <> 'array'
        THEN '[]'::jsonb
      ELSE value
    END
  ) WITH ORDINALITY AS items(element, ordinality)
  WHERE jsonb_typeof(element) = 'string'
    AND element #>> '{}' <> ''
$$;

CREATE OR REPLACE FUNCTION "_comma_text_to_text_array"(value text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(array_agg(item ORDER BY ordinality), ARRAY[]::text[])
  FROM unnest(regexp_split_to_array(btrim(COALESCE(value, '')), '\s*,\s*'))
    WITH ORDINALITY AS items(item, ordinality)
  WHERE item <> ''
$$;

ALTER TABLE "settings"
    ALTER COLUMN "notificationStaffIds" TYPE TEXT[]
        USING "_jsonb_string_array_to_text_array"("notificationStaffIds"),
    ALTER COLUMN "notificationStaffIds" SET DEFAULT ARRAY[]::text[],
    ALTER COLUMN "notificationStaffIds" SET NOT NULL,
    ADD CONSTRAINT "Settings_notificationStaffIds_text_array_check"
        CHECK (
            array_position("notificationStaffIds", NULL) IS NULL
            AND array_position("notificationStaffIds", '') IS NULL
        );

ALTER TABLE "settings"
    ALTER COLUMN "notificationEmailAddresses" TYPE TEXT[]
        USING "_comma_text_to_text_array"("notificationEmailAddresses"),
    ALTER COLUMN "notificationEmailAddresses" SET DEFAULT ARRAY[]::text[],
    ALTER COLUMN "notificationEmailAddresses" SET NOT NULL,
    ADD CONSTRAINT "Settings_notificationEmailAddresses_text_array_check"
        CHECK (
            array_position("notificationEmailAddresses", NULL) IS NULL
            AND array_position("notificationEmailAddresses", '') IS NULL
        );

DROP FUNCTION "_jsonb_string_array_to_text_array"(jsonb);
DROP FUNCTION "_comma_text_to_text_array"(text);
