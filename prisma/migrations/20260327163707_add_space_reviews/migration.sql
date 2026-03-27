-- CreateTable
CREATE TABLE "space_reviews" (
    "id" UUID NOT NULL,
    "spaceId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "reservationId" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" VARCHAR(100),
    "comment" VARCHAR(1000),
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "space_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "space_reviews_reservationId_key" ON "space_reviews"("reservationId");

-- CreateIndex
CREATE INDEX "space_reviews_spaceId_isPublished_createdAt_idx" ON "space_reviews"("spaceId", "isPublished", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "space_reviews_customerId_idx" ON "space_reviews"("customerId");

-- AddForeignKey
ALTER TABLE "space_reviews" ADD CONSTRAINT "space_reviews_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_reviews" ADD CONSTRAINT "space_reviews_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_reviews" ADD CONSTRAINT "space_reviews_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
