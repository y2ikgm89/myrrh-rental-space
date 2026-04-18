-- AlterTable
ALTER TABLE "settings" ADD COLUMN "googleCalendarMeetEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "settings" ADD COLUMN "googleCalendarReminderMinutes" INTEGER;
