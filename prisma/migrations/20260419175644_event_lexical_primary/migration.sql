-- Event 本文を Lexical JSON primary に移行
-- description(String?) + contentJson(Json?) → descriptionJson + descriptionHtml + descriptionPlainText

-- 1. 新 3 列を nullable で追加
ALTER TABLE "events" ADD COLUMN "descriptionJson" JSONB;
ALTER TABLE "events" ADD COLUMN "descriptionHtml" TEXT;
ALTER TABLE "events" ADD COLUMN "descriptionPlainText" TEXT;

-- 2. 既存 description から単一段落 Lexical JSON + HTML + plainText を生成
--    contentJson が非 null ならそれを JSON 正本として優先
UPDATE "events"
SET
  "descriptionJson" = COALESCE(
    "contentJson",
    CASE
      WHEN "description" IS NULL OR TRIM("description") = ''
      THEN '{"root":{"type":"root","format":"","indent":0,"version":1,"direction":"ltr","children":[{"type":"paragraph","format":"","indent":0,"version":1,"direction":"ltr","textFormat":0,"textStyle":"","children":[]}]}}'::jsonb
      ELSE jsonb_build_object(
        'root', jsonb_build_object(
          'type', 'root',
          'format', '',
          'indent', 0,
          'version', 1,
          'direction', 'ltr',
          'children', jsonb_build_array(
            jsonb_build_object(
              'type', 'paragraph',
              'format', '',
              'indent', 0,
              'version', 1,
              'direction', 'ltr',
              'textFormat', 0,
              'textStyle', '',
              'children', jsonb_build_array(
                jsonb_build_object(
                  'type', 'text',
                  'text', "description",
                  'detail', 0,
                  'format', 0,
                  'mode', 'normal',
                  'style', '',
                  'version', 1
                )
              )
            )
          )
        )
      )
    END
  ),
  "descriptionHtml" = CASE
    WHEN "description" IS NULL OR TRIM("description") = ''
    THEN ''
    ELSE '<p>' || REPLACE(REPLACE(REPLACE("description", '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</p>'
  END,
  "descriptionPlainText" = COALESCE("description", '');

-- 3. NOT NULL 制約付与
ALTER TABLE "events" ALTER COLUMN "descriptionJson" SET NOT NULL;
ALTER TABLE "events" ALTER COLUMN "descriptionHtml" SET NOT NULL;
ALTER TABLE "events" ALTER COLUMN "descriptionPlainText" SET NOT NULL;

-- 4. 旧列削除
ALTER TABLE "events" DROP COLUMN "description";
ALTER TABLE "events" DROP COLUMN "contentJson";
