-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('PERSONAL', 'CORPORATE');

-- AlterTable: Customer
ALTER TABLE "customers" ADD COLUMN "customerType" "CustomerType" NOT NULL DEFAULT 'PERSONAL';

-- AlterTable: Reservation
ALTER TABLE "reservations" ADD COLUMN "guestCustomerType" "CustomerType";

-- AlterTable: Inquiry
ALTER TABLE "inquiries" ADD COLUMN "customerType" "CustomerType";

-- Backfill: companyName が NULL でないレコードを CORPORATE に更新
UPDATE "customers" SET "customerType" = 'CORPORATE' WHERE "companyName" IS NOT NULL AND "companyName" != '';

-- CreateIndex
CREATE INDEX "customers_customerType_idx" ON "customers"("customerType");
