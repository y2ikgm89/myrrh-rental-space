-- リリース前のメール設定刷新クリーンアップ。
-- 送信元(senderEmail/senderName)・冗長マスター(sendAdminNotificationEmail)・
-- 未使用テンプレートID4列を撤去し、イベント管理者通知トグル2列を追加する。
-- アクティブユーザーなし＋単一インスタンス(Cloud Run min0/max1)のため big-bang DROP。
-- 各 DROP は squawk の per-statement ignore に合わせ個別文に分割する。

-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "adminNotificationTemplateId";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "reservationCancelledTemplateId";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "reservationConfirmationTemplateId";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "reservationUpdatedTemplateId";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "sendAdminNotificationEmail";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "senderEmail";
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "senderName";

ALTER TABLE "settings" ADD COLUMN "notifyEventCancellation" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "settings" ADD COLUMN "notifyEventRegistration" BOOLEAN NOT NULL DEFAULT true;
