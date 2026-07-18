-- STRIPE-DEDUP-A: Stripe webhook event dedup chokepoint table (expand-only, no data backfill).
--
-- Stripe 公式 "handle-duplicate-events" 推奨実装
-- (https://docs.stripe.com/webhooks#handle-duplicate-events)。
-- signature verification 直後に `INSERT` を試み、UNIQUE 制約違反 (P2002) なら
-- 「既に受領済み」として webhook を即 200 短絡させる。
--
-- expand-only migration:
--   - CREATE TABLE + CREATE INDEX のみ (DROP/RENAME 無し)
--   - 既存経路への副作用ゼロ (デプロイ時の計画ダウンタイム発生条件を満たさない)
--   - retention は STRIPE-DEDUP-B の cron が担当

CREATE TABLE "stripe_events" (
    "id" VARCHAR(80) NOT NULL,
    "type" VARCHAR(80) NOT NULL,
    "receivedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(6),

    CONSTRAINT "stripe_events_pkey" PRIMARY KEY ("id")
);

-- retention cron (STRIPE-DEDUP-B) 用: receivedAt で古い順に走査するため。
CREATE INDEX "stripe_events_receivedAt_idx" ON "stripe_events"("receivedAt");
