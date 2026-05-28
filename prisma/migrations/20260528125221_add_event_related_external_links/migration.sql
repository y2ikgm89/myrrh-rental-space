-- CreateTable
CREATE TABLE "event_related_external_links" (
    "id" VARCHAR(30) NOT NULL,
    "eventId" VARCHAR(30) NOT NULL,
    "url" VARCHAR(2000) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "imageUrl" VARCHAR(500),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_related_external_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_related_external_links_eventId_sortOrder_idx" ON "event_related_external_links"("eventId", "sortOrder");

-- AddForeignKey
ALTER TABLE "event_related_external_links" ADD CONSTRAINT "event_related_external_links_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
