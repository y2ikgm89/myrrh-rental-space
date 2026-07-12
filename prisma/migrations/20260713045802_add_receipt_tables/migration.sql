-- PR#16: 領収書 (適格請求書) スキーマ追加 (Priority-10 audit #3)
--
-- 規約・特商法表記・確認メール・FAQ が「マイページから適格請求書要件を満たした
-- 領収書を PDF ダウンロード可能」と対外約束していたのに、PDF ライブラリ・領収書
-- モデル・発行 API・ダウンロード UI が全て未実装だった。本 migration は schema 部分。

-- ==============================================
-- ReceiptSequence: 連番採番テーブル
-- ==============================================
CREATE TABLE "receipt_sequences" (
    "id" VARCHAR(20) NOT NULL DEFAULT 'singleton',
    "year" INTEGER NOT NULL,
    "nextNo" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "receipt_sequences_pkey" PRIMARY KEY ("id")
);

-- ==============================================
-- Receipt: 領収書
-- ==============================================
CREATE TABLE "receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "serialNo" VARCHAR(20) NOT NULL,
    "issuedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reservationId" UUID,
    "eventRegistrationId" VARCHAR(30),
    "recipientName" VARCHAR(100) NOT NULL,
    "subject" VARCHAR(100) NOT NULL DEFAULT 'スペース利用料として',
    "amount" INTEGER NOT NULL,
    "taxAmount" INTEGER NOT NULL DEFAULT 0,
    "taxRate" DECIMAL(5, 2) NOT NULL,
    "issuerSnapshot" JSONB NOT NULL,
    "reissuedFromId" UUID,
    "reissuedReason" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "receipts_serialNo_key" ON "receipts"("serialNo");
CREATE UNIQUE INDEX "receipts_reservationId_key" ON "receipts"("reservationId");
CREATE UNIQUE INDEX "receipts_eventRegistrationId_key"
    ON "receipts"("eventRegistrationId");

CREATE INDEX "receipts_reservationId_idx" ON "receipts"("reservationId");
CREATE INDEX "receipts_eventRegistrationId_idx"
    ON "receipts"("eventRegistrationId");
CREATE INDEX "receipts_issuedAt_idx" ON "receipts"("issuedAt");

-- Foreign keys (Restrict: 領収書がある予約/申込は物理削除不可、税務証跡性維持)
ALTER TABLE "receipts"
    ADD CONSTRAINT "receipts_reservationId_fkey"
    FOREIGN KEY ("reservationId") REFERENCES "reservations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "receipts"
    ADD CONSTRAINT "receipts_eventRegistrationId_fkey"
    FOREIGN KEY ("eventRegistrationId") REFERENCES "event_registrations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- 再発行時の自参照 FK (元連番を維持、SetNull で親削除時は自然消滅)
ALTER TABLE "receipts"
    ADD CONSTRAINT "receipts_reissuedFromId_fkey"
    FOREIGN KEY ("reissuedFromId") REFERENCES "receipts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
