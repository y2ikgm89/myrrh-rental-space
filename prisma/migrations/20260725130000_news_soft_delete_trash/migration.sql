-- News soft-delete / trash (Post / FAQ / Event と同型)
-- 1. deletedAt 追加（nullable、既存行は null = アクティブ）
-- 2. slug の無条件 unique を partial unique (deletedAt IS NULL) に置換し、
--    ゴミ箱中の slug を新規お知らせで再利用可能にする

-- AlterTable
ALTER TABLE "news" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "news_deletedAt_idx" ON "news"("deletedAt");

-- DropIndex
DROP INDEX "news_slug_key";

-- CreateIndex
CREATE UNIQUE INDEX "news_slug_active_key" ON "news"("slug") WHERE ("deletedAt" IS NULL);
