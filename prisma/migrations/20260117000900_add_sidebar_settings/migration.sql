-- AlterTable
ALTER TABLE "pages" ADD COLUMN     "showSidebar" BOOLEAN;

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "sidebarEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sidebarPopularCount" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "sidebarRecentCount" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "sidebarWidgets" JSONB NOT NULL DEFAULT '{"search":true,"recent":true,"popular":true,"categories":true,"tags":true}';
