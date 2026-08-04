-- squawk-ignore-file renaming-table
--
-- 物理テーブル名を命名規約へ揃える。
--
-- squawk の `renaming-table` は Risk 1（ローリング切替窓で旧 revision が新スキーマを
-- 叩いて 500）を検出する rule で、通常は無効化しない。この 1 本だけ file 単位で
-- 免除するのは、`.squawk.toml` 冒頭と `scripts/lint-migrations.ts` の docblock が
-- 挙げる 3 条件をすべて満たすため:
--
--   1. Cloud Run は min0/max1 の単一インスタンスで、切替は atomic。旧 revision と
--      新スキーマが同時に存在する窓が原理的に無い。
--   2. `ALTER TABLE ... RENAME TO` は deploy-production.yml の破壊的 DDL grep に
--      合致するので、デプロイは自動で計画ダウンタイム付きへ切り替わる。
--   3. アプリ側は無変更で済む。テーブル名は `@@map` の値であって Prisma の
--      TypeScript API には現れないため、client 再生成後も型エラーは 0 件
--      （生の SQL を書いていた 5 箇所だけ本 PR で追随させた）。
--
-- Better Auth 由来の 4 表だけが単数形、設定 singleton 17 表だけが複数形という
-- 二重の不整合を解消する。`media`（不可算）と `inquiry_status_history`（履歴ログの
-- 集合名詞）は意図的に据え置く。
--
-- Prisma の自動生成は @@map 変更を「別テーブル」と見て DROP + CREATE を出す（44 文・
-- 全件喪失）。ALTER TABLE ... RENAME TO は行・索引・制約・外部キーを保つので手で書く。
--
-- 3 段構成:
--   1. テーブル本体の RENAME
--   2. Prisma 管理オブジェクト（PK / FK / index）の追随 — `prisma migrate diff` の出力そのもの
--   3. 手書き CHECK の追随 — Prisma は CHECK を管理しないので diff に出ない

BEGIN;

-- 1. テーブル
ALTER TABLE public."user" RENAME TO users;
ALTER TABLE public."account" RENAME TO accounts;
ALTER TABLE public."session" RENAME TO sessions;
ALTER TABLE public."verification" RENAME TO verifications;
ALTER TABLE public."admin_notification" RENAME TO admin_notifications;
ALTER TABLE public."settings_announcement_carousels" RENAME TO settings_announcement_carousel;
ALTER TABLE public."settings_systems" RENAME TO settings_system;
ALTER TABLE public."settings_seos" RENAME TO settings_seo;
ALTER TABLE public."settings_layouts" RENAME TO settings_layout;
ALTER TABLE public."settings_sidebars" RENAME TO settings_sidebar;
ALTER TABLE public."settings_organizations" RENAME TO settings_organization;
ALTER TABLE public."settings_commerces" RENAME TO settings_commerce;
ALTER TABLE public."settings_notifications" RENAME TO settings_notification;
ALTER TABLE public."settings_reservations" RENAME TO settings_reservation;
ALTER TABLE public."settings_stripes" RENAME TO settings_stripe;
ALTER TABLE public."settings_resends" RENAME TO settings_resend;
ALTER TABLE public."settings_turnstiles" RENAME TO settings_turnstile;
ALTER TABLE public."settings_google_calendars" RENAME TO settings_google_calendar;
ALTER TABLE public."settings_google_business_profiles" RENAME TO settings_google_business_profile;
ALTER TABLE public."settings_instagrams" RENAME TO settings_instagram;
ALTER TABLE public."settings_switchbots" RENAME TO settings_switchbot;
ALTER TABLE public."settings_data_retentions" RENAME TO settings_data_retention;

-- 2. Prisma 管理オブジェクト（PK / FK / index）
ALTER TABLE "accounts" RENAME CONSTRAINT "account_pkey" TO "accounts_pkey";
ALTER TABLE "admin_notifications" RENAME CONSTRAINT "admin_notification_pkey" TO "admin_notifications_pkey";
ALTER TABLE "sessions" RENAME CONSTRAINT "session_pkey" TO "sessions_pkey";
ALTER TABLE "settings_announcement_carousel" RENAME CONSTRAINT "settings_announcement_carousels_pkey" TO "settings_announcement_carousel_pkey";
ALTER TABLE "settings_commerce" RENAME CONSTRAINT "settings_commerces_pkey" TO "settings_commerce_pkey";
ALTER TABLE "settings_data_retention" RENAME CONSTRAINT "settings_data_retentions_pkey" TO "settings_data_retention_pkey";
ALTER TABLE "settings_google_business_profile" RENAME CONSTRAINT "settings_google_business_profiles_pkey" TO "settings_google_business_profile_pkey";
ALTER TABLE "settings_google_calendar" RENAME CONSTRAINT "settings_google_calendars_pkey" TO "settings_google_calendar_pkey";
ALTER TABLE "settings_instagram" RENAME CONSTRAINT "settings_instagrams_pkey" TO "settings_instagram_pkey";
ALTER TABLE "settings_layout" RENAME CONSTRAINT "settings_layouts_pkey" TO "settings_layout_pkey";
ALTER TABLE "settings_notification" RENAME CONSTRAINT "settings_notifications_pkey" TO "settings_notification_pkey";
ALTER TABLE "settings_organization" RENAME CONSTRAINT "settings_organizations_pkey" TO "settings_organization_pkey";
ALTER TABLE "settings_resend" RENAME CONSTRAINT "settings_resends_pkey" TO "settings_resend_pkey";
ALTER TABLE "settings_reservation" RENAME CONSTRAINT "settings_reservations_pkey" TO "settings_reservation_pkey";
ALTER TABLE "settings_seo" RENAME CONSTRAINT "settings_seos_pkey" TO "settings_seo_pkey";
ALTER TABLE "settings_sidebar" RENAME CONSTRAINT "settings_sidebars_pkey" TO "settings_sidebar_pkey";
ALTER TABLE "settings_stripe" RENAME CONSTRAINT "settings_stripes_pkey" TO "settings_stripe_pkey";
ALTER TABLE "settings_switchbot" RENAME CONSTRAINT "settings_switchbots_pkey" TO "settings_switchbot_pkey";
ALTER TABLE "settings_system" RENAME CONSTRAINT "settings_systems_pkey" TO "settings_system_pkey";
ALTER TABLE "settings_turnstile" RENAME CONSTRAINT "settings_turnstiles_pkey" TO "settings_turnstile_pkey";
ALTER TABLE "users" RENAME CONSTRAINT "user_pkey" TO "users_pkey";
ALTER TABLE "verifications" RENAME CONSTRAINT "verification_pkey" TO "verifications_pkey";
ALTER TABLE "accounts" RENAME CONSTRAINT "account_userId_fkey" TO "accounts_userId_fkey";
ALTER TABLE "sessions" RENAME CONSTRAINT "session_userId_fkey" TO "sessions_userId_fkey";
ALTER INDEX "account_userId_idx" RENAME TO "accounts_userId_idx";
ALTER INDEX "admin_notification_createdAt_idx" RENAME TO "admin_notifications_createdAt_idx";
ALTER INDEX "admin_notification_isRead_createdAt_idx" RENAME TO "admin_notifications_isRead_createdAt_idx";
ALTER INDEX "admin_notification_type_idx" RENAME TO "admin_notifications_type_idx";
ALTER INDEX "session_token_key" RENAME TO "sessions_token_key";
ALTER INDEX "session_userId_idx" RENAME TO "sessions_userId_idx";
ALTER INDEX "user_email_key" RENAME TO "users_email_key";
ALTER INDEX "user_name_idx" RENAME TO "users_name_idx";
ALTER INDEX "verification_identifier_idx" RENAME TO "verifications_identifier_idx";

-- 3. 手書き CHECK
ALTER TABLE public.settings_announcement_carousel RENAME CONSTRAINT "settings_announcement_carousels_singleton_check" TO "settings_announcement_carousel_singleton_check";
ALTER TABLE public.settings_commerce RENAME CONSTRAINT "settings_commerces_singleton_check" TO "settings_commerce_singleton_check";
ALTER TABLE public.settings_data_retention RENAME CONSTRAINT "settings_data_retentions_singleton_check" TO "settings_data_retention_singleton_check";
ALTER TABLE public.settings_google_business_profile RENAME CONSTRAINT "settings_google_business_profiles_singleton_check" TO "settings_google_business_profile_singleton_check";
ALTER TABLE public.settings_google_calendar RENAME CONSTRAINT "settings_google_calendars_connection_status_check" TO "settings_google_calendar_connection_status_check";
ALTER TABLE public.settings_google_calendar RENAME CONSTRAINT "settings_google_calendars_singleton_check" TO "settings_google_calendar_singleton_check";
ALTER TABLE public.settings_instagram RENAME CONSTRAINT "settings_instagrams_singleton_check" TO "settings_instagram_singleton_check";
ALTER TABLE public.settings_layout RENAME CONSTRAINT "settings_layouts_singleton_check" TO "settings_layout_singleton_check";
ALTER TABLE public.settings_notification RENAME CONSTRAINT "settings_notifications_singleton_check" TO "settings_notification_singleton_check";
ALTER TABLE public.settings_organization RENAME CONSTRAINT "settings_organizations_singleton_check" TO "settings_organization_singleton_check";
ALTER TABLE public.settings_resend RENAME CONSTRAINT "settings_resends_connection_status_check" TO "settings_resend_connection_status_check";
ALTER TABLE public.settings_resend RENAME CONSTRAINT "settings_resends_singleton_check" TO "settings_resend_singleton_check";
ALTER TABLE public.settings_reservation RENAME CONSTRAINT "settings_reservations_singleton_check" TO "settings_reservation_singleton_check";
ALTER TABLE public.settings_seo RENAME CONSTRAINT "settings_seos_singleton_check" TO "settings_seo_singleton_check";
ALTER TABLE public.settings_sidebar RENAME CONSTRAINT "settings_sidebars_singleton_check" TO "settings_sidebar_singleton_check";
ALTER TABLE public.settings_stripe RENAME CONSTRAINT "settings_stripes_connection_status_check" TO "settings_stripe_connection_status_check";
ALTER TABLE public.settings_stripe RENAME CONSTRAINT "settings_stripes_singleton_check" TO "settings_stripe_singleton_check";
ALTER TABLE public.settings_switchbot RENAME CONSTRAINT "settings_switchbots_connection_status_check" TO "settings_switchbot_connection_status_check";
ALTER TABLE public.settings_switchbot RENAME CONSTRAINT "settings_switchbots_singleton_check" TO "settings_switchbot_singleton_check";
ALTER TABLE public.settings_system RENAME CONSTRAINT "settings_systems_singleton_check" TO "settings_system_singleton_check";
ALTER TABLE public.settings_turnstile RENAME CONSTRAINT "settings_turnstiles_connection_status_check" TO "settings_turnstile_connection_status_check";
ALTER TABLE public.settings_turnstile RENAME CONSTRAINT "settings_turnstiles_singleton_check" TO "settings_turnstile_singleton_check";

COMMIT;
