-- 予約の利用人数を保存する。
--
-- 公開予約フォームは `numberOfGuests` を必須で集め、`guestCountCapacityError` が
-- スペース定員に対して server-side で検査していたが、**DB に列が無く保存されて
-- いなかった**。その結果、編集画面は読む値が無いので `numberOfGuests={1}` を
-- ハードコードしており、20 名の予約をマイページから編集すると 1 名として送信され、
-- **定員 1 名のスペースへ移動できていた**（定員 gate が編集経路で実質無効）。
--
-- nullable にするのは「記録が無い」と「1 名」を区別するため。この列より前の予約には
-- 実際の人数が存在せず、`DEFAULT 1` で埋めるのは捏造になる。編集画面がやっていたのが
-- まさにそれで、同じ嘘を DB に固定してしまう。
--
-- 値域は他の数量列（event_time_slots_capacity_positive 等）と揃えて 1 以上。
-- 定員上限は Space ごとに異なるので DB では見ない（アプリの gate が担当）。

ALTER TABLE "reservations" ADD COLUMN "numberOfGuests" INTEGER;

ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_number_of_guests_positive_check"
  CHECK ("numberOfGuests" IS NULL OR "numberOfGuests" >= 1);
