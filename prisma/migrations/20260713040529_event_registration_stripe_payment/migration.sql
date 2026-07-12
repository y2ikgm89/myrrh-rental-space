-- PR#9: Add Stripe payment columns to event_registrations (additive schema)
--
-- Reservation と同型の paymentStatus / stripeCheckoutSessionId / stripePaymentIntentId /
-- paidAmount / paidAt を追加する。有料 EventTicket の Stripe Checkout 対応 (PR#10 の
-- 実装フローの前提)。既存 registration は default UNPAID + null で埋まる (additive)。
--
-- @unique 制約は新列上のため既存重複リスクなし。

ALTER TABLE "event_registrations"
    ADD COLUMN "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    ADD COLUMN "stripeCheckoutSessionId" TEXT,
    ADD COLUMN "stripePaymentIntentId" TEXT,
    ADD COLUMN "paidAmount" INTEGER,
    ADD COLUMN "paidAt" TIMESTAMP(3);

-- @unique: Stripe session/payment_intent は一意で、二重紐付けを禁止する
CREATE UNIQUE INDEX "event_registrations_stripeCheckoutSessionId_key"
    ON "event_registrations"("stripeCheckoutSessionId");

CREATE UNIQUE INDEX "event_registrations_stripePaymentIntentId_key"
    ON "event_registrations"("stripePaymentIntentId");

-- @@index: webhook / cron の atomic claim (WHERE paymentStatus IN ...) の高速化
CREATE INDEX "event_registrations_paymentStatus_idx"
    ON "event_registrations"("paymentStatus");
