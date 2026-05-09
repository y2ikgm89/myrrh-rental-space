ALTER TABLE "settings" ADD COLUMN "googleBusinessProfileEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "settings" ADD COLUMN "googleBusinessProfileAuth" JSONB;

ALTER TABLE "locations" ADD COLUMN "gbpSyncEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "locations" ADD COLUMN "gbpSyncedAt" TIMESTAMP(3);
ALTER TABLE "locations" ADD COLUMN "gbpSyncError" TEXT;

CREATE INDEX "locations_gbpSyncError_idx" ON "locations" ("gbpSyncError") WHERE "gbpSyncError" IS NOT NULL;
