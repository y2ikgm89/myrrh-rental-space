-- Post soft-delete / trash (FAQ / Event と同型)
-- 1. deletedAt 追加（nullable、既存行は null = アクティブ）
-- 2. slug の無条件 unique を partial unique (deletedAt IS NULL) に置換し、
--    ゴミ箱中の slug を新規投稿で再利用可能にする

-- AlterTable
ALTER TABLE "posts" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "posts_deletedAt_idx" ON "posts"("deletedAt");

-- DropIndex
DROP INDEX "posts_slug_key";

-- CreateIndex
CREATE UNIQUE INDEX "posts_slug_active_key" ON "posts"("slug") WHERE ("deletedAt" IS NULL);
