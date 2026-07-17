-- CreateEnum
CREATE TYPE "ReservationSeriesFreq" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- AlterEnum
ALTER TYPE "TermsScope" ADD VALUE 'RESERVATION_SERIES';

-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "recurrenceInstanceIndex" INTEGER,
ADD COLUMN     "seriesId" UUID;

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "maxRecurrenceInstances" INTEGER NOT NULL DEFAULT 26;

-- CreateTable
CREATE TABLE "reservation_series" (
    "id" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "couponId" UUID,
    "rrule" VARCHAR(500) NOT NULL,
    "dtstart" TIMESTAMP(6) NOT NULL,
    "duration" INTEGER NOT NULL,
    "instanceCount" INTEGER NOT NULL,
    "templateData" JSONB NOT NULL,
    "agreementSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelledByType" VARCHAR(20),
    "cancellationReason" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,

    CONSTRAINT "reservation_series_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reservation_series_spaceId_dtstart_idx" ON "reservation_series"("spaceId", "dtstart");

-- CreateIndex
CREATE INDEX "reservation_series_customerId_idx" ON "reservation_series"("customerId");

-- CreateIndex
CREATE INDEX "reservation_series_createdAt_idx" ON "reservation_series"("createdAt");

-- CreateIndex
CREATE INDEX "reservation_series_deletedAt_idx" ON "reservation_series"("deletedAt");

-- CreateIndex
CREATE INDEX "reservations_seriesId_recurrenceInstanceIndex_idx" ON "reservations"("seriesId", "recurrenceInstanceIndex");

-- AddForeignKey
ALTER TABLE "reservation_series" ADD CONSTRAINT "reservation_series_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_series" ADD CONSTRAINT "reservation_series_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_series" ADD CONSTRAINT "reservation_series_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_series" ADD CONSTRAINT "reservation_series_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "reservation_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Codex P2 #3599414660 fix: partial unique で soft-delete 後の同 (spaceId, dtstart) 再作成を許可
CREATE UNIQUE INDEX "reservation_series_space_dtstart_active_unique"
  ON "reservation_series" ("spaceId", "dtstart") WHERE "deletedAt" IS NULL;
