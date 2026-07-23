-- CreateTable
-- id has no DB-level default (matches this repo's convention for @default(uuid())
-- columns elsewhere, e.g. locations/space_categories: Prisma supplies the value
-- client-side on every insert; the seed INSERT below also supplies it explicitly).
CREATE TABLE "event_categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_categories_name_active_key" ON "event_categories"("name") WHERE "isActive" = true;

-- CreateIndex
CREATE UNIQUE INDEX "event_categories_sortOrder_key" ON "event_categories"("sortOrder");

-- CreateIndex
CREATE INDEX "event_categories_sortOrder_idx" ON "event_categories"("sortOrder");

-- Seed a default category so existing events have somewhere to backfill to.
INSERT INTO "event_categories" ("id", "name", "sortOrder", "isActive", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), '未分類', 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- AlterTable: add categoryId as nullable first (expand step, no data yet)
ALTER TABLE "events" ADD COLUMN "categoryId" UUID;

-- Backfill: assign every existing event to the "未分類" category
UPDATE "events"
SET "categoryId" = (SELECT "id" FROM "event_categories" WHERE "name" = '未分類' LIMIT 1)
WHERE "categoryId" IS NULL;

-- AlterTable: contract step — make it required. This is the line that triggers
-- the deploy pipeline's breaking-migration detection (.github/workflows/deploy-production.yml:357)
-- squawk-ignore adding-not-nullable-field
ALTER TABLE "events" ALTER COLUMN "categoryId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "event_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "events_categoryId_idx" ON "events"("categoryId");
