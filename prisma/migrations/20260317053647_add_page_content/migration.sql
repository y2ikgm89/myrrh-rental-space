-- CreateTable
CREATE TABLE "page_contents" (
    "id" TEXT NOT NULL,
    "pageKey" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "ogpTitle" TEXT,
    "ogpDescription" TEXT,
    "ogpImage" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "page_contents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "page_contents_pageKey_key" ON "page_contents"("pageKey");
