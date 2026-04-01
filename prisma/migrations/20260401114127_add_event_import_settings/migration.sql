-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "eventImportEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "eventImportSyncToken" TEXT;
