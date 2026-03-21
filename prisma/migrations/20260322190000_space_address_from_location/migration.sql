-- スペース住所: 建物は Location.address を正本とし、Space は addressDetail（号室等）のみ保持。
-- locationId 必須化、FK は RESTRICT（アプリのソフト削除と整合）。

ALTER TABLE "spaces" ADD COLUMN "addressDetail" TEXT;

-- 拠点が1件も無いのにスペースだけある環境向けフォールバック
INSERT INTO "locations" (
    "id",
    "name",
    "description",
    "address",
    "access",
    "imageUrl",
    "imageUrls",
    "sortOrder",
    "isPublished",
    "isActive",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid(),
    '移行用拠点',
    NULL,
    '住所未設定（拠点マスタで編集してください）',
    NULL,
    'https://placehold.co/800x600/e2e8f0/64748b?text=Location',
    '[]'::jsonb,
    999,
    false,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "spaces" WHERE "locationId" IS NULL)
  AND NOT EXISTS (SELECT 1 FROM "locations");

UPDATE "spaces" AS s
SET "locationId" = (
  SELECT l."id"
  FROM "locations" AS l
  ORDER BY l."isActive" DESC, l."sortOrder" ASC, l."createdAt" ASC
  LIMIT 1
)
WHERE s."locationId" IS NULL;

UPDATE "spaces" AS s
SET "addressDetail" = CASE
  WHEN TRIM(s."address") = TRIM(l."address") THEN NULL
  WHEN l."address" IS NOT NULL
    AND TRIM(s."address") LIKE TRIM(l."address") || '%'
    AND LENGTH(TRIM(s."address")) > LENGTH(TRIM(l."address"))
  THEN NULLIF(
    TRIM(
      SUBSTRING(
        TRIM(s."address")
        FROM (LENGTH(TRIM(l."address")) + 1)
      )
    ),
    ''
  )
  ELSE TRIM(s."address")
END
FROM "locations" AS l
WHERE s."locationId" = l."id";

ALTER TABLE "spaces" DROP CONSTRAINT "spaces_locationId_fkey";
ALTER TABLE "spaces" DROP CONSTRAINT "spaces_categoryId_fkey";

DROP INDEX IF EXISTS "spaces_address_idx";

ALTER TABLE "spaces" DROP COLUMN "address";
ALTER TABLE "spaces" ALTER COLUMN "locationId" SET NOT NULL;

ALTER TABLE "spaces"
ADD CONSTRAINT "spaces_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "locations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "spaces"
ADD CONSTRAINT "spaces_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "space_categories"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "spaces_addressDetail_idx" ON "spaces"("addressDetail");
