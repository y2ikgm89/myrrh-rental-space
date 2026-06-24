-- CreateEnum
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('OK', 'SOFT_BOUNCED', 'HARD_BOUNCED', 'COMPLAINED');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "emailDeliveryReason" VARCHAR(500),
ADD COLUMN     "emailDeliveryStatus" "EmailDeliveryStatus" NOT NULL DEFAULT 'OK',
ADD COLUMN     "emailDeliveryUpdatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "customers_emailDeliveryStatus_idx" ON "customers"("emailDeliveryStatus");
