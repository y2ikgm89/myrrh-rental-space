-- AlterTable
ALTER TABLE "event_registrations" ADD COLUMN     "reminderSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "notifyEventReminder" BOOLEAN NOT NULL DEFAULT false;
