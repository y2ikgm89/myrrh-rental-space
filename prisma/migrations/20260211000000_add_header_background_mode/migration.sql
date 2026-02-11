-- CreateEnum
CREATE TYPE "HeaderBackgroundMode" AS ENUM ('solid', 'transparent');

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "headerBackgroundMode" "HeaderBackgroundMode" NOT NULL DEFAULT 'solid';
