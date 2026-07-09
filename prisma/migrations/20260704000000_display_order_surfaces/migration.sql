-- Clean-break display order terminology for public/admin ordered surfaces.
-- Prisma cannot infer semantic column renames; keep the final schema explicit.

DROP INDEX IF EXISTS "terms_documents_showInFooter_isPublished_footerOrder_idx";
-- Clean break: old Cloud Run revisions are drained before this migration by the breaking migration deploy path.
-- squawk-ignore renaming-column
ALTER TABLE "terms_documents" RENAME COLUMN "footerOrder" TO "displayOrder";
CREATE INDEX "terms_documents_showInFooter_isPublished_displayOrder_idx"
  ON "terms_documents"("showInFooter", "isPublished", "displayOrder");

DROP INDEX IF EXISTS "announcement_bars_isActive_priority_idx";
ALTER TABLE "announcement_bars" ADD COLUMN "displayOrder" INTEGER;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      ORDER BY "priority" DESC, "createdAt" DESC, "id" ASC
    ) - 1 AS "displayOrder"
  FROM "announcement_bars"
)
UPDATE "announcement_bars"
SET "displayOrder" = ranked."displayOrder"
FROM ranked
WHERE "announcement_bars"."id" = ranked."id";

-- Safe here: displayOrder is backfilled for every existing row before the constraint is applied.
-- squawk-ignore adding-not-nullable-field
ALTER TABLE "announcement_bars" ALTER COLUMN "displayOrder" SET NOT NULL;
ALTER TABLE "announcement_bars" ALTER COLUMN "displayOrder" SET DEFAULT 0;
-- Clean break: old priority reads/writes are removed and old revisions are drained before migration.
-- squawk-ignore ban-drop-column
ALTER TABLE "announcement_bars" DROP COLUMN "priority";
CREATE INDEX "announcement_bars_isActive_displayOrder_idx"
  ON "announcement_bars"("isActive", "displayOrder");
