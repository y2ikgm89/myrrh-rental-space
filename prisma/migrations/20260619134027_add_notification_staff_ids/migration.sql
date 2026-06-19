-- 通知先にスタッフ(User.id 配列)を指定できるようにするため notificationStaffIds を追加。
-- 送信時に ID→現在メールへ解決する（メール変更・退職に自動追従）。
-- nullable JSONB の追加のみ＝後方互換（旧コードは参照しない）。
ALTER TABLE "settings" ADD COLUMN "notificationStaffIds" JSONB;
