-- Phase 1: Inquiry Overhaul (破壊的変更)
--
-- Critical/High/Medium 34 件対応の Phase 1: schema 基盤の破壊的再設計。
--
-- 変更概要:
--   1. InquiryStatus enum に FLAGGED / SPAM 追加
--   2. InquiryReplyAuthorType enum 新設 (STAFF / CUSTOMER)
--   3. Inquiry:
--      - `replyMessage` / `repliedAt` / `repliedById` を DROP（複数返信は inquiry_replies へ）
--      - `receiptNumber` 追加（ユーザー可視の受付番号 "INQ-XXXXXXXX"、NOT NULL UNIQUE）
--      - `phoneNumber` 追加（任意）
--      - `assigneeId` 追加（担当者アサイン用、User FK）
--      - `slaExpiresAt` 追加（SLA 対応期限）
--      - `deletedAt` 追加（soft delete）
--      - `anonymizedAt` / `anonymizedReason` 追加（GDPR 匿名化用）
--   4. 6 テーブル新設:
--      - inquiry_replies (複数返信スレッド)
--      - inquiry_status_history (状態変更履歴)
--      - inquiry_attachments (添付ファイル、Inquiry または InquiryReply に紐付け)
--      - inquiry_internal_notes (スタッフ間 internal notes)
--      - inquiry_tags (タグマスタ)
--      - inquiry_tag_on_inquiries (Inquiry ↔ Tag join)
--   5. Data migration:
--      - 既存 `Inquiry.replyMessage IS NOT NULL` → InquiryReply INSERT (author_type=STAFF)
--      - 全 Inquiry に `inquiry_status_history` の初期行 (from_status=NULL) を backfill
--      - `receiptNumber` を id.substr(0,8).upper() で backfill
--
-- 本 migration は DROP COLUMN を含むため deploy workflow が
-- **計画ダウンタイム付きデプロイ** (breaking migration mode) に切り替わる。

-- ============================================================================
-- 1. Enum 拡張
-- ============================================================================

-- InquiryStatus に FLAGGED / SPAM を追加。
-- 同一 migration 内で新値を使用しないため、PostgreSQL 12+ でも問題なく適用可能。
-- squawk-ignore adding-required-field
ALTER TYPE "InquiryStatus" ADD VALUE IF NOT EXISTS 'FLAGGED';
-- squawk-ignore adding-required-field
ALTER TYPE "InquiryStatus" ADD VALUE IF NOT EXISTS 'SPAM';

-- ============================================================================
-- 2. 新規 Enum
-- ============================================================================

CREATE TYPE "InquiryReplyAuthorType" AS ENUM ('STAFF', 'CUSTOMER');

-- ============================================================================
-- 3. 新規テーブル (6 個)
-- ============================================================================

CREATE TABLE "inquiry_replies" (
    "id" UUID NOT NULL,
    "inquiryId" UUID NOT NULL,
    "authorType" "InquiryReplyAuthorType" NOT NULL,
    "authorId" UUID,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inquiry_replies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inquiry_replies_inquiryId_createdAt_idx" ON "inquiry_replies"("inquiryId", "createdAt");
CREATE INDEX "inquiry_replies_authorId_idx" ON "inquiry_replies"("authorId");

CREATE TABLE "inquiry_status_history" (
    "id" UUID NOT NULL,
    "inquiryId" UUID NOT NULL,
    "fromStatus" "InquiryStatus",
    "toStatus" "InquiryStatus" NOT NULL,
    "changedById" UUID,
    "reason" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inquiry_status_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inquiry_status_history_inquiryId_createdAt_idx" ON "inquiry_status_history"("inquiryId", "createdAt");

CREATE TABLE "inquiry_attachments" (
    "id" UUID NOT NULL,
    "inquiryId" UUID NOT NULL,
    "replyId" UUID,
    "r2Key" TEXT NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "uploadedById" UUID,
    "uploadedByCustomerId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inquiry_attachments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inquiry_attachments_r2Key_key" ON "inquiry_attachments"("r2Key");
CREATE INDEX "inquiry_attachments_inquiryId_createdAt_idx" ON "inquiry_attachments"("inquiryId", "createdAt");
CREATE INDEX "inquiry_attachments_replyId_idx" ON "inquiry_attachments"("replyId");

CREATE TABLE "inquiry_internal_notes" (
    "id" UUID NOT NULL,
    "inquiryId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inquiry_internal_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inquiry_internal_notes_inquiryId_createdAt_idx" ON "inquiry_internal_notes"("inquiryId", "createdAt");
CREATE INDEX "inquiry_internal_notes_authorId_idx" ON "inquiry_internal_notes"("authorId");

CREATE TABLE "inquiry_tags" (
    "id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "color" VARCHAR(20),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inquiry_tags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inquiry_tags_name_key" ON "inquiry_tags"("name");

CREATE TABLE "inquiry_tag_on_inquiries" (
    "inquiryId" UUID NOT NULL,
    "tagId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inquiry_tag_on_inquiries_pkey" PRIMARY KEY ("inquiryId", "tagId")
);

CREATE INDEX "inquiry_tag_on_inquiries_tagId_idx" ON "inquiry_tag_on_inquiries"("tagId");

-- ============================================================================
-- 4. Inquiry: 列追加 (nullable でまず追加、backfill 後に NOT NULL 化)
-- ============================================================================

ALTER TABLE "inquiries" ADD COLUMN "receiptNumber" VARCHAR(20);
ALTER TABLE "inquiries" ADD COLUMN "phoneNumber" TEXT;
ALTER TABLE "inquiries" ADD COLUMN "assigneeId" UUID;
ALTER TABLE "inquiries" ADD COLUMN "slaExpiresAt" TIMESTAMP(3);
ALTER TABLE "inquiries" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "inquiries" ADD COLUMN "anonymizedAt" TIMESTAMP(3);
ALTER TABLE "inquiries" ADD COLUMN "anonymizedReason" VARCHAR(50);

-- ============================================================================
-- 5. Data migration
-- ============================================================================

-- 5-a. 既存の Inquiry.replyMessage IS NOT NULL を InquiryReply に転送。
--      author_type = STAFF、author_id は既存の replied_by_id を継承 (null 可)。
--      body の COALESCE は NULL 対策の防御 (WHERE 節で除外済みなので実質不要)。
INSERT INTO "inquiry_replies" ("id", "inquiryId", "authorType", "authorId", "body", "createdAt", "updatedAt")
SELECT
    gen_random_uuid(),
    i."id",
    'STAFF'::"InquiryReplyAuthorType",
    i."repliedById",
    COALESCE(i."replyMessage", ''),
    COALESCE(i."repliedAt", i."updatedAt"),
    COALESCE(i."repliedAt", i."updatedAt")
FROM "inquiries" i
WHERE i."replyMessage" IS NOT NULL;

-- 5-b. 全 Inquiry に status history の初期行を backfill (from_status = NULL、to_status = 現在の status)。
--      changed_by_id は不明のため NULL (system 経由扱い)。created_at は Inquiry.created_at と揃える。
INSERT INTO "inquiry_status_history" ("id", "inquiryId", "fromStatus", "toStatus", "changedById", "createdAt")
SELECT
    gen_random_uuid(),
    "id",
    NULL,
    "status",
    NULL,
    "createdAt"
FROM "inquiries";

-- 5-c. receiptNumber の backfill。id (UUID) の先頭 8 文字を大文字化し "INQ-" prefix を付与。
--      新規 Inquiry は application 層で採番するが、既存分は id 由来で決定的に埋める。
UPDATE "inquiries"
SET "receiptNumber" = 'INQ-' || UPPER(SUBSTRING("id"::text, 1, 8))
WHERE "receiptNumber" IS NULL;

-- ============================================================================
-- 6. Inquiry: 旧列 DROP + receiptNumber NOT NULL 化
-- ============================================================================

-- squawk-ignore prefer-robust-stmts
-- squawk-ignore disallowed-unique-constraint
ALTER TABLE "inquiries" ALTER COLUMN "receiptNumber" SET NOT NULL;
CREATE UNIQUE INDEX "inquiries_receiptNumber_key" ON "inquiries"("receiptNumber");

-- squawk-ignore prefer-robust-stmts
ALTER TABLE "inquiries" DROP COLUMN "replyMessage";
-- squawk-ignore prefer-robust-stmts
ALTER TABLE "inquiries" DROP COLUMN "repliedAt";
-- squawk-ignore prefer-robust-stmts
ALTER TABLE "inquiries" DROP COLUMN "repliedById";

-- ============================================================================
-- 7. Inquiry: 追加 index (customerId 複合 / 新規列)
-- ============================================================================

CREATE INDEX "inquiries_customerId_createdAt_idx" ON "inquiries"("customerId", "createdAt");
CREATE INDEX "inquiries_customerId_status_idx" ON "inquiries"("customerId", "status");
CREATE INDEX "inquiries_assigneeId_idx" ON "inquiries"("assigneeId");
CREATE INDEX "inquiries_deletedAt_idx" ON "inquiries"("deletedAt");
CREATE INDEX "inquiries_slaExpiresAt_idx" ON "inquiries"("slaExpiresAt");
CREATE INDEX "inquiries_anonymizedAt_idx" ON "inquiries"("anonymizedAt");

-- ============================================================================
-- 8. Foreign Keys
-- ============================================================================

-- Inquiry.assigneeId → User.id
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_assigneeId_fkey"
    FOREIGN KEY ("assigneeId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- inquiry_replies
ALTER TABLE "inquiry_replies" ADD CONSTRAINT "inquiry_replies_inquiryId_fkey"
    FOREIGN KEY ("inquiryId") REFERENCES "inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inquiry_replies" ADD CONSTRAINT "inquiry_replies_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- inquiry_status_history
ALTER TABLE "inquiry_status_history" ADD CONSTRAINT "inquiry_status_history_inquiryId_fkey"
    FOREIGN KEY ("inquiryId") REFERENCES "inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inquiry_status_history" ADD CONSTRAINT "inquiry_status_history_changedById_fkey"
    FOREIGN KEY ("changedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- inquiry_attachments
ALTER TABLE "inquiry_attachments" ADD CONSTRAINT "inquiry_attachments_inquiryId_fkey"
    FOREIGN KEY ("inquiryId") REFERENCES "inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inquiry_attachments" ADD CONSTRAINT "inquiry_attachments_replyId_fkey"
    FOREIGN KEY ("replyId") REFERENCES "inquiry_replies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inquiry_attachments" ADD CONSTRAINT "inquiry_attachments_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inquiry_attachments" ADD CONSTRAINT "inquiry_attachments_uploadedByCustomerId_fkey"
    FOREIGN KEY ("uploadedByCustomerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- inquiry_internal_notes (author は Restrict = staff 削除時は先に internal notes を消す運用)
ALTER TABLE "inquiry_internal_notes" ADD CONSTRAINT "inquiry_internal_notes_inquiryId_fkey"
    FOREIGN KEY ("inquiryId") REFERENCES "inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inquiry_internal_notes" ADD CONSTRAINT "inquiry_internal_notes_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- inquiry_tag_on_inquiries
ALTER TABLE "inquiry_tag_on_inquiries" ADD CONSTRAINT "inquiry_tag_on_inquiries_inquiryId_fkey"
    FOREIGN KEY ("inquiryId") REFERENCES "inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inquiry_tag_on_inquiries" ADD CONSTRAINT "inquiry_tag_on_inquiries_tagId_fkey"
    FOREIGN KEY ("tagId") REFERENCES "inquiry_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
