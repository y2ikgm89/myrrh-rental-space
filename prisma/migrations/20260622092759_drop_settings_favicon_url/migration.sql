/*
  Warnings:

  - You are about to drop the column `faviconUrl` on the `settings` table. All the data in the column will be lost.

*/
-- AlterTable
-- contract: faviconUrl 撤去（expand #699 完了・file-convention favicon.ico 一本化・リリース前 big-bang）
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "faviconUrl";
