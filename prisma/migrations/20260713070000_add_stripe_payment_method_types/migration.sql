-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "stripePaymentMethodTypes" TEXT[] DEFAULT ARRAY['card']::TEXT[];
