-- CreateTable
CREATE TABLE "event_related_posts" (
    "eventId" VARCHAR(30) NOT NULL,
    "postId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_related_posts_pkey" PRIMARY KEY ("eventId","postId")
);

-- CreateIndex
CREATE INDEX "event_related_posts_eventId_sortOrder_idx" ON "event_related_posts"("eventId", "sortOrder");

-- CreateIndex
CREATE INDEX "event_related_posts_postId_idx" ON "event_related_posts"("postId");

-- AddForeignKey
ALTER TABLE "event_related_posts" ADD CONSTRAINT "event_related_posts_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_related_posts" ADD CONSTRAINT "event_related_posts_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
