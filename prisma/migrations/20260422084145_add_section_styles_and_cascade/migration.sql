-- CreateTable
CREATE TABLE "section_styles" (
    "id" VARCHAR(30) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "scope" VARCHAR(32) NOT NULL,
    "spacing" JSONB NOT NULL,
    "background" JSONB NOT NULL,
    "container" JSONB NOT NULL,
    "typography" JSONB NOT NULL,
    "animation" JSONB NOT NULL,
    "customClass" VARCHAR(200),
    "applicableTypes" VARCHAR(64)[] DEFAULT ARRAY[]::VARCHAR(64)[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "parentId" VARCHAR(30),
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "section_styles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "section_styles_name_key" ON "section_styles"("name");

-- CreateIndex
CREATE INDEX "section_styles_scope_idx" ON "section_styles"("scope");

-- CreateIndex
CREATE INDEX "section_styles_deletedAt_idx" ON "section_styles"("deletedAt");

-- CreateIndex
CREATE INDEX "section_styles_parentId_idx" ON "section_styles"("parentId");

-- AddForeignKey (self-relation for StyleDerivation)
ALTER TABLE "section_styles" ADD CONSTRAINT "section_styles_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "section_styles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Section に styleId / styleOverride 追加（design 列は Phase B.P4 で削除）
ALTER TABLE "sections" ADD COLUMN "styleId" VARCHAR(30);
ALTER TABLE "sections" ADD COLUMN "styleOverride" JSONB;

-- CreateIndex
CREATE INDEX "sections_styleId_idx" ON "sections"("styleId");

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_styleId_fkey"
  FOREIGN KEY ("styleId") REFERENCES "section_styles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Page に pageStyleId 追加
ALTER TABLE "pages" ADD COLUMN "pageStyleId" VARCHAR(30);

-- CreateIndex
CREATE INDEX "pages_pageStyleId_idx" ON "pages"("pageStyleId");

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_pageStyleId_fkey"
  FOREIGN KEY ("pageStyleId") REFERENCES "section_styles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Settings に globalSectionStyleId 追加
ALTER TABLE "settings" ADD COLUMN "globalSectionStyleId" VARCHAR(30);

-- CreateIndex
CREATE INDEX "settings_globalSectionStyleId_idx" ON "settings"("globalSectionStyleId");

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_globalSectionStyleId_fkey"
  FOREIGN KEY ("globalSectionStyleId") REFERENCES "section_styles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
