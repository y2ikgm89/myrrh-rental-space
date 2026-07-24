-- Breaking: replace SmartLockDeviceType (drop LOCK_VISION_PRO, add LOCK/LOCK_LITE/LOCK_PRO).
-- Triggers planned downtime deploy mode (DROP TYPE + ALTER COLUMN TYPE).

-- Remove unsupported device rows (passcodes CASCADE; space/location FK SET NULL).
DELETE FROM "smart_lock_devices" WHERE "deviceType" = 'LOCK_VISION_PRO';

-- squawk-ignore require-concurrent-index-creation
CREATE TYPE "SmartLockDeviceType_new" AS ENUM (
  'KEYPAD',
  'KEYPAD_TOUCH',
  'KEYPAD_VISION',
  'KEYPAD_VISION_PRO',
  'LOCK',
  'LOCK_LITE',
  'LOCK_PRO'
);

-- squawk-ignore ban-drop-table
ALTER TABLE "smart_lock_devices"
  ALTER COLUMN "deviceType" TYPE "SmartLockDeviceType_new"
  USING ("deviceType"::text::"SmartLockDeviceType_new");

-- squawk-ignore ban-drop-table
DROP TYPE "SmartLockDeviceType";

ALTER TYPE "SmartLockDeviceType_new" RENAME TO "SmartLockDeviceType";
