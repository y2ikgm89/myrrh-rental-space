BEGIN;

-- CreateEnum
CREATE TYPE "event_registration_source" AS ENUM ('ONLINE', 'WALK_IN', 'ADMIN_PROXY');

-- AlterTable
ALTER TABLE "event_registrations" ADD COLUMN     "source" "event_registration_source" NOT NULL DEFAULT 'ONLINE';

COMMIT;
