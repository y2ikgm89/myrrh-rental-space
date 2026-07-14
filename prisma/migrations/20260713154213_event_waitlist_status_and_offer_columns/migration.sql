-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RegistrationStatus" ADD VALUE 'WAITLISTED';
ALTER TYPE "RegistrationStatus" ADD VALUE 'WAITLISTED_OFFERED';
ALTER TYPE "RegistrationStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "event_registrations" ADD COLUMN     "expiresAt" TIMESTAMPTZ(6),
ADD COLUMN     "offeredAt" TIMESTAMPTZ(6),
ADD COLUMN     "waitlistedAt" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "event_registrations_slotId_ticketId_status_waitlistedAt_idx" ON "event_registrations"("slotId", "ticketId", "status", "waitlistedAt");

-- CreateIndex
CREATE INDEX "event_registrations_status_expiresAt_idx" ON "event_registrations"("status", "expiresAt");
