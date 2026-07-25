-- AlterTable
ALTER TABLE "posts" ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "posts_viewCount_idx" ON "posts"("viewCount");

-- CreateIndex
CREATE INDEX "posts_status_viewCount_idx" ON "posts"("status", "viewCount");
