-- AlterTable
ALTER TABLE "faq_categories" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "iconEmoji" VARCHAR(8);

-- AlterTable
ALTER TABLE "faq_items" ADD COLUMN     "answerPlainText" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "faq_categories_deletedAt_idx" ON "faq_categories"("deletedAt");

-- CreateIndex
CREATE INDEX "faq_items_deletedAt_idx" ON "faq_items"("deletedAt");

-- CreateIndex
CREATE INDEX "faq_items_updatedAt_idx" ON "faq_items"("updatedAt");
