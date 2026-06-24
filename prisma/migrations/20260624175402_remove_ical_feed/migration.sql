/*
  Warnings:

  - You are about to drop the column `icalFeedEnabled` on the `settings` table. All the data in the column will be lost.
  - You are about to drop the column `icalFeedIncludeCustomerInfo` on the `settings` table. All the data in the column will be lost.
  - You are about to drop the `ical_tokens` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ical_tokens" DROP CONSTRAINT "ical_tokens_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "ical_tokens" DROP CONSTRAINT "ical_tokens_spaceId_fkey";

-- squawk-ignore ban-drop-column
-- AlterTable
ALTER TABLE "settings" DROP COLUMN "icalFeedEnabled",
DROP COLUMN "icalFeedIncludeCustomerInfo";

-- squawk-ignore ban-drop-table
-- DropTable
DROP TABLE "ical_tokens";
