-- AlterTable
ALTER TABLE "faq_items" ADD COLUMN     "lastViewedAt" TIMESTAMP(3),
ADD COLUMN     "viewCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "faq_items_viewCount_idx" ON "faq_items"("viewCount");
