-- FAQ カテゴリのアイコンを自由テキスト絵文字 (iconEmoji VarChar(8)) から
-- キュレーション済みアイコン名 (icon TEXT, SpaceCategory.icon と同方式) に置換する。
-- 既存の絵文字値は無効なアイコン名になるため NULL にクリアする (未選択扱い)。
ALTER TABLE "faq_categories" RENAME COLUMN "iconEmoji" TO "icon";
ALTER TABLE "faq_categories" ALTER COLUMN "icon" TYPE TEXT;
UPDATE "faq_categories" SET "icon" = NULL WHERE "icon" IS NOT NULL;
