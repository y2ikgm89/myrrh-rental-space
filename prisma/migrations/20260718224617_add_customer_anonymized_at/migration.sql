-- STATE-03: Customer anonymize command 用の証跡列を追加する (additive、全 nullable)。
--
-- 目的: 決済歴 (Receipt 発行済) のある Customer は物理削除できない
-- (Receipt.reservation は onDelete: Restrict、Reservation.customer は Cascade)。
-- deleteCustomer を廃止し anonymizeCustomer に置換するため、匿名化実施時刻と
-- 理由コードを Customer に直接持たせる。
--
-- 破壊的変更: なし。全列 nullable のため既存行は影響なし、
-- Prisma 側でも append-only 契約 (update で anonymizedAt を非 null に一度だけ設定)。

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "anonymizedAt" TIMESTAMP(3),
ADD COLUMN     "anonymizedReason" VARCHAR(50);
