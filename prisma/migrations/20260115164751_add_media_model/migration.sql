-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO', 'DOCUMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "MediaUsage" AS ENUM ('BLOG', 'NEWS', 'PAGE', 'SPACE', 'SITE', 'GENERAL');

-- CreateTable
CREATE TABLE "media" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "type" "MediaType" NOT NULL,
    "usage" "MediaUsage" NOT NULL DEFAULT 'GENERAL',
    "alt" TEXT,
    "title" TEXT,
    "description" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "uploadedBy" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_type_usage_idx" ON "media"("type", "usage");

-- CreateIndex
CREATE INDEX "media_uploadedBy_idx" ON "media"("uploadedBy");

-- CreateIndex
CREATE INDEX "media_isActive_createdAt_idx" ON "media"("isActive", "createdAt");

-- CreateIndex
CREATE INDEX "media_mimeType_idx" ON "media"("mimeType");

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
