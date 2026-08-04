-- 索引名の camelCase を解消する。物理名の snake_case 化はこれで完了。
--
-- 列・テーブル・enum は 20260804085847〜20260804150000 で寄せたが、**索引名は
-- 命名ゲートの盲点だった**。内訳は 2 種類:
--
--   1. schema の `map:` で明示していた 21 本 — 宣言をそのまま snake_case にする
--   2. Prisma が列名から導出する 2 本（customers_firstName_idx / events_spaceId_idx）
--      — 列を rename したときに追随しそこねて履歴 DB に旧名が残っていた。
--      **これは実ドリフト**で、baseline を畳んだ結果と食い違う（census が検出）。
--
-- `ALTER INDEX ... RENAME TO` は破壊的 DDL 判定の対象外（旧 revision は索引名を
-- 参照しない）。計画ダウンタイムは要らないし squawk の免除も要らない。

BEGIN;

ALTER INDEX "locations_active_sortOrder_key" RENAME TO locations_active_sort_order_key;
ALTER INDEX "space_categories_sortOrder_key" RENAME TO space_categories_sort_order_key;
ALTER INDEX "reservation_series_deletedById_idx" RENAME TO reservation_series_deleted_by_id_idx;
ALTER INDEX "reservation_series_couponId_idx" RENAME TO reservation_series_coupon_id_idx;
ALTER INDEX "reservations_deletedById_idx" RENAME TO reservations_deleted_by_id_idx;
ALTER INDEX "inquiry_attachments_uploadedById_idx" RENAME TO inquiry_attachments_uploaded_by_id_idx;
ALTER INDEX "inquiry_attachments_uploadedByCustomerId_idx" RENAME TO inquiry_attachments_uploaded_by_customer_id_idx;
ALTER INDEX "announcement_bars_displayOrder_key" RENAME TO announcement_bars_display_order_key;
ALTER INDEX "posts_createdAt_alive_idx" RENAME TO posts_created_at_alive_idx;
ALTER INDEX "sections_pageId_order_key" RENAME TO sections_page_id_order_key;
ALTER INDEX "faq_items_categoryId_order_active_key" RENAME TO faq_items_category_id_order_active_key;
ALTER INDEX "instagram_posts_sortOrder_key" RENAME TO instagram_posts_sort_order_key;
ALTER INDEX "terms_documents_displayOrder_active_key" RENAME TO terms_documents_display_order_active_key;
ALTER INDEX "editor_comment_threads_resolvedBy_idx" RENAME TO editor_comment_threads_resolved_by_idx;
ALTER INDEX "editor_comments_deletedBy_idx" RENAME TO editor_comments_deleted_by_idx;
ALTER INDEX "event_categories_sortOrder_key" RENAME TO event_categories_sort_order_key;
ALTER INDEX "events_spaceId_alive_idx" RENAME TO events_space_id_alive_idx;
ALTER INDEX "events_deletedById_idx" RENAME TO events_deleted_by_id_idx;
ALTER INDEX "event_tickets_eventId_sortOrder_key" RENAME TO event_tickets_event_id_sort_order_key;
ALTER INDEX "receipts_reissuedFromId_idx" RENAME TO receipts_reissued_from_id_idx;
ALTER INDEX "smart_lock_devices_pairedLockDeviceId_idx" RENAME TO smart_lock_devices_paired_lock_device_id_idx;
ALTER INDEX "customers_firstName_idx" RENAME TO customers_first_name_idx;
ALTER INDEX "events_spaceId_idx" RENAME TO events_space_id_idx;

COMMIT;
