-- DropIndex
DROP INDEX "staff_invitations_email_pending_idx";

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "footerContactLabel" TEXT NOT NULL DEFAULT 'Contact',
ADD COLUMN     "footerHoursLabel" TEXT NOT NULL DEFAULT 'Hours',
ADD COLUMN     "footerNavigationLabel" TEXT NOT NULL DEFAULT 'Navigation',
ADD COLUMN     "footerShowSocialLinks" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "footerTagline" TEXT,
ADD COLUMN     "themeColor" TEXT NOT NULL DEFAULT '#fafafa';
