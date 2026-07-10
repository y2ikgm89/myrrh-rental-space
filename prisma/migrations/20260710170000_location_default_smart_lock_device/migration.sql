-- AlterTable
ALTER TABLE "locations" ADD COLUMN     "defaultSmartLockDeviceId" UUID;

-- CreateIndex
CREATE INDEX "locations_defaultSmartLockDeviceId_idx" ON "locations"("defaultSmartLockDeviceId");

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_defaultSmartLockDeviceId_fkey" FOREIGN KEY ("defaultSmartLockDeviceId") REFERENCES "smart_lock_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
