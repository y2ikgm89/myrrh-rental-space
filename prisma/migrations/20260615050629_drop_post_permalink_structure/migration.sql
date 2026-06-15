/*
  Warnings:

  - You are about to drop the column `postPermalinkStructure` on the `settings` table. All the data in the column will be lost.

*/
-- AlterTable
-- contract: postPermalinkStructure 撤去（expand #578/#580 完了・リリース前 big-bang）
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "postPermalinkStructure";

-- DropEnum
DROP TYPE "PostPermalinkStructure";
