-- AlterEnum
ALTER TYPE "HomepageSectionType" ADD VALUE 'INSTAGRAM';

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "instagramAccessToken" TEXT,
ADD COLUMN     "instagramAccountType" TEXT,
ADD COLUMN     "instagramFeedColumns" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "instagramFeedEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "instagramFeedLayout" TEXT NOT NULL DEFAULT 'grid',
ADD COLUMN     "instagramFeedMaxItems" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN     "instagramShowCaption" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "instagramShowViewAll" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "instagramTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "instagramUserId" TEXT,
ADD COLUMN     "instagramUsername" TEXT;

-- CreateTable
CREATE TABLE "instagram_posts" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "postUrl" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "thumbnailUrl" TEXT,
    "caption" TEXT,
    "mediaType" TEXT NOT NULL,
    "permalink" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instagram_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "instagram_posts_postId_key" ON "instagram_posts"("postId");

-- CreateIndex
CREATE INDEX "instagram_posts_sortOrder_idx" ON "instagram_posts"("sortOrder");
