-- googleCalendarPollingIntervalMin は管理UIで選択・保存できるが、双方向同期の実周期は
-- Cloud Scheduler のジョブ頻度（インフラ固定）で決まり、アプリの cron は本値を一切参照しない
-- 死に設定だった。設定面（列・UI・フォーム・型・マッピング）を撤去する。参照は同一 PR で全除去済み。
-- pre-release・単一インスタンスのため big-bang DROP。
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "googleCalendarPollingIntervalMin";
