-- AlterTable
ALTER TABLE "locations" ADD COLUMN "parkingInfo" TEXT;
ALTER TABLE "locations" ADD COLUMN "amenities" JSONB NOT NULL DEFAULT '{}';
