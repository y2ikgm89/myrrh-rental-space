-- Expand-only: async deleteKey state + lock device telemetry columns.
-- REVOKE_PENDING must be committed before use in the same session on some PG
-- versions; Prisma migrate applies the whole file in one transaction — ADD VALUE
-- is fine inside a single migration here (PG 12+).

ALTER TYPE "SmartLockPasscodeStatus" ADD VALUE 'REVOKE_PENDING';

ALTER TABLE "smart_lock_passcodes"
  ADD COLUMN "switchbotDeleteCommandId" TEXT,
  ADD COLUMN "revokeRequestedAt" TIMESTAMP(3);

ALTER TABLE "smart_lock_devices"
  ADD COLUMN "pairedLockDeviceId" UUID,
  ADD COLUMN "lastLockState" TEXT,
  ADD COLUMN "lastDoorState" TEXT,
  ADD COLUMN "lastBattery" INTEGER,
  ADD COLUMN "lastStateAt" TIMESTAMP(3);

CREATE INDEX "smart_lock_passcodes_status_revokeRequestedAt_idx"
  ON "smart_lock_passcodes"("status", "revokeRequestedAt");

ALTER TABLE "smart_lock_devices"
  ADD CONSTRAINT "smart_lock_devices_pairedLockDeviceId_fkey"
  FOREIGN KEY ("pairedLockDeviceId") REFERENCES "smart_lock_devices"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
