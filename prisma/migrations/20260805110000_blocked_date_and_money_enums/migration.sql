-- squawk-ignore-file changing-column-type
--
-- 値域が閉じた 4 列を enum 型へ寄せる。
--
-- | 列 | これまでの DB 側の保護 |
-- | --- | --- |
-- | blocked_dates.scope | 判別 union の CHECK のみ（値域は無保護） |
-- | blocked_dates.type | **なし** |
-- | refunds.refunded_by_type | 手書き CHECK |
-- | transfer_accounts.account_type | **なし** |
--
-- 保護が無い 2 列は、生 SQL・seed・将来の直接書込が通れば任意の値が入る状態だった。
--
-- **`blocked_date_scope` の宣言順は cascade の優先順位そのもの。**
-- `availability.ts` は `orderBy: { scope: "asc" }` で最優先の理由を採り、
-- PostgreSQL の enum は宣言順でソートする。GLOBAL, LOCATION, SPACE の順を変えると
-- 全社休業日よりスペース単位の休業が優先される。
-- 検査は cascade-priority.test.ts が実 DB に行を入れて行う。
--
-- squawk の changing-column-type 免除は WP16 と同じ理由（ALTER COLUMN ... TYPE は
-- deploy-production.yml の破壊的 DDL 判定に合致し、計画ダウンタイムが自動で付く。
-- migration-squawk-ignore-is-breaking.test.ts が機械強制）。
--
-- 既存値は全て大文字なので変換は素のキャストで足りる。

BEGIN;

CREATE TYPE blocked_date_scope AS ENUM ('GLOBAL', 'LOCATION', 'SPACE');
CREATE TYPE blocked_date_type AS ENUM ('HOLIDAY', 'MAINTENANCE', 'EMERGENCY', 'OTHER');
CREATE TYPE refunded_by_type AS ENUM ('ADMIN', 'AUTO_ON_CANCEL', 'AUTO_CAPACITY_RACE', 'AUTO_AMOUNT_MISMATCH', 'STRIPE_DASHBOARD');
CREATE TYPE transfer_account_type AS ENUM ('ORDINARY', 'CURRENT', 'SAVINGS');

ALTER TABLE "refunds" DROP CONSTRAINT "refunds_refunded_by_type_check";

ALTER TABLE "blocked_dates" ALTER COLUMN "scope" TYPE blocked_date_scope USING "scope"::blocked_date_scope;
ALTER TABLE "blocked_dates" ALTER COLUMN "type" TYPE blocked_date_type USING "type"::blocked_date_type;
ALTER TABLE "refunds" ALTER COLUMN "refunded_by_type" TYPE refunded_by_type USING "refunded_by_type"::refunded_by_type;
ALTER TABLE "transfer_accounts" ALTER COLUMN "account_type" TYPE transfer_account_type USING "account_type"::transfer_account_type;

COMMIT;
