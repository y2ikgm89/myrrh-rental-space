-- CreateEnum
CREATE TYPE "SmartLockDeviceType" AS ENUM ('KEYPAD', 'KEYPAD_TOUCH', 'KEYPAD_VISION', 'KEYPAD_VISION_PRO', 'LOCK_VISION_PRO');

-- CreateEnum
CREATE TYPE "SmartLockPasscodeStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'REVOKED');

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "switchbotConnectionStatus" TEXT,
ADD COLUMN     "switchbotEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "switchbotLastTestedAt" TIMESTAMP(3),
ADD COLUMN     "switchbotOpenToken" TEXT,
ADD COLUMN     "switchbotPasscodeBufferMinutes" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "switchbotSecretKey" TEXT,
ADD COLUMN     "switchbotWebhookPathToken" TEXT;

-- CreateTable
CREATE TABLE "smart_lock_devices" (
    "id" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "deviceType" "SmartLockDeviceType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smart_lock_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smart_lock_passcodes" (
    "id" UUID NOT NULL,
    "reservationId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "status" "SmartLockPasscodeStatus" NOT NULL DEFAULT 'PENDING',
    "passcodeCiphertext" TEXT NOT NULL,
    "switchbotCommandId" TEXT,
    "switchbotKeyId" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "failureReason" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smart_lock_passcodes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "smart_lock_devices_deviceId_key" ON "smart_lock_devices"("deviceId");

-- CreateIndex
CREATE INDEX "smart_lock_devices_spaceId_idx" ON "smart_lock_devices"("spaceId");

-- CreateIndex
CREATE INDEX "smart_lock_passcodes_status_endTime_idx" ON "smart_lock_passcodes"("status", "endTime");

-- CreateIndex
CREATE UNIQUE INDEX "smart_lock_passcodes_reservationId_deviceId_key" ON "smart_lock_passcodes"("reservationId", "deviceId");

-- AddForeignKey
ALTER TABLE "smart_lock_devices" ADD CONSTRAINT "smart_lock_devices_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smart_lock_passcodes" ADD CONSTRAINT "smart_lock_passcodes_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smart_lock_passcodes" ADD CONSTRAINT "smart_lock_passcodes_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "smart_lock_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
