/*
  Warnings:

  - You are about to drop the column `description` on the `spaces` table. All the data in the column will be lost.
  - Added the required column `descriptionHtml` to the `spaces` table without a default value. This is not possible if the table is not empty.
  - Added the required column `descriptionJson` to the `spaces` table without a default value. This is not possible if the table is not empty.
  - Added the required column `descriptionPlainText` to the `spaces` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "spaces" DROP COLUMN "description",
ADD COLUMN     "descriptionHtml" TEXT NOT NULL,
ADD COLUMN     "descriptionJson" JSONB NOT NULL,
ADD COLUMN     "descriptionPlainText" TEXT NOT NULL;
