-- squawk-ignore-file changing-column-type
--
-- 外部サービスの接続状態を enum 型へ寄せる。
--
-- 6 つの設定表が `'connected' | 'error'` という同じ値域を持ちながら、それぞれ
-- 手書き CHECK（`*_connection_status_check`）で別々に強制していた。同じ値域を
-- 6 箇所に書くと、1 箇所だけ値を足したときに気づけない。型 1 つに集約する。
--
-- squawk の `changing-column-type` は Risk 1（旧 revision が新スキーマを叩く）を
-- 検出する rule。`ALTER COLUMN ... TYPE` は deploy-production.yml の破壊的 DDL 判定に
-- 合致するのでデプロイは自動で計画ダウンタイム付きになる
-- （`migration-squawk-ignore-is-breaking.test.ts` が機械強制）。
--
-- 既存値は小文字なので `upper()` で写す。CHECK は enum 型が値域を担うので落とす。

BEGIN;

CREATE TYPE connection_status AS ENUM ('CONNECTED', 'ERROR');

ALTER TABLE "settings_stripe" DROP CONSTRAINT "settings_stripe_connection_status_check";
ALTER TABLE "settings_resend" DROP CONSTRAINT "settings_resend_connection_status_check";
ALTER TABLE "settings_turnstile" DROP CONSTRAINT "settings_turnstile_connection_status_check";
ALTER TABLE "settings_google_maps" DROP CONSTRAINT "settings_google_maps_connection_status_check";
ALTER TABLE "settings_google_calendar" DROP CONSTRAINT "settings_google_calendar_connection_status_check";
ALTER TABLE "settings_switchbot" DROP CONSTRAINT "settings_switchbot_connection_status_check";

ALTER TABLE "settings_stripe" ALTER COLUMN "stripe_connection_status" TYPE connection_status USING upper("stripe_connection_status")::connection_status;
ALTER TABLE "settings_resend" ALTER COLUMN "resend_connection_status" TYPE connection_status USING upper("resend_connection_status")::connection_status;
ALTER TABLE "settings_turnstile" ALTER COLUMN "turnstile_connection_status" TYPE connection_status USING upper("turnstile_connection_status")::connection_status;
ALTER TABLE "settings_google_maps" ALTER COLUMN "google_maps_connection_status" TYPE connection_status USING upper("google_maps_connection_status")::connection_status;
ALTER TABLE "settings_google_calendar" ALTER COLUMN "google_calendar_connection_status" TYPE connection_status USING upper("google_calendar_connection_status")::connection_status;
ALTER TABLE "settings_switchbot" ALTER COLUMN "switchbot_connection_status" TYPE connection_status USING upper("switchbot_connection_status")::connection_status;

COMMIT;
