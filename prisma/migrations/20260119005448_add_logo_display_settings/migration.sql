-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "footerLogoUrl" TEXT,
ADD COLUMN     "useFooterLogo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "useHeaderLogo" BOOLEAN NOT NULL DEFAULT true;
