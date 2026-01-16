-- CreateEnum
CREATE TYPE "GrapesPageStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "pages" ADD COLUMN     "projectData" JSONB,
ADD COLUMN     "templateId" TEXT;

-- AlterTable
ALTER TABLE "settings" ALTER COLUMN "containerWidth" DROP NOT NULL,
ALTER COLUMN "containerWidth" DROP DEFAULT,
ALTER COLUMN "contentWidth" DROP NOT NULL,
ALTER COLUMN "contentWidth" DROP DEFAULT;

-- CreateTable
CREATE TABLE "grapes_pages" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "projectData" JSONB NOT NULL,
    "template" TEXT,
    "status" "GrapesPageStatus" NOT NULL DEFAULT 'DRAFT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metaDescription" TEXT,
    "metaKeywords" TEXT,
    "ogpTitle" TEXT,
    "ogpDescription" TEXT,
    "ogpImageUrl" TEXT,

    CONSTRAINT "grapes_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grapes_page_versions" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "projectData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "grapes_page_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "grapes_pages_slug_key" ON "grapes_pages"("slug");

-- CreateIndex
CREATE INDEX "grapes_pages_status_isActive_idx" ON "grapes_pages"("status", "isActive");

-- CreateIndex
CREATE INDEX "grapes_pages_slug_idx" ON "grapes_pages"("slug");

-- CreateIndex
CREATE INDEX "grapes_page_versions_pageId_createdAt_idx" ON "grapes_page_versions"("pageId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "grapes_page_versions_pageId_version_key" ON "grapes_page_versions"("pageId", "version");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "pages_templateId_idx" ON "pages"("templateId");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- AddForeignKey
ALTER TABLE "grapes_page_versions" ADD CONSTRAINT "grapes_page_versions_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "grapes_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
