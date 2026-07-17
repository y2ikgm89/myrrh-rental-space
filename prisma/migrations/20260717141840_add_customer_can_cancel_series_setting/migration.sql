-- AlterTable: settings.customerCanCancelSeriesInFull を追加 (Phase B.2 task 25)
-- 顧客が定期予約 (ReservationSeries) を series-all スコープで自らキャンセルできるか。
-- default false: 顧客はマイページから series-all キャンセルできず、admin 問い合わせ導線のみ。
-- table name は schema.prisma の `@@map("settings")` により lowercase (Settings ではなく settings)。
ALTER TABLE "settings" ADD COLUMN "customerCanCancelSeriesInFull" BOOLEAN NOT NULL DEFAULT false;
