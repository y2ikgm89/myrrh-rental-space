-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "analyticsType" TEXT,
ADD COLUMN     "bingWebmasterToolsId" TEXT,
ADD COLUMN     "gaPropertyId" TEXT,
ADD COLUMN     "googleTagManagerId" TEXT;

-- CreateTable
CREATE TABLE "blog_comments" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "parentCommentId" TEXT,
    "content" TEXT NOT NULL,
    "userId" TEXT,
    "guestName" TEXT,
    "guestEmail" TEXT,
    "ipAddress" TEXT,
    "contentHash" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blog_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "blog_comments_postId_createdAt_idx" ON "blog_comments"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "blog_comments_parentCommentId_idx" ON "blog_comments"("parentCommentId");

-- CreateIndex
CREATE INDEX "blog_comments_userId_idx" ON "blog_comments"("userId");

-- CreateIndex
CREATE INDEX "blog_comments_ipAddress_createdAt_idx" ON "blog_comments"("ipAddress", "createdAt");

-- CreateIndex
CREATE INDEX "blog_comments_guestEmail_createdAt_idx" ON "blog_comments"("guestEmail", "createdAt");

-- CreateIndex
CREATE INDEX "blog_comments_contentHash_idx" ON "blog_comments"("contentHash");

-- CreateIndex
CREATE INDEX "blog_comments_isDeleted_idx" ON "blog_comments"("isDeleted");

-- CreateIndex
CREATE INDEX "blog_comments_isDeleted_createdAt_idx" ON "blog_comments"("isDeleted", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "blog_comments" ADD CONSTRAINT "blog_comments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "blog_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blog_comments" ADD CONSTRAINT "blog_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blog_comments" ADD CONSTRAINT "blog_comments_parentCommentId_fkey" FOREIGN KEY ("parentCommentId") REFERENCES "blog_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
