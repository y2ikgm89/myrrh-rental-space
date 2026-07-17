-- AlterTable: Settings.customerCanCancelSeriesInFull を追加 (Phase B.2 task 25)
-- 顧客が定期予約 (ReservationSeries) を series-all スコープで自らキャンセルできるか。
-- default false: 顧客はマイページから series-all キャンセルできず、admin 問い合わせ導線のみ。
ALTER TABLE "Settings" ADD COLUMN "customerCanCancelSeriesInFull" BOOLEAN NOT NULL DEFAULT false;
