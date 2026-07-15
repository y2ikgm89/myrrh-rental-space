-- Foundation gap analysis (2026-07-15) task #9 PR#2、Codex review PR #1123 P2 + PR #1124 P1 対応。
-- 前 migration 20260715120000_add_refund_audit_columns で追加した 5 columns (累積 refundedAmount +
-- 単一 stripeRefundId scalar) は「複数回部分返金で 2 個目以降の refund_id を保存できない」
-- 設計上の矛盾があるため child table に refactor する。
--
-- 前 migration の 5 列はまだ domain code から使われていない (schema 準備段階のみ) ため
-- DROP は data loss なし。unique index も同時に消える (all NULL 状態)。

-- ============================================================
-- 1. 前 migration の 5 columns を DROP (Reservation + EventRegistration)
-- ============================================================
-- 一意制約 index を先に drop してから column を drop する (PostgreSQL 依存順序)
DROP INDEX IF EXISTS "reservations_stripeRefundId_key";
-- squawk-ignore ban-drop-column
ALTER TABLE "reservations" DROP COLUMN "refundedAt";
-- squawk-ignore ban-drop-column
ALTER TABLE "reservations" DROP COLUMN "refundedAmount";
-- squawk-ignore ban-drop-column
ALTER TABLE "reservations" DROP COLUMN "refundReason";
-- squawk-ignore ban-drop-column
ALTER TABLE "reservations" DROP COLUMN "stripeRefundId";
-- squawk-ignore ban-drop-column
ALTER TABLE "reservations" DROP COLUMN "refundedByType";

DROP INDEX IF EXISTS "event_registrations_stripeRefundId_key";
-- squawk-ignore ban-drop-column
ALTER TABLE "event_registrations" DROP COLUMN "refundedAt";
-- squawk-ignore ban-drop-column
ALTER TABLE "event_registrations" DROP COLUMN "refundedAmount";
-- squawk-ignore ban-drop-column
ALTER TABLE "event_registrations" DROP COLUMN "refundReason";
-- squawk-ignore ban-drop-column
ALTER TABLE "event_registrations" DROP COLUMN "stripeRefundId";
-- squawk-ignore ban-drop-column
ALTER TABLE "event_registrations" DROP COLUMN "refundedByType";

-- ============================================================
-- 2. Refund child table を CREATE (polymorphic FK + append-only)
-- ============================================================
CREATE TABLE "refunds" (
  "id"                  UUID           NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "reservationId"       UUID,
  "eventRegistrationId" VARCHAR(30),
  "amount"              INTEGER        NOT NULL,
  "reason"              TEXT,
  "stripeRefundId"      TEXT           NOT NULL,
  "refundedByType"      VARCHAR(20)    NOT NULL,
  "createdAt"           TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Stripe refund object 1 個 = Refund 1 行 (二重返金防止 + webhook idempotency)
CREATE UNIQUE INDEX "refunds_stripeRefundId_key" ON "refunds"("stripeRefundId");

-- lookup 用 (Reservation / EventRegistration からの refund 集計)
CREATE INDEX "refunds_reservationId_idx" ON "refunds"("reservationId");
CREATE INDEX "refunds_eventRegistrationId_idx" ON "refunds"("eventRegistrationId");
CREATE INDEX "refunds_createdAt_idx" ON "refunds"("createdAt");

-- polymorphic 排他制約: どちらか片方だけが非 NULL でなければならない
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_target_check" CHECK (
  ("reservationId" IS NOT NULL AND "eventRegistrationId" IS NULL)
  OR ("reservationId" IS NULL AND "eventRegistrationId" IS NOT NULL)
);

-- FK は ON DELETE RESTRICT で会計証跡保護 (Codex review PR #1124 P1 対応)。
-- ON DELETE SET NULL は refunds_target_check (片方が非 NULL 必須) に違反するため使えない
-- (reservation の hard delete で reservationId が NULL 化 → eventRegistrationId は元々 NULL
-- → CHECK 制約違反で削除 tx が失敗)。
-- RESTRICT なら refund が 1 件でもある reservation/event_registration の hard delete が
-- 阻止される (会計証跡は append-only + attributable を保持)。deleteCustomer 等の cascade
-- 経路で refund 残存の予約を hard delete する必要が生じた場合は、事前に refund reason
-- を tombstone 化する別導線を用意する (未該当なら現時点で問題なし)。
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_eventRegistrationId_fkey"
  FOREIGN KEY ("eventRegistrationId") REFERENCES "event_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- refundedByType の value 制約 (application 側でも helper enum で強制するが DB 側でも二重防御)
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_refundedByType_check" CHECK (
  "refundedByType" IN ('ADMIN', 'AUTO_ON_CANCEL', 'STRIPE_DASHBOARD')
);
