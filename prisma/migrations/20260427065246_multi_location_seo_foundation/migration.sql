-- Step 1: Location に新規カラム追加（NULL 許容で既存行影響なし）
ALTER TABLE "locations"
  ADD COLUMN "slug"                    VARCHAR(255),
  ADD COLUMN "postalCode"              TEXT,
  ADD COLUMN "prefecture"              TEXT,
  ADD COLUMN "city"                    TEXT,
  ADD COLUMN "streetAddress"           TEXT,
  ADD COLUMN "buildingName"            TEXT,
  ADD COLUMN "specialHolidays"         JSONB,
  ADD COLUMN "latitude"                DOUBLE PRECISION,
  ADD COLUMN "longitude"               DOUBLE PRECISION,
  ADD COLUMN "googleBusinessPlaceId"   TEXT,
  ADD COLUMN "googleReviewUrl"         TEXT,
  ADD COLUMN "priceRange"              VARCHAR(100),
  ADD COLUMN "paymentAccepted"         TEXT,
  ADD COLUMN "phoneNumber"             TEXT,
  ADD COLUMN "email"                   TEXT;

-- Step 2: 既存 Location 全件に placeholder slug を採番
UPDATE "locations"
SET "slug" = 'location-' || SUBSTRING(REPLACE("id"::text, '-', '') FROM 1 FOR 8)
WHERE "slug" IS NULL;

-- Step 3: 既存 Settings の MEO データを「最初の Location」に移管
UPDATE "locations" SET
  "latitude"              = COALESCE("latitude",              (SELECT "latitude"              FROM "settings" WHERE "id" = 'singleton')),
  "longitude"             = COALESCE("longitude",             (SELECT "longitude"             FROM "settings" WHERE "id" = 'singleton')),
  "googleBusinessPlaceId" = COALESCE("googleBusinessPlaceId", (SELECT "googleBusinessPlaceId" FROM "settings" WHERE "id" = 'singleton')),
  "googleReviewUrl"       = COALESCE("googleReviewUrl",       (SELECT "googleReviewUrl"       FROM "settings" WHERE "id" = 'singleton')),
  "priceRange"            = COALESCE("priceRange",            (SELECT "priceRange"            FROM "settings" WHERE "id" = 'singleton')),
  "paymentAccepted"       = COALESCE("paymentAccepted",       (SELECT "paymentAccepted"       FROM "settings" WHERE "id" = 'singleton')),
  "amenities"             = COALESCE("amenities", '{}'::jsonb) || COALESCE((SELECT "businessAttributes" FROM "settings" WHERE "id" = 'singleton'), '{}'::jsonb),
  "specialHolidays"       = COALESCE("specialHolidays",       (SELECT "specialHolidays"       FROM "settings" WHERE "id" = 'singleton')),
  "postalCode"            = COALESCE("postalCode",            (SELECT "postalCode"            FROM "settings" WHERE "id" = 'singleton')),
  "prefecture"            = COALESCE("prefecture",            (SELECT "prefecture"            FROM "settings" WHERE "id" = 'singleton')),
  "city"                  = COALESCE("city",                  (SELECT "city"                  FROM "settings" WHERE "id" = 'singleton')),
  "streetAddress"         = COALESCE("streetAddress",         (SELECT "streetAddress"         FROM "settings" WHERE "id" = 'singleton')),
  "buildingName"          = COALESCE("buildingName",          (SELECT "buildingName"          FROM "settings" WHERE "id" = 'singleton')),
  "phoneNumber"           = COALESCE("phoneNumber",           (SELECT "phoneNumber"           FROM "settings" WHERE "id" = 'singleton')),
  "email"                 = COALESCE("email",                 (SELECT "email"                 FROM "settings" WHERE "id" = 'singleton'))
WHERE "id" = (SELECT "id" FROM "locations" ORDER BY "sortOrder" ASC, "createdAt" ASC LIMIT 1);

-- Step 4: slug NOT NULL + UNIQUE 制約
ALTER TABLE "locations" ALTER COLUMN "slug" SET NOT NULL;
ALTER TABLE "locations" ADD CONSTRAINT "locations_slug_key" UNIQUE ("slug");

-- Step 5: Settings から MEO フィールド削除
ALTER TABLE "settings"
  DROP COLUMN "latitude",
  DROP COLUMN "longitude",
  DROP COLUMN "priceRange",
  DROP COLUMN "googleBusinessPlaceId",
  DROP COLUMN "googleReviewUrl",
  DROP COLUMN "businessAttributes",
  DROP COLUMN "paymentAccepted",
  DROP COLUMN "specialHolidays";
