-- 冗長な索引 20 本を削除する。
--
-- pg_index を直接走査して確定した内訳（実 DB・索引総数 349 本）:
--
--   完全重複 10 本 — 同じ列・同じ opclass の UNIQUE 索引が別に存在する。
--     プレーン側は検索でも制約でも一切使われず、書込コストだけを二重に払う。
--     例: receipts_reservationId_idx ⊂ receipts_reservationId_key
--
--   先頭プレフィクス重複 10 本 — その列を先頭に持つ複合索引が別に存在する。
--     PostgreSQL は複合索引を先頭列だけの述語にも使えるので、単列側は不要。
--     例: reservations_spaceId_idx ⊂ reservations_spaceId_startTime_endTime_idx
--
-- 削除対象はいずれも書込の重い表（reservations / event_registrations / inquiries /
-- audit_logs）に偏っており、INSERT / UPDATE / DELETE ごとに無駄な B-tree 更新が
-- 発生していた。
--
-- **FK 索引カバレッジは維持される。** 対象のうち FK 列に対応するもの
-- （reservations.spaceId / customerId、event_registrations.eventId / slotId、
-- inquiries.customerId、audit_logs.userId、receipts.*）は、いずれもその列を
-- **先頭に持つ**複合索引か UNIQUE 索引が残るため、
-- foreign-key-index-coverage.test.ts は緑のまま。
--
-- SQL は `prisma migrate diff --from-config-datasource --to-schema --script` の生成物。

-- DropIndex
DROP INDEX "audit_logs_userId_idx";

-- DropIndex
DROP INDEX "customers_emailCanonical_idx";

-- DropIndex
DROP INDEX "customers_lastName_idx";

-- DropIndex
DROP INDEX "event_categories_sortOrder_idx";

-- DropIndex
DROP INDEX "event_registrations_eventId_idx";

-- DropIndex
DROP INDEX "event_registrations_slotId_idx";

-- DropIndex
DROP INDEX "event_registrations_status_idx";

-- DropIndex
DROP INDEX "event_tickets_eventId_sortOrder_idx";

-- DropIndex
DROP INDEX "event_time_slots_eventId_startAt_idx";

-- DropIndex
DROP INDEX "inquiries_createdAt_idx";

-- DropIndex
DROP INDEX "inquiries_customerId_idx";

-- DropIndex
DROP INDEX "instagram_posts_sortOrder_idx";

-- DropIndex
DROP INDEX "navigation_items_type_order_idx";

-- DropIndex
DROP INDEX "post_categories_order_idx";

-- DropIndex
DROP INDEX "receipts_eventRegistrationId_idx";

-- DropIndex
DROP INDEX "receipts_reservationId_idx";

-- DropIndex
DROP INDEX "reservations_customerId_idx";

-- DropIndex
DROP INDEX "reservations_spaceId_idx";

-- DropIndex
DROP INDEX "social_links_order_idx";

-- DropIndex
DROP INDEX "space_categories_sortOrder_idx";

