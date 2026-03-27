-- AlterTable
ALTER TABLE "inquiries" ADD COLUMN     "repliedAt" TIMESTAMP(3),
ADD COLUMN     "repliedById" UUID,
ADD COLUMN     "replyMessage" TEXT;

-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" UUID;

-- CreateIndex
CREATE INDEX "reservations_deletedAt_idx" ON "reservations"("deletedAt");

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_repliedById_fkey" FOREIGN KEY ("repliedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
