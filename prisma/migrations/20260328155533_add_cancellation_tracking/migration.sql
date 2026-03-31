-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledByType" VARCHAR(20);
