-- 領収書の宛名・但し書きを VarChar(100) から TEXT にする。
--
-- どちらも他のレコードから導出される値で、導出元の方が長い:
--
--   subject       = `${Event.title} 参加費として`
--                   Event.title は VarChar(200) / Zod .max(200) なので最大 207 文字。
--                   **タイトルが 94 文字を超えた時点で 100 を割る。**
--   recipientName = `${Customer.lastName} ${Customer.firstName}`
--                   両者とも DB 上は無制限 TEXT。Zod 側も customer-profile.ts には
--                   上限が無く（本 PR で .max(50) を追加）、上限が効く経路でも
--                   50 + 1 + 50 = 101 で 1 文字はみ出す。
--
-- 超えると `tx.receipt.create` が Prisma P2000 を投げる。この例外は DomainError では
-- ないので stripe-webhook の catch が再送出し、webhook が 500 を返して Stripe が
-- 無限リトライする。決済は成立しているのに領収書だけ出ない状態になる。
--
-- ## 切り詰めではなく列を広げる理由
--
-- 領収書は会計証跡であり、宛名を黙って切り詰めた PDF は「正しく見える誤った書類」に
-- なる。落ちるより悪い。切り詰めは上限を別の桁へ動かすだけでもある（導出元が
-- 無制限 TEXT である以上、どんな n を選んでも同じ形の破綻が残る）。
--
-- 本 schema は既にスナップショット/自由記述の列を TEXT にしている
-- （terms_agreements.contentSnapshot、各種 description、notes 等）。導出元の
-- lastName / firstName / companyName も TEXT なので、導出先だけ VarChar(100) で
-- 縛られている現状の方が不整合である。PostgreSQL 公式も varchar(n) に性能上の
-- 利点は無いとしており、長さ制約はドメイン上必要な場所（= 入力の Zod）に置く。
--
-- 表現域の widening なので既存値は 1 件も失われない。

ALTER TABLE "receipts"
  ALTER COLUMN "recipientName" TYPE TEXT,
  ALTER COLUMN "subject" TYPE TEXT;
