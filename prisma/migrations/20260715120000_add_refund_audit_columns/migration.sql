-- Foundation gap analysis (2026-07-15) task #9 PR#1: refund audit columns
-- Reservation + EventRegistration に返金の会計証跡列を追加する (expand-only、全 nullable)。
--
-- 目的: 現状の refundReservationPaymentCommand は全額 REFUNDED 一括遷移で reason / amount /
-- refund_id が失われている。後続 PR で部分返金 / reason 記録 / at-least-once idempotency に
-- 活用するための schema 準備。
--
-- 破壊的変更: なし。全列 nullable のため既存行は影響なし、unique 制約は現存レコード全 null
-- (unique index は NULL を重複扱いしない PostgreSQL semantics) のため衝突なし。

-- Reservation 側 -------------------------------------------------------------
ALTER TABLE "reservations"
  ADD COLUMN "refundedAt" TIMESTAMP(3),
  ADD COLUMN "refundedAmount" INTEGER,
  ADD COLUMN "refundReason" TEXT,
  ADD COLUMN "stripeRefundId" TEXT,
  ADD COLUMN "refundedByType" VARCHAR(20);

-- Stripe refund object id の一意制約 (二重返金防止 + webhook idempotency key)
CREATE UNIQUE INDEX "reservations_stripeRefundId_key" ON "reservations"("stripeRefundId");

-- EventRegistration 側 -------------------------------------------------------
ALTER TABLE "event_registrations"
  ADD COLUMN "refundedAt" TIMESTAMP(3),
  ADD COLUMN "refundedAmount" INTEGER,
  ADD COLUMN "refundReason" TEXT,
  ADD COLUMN "stripeRefundId" TEXT,
  ADD COLUMN "refundedByType" VARCHAR(20);

CREATE UNIQUE INDEX "event_registrations_stripeRefundId_key" ON "event_registrations"("stripeRefundId");
