-- CreateEnum
CREATE TYPE "LayoutWidth" AS ENUM ('XS', 'SM', 'MD', 'LG', 'XL', 'FULL', 'CUSTOM');

-- AlterTable
ALTER TABLE "blog_posts" ADD COLUMN     "contentWidth" "LayoutWidth",
ADD COLUMN     "contentWidthCustom" INTEGER;

-- AlterTable
ALTER TABLE "news" ADD COLUMN     "contentWidth" "LayoutWidth",
ADD COLUMN     "contentWidthCustom" INTEGER;

-- AlterTable
ALTER TABLE "pages" ADD COLUMN     "contentWidth" "LayoutWidth",
ADD COLUMN     "contentWidthCustom" INTEGER;

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "containerWidth" "LayoutWidth" NOT NULL DEFAULT 'LG',
ADD COLUMN     "containerWidthCustom" INTEGER,
ADD COLUMN     "contentWidth" "LayoutWidth" NOT NULL DEFAULT 'SM',
ADD COLUMN     "contentWidthCustom" INTEGER;
