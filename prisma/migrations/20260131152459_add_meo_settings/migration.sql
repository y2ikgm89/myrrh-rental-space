-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "businessAttributes" JSONB,
ADD COLUMN     "googleBusinessPlaceId" TEXT,
ADD COLUMN     "googleReviewUrl" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "priceRange" TEXT;
