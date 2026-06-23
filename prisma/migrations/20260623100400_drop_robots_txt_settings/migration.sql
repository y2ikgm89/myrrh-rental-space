/*
  Warnings:

  - You are about to drop the column `robotsTxtCustom` on the `settings` table. All the data in the column will be lost.
  - You are about to drop the column `robotsTxtEnabled` on the `settings` table. All the data in the column will be lost.

*/
-- AlterTable
-- contract: robotsTxt 撤去（dead-by-default で書込ゼロ・admin UI/Server Action/route handler 全廃→app/robots.ts MetadataRoute 化のリリース前 big-bang）
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "robotsTxtCustom";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "robotsTxtEnabled";
