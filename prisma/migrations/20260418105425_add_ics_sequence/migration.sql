-- AlterTable
ALTER TABLE "event_registrations" ADD COLUMN     "icsSequence" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "icsSequence" INTEGER NOT NULL DEFAULT 0;
