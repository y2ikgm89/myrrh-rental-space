-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "announcementBarBgColor" TEXT,
ADD COLUMN     "announcementBarTextColor" TEXT,
ADD COLUMN     "announcementBarStripeColor" TEXT,
ADD COLUMN     "announcementBarStripeAnimation" BOOLEAN NOT NULL DEFAULT false;
