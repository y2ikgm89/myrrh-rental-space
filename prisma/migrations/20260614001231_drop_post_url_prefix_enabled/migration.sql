/*
  Warnings:

  - You are about to drop the column `postUrlPrefixEnabled` on the `settings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "settings" DROP COLUMN "postUrlPrefixEnabled";
