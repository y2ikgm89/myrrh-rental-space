-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PENDING', 'PAID', 'REFUNDED', 'FAILED');

-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
ADD COLUMN     "stripeCheckoutSessionId" TEXT,
ADD COLUMN     "stripePaymentIntentId" TEXT;

-- CreateIndex
CREATE INDEX "reservations_paymentStatus_idx" ON "reservations"("paymentStatus");

-- CreateIndex
CREATE INDEX "reservations_stripePaymentIntentId_idx" ON "reservations"("stripePaymentIntentId");
