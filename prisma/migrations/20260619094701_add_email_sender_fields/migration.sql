-- 送信元(From)を管理画面から設定可能にするため senderEmail / senderName を復活。
-- env (EMAIL_FROM / EMAIL_FROM_NAME) 優先・DB フォールバックの env-OR-DB。
-- nullable 列の追加のみ＝後方互換（旧コードは参照しない・新コードは null フォールバック）。
ALTER TABLE "settings" ADD COLUMN "senderEmail" TEXT;
ALTER TABLE "settings" ADD COLUMN "senderName" TEXT;
