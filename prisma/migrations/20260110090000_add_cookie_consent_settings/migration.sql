-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "cookieConsentAcceptText" TEXT,
ADD COLUMN     "cookieConsentEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cookieConsentMessage" TEXT,
ADD COLUMN     "cookieConsentPolicyUrl" TEXT,
ADD COLUMN     "cookieConsentRejectText" TEXT;
