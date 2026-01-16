-- CreateEnum
CREATE TYPE "TermsType" AS ENUM ('TERMS_OF_USE', 'PRIVACY_POLICY', 'CANCELLATION', 'PAYMENT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "TermsStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "spaces" ADD COLUMN     "termsId" TEXT;

-- CreateTable
CREATE TABLE "terms" (
    "id" TEXT NOT NULL,
    "type" "TermsType" NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terms_versions" (
    "id" TEXT NOT NULL,
    "termsId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "status" "TermsStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "publishedBy" TEXT,
    "isCurrentVersion" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "terms_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terms_agreements" (
    "id" TEXT NOT NULL,
    "termsId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "reservationId" TEXT,
    "userId" TEXT,
    "guestName" TEXT,
    "guestEmail" TEXT,
    "agreedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "terms_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "terms_slug_key" ON "terms"("slug");

-- CreateIndex
CREATE INDEX "terms_type_isActive_idx" ON "terms"("type", "isActive");

-- CreateIndex
CREATE INDEX "terms_slug_idx" ON "terms"("slug");

-- CreateIndex
CREATE INDEX "terms_versions_termsId_isCurrentVersion_idx" ON "terms_versions"("termsId", "isCurrentVersion");

-- CreateIndex
CREATE INDEX "terms_versions_status_publishedAt_idx" ON "terms_versions"("status", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "terms_versions_termsId_version_key" ON "terms_versions"("termsId", "version");

-- CreateIndex
CREATE INDEX "terms_agreements_reservationId_idx" ON "terms_agreements"("reservationId");

-- CreateIndex
CREATE INDEX "terms_agreements_userId_agreedAt_idx" ON "terms_agreements"("userId", "agreedAt");

-- CreateIndex
CREATE INDEX "terms_agreements_termsId_versionId_idx" ON "terms_agreements"("termsId", "versionId");

-- CreateIndex
CREATE INDEX "terms_agreements_guestEmail_agreedAt_idx" ON "terms_agreements"("guestEmail", "agreedAt");

-- CreateIndex
CREATE INDEX "spaces_termsId_idx" ON "spaces"("termsId");

-- AddForeignKey
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_termsId_fkey" FOREIGN KEY ("termsId") REFERENCES "terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms_versions" ADD CONSTRAINT "terms_versions_termsId_fkey" FOREIGN KEY ("termsId") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms_agreements" ADD CONSTRAINT "terms_agreements_termsId_fkey" FOREIGN KEY ("termsId") REFERENCES "terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms_agreements" ADD CONSTRAINT "terms_agreements_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "terms_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms_agreements" ADD CONSTRAINT "terms_agreements_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms_agreements" ADD CONSTRAINT "terms_agreements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
