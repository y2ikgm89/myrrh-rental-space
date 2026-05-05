-- Drop terms-related tables, FKs, and enum types (clean-break rebuild)

-- 1. Drop foreign keys referencing TermsVersion / Terms / TermsAgreement first
ALTER TABLE "terms_agreements" DROP CONSTRAINT IF EXISTS "terms_agreements_termsId_fkey";
ALTER TABLE "terms_agreements" DROP CONSTRAINT IF EXISTS "terms_agreements_versionId_fkey";
ALTER TABLE "terms_agreements" DROP CONSTRAINT IF EXISTS "terms_agreements_reservationId_fkey";
ALTER TABLE "terms_agreements" DROP CONSTRAINT IF EXISTS "terms_agreements_userId_fkey";

ALTER TABLE "terms_versions" DROP CONSTRAINT IF EXISTS "terms_versions_termsId_fkey";
ALTER TABLE "terms_versions" DROP CONSTRAINT IF EXISTS "terms_versions_createdBy_fkey";
ALTER TABLE "terms_versions" DROP CONSTRAINT IF EXISTS "terms_versions_publishedBy_fkey";

-- 2. Drop Space.termsId column (FK first then column)
ALTER TABLE "spaces" DROP CONSTRAINT IF EXISTS "spaces_termsId_fkey";
ALTER TABLE "spaces" DROP COLUMN IF EXISTS "termsId";

-- 3. Drop tables
DROP TABLE IF EXISTS "terms_agreements";
DROP TABLE IF EXISTS "terms_versions";
DROP TABLE IF EXISTS "terms";

-- 4. Drop enum types
DROP TYPE IF EXISTS "TermsType";
DROP TYPE IF EXISTS "TermsStatus";
