-- 外部キー列と管理画面一覧の既定ソート列に索引を張る。
--
-- PostgreSQL は FOREIGN KEY を宣言しても**参照する側**の列に索引を自動生成しない。
-- 親を DELETE / UPDATE するたび、RESTRICT / SET NULL / CASCADE の判定のために子テーブルを
-- 全件走査する。実測（migration 履歴から作った DB の pg_constraint 走査）で、索引の無い
-- FK が 13 本あった。
--
-- nullable な列は部分索引にする。deletedById / resolvedBy / couponId などは大半の行で
-- NULL なので、無条件索引は NULL ばかりを溜め込んで書込コストだけ払うことになる。
-- `col = $1` は NULL を返さないため、プランナは `WHERE col IS NOT NULL` の部分索引を
-- 等価検索にも FK 検査にも使える。NOT NULL の 3 本（blocked_dates.createdBy /
-- pending_customer_merges.sourceCustomerId / smart_lock_passcodes.deviceId）は通常の索引。
--
-- 一覧の既定ソート:
--   customers  — getCustomers の既定は `createdAt desc`（queries.ts:76）だが createdAt に
--                索引が無く、全件 Sort してから LIMIT していた。姓・名・電話番号など
--                使われない単列索引は多数あるのに、一番使う導線だけ裸だった。
--   posts      — 同じく admin-queries.ts:95 の既定が `createdAt desc`。buildPostWhere は
--                常に `deletedAt: null` を付けるので部分索引にする。
--
-- SQL は手書きせず `prisma migrate diff --from-config-datasource --to-schema --script` に
-- 生成させたものをそのまま採用している（列名・述語の写し間違いを避けるため）。

-- CreateIndex
CREATE INDEX "blocked_dates_createdBy_idx" ON "blocked_dates"("createdBy");

-- CreateIndex
CREATE INDEX "customers_createdAt_idx" ON "customers"("createdAt");

-- CreateIndex
CREATE INDEX "editor_comment_threads_resolvedBy_idx" ON "editor_comment_threads"("resolvedBy") WHERE ("resolvedBy" IS NOT NULL);

-- CreateIndex
CREATE INDEX "editor_comments_deletedBy_idx" ON "editor_comments"("deletedBy") WHERE ("deletedBy" IS NOT NULL);

-- CreateIndex
CREATE INDEX "events_deletedById_idx" ON "events"("deletedById") WHERE ("deletedById" IS NOT NULL);

-- CreateIndex
CREATE INDEX "inquiry_attachments_uploadedById_idx" ON "inquiry_attachments"("uploadedById") WHERE ("uploadedById" IS NOT NULL);

-- CreateIndex
CREATE INDEX "inquiry_attachments_uploadedByCustomerId_idx" ON "inquiry_attachments"("uploadedByCustomerId") WHERE ("uploadedByCustomerId" IS NOT NULL);

-- CreateIndex
CREATE INDEX "pending_customer_merges_sourceCustomerId_idx" ON "pending_customer_merges"("sourceCustomerId");

-- CreateIndex
CREATE INDEX "posts_createdAt_alive_idx" ON "posts"("createdAt") WHERE ("deletedAt" IS NULL);

-- CreateIndex
CREATE INDEX "receipts_reissuedFromId_idx" ON "receipts"("reissuedFromId") WHERE ("reissuedFromId" IS NOT NULL);

-- CreateIndex
CREATE INDEX "reservation_series_deletedById_idx" ON "reservation_series"("deletedById") WHERE ("deletedById" IS NOT NULL);

-- CreateIndex
CREATE INDEX "reservation_series_couponId_idx" ON "reservation_series"("couponId") WHERE ("couponId" IS NOT NULL);

-- CreateIndex
CREATE INDEX "reservations_deletedById_idx" ON "reservations"("deletedById") WHERE ("deletedById" IS NOT NULL);

-- CreateIndex
CREATE INDEX "smart_lock_devices_pairedLockDeviceId_idx" ON "smart_lock_devices"("pairedLockDeviceId") WHERE ("pairedLockDeviceId" IS NOT NULL);

-- CreateIndex
CREATE INDEX "smart_lock_passcodes_deviceId_idx" ON "smart_lock_passcodes"("deviceId");

