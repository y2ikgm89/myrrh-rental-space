-- CreateEnum
CREATE TYPE "PageSectionType" AS ENUM ('HERO', 'CUSTOM', 'CONTACT_FORM', 'FAQ_LIST', 'SPACE_LIST', 'NEWS_LIST', 'POST_LIST', 'CTA', 'GALLERY', 'TESTIMONIAL', 'MAP', 'EMBED');

-- AlterTable
ALTER TABLE "pages" ADD COLUMN     "useSections" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "page_sections" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "type" "PageSectionType" NOT NULL,
    "title" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "content" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "page_sections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "page_sections_pageId_order_isActive_idx" ON "page_sections"("pageId", "order", "isActive");

-- CreateIndex
CREATE INDEX "page_sections_type_idx" ON "page_sections"("type");

-- AddForeignKey
ALTER TABLE "page_sections" ADD CONSTRAINT "page_sections_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
