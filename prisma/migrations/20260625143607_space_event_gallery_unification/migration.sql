-- Big-bang migration: imageUrls (string[]) -> gallery (GalleryItem[])
-- Spaces + Events 統一。pre-release / アクティブユーザー無による migrations.md 例外条項適用。
-- Precedent: 20260507163006_space_facilities_to_object_array (jsonb_agg + jsonb_build_object).
-- Prisma が migration 全体を 1 transaction で包むためアトミック。

-- ============ SPACES ============

ALTER TABLE "spaces" ADD COLUMN "gallery" JSONB NOT NULL DEFAULT '[]';

UPDATE "spaces"
SET "gallery" = COALESCE(
  (
    SELECT jsonb_agg(
      jsonb_build_object('url', value, 'alt', '', 'caption', '')
    )
    FROM jsonb_array_elements_text("imageUrls")
  ),
  '[]'::jsonb
)
WHERE jsonb_typeof("imageUrls") = 'array' AND jsonb_array_length("imageUrls") > 0;

-- squawk-ignore ban-drop-column
ALTER TABLE "spaces" DROP COLUMN "imageUrls";

-- ============ EVENTS ============

ALTER TABLE "events" ADD COLUMN "gallery" JSONB NOT NULL DEFAULT '[]';
