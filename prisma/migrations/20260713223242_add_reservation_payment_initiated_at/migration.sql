-- Add checkout-initiation timestamp column for the PENDING fail-safe expiry cron.
--
-- `paymentInitiatedAt` records the last time `paymentStatus` transitioned to PENDING
-- (checkout session started). The fail-safe cron (`/api/cron/pending-reservation-expire`)
-- uses this timestamp for its cutoff comparison instead of `createdAt`, so a reservation
-- that sits UNPAID for hours and then starts a checkout is not immediately cancelled.
-- FAILED → PENDING re-checkout also refreshes this value.
--
-- ADD COLUMN nullable = safe (no rewrite, no default fill).
ALTER TABLE "reservations" ADD COLUMN "paymentInitiatedAt" TIMESTAMP(3);

-- Backfill: PENDING の在庫を握っている既存予約は createdAt を初期値に置く。
-- 次の checkout retry があれば payment-commands.ts 側で refresh される。
-- 対象は現行 PENDING のみのため大規模 UPDATE ではない (partial WHERE)。
UPDATE "reservations"
SET "paymentInitiatedAt" = "createdAt"
WHERE "paymentStatus" = 'PENDING' AND "paymentInitiatedAt" IS NULL;
