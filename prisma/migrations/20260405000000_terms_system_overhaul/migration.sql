-- AlterEnum
ALTER TYPE "TermsType" ADD VALUE 'RENTAL_TERMS';

-- DropForeignKey
ALTER TABLE "settings" DROP CONSTRAINT "settings_cancellationTermsId_fkey";

-- AlterTable
ALTER TABLE "settings" DROP COLUMN "cancellationTermsId",
DROP COLUMN "requirePrivacyAgreement",
DROP COLUMN "requireTermsAgreement",
DROP COLUMN "termsAgreementEnabled",
DROP COLUMN "termsAgreementText";

-- AlterTable
ALTER TABLE "terms" ADD COLUMN     "requiredAtReservation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "showInFooter" BOOLEAN NOT NULL DEFAULT false;
