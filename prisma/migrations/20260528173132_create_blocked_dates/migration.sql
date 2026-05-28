-- CreateTable
CREATE TABLE "blocked_dates" (
    "id" UUID NOT NULL,
    "scope" VARCHAR(16) NOT NULL,
    "spaceId" UUID,
    "locationId" UUID,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "reason" VARCHAR(200),
    "type" VARCHAR(32) NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blocked_dates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "blocked_dates_scope_startDate_endDate_idx" ON "blocked_dates"("scope", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "blocked_dates_spaceId_startDate_endDate_idx" ON "blocked_dates"("spaceId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "blocked_dates_locationId_startDate_endDate_idx" ON "blocked_dates"("locationId", "startDate", "endDate");

-- AddForeignKey
ALTER TABLE "blocked_dates" ADD CONSTRAINT "blocked_dates_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_dates" ADD CONSTRAINT "blocked_dates_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_dates" ADD CONSTRAINT "blocked_dates_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint: scope discriminated union (SPACE->spaceId, LOCATION->locationId, GLOBAL->both null)
ALTER TABLE "blocked_dates" ADD CONSTRAINT "blocked_dates_scope_target_check" CHECK (
    ("scope" = 'SPACE' AND "spaceId" IS NOT NULL AND "locationId" IS NULL)
    OR ("scope" = 'LOCATION' AND "locationId" IS NOT NULL AND "spaceId" IS NULL)
    OR ("scope" = 'GLOBAL' AND "spaceId" IS NULL AND "locationId" IS NULL)
);
