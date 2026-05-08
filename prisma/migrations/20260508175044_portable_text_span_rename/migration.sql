-- Portable Text span rename migration
-- Transform ButtonLabelToken shape:
--   {_key, type:"text", value:X} -> {_key, _type:"span", text:X}
--   {_key, type:"icon", name:Y}  -> {_key, _type:"iconInline", name:Y}

-- 1. navigation_items.label (Json array of tokens)
UPDATE navigation_items
SET label = (
  SELECT jsonb_agg(
    CASE
      WHEN token->>'type' = 'text'
        THEN jsonb_build_object('_key', token->'_key', '_type', to_jsonb('span'::text), 'text', token->'value')
      WHEN token->>'type' = 'icon'
        THEN jsonb_build_object('_key', token->'_key', '_type', to_jsonb('iconInline'::text), 'name', token->'name')
      ELSE token
    END
  )
  FROM jsonb_array_elements(label::jsonb) AS token
)
WHERE label IS NOT NULL
  AND label::text != 'null'
  AND label::text != '[]'
  AND jsonb_typeof(label::jsonb) = 'array';

-- 2. sections.config buttons[].label (nested Json)
UPDATE sections
SET config = (
  SELECT jsonb_set(
    config::jsonb,
    '{buttons}',
    (
      SELECT jsonb_agg(
        CASE
          WHEN button ? 'label'
            THEN jsonb_set(
              button,
              '{label}',
              (
                SELECT jsonb_agg(
                  CASE
                    WHEN token->>'type' = 'text'
                      THEN jsonb_build_object('_key', token->'_key', '_type', to_jsonb('span'::text), 'text', token->'value')
                    WHEN token->>'type' = 'icon'
                      THEN jsonb_build_object('_key', token->'_key', '_type', to_jsonb('iconInline'::text), 'name', token->'name')
                    ELSE token
                  END
                )
                FROM jsonb_array_elements(button->'label') AS token
              )
            )
          ELSE button
        END
      )
      FROM jsonb_array_elements(config::jsonb->'buttons') AS button
    )
  )
)
WHERE config IS NOT NULL
  AND config::text != 'null'
  AND jsonb_typeof(config::jsonb) = 'object'
  AND config::jsonb ? 'buttons'
  AND jsonb_typeof(config::jsonb->'buttons') = 'array'
  AND jsonb_array_length(config::jsonb->'buttons') > 0;
