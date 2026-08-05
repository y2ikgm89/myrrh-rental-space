-- squawk-ignore-file changing-column-type
-- squawk-ignore-file renaming-column
--
-- 金額の手動上書きを実行した管理者への参照を、text の論理参照から uuid の外部キーへ。
--
-- `reservations.price_overridden_by` は `users.id` を保持しているのに **User を指す列で
-- 唯一** text かつ FK 無しだった（`created_by` / `deleted_by_id` / `replied_by_id` は
-- どれも uuid + FK + ON DELETE SET NULL）。上書き額は返金額・領収書金額の根拠なので、
-- 実行者が退職して users 行が消えたとき、この列だけが**存在しない ID を指したまま残る**。
--
-- 併せて列名を house pattern（`deleted_by_id` + relation `deletedBy`）に揃える。
-- Prisma 側で relation field 名を `priceOverriddenBy` にするため、スカラー列は
-- `price_overridden_by_id` でなければ名前が衝突する。
--
-- ## 破壊的 DDL であること
--
-- RENAME COLUMN と ALTER COLUMN ... TYPE はいずれも deploy-production.yml の
-- 破壊的 DDL 判定に合致し、計画ダウンタイムが自動で付く（意図どおり）。
-- squawk 免除が破壊的判定と一致していることは
-- migration-squawk-ignore-is-breaking.test.ts が機械強制する。
--
-- ## データ修復をここでやらない
--
-- `::uuid` キャストも FK 追加も、既存値が不正なら**この migration が落ちる**。
-- 落とすのが正しい。migration 内でデータを黙って直すと副作用（append-only trigger /
-- 監査ログ）を迂回するため、このリポジトリでは禁止と決めてある。
-- 実行前の確認クエリは PR 本文に置いた。

BEGIN;

ALTER TABLE "reservations" RENAME COLUMN "price_overridden_by" TO "price_overridden_by_id";

ALTER TABLE "reservations"
  ALTER COLUMN "price_overridden_by_id" TYPE uuid USING "price_overridden_by_id"::uuid;

ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_price_overridden_by_id_fkey"
  FOREIGN KEY ("price_overridden_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 手動上書きは例外的な操作なので大半の行が NULL。`reservations_deleted_by_id_idx` と
-- 同じく partial にして NULL を索引に載せない。
CREATE INDEX "reservations_price_overridden_by_id_idx"
  ON "reservations" ("price_overridden_by_id")
  WHERE "price_overridden_by_id" IS NOT NULL;

COMMIT;
