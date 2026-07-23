-- Expand refunds.refundedByType CHECK to allow AUTO_CAPACITY_RACE
-- (waitlist capacity-race auto-refund attribution).

ALTER TABLE "refunds" DROP CONSTRAINT "refunds_refundedByType_check";

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_refundedByType_check" CHECK (
  "refundedByType" IN (
    'ADMIN',
    'AUTO_ON_CANCEL',
    'AUTO_CAPACITY_RACE',
    'STRIPE_DASHBOARD'
  )
);
