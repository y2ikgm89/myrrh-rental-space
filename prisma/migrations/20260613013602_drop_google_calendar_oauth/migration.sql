/*
  Warnings:

  - You are about to drop the column `googleCalendarOAuthEventId` on the `reservations` table. All the data in the column will be lost.
  - You are about to drop the column `googleCalendarOAuthEnabled` on the `settings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "reservations" DROP COLUMN "googleCalendarOAuthEventId";

-- AlterTable
ALTER TABLE "settings" DROP COLUMN "googleCalendarOAuthEnabled";
