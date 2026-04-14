-- AlterTable
ALTER TABLE "faq_items" ADD COLUMN     "helpfulCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "notHelpfulCount" INTEGER NOT NULL DEFAULT 0;
