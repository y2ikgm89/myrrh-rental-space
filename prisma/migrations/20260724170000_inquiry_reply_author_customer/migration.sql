-- Inquiry Overhaul PR1: CUSTOMER reply authorship via authorCustomerId.
--
-- 目的: InquiryReply に Customer FK を追加し、STAFF/CUSTOMER 作者の逆側 FK 混入を
-- CHECK で禁止する。既存行はすべて STAFF (Phase 1 backfill) のため backfill 不要。
--
-- 破壊的変更: なし (nullable 列追加 + CHECK のみ)。

-- AlterTable
ALTER TABLE "inquiry_replies" ADD COLUMN "authorCustomerId" UUID;

-- CreateIndex
CREATE INDEX "inquiry_replies_authorCustomerId_idx" ON "inquiry_replies"("authorCustomerId");

-- AddForeignKey
ALTER TABLE "inquiry_replies" ADD CONSTRAINT "inquiry_replies_authorCustomerId_fkey"
    FOREIGN KEY ("authorCustomerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Side-check: forbid cross-side FK pollution (SetNull after parent delete is allowed).
ALTER TABLE "inquiry_replies" ADD CONSTRAINT "inquiry_replies_author_side_check" CHECK (
  ( "authorType" = 'STAFF' AND "authorCustomerId" IS NULL )
  OR
  ( "authorType" = 'CUSTOMER' AND "authorId" IS NULL )
);
