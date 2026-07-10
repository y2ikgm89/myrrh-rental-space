/*
  Warnings:

  - You are about to drop the column `spaceId` on the `smart_lock_devices` table. All the data in the column will be lost.
  - Added the required column `locationId` to the `smart_lock_devices` table without a default value. This is not possible if the table is not empty.

  SmartLockDeviceをSpace所有からLocation所有に変更する（同一Locationの複数SpaceがA
  台の物理ロックを共有できるようにするための再設計）。この機能は本migration作成時点で
  本番に投入直後・登録済みデバイスが実質ゼロのため、Space.locationId からの
  バックフィルのみで安全に移行できる。
*/
-- AlterTable: locationIdはまずnullableで追加し、バックフィル後にNOT NULL化する
ALTER TABLE "smart_lock_devices" ADD COLUMN "locationId" UUID;

-- バックフィル: 既存行があれば、紐づくSpaceのlocationIdを引き継ぐ
UPDATE "smart_lock_devices" AS d
SET "locationId" = s."locationId"
FROM "spaces" AS s
WHERE d."spaceId" = s.id;

-- AlterTable
-- 直前のUPDATEで全行backfill済み（本migration作成時点で登録済みデバイスは実質ゼロ）。
-- squawk-ignore adding-not-nullable-field
ALTER TABLE "smart_lock_devices" ALTER COLUMN "locationId" SET NOT NULL;

-- DropForeignKey
ALTER TABLE "smart_lock_devices" DROP CONSTRAINT "smart_lock_devices_spaceId_fkey";

-- DropIndex
DROP INDEX "smart_lock_devices_spaceId_idx";

-- AlterTable
-- 意図的な破壊的変更（SmartLockDeviceをSpace所有からLocation所有へ再設計、PR#926）。
-- 本番投入直後で登録済みデバイスは実質ゼロのため旧参照コードの残存リスクなし。
-- squawk-ignore ban-drop-column
ALTER TABLE "smart_lock_devices" DROP COLUMN "spaceId";

-- AlterTable
ALTER TABLE "spaces" ADD COLUMN     "smartLockDeviceId" UUID;

-- CreateIndex
CREATE INDEX "smart_lock_devices_locationId_idx" ON "smart_lock_devices"("locationId");

-- CreateIndex
CREATE INDEX "spaces_smartLockDeviceId_idx" ON "spaces"("smartLockDeviceId");

-- AddForeignKey
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_smartLockDeviceId_fkey" FOREIGN KEY ("smartLockDeviceId") REFERENCES "smart_lock_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smart_lock_devices" ADD CONSTRAINT "smart_lock_devices_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
