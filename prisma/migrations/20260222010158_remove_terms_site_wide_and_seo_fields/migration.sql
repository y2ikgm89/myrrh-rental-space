-- AlterTable: Remove isSiteWide and SEO fields from terms table
ALTER TABLE "terms" DROP COLUMN IF EXISTS "isSiteWide";
ALTER TABLE "terms" DROP COLUMN IF EXISTS "metaDescription";
ALTER TABLE "terms" DROP COLUMN IF EXISTS "metaKeywords";
ALTER TABLE "terms" DROP COLUMN IF EXISTS "ogpTitle";
ALTER TABLE "terms" DROP COLUMN IF EXISTS "ogpDescription";
ALTER TABLE "terms" DROP COLUMN IF EXISTS "ogpImageUrl";

-- DropIndex
DROP INDEX IF EXISTS "terms_type_isSiteWide_idx";
