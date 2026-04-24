-- CreateTable
CREATE TABLE "page_freeform_states" (
    "pageId" UUID NOT NULL,
    "draftDocument" JSONB NOT NULL,
    "publishedDocument" JSONB,
    "draftVersion" INTEGER NOT NULL DEFAULT 1,
    "publishedVersion" INTEGER,
    "lastPublishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "page_freeform_states_pkey" PRIMARY KEY ("pageId")
);

-- CreateTable
CREATE TABLE "page_freeform_revisions" (
    "id" UUID NOT NULL,
    "pageId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "document" JSONB NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_freeform_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "page_freeform_revisions_pageId_version_idx" ON "page_freeform_revisions"("pageId", "version");

-- AddForeignKey
ALTER TABLE "page_freeform_states" ADD CONSTRAINT "page_freeform_states_pageId_fkey"
  FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_freeform_revisions" ADD CONSTRAINT "page_freeform_revisions_pageId_fkey"
  FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
