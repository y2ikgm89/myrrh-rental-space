-- AlterTable
ALTER TABLE "pages" ADD COLUMN     "isSystemPage" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "pages_isSystemPage_idx" ON "pages"("isSystemPage");
