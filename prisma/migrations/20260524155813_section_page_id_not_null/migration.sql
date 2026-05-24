-- Make Section.pageId NOT NULL
--
-- Pre-check: SELECT COUNT(*) FROM sections WHERE "pageId" IS NULL → 0 (verified before migration).
-- All sections including home page-hero already have pageId set (seed.ts).
-- Domain command previously rejected null pageId as NOT_FOUND defensively;
-- this migration removes the nullability at the schema level for stronger guarantees.

ALTER TABLE "sections" ALTER COLUMN "pageId" SET NOT NULL;
