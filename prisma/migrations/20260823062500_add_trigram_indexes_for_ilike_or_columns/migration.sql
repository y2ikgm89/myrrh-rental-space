-- ILIKE '%q%' で OR される列はすべて trigram index を持つ（監査 A-33）。
--
-- schema のコメントは searchInquiries が name/email/subject の 3 列を OR すると
-- 宣言していたが、実装はその後 receiptNumber を足して 4 列になり、お問い合わせ一覧は
-- さらに message を足して 5 列になっていた。顧客一覧も phoneNumber を足して 5 列。
-- index path の無い枝が 1 本でも混ざると PostgreSQL は BitmapOr を組めず、OR 全体が
-- 対象テーブルの Seq Scan になる。同じ where は count と findMany の両方へ渡るので、
-- 同一の全表走査が 2 本並行で走る。
BEGIN;

-- CreateIndex
CREATE INDEX "customers_phone_number_trgm_idx" ON "customers" USING GIN ("phone_number" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "inquiries_receipt_number_trgm_idx" ON "inquiries" USING GIN ("receipt_number" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "inquiries_message_trgm_idx" ON "inquiries" USING GIN ("message" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "posts_excerpt_trgm_idx" ON "posts" USING GIN ("excerpt" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "events_address_detail_trgm_idx" ON "events" USING GIN ("address_detail" gin_trgm_ops);

COMMIT;
