-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "flagReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "flaggedForReviewAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "customers_flaggedForReviewAt_idx" ON "customers"("flaggedForReviewAt");
