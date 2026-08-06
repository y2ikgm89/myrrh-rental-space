-- 金額の内側の辻褄を DB に見せる。
--
-- ## 1. 予約: 税額が税率から導かれた値であること
--
-- これまで DB が見ていたのは「`tax_rate` は 0..100」「`tax_amount` は 0 以上」
-- 「`total_price_with_tax` = `total_price` + `tax_amount`」の 3 本だけで、
-- **税額そのものが税率から導かれた値かどうかは誰も見ていなかった**。
-- 税抜 10,000 円・税率 10%・税額 3,000 円・税込 13,000 円という行は、
-- 3 本すべてを満たしたまま保存できる。
--
-- 顧客が見るのは合計だけなので、内訳の矛盾は請求時まで表に出ない。
-- 領収書 PDF は税抜・税額・税込を並べて印字するので、そこで初めて
-- 「10% のはずが 30% 取られている」ように見える紙が出る。
--
-- 書込経路は 4 本 + seed があり、**すべて同じ式**を使っている:
--
--   pricing/tax.ts             Math.round(totalPrice * (taxRate / 100))
--   reservations/admin-commands.ts       Math.round(finalTotalPrice * snapshotTaxRate / 100)
--   reservations/customer-commands.ts    同上
--   reservations/calendar-sync-inbound-mutations.ts  同上
--   prisma/seed.ts             同上
--
-- 管理者の金額上書きも `total_price` を差し替えたうえで同じ式で引き直すので、
-- 上書き後の行もこの CHECK を満たす。
--
-- PostgreSQL の `round(numeric)` は 0 から遠い方へ、JS の `Math.round` は
-- +∞ 方向へ丸める。`total_price >= 0` かつ `tax_rate >= 0` なので両者は一致する。
-- JS 側は二進浮動小数だが、`total_price * tax_rate / 100` は整数どうしの積を
-- 100 で割った値 = 必ず 0.01 の倍数なので、`.5` の境界に 1e-11 より近づくことがなく、
-- 丸め結果は厳密演算と一致する。
--
-- ## 2. 領収書: 税額が総額を超えないこと
--
-- `amount >= 0` と `tax_amount >= 0` は別々に見ていたが、両者の関係を見ていなかった。
-- 領収書 PDF は税抜対象額を `amount - tax_amount` で毎回導出するため、
-- `tax_amount > amount` の行は**負の税抜金額**を印字する。
--
-- 既存の `receipts_money_non_negative_check` は DROP しない。あれは
-- 「どちらも負にならない」という別の事実で、今も正しい。1 本の CHECK に
-- 無関係な事実を詰め込むより、名前で読み分けられる方がよい
-- （DROP CONSTRAINT はデプロイの自動ダウンタイムモードに入る、という事情もある）。
--
-- ## 既存データ
--
-- どちらも既存行を検査する DDL なので、違反行があれば適用時に落ちる。
-- 本番の Cloud Run migrate job は `scripts/migration-preconditions.ts` を
-- `prisma migrate deploy` の**前**に実行し、この migration を実際に流して巻き戻すので、
-- 違反があれば `_prisma_migrations` に失敗を残さずそこで止まる。

BEGIN;

ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_tax_amount_derivation_check"
  CHECK ("tax_amount" = round("total_price"::numeric * "tax_rate" / 100));

ALTER TABLE "receipts"
  ADD CONSTRAINT "receipts_tax_within_amount_check"
  CHECK ("tax_amount" <= "amount");

COMMIT;
