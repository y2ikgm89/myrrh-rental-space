-- 記録されていないログイン試行テーブルと、その保持設定を削除する。
--
-- `login_attempts` には **本番の書き込み経路が無い**。行を作っていたのは
-- prisma/seed.ts（デモデータ）だけで、読む場所は 1 箇所も無かった
-- （レートリミットもロックアウトも管理画面表示もこのテーブルを見ていない）。
-- 顧客認証は Better Auth、管理画面は IAP で、どちらも自前のテーブルを使う。
--
-- それでも `Settings.dataRetention` には `loginAttemptMonths` があり、管理画面に
-- 「ログイン試行記録 / login_attempts テーブル」という保持期間の入力欄が出ていた。
-- **記録していないデータの保持期間を運用者に設定させていた**ことになり、
-- 「ログイン試行は記録されている」という誤った安心を与える。空のテーブルを
-- 毎日 DELETE する cron も回っていた。
--
-- 機能として実装する選択肢もあるが、それは監査の範囲を超える新規機能なので、
-- ここでは実装されていない設備を撤去する側を採る。将来必要になったら、
-- 何を記録し誰が読むかを決めたうえで改めて追加する。
--
-- 既存行の `dataRetention` JSON に残る `loginAttemptMonths` は読み側の Zod が
-- 既定で未知キーを落とすため無害。ここで直すのは列 DEFAULT だけで、
-- 新規行に余分なキーが入らないようにする。
--
-- `DROP TABLE` は deploy-production.yml の breaking 判定に一致するため、この
-- migration を含むデプロイは計画ダウンタイムモードになる。

-- 新規行の既定値から保持月数キーを外す（既存行は読み側で無視されるため触らない）
ALTER TABLE "settings_data_retentions"
  ALTER COLUMN "dataRetention" SET DEFAULT '{"sessionMonths":6,"verificationMonths":6,"reservationGuestMonths":12,"inquiryMonths":36,"customerInactiveMonths":84}';

-- squawk-ignore ban-drop-table
DROP TABLE "login_attempts";
