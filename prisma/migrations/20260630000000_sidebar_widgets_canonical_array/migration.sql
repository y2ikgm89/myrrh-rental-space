-- Canonicalize settings.sidebarWidgets to the array shape used by validation/UI.
-- This removes the legacy object default and leaves compatibility at the data
-- migration boundary instead of in runtime parsing.

UPDATE "settings"
SET "sidebarWidgets" = jsonb_build_array(
    jsonb_build_object(
        'type',
        'search',
        'enabled',
        CASE
            WHEN jsonb_typeof("sidebarWidgets" -> 'search') = 'boolean'
                THEN ("sidebarWidgets" ->> 'search')::boolean
            ELSE true
        END
    ),
    jsonb_build_object(
        'type',
        'recent',
        'enabled',
        CASE
            WHEN jsonb_typeof("sidebarWidgets" -> 'recent') = 'boolean'
                THEN ("sidebarWidgets" ->> 'recent')::boolean
            ELSE true
        END,
        'layout',
        'compact'
    ),
    jsonb_build_object(
        'type',
        'popular',
        'enabled',
        CASE
            WHEN jsonb_typeof("sidebarWidgets" -> 'popular') = 'boolean'
                THEN ("sidebarWidgets" ->> 'popular')::boolean
            ELSE true
        END,
        'layout',
        'compact',
        'showRanking',
        true
    ),
    jsonb_build_object(
        'type',
        'categories',
        'enabled',
        CASE
            WHEN jsonb_typeof("sidebarWidgets" -> 'categories') = 'boolean'
                THEN ("sidebarWidgets" ->> 'categories')::boolean
            ELSE true
        END
    ),
    jsonb_build_object(
        'type',
        'tags',
        'enabled',
        CASE
            WHEN jsonb_typeof("sidebarWidgets" -> 'tags') = 'boolean'
                THEN ("sidebarWidgets" ->> 'tags')::boolean
            ELSE true
        END
    )
)
WHERE jsonb_typeof("sidebarWidgets") = 'object';

ALTER TABLE "settings"
    ALTER COLUMN "sidebarWidgets" SET DEFAULT '[{"type":"search","enabled":true},{"type":"recent","enabled":true,"layout":"compact"},{"type":"popular","enabled":true,"layout":"compact","showRanking":true},{"type":"categories","enabled":true},{"type":"tags","enabled":true}]'::jsonb,
    ADD CONSTRAINT "Settings_sidebarWidgets_array_check"
        CHECK (jsonb_typeof("sidebarWidgets") = 'array');
