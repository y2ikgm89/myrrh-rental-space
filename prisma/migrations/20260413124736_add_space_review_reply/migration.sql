-- AlterTable
ALTER TABLE "space_reviews" ADD COLUMN     "repliedAt" TIMESTAMP(3),
ADD COLUMN     "repliedById" UUID,
ADD COLUMN     "replyBody" VARCHAR(1000);

-- CreateIndex
CREATE INDEX "space_reviews_repliedById_idx" ON "space_reviews"("repliedById");

-- AddForeignKey
ALTER TABLE "space_reviews" ADD CONSTRAINT "space_reviews_repliedById_fkey" FOREIGN KEY ("repliedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
