-- イベント申込に、決済確定時点の税率を刻む列を足す。
--
-- ## なぜ要るのか
--
-- 適格請求書の税率区分は「取引年月日時点の税率」で書く。予約は決済時に
-- `reservations.tax_rate` へスナップショットしているが、イベント申込は
-- 持っていなかったため、領収書の発行側が**発行時点の設定**を読むしかなかった。
--
-- 決済と発行が離れる経路（`receipts/backfill.ts` の取りこぼし救済 cron、
-- 再発行、運用での後追い発行）で標準税率が変わっていると、append-only の証跡に
-- **その取引と無関係な税率区分**が焼かれる。出た紙は後から直せない。
--
-- なお `paid_amount` は `ticket.price × quantity` で、**税率が一切関与しない**
-- （イベントのチケット価格は税込で入力される）。つまり「決済に使った税率」という
-- ものは存在せず、ここに刻むのは「その取引の日に適用されていた標準税率」である。
--
-- ## nullable にする理由
--
-- 既存行には刻めない（その日の設定値がどこにも残っていない）。埋められない過去を
-- 現在値で埋めると「刻んである」という嘘になるので NULL のままにし、読み手側で
-- 「NULL なら設定から読む」と明示的に分岐させる。
--
-- 決済確定の書込で設定行が読めなかった場合も NULL のままにする。webhook を
-- 失敗させて「入金済みなのに確定しない」状態を作る方が害が大きい。

BEGIN;

ALTER TABLE "event_registrations" ADD COLUMN "tax_rate" INTEGER;

ALTER TABLE "event_registrations"
  ADD CONSTRAINT "event_registrations_tax_rate_range_check"
  CHECK ("tax_rate" IS NULL OR ("tax_rate" >= 0 AND "tax_rate" <= 100));

COMMIT;
