-- 残っていた 177 個の `timestamp without time zone` 列を TIMESTAMPTZ(6) に寄せ、
-- DB 全体の日時型を 1 つに統一する（適用後: timestamptz 223 / naive 0）。
--
-- 20260728140000_timestamptz_and_yen_int_unify は Reservation / ReservationSeries /
-- Event / EventRegistration の 46 列だけを対象にしており、残り 177 列は naive のまま
-- 据え置かれていた。同じ DB に 2 種類の日時型が混在している状態が本 migration の対象。
--
-- なぜ揃えるか:
--   `timestamp without time zone` はオフセットを持たない。67 テーブルの列 DEFAULT は
--   `CURRENT_TIMESTAMP`（= timestamptz）で、naive 列へ代入される瞬間に**セッションの
--   TimeZone で暗黙変換**される。アプリは保存値を UTC として読む（Prisma の naive 列
--   デシリアライズ）ので、セッション TimeZone が UTC でなくなった瞬間に全行の
--   createdAt / updatedAt が丸ごとずれる。現在は docker も Neon も UTC 既定なので
--   露見していないだけで、正しさが「DB の設定が変わらないこと」に依存している。
--   同じ暗黙変換は raw SQL の比較にも効く（例:
--   `src/shared/domain/coupons/queries.ts` の `"validFrom" <= ${now}` は
--   naive 列と timestamptz パラメータの比較）。
--   PostgreSQL 公式も timestamptz を既定として推奨している。
--
-- 変換方針は先行 migration と同一: 保存値は UTC が SSoT なので `AT TIME ZONE 'UTC'`。
-- セッション TimeZone に依存しない明示変換にする（暗黙変換に任せない）。
--
-- 検証（使い捨て DB に全 migration 適用 → 本 SQL 適用 → 実測）:
--   trigger 13→13 / CHECK 49→49 / EXCLUDE 1→1 / partial index 16→16 /
--   index 333→333 / FK 81→81 と手書き資産は全て保全され、
--   naive 177→0・timestamptz 46→223、schema.prisma との `migrate diff` は空。
--
-- デプロイ影響: `ALTER COLUMN ... TYPE` を含むため deploy workflow が自動的に
-- breaking migration mode に入り、public/admin 両サービスの計画ダウンタイムが発生する。

ALTER TABLE "account"
  ALTER COLUMN "accessTokenExpiresAt" TYPE TIMESTAMPTZ(6) USING "accessTokenExpiresAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "refreshTokenExpiresAt" TYPE TIMESTAMPTZ(6) USING "refreshTokenExpiresAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "announcement_bars"
  ALTER COLUMN "startAt" TYPE TIMESTAMPTZ(6) USING "startAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "endAt" TYPE TIMESTAMPTZ(6) USING "endAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "audit_logs"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "block_templates"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "blocked_dates"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "coupons"
  ALTER COLUMN "validFrom" TYPE TIMESTAMPTZ(6) USING "validFrom" AT TIME ZONE 'UTC',
  ALTER COLUMN "validUntil" TYPE TIMESTAMPTZ(6) USING "validUntil" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "customers"
  ALTER COLUMN "lastReservationAt" TYPE TIMESTAMPTZ(6) USING "lastReservationAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "firstReservationAt" TYPE TIMESTAMPTZ(6) USING "firstReservationAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "emailDeliveryUpdatedAt" TYPE TIMESTAMPTZ(6) USING "emailDeliveryUpdatedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "flaggedForReviewAt" TYPE TIMESTAMPTZ(6) USING "flaggedForReviewAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "anonymizedAt" TYPE TIMESTAMPTZ(6) USING "anonymizedAt" AT TIME ZONE 'UTC';

ALTER TABLE "editor_comment_threads"
  ALTER COLUMN "resolvedAt" TYPE TIMESTAMPTZ(6) USING "resolvedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "editor_comments"
  ALTER COLUMN "deletedAt" TYPE TIMESTAMPTZ(6) USING "deletedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "event_categories"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "event_tickets"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "event_time_slots"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "faq_categories"
  ALTER COLUMN "deletedAt" TYPE TIMESTAMPTZ(6) USING "deletedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "faq_items"
  ALTER COLUMN "publishedAt" TYPE TIMESTAMPTZ(6) USING "publishedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "deletedAt" TYPE TIMESTAMPTZ(6) USING "deletedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "lastViewedAt" TYPE TIMESTAMPTZ(6) USING "lastViewedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "inquiries"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "slaExpiresAt" TYPE TIMESTAMPTZ(6) USING "slaExpiresAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "deletedAt" TYPE TIMESTAMPTZ(6) USING "deletedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "anonymizedAt" TYPE TIMESTAMPTZ(6) USING "anonymizedAt" AT TIME ZONE 'UTC';

ALTER TABLE "inquiry_attachments"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "inquiry_internal_notes"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "inquiry_replies"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "inquiry_status_history"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "inquiry_tag_on_inquiries"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "inquiry_tags"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "instagram_posts"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "locations"
  ALTER COLUMN "gbpSyncedAt" TYPE TIMESTAMPTZ(6) USING "gbpSyncedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "login_attempts"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "media"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "navigation_items"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "news"
  ALTER COLUMN "publishedAt" TYPE TIMESTAMPTZ(6) USING "publishedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "pages"
  ALTER COLUMN "publishedAt" TYPE TIMESTAMPTZ(6) USING "publishedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "pending_customer_email_changes"
  ALTER COLUMN "expiresAt" TYPE TIMESTAMPTZ(6) USING "expiresAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "consumedAt" TYPE TIMESTAMPTZ(6) USING "consumedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "pending_customer_merges"
  ALTER COLUMN "expiresAt" TYPE TIMESTAMPTZ(6) USING "expiresAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "consumedAt" TYPE TIMESTAMPTZ(6) USING "consumedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "post_categories"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "post_tags"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "posts"
  ALTER COLUMN "publishedAt" TYPE TIMESTAMPTZ(6) USING "publishedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "deletedAt" TYPE TIMESTAMPTZ(6) USING "deletedAt" AT TIME ZONE 'UTC';

ALTER TABLE "sections"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "session"
  ALTER COLUMN "expiresAt" TYPE TIMESTAMPTZ(6) USING "expiresAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "settings_analytics"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "settings_announcement_carousels"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "settings_commerces"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "settings_data_retentions"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "settings_features"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "settings_google_business_profiles"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "settings_google_calendars"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "googleCalendarLastTestedAt" TYPE TIMESTAMPTZ(6) USING "googleCalendarLastTestedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "googleCalendarLastSyncedAt" TYPE TIMESTAMPTZ(6) USING "googleCalendarLastSyncedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "googleCalendarWebhookExpiration" TYPE TIMESTAMPTZ(6) USING "googleCalendarWebhookExpiration" AT TIME ZONE 'UTC';

ALTER TABLE "settings_google_maps"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "googleMapsLastTestedAt" TYPE TIMESTAMPTZ(6) USING "googleMapsLastTestedAt" AT TIME ZONE 'UTC';

ALTER TABLE "settings_instagrams"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "instagramTokenExpiresAt" TYPE TIMESTAMPTZ(6) USING "instagramTokenExpiresAt" AT TIME ZONE 'UTC';

ALTER TABLE "settings_layouts"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "settings_notifications"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "settings_organizations"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "establishedDate" TYPE TIMESTAMPTZ(6) USING "establishedDate" AT TIME ZONE 'UTC';

ALTER TABLE "settings_resends"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "resendLastTestedAt" TYPE TIMESTAMPTZ(6) USING "resendLastTestedAt" AT TIME ZONE 'UTC';

ALTER TABLE "settings_reservations"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "settings_seos"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "settings_sidebars"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "settings_stripes"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "stripeLastTestedAt" TYPE TIMESTAMPTZ(6) USING "stripeLastTestedAt" AT TIME ZONE 'UTC';

ALTER TABLE "settings_switchbots"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "switchbotLastTestedAt" TYPE TIMESTAMPTZ(6) USING "switchbotLastTestedAt" AT TIME ZONE 'UTC';

ALTER TABLE "settings_systems"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "settings_turnstiles"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "turnstileLastTestedAt" TYPE TIMESTAMPTZ(6) USING "turnstileLastTestedAt" AT TIME ZONE 'UTC';

ALTER TABLE "smart_lock_devices"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "lastStateAt" TYPE TIMESTAMPTZ(6) USING "lastStateAt" AT TIME ZONE 'UTC';

ALTER TABLE "smart_lock_passcodes"
  ALTER COLUMN "startTime" TYPE TIMESTAMPTZ(6) USING "startTime" AT TIME ZONE 'UTC',
  ALTER COLUMN "endTime" TYPE TIMESTAMPTZ(6) USING "endTime" AT TIME ZONE 'UTC',
  ALTER COLUMN "confirmedAt" TYPE TIMESTAMPTZ(6) USING "confirmedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "revokedAt" TYPE TIMESTAMPTZ(6) USING "revokedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "revokeRequestedAt" TYPE TIMESTAMPTZ(6) USING "revokeRequestedAt" AT TIME ZONE 'UTC';

ALTER TABLE "social_links"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "space_categories"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "space_rate_plans"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "space_reviews"
  ALTER COLUMN "repliedAt" TYPE TIMESTAMPTZ(6) USING "repliedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "spaces"
  ALTER COLUMN "publishedAt" TYPE TIMESTAMPTZ(6) USING "publishedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "terms_agreements"
  ALTER COLUMN "agreedAt" TYPE TIMESTAMPTZ(6) USING "agreedAt" AT TIME ZONE 'UTC';

ALTER TABLE "terms_documents"
  ALTER COLUMN "publishedAt" TYPE TIMESTAMPTZ(6) USING "publishedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "deletedAt" TYPE TIMESTAMPTZ(6) USING "deletedAt" AT TIME ZONE 'UTC';

ALTER TABLE "transfer_accounts"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "user"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "verification"
  ALTER COLUMN "expiresAt" TYPE TIMESTAMPTZ(6) USING "expiresAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';
