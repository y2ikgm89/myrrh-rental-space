-- Migration: AnnouncementBar message を Sanity Portable Text 互換 spans 配列化
--
-- baseline (type AnnouncementBarType + message VARCHAR(200)) から
-- 最終形 (message Json (PortableTextSpan[])) への単一 data-preserving 変換。
--
-- type 列の info / warning / promo は curated icon を先頭 inline-icon span として
-- 保全し、本文 plain text は span として後続。WCAG 1.4.1 準拠の icon prefix を
-- データ層で集約する。

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. message_new (Json) 列を追加
ALTER TABLE "announcement_bars" ADD COLUMN "message_new" JSONB;

-- 2. 既存 type + message を spans 配列に変換（icon prefix + text span の 2 要素）
UPDATE "announcement_bars"
SET "message_new" = (
  CASE "type"
    WHEN 'info' THEN jsonb_build_array(
      jsonb_build_object('_key', gen_random_uuid()::text, '_type', 'iconInline', 'name', 'IconInfoCircle'),
      jsonb_build_object('_key', gen_random_uuid()::text, '_type', 'span', 'text', "message")
    )
    WHEN 'warning' THEN jsonb_build_array(
      jsonb_build_object('_key', gen_random_uuid()::text, '_type', 'iconInline', 'name', 'IconAlertTriangle'),
      jsonb_build_object('_key', gen_random_uuid()::text, '_type', 'span', 'text', "message")
    )
    WHEN 'promo' THEN jsonb_build_array(
      jsonb_build_object('_key', gen_random_uuid()::text, '_type', 'iconInline', 'name', 'IconSparkles'),
      jsonb_build_object('_key', gen_random_uuid()::text, '_type', 'span', 'text', "message")
    )
  END
);

-- 3. 旧列削除
ALTER TABLE "announcement_bars" DROP COLUMN "message";
ALTER TABLE "announcement_bars" DROP COLUMN "type";

-- 4. message_new を message に rename + NOT NULL + default 空配列
ALTER TABLE "announcement_bars" RENAME COLUMN "message_new" TO "message";
ALTER TABLE "announcement_bars" ALTER COLUMN "message" SET DEFAULT '[]'::jsonb;
UPDATE "announcement_bars" SET "message" = '[]'::jsonb WHERE "message" IS NULL;
ALTER TABLE "announcement_bars" ALTER COLUMN "message" SET NOT NULL;

-- 5. AnnouncementBarType enum を削除（参照する列が消えたため）
DROP TYPE "AnnouncementBarType";
