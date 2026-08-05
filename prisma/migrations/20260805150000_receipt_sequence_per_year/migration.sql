-- squawk-ignore-file ban-drop-column
--
-- 領収書番号の連番を「単一行 + year 列」から「年ごとに 1 行」へ。
--
-- ## なぜ
--
-- `receipt_sequences` は `id = 'singleton'` の 1 行だけを持ち、`year` は
-- 「今どの年を数えているか」を表す可変フィールドだった。そのため採番コードに
--
--     if (existing.year !== currentYear) { nextNo = 1; ... }
--
-- という**過去の年の到達点を捨てる分岐**が必要になる。時計が戻る・年を跨いだ
-- 再実行といった場面でこの分岐が走ると、既に発行済みの番号をもう一度採る。
-- `receipts.serial_no` は UNIQUE なので、そのとき落ちるのは**領収書の発行**で、
-- 入金済みの顧客に領収書が出せなくなる。
--
-- 年を主キーにすれば採番は「その年の行を +1」だけになり、分岐そのものが消える。
--
-- ## 既存行の扱い
--
-- 単一行の `year` はそのまま主キーになる（値は変えない）。到達点は保存される。
--
-- ## 破壊的 DDL であること
--
-- `DROP COLUMN` / `DROP CONSTRAINT` は deploy-production.yml の破壊的 DDL 判定に
-- 合致し、計画ダウンタイムが自動で付く（意図どおり）。squawk 免除が破壊的判定と
-- 一致していることは migration-squawk-ignore-is-breaking.test.ts が機械強制する。
--
-- ## 文の順序
--
-- 主キーの張り替えは「落ちうる ADD」を含むので BEGIN/COMMIT で包む。
-- 包まないと、PRIMARY KEY を落とした後で新しい PRIMARY KEY の作成に失敗した場合、
-- **どちらの主キーも無い状態**で止まる。

BEGIN;

-- id 列にしか依存していない CHECK。列を落とせば PostgreSQL が連鎖で消すが、
-- 何が消えるかを明示するために先に落とす。
ALTER TABLE "receipt_sequences" DROP CONSTRAINT "receipt_sequences_singleton_check";

ALTER TABLE "receipt_sequences" DROP CONSTRAINT "receipt_sequences_pkey";

ALTER TABLE "receipt_sequences" DROP COLUMN "id";

ALTER TABLE "receipt_sequences" ADD CONSTRAINT "receipt_sequences_pkey" PRIMARY KEY ("year");

COMMIT;
