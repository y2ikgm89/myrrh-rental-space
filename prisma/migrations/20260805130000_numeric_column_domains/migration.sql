-- 数値列 84 本のうち、値域制約を持っていなかった 55 本に CHECK を付ける。
--
-- ## なぜ必要か
--
-- 金額・税率・定員には既に CHECK があるのに、**評価点・座標・税率設定・その他の
-- 数値列は素通し**だった。DB が受理してしまう代表例:
--
-- | 列 | 入れられた値 | 顧客に起きること |
-- | --- | --- | --- |
-- | space_reviews.rating | -3 / 99 | 星の描画が壊れ、スペースの平均評価が狂う |
-- | locations.latitude / longitude | 999 | 地図が拠点と無関係な場所を指す |
-- | settings_commerce.tax_standard_rate | 1000 | 予約側の tax_rate CHECK に弾かれ**予約が作れなくなる** |
-- | event_registrations.paid_amount | -1 | 返金額の計算根拠が負になる |
--
-- tax rate は特に非対称だった — `reservations_tax_rate_range_check` は 0..100 を
-- 強制しているのに、**その値を供給する設定側**には何も無かった。
--
-- ## 値域の決め方
--
-- DB の CHECK は**アプリの Zod より狭くしない**。狭いと今まで通っていた入力が
-- 22001 相当の生エラーになり、利用者には理由の分からない失敗として出る。
--
--   - 物理・法的に決まるもの: 緯度 -90..90 / 経度 -180..180（WGS84）、
--     評価 1..5、税率 0..100、電池残量 0..100、年 2000..9999
--   - 0 が意味を成さないもの（幅・所要分・件数上限）: > 0
--   - それ以外（並び順・カウンタ・金額・サイズ）: >= 0
--
-- NULL は CHECK を UNKNOWN で通るので、nullable 列でも「未設定」は従来どおり。
--
-- ## 1 列 1 制約にしてある
--
-- 表ごとにまとめると失敗時にどの列か分からず、述語を実測する generic prober
-- （numeric-column-domains の integration 側）も単一列前提で書けない。

BEGIN;

ALTER TABLE "locations" ADD CONSTRAINT "locations_latitude_range_check" CHECK ("latitude" >= -90 AND "latitude" <= 90);
ALTER TABLE "locations" ADD CONSTRAINT "locations_longitude_range_check" CHECK ("longitude" >= -180 AND "longitude" <= 180);
ALTER TABLE "space_reviews" ADD CONSTRAINT "space_reviews_rating_range_check" CHECK ("rating" >= 1 AND "rating" <= 5);
ALTER TABLE "settings_commerce" ADD CONSTRAINT "settings_commerce_tax_standard_rate_range_check" CHECK ("tax_standard_rate" >= 0 AND "tax_standard_rate" <= 100);
ALTER TABLE "settings_commerce" ADD CONSTRAINT "settings_commerce_tax_reduced_rate_range_check" CHECK ("tax_reduced_rate" >= 0 AND "tax_reduced_rate" <= 100);
ALTER TABLE "smart_lock_devices" ADD CONSTRAINT "smart_lock_devices_last_battery_range_check" CHECK ("last_battery" >= 0 AND "last_battery" <= 100);
ALTER TABLE "receipt_sequences" ADD CONSTRAINT "receipt_sequences_year_range_check" CHECK ("year" >= 2000 AND "year" <= 9999);
ALTER TABLE "reservation_series" ADD CONSTRAINT "reservation_series_duration_positive_check" CHECK ("duration" > 0);
ALTER TABLE "reservation_series" ADD CONSTRAINT "reservation_series_instance_count_positive_check" CHECK ("instance_count" > 0);
ALTER TABLE "settings_announcement_carousel" ADD CONSTRAINT "settings_announcement_carousel_duration_positive_check" CHECK ("duration" > 0);
ALTER TABLE "settings_layout" ADD CONSTRAINT "settings_layout_container_width_custom_positive_check" CHECK ("container_width_custom" > 0);
ALTER TABLE "settings_layout" ADD CONSTRAINT "settings_layout_content_width_custom_positive_check" CHECK ("content_width_custom" > 0);
ALTER TABLE "news" ADD CONSTRAINT "news_content_width_custom_positive_check" CHECK ("content_width_custom" > 0);
ALTER TABLE "posts" ADD CONSTRAINT "posts_content_width_custom_positive_check" CHECK ("content_width_custom" > 0);
ALTER TABLE "settings_sidebar" ADD CONSTRAINT "settings_sidebar_sidebar_recent_count_positive_check" CHECK ("sidebar_recent_count" > 0);
ALTER TABLE "settings_sidebar" ADD CONSTRAINT "settings_sidebar_sidebar_popular_count_positive_check" CHECK ("sidebar_popular_count" > 0);
ALTER TABLE "settings_reservation" ADD CONSTRAINT "settings_reservation_default_time_slot_positive_check" CHECK ("default_time_slot" > 0);
ALTER TABLE "settings_reservation" ADD CONSTRAINT "settings_reservation_min_reservation_duration_positive_check" CHECK ("min_reservation_duration" > 0);
ALTER TABLE "settings_reservation" ADD CONSTRAINT "settings_reservation_max_reservation_duration_positive_check" CHECK ("max_reservation_duration" > 0);
ALTER TABLE "settings_reservation" ADD CONSTRAINT "settings_reservation_max_recurrence_instances_positive_check" CHECK ("max_recurrence_instances" > 0);
ALTER TABLE "settings_reservation" ADD CONSTRAINT "settings_reservation_cancellation_deadline_hours_positive_check" CHECK ("cancellation_deadline_hours" > 0);
ALTER TABLE "settings_reservation" ADD CONSTRAINT "settings_reservation_modification_deadline_hours_positive_check" CHECK ("modification_deadline_hours" > 0);
ALTER TABLE "receipt_sequences" ADD CONSTRAINT "receipt_sequences_next_no_positive_check" CHECK ("next_no" > 0);
ALTER TABLE "locations" ADD CONSTRAINT "locations_sort_order_position_check" CHECK ("sort_order" >= 0 OR "sort_order" <= -1000000);
ALTER TABLE "space_categories" ADD CONSTRAINT "space_categories_sort_order_position_check" CHECK ("sort_order" >= 0 OR "sort_order" <= -1000000);
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_version_non_negative_check" CHECK ("version" >= 0);
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_ics_sequence_non_negative_check" CHECK ("ics_sequence" >= 0);
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_recurrence_instance_index_non_negative_check" CHECK ("recurrence_instance_index" >= 0);
ALTER TABLE "customers" ADD CONSTRAINT "customers_total_reservations_non_negative_check" CHECK ("total_reservations" >= 0);
ALTER TABLE "customers" ADD CONSTRAINT "customers_total_spent_non_negative_check" CHECK ("total_spent" >= 0);
ALTER TABLE "inquiry_attachments" ADD CONSTRAINT "inquiry_attachments_size_bytes_non_negative_check" CHECK ("size_bytes" >= 0);
ALTER TABLE "announcement_bars" ADD CONSTRAINT "announcement_bars_display_order_position_check" CHECK ("display_order" >= 0 OR "display_order" <= -1000000);
ALTER TABLE "posts" ADD CONSTRAINT "posts_view_count_non_negative_check" CHECK ("view_count" >= 0);
ALTER TABLE "post_categories" ADD CONSTRAINT "post_categories_order_position_check" CHECK ("order" >= 0 OR "order" <= -1000000);
ALTER TABLE "sections" ADD CONSTRAINT "sections_order_position_check" CHECK ("order" >= -1 OR "order" <= -1000000);
ALTER TABLE "navigation_items" ADD CONSTRAINT "navigation_items_order_position_check" CHECK ("order" >= 0 OR "order" <= -1000000);
ALTER TABLE "social_links" ADD CONSTRAINT "social_links_order_position_check" CHECK ("order" >= 0 OR "order" <= -1000000);
ALTER TABLE "faq_categories" ADD CONSTRAINT "faq_categories_order_position_check" CHECK ("order" >= 0 OR "order" <= -1000000);
ALTER TABLE "faq_items" ADD CONSTRAINT "faq_items_order_position_check" CHECK ("order" >= 0 OR "order" <= -1000000);
ALTER TABLE "faq_items" ADD CONSTRAINT "faq_items_view_count_non_negative_check" CHECK ("view_count" >= 0);
ALTER TABLE "faq_items" ADD CONSTRAINT "faq_items_helpful_count_non_negative_check" CHECK ("helpful_count" >= 0);
ALTER TABLE "faq_items" ADD CONSTRAINT "faq_items_not_helpful_count_non_negative_check" CHECK ("not_helpful_count" >= 0);
ALTER TABLE "settings_google_calendar" ADD CONSTRAINT "settings_google_calendar_reminder_minutes_non_negative_check" CHECK ("google_calendar_reminder_minutes" >= 0);
ALTER TABLE "settings_switchbot" ADD CONSTRAINT "settings_switchbot_passcode_buffer_minutes_non_negative_check" CHECK ("switchbot_passcode_buffer_minutes" >= 0);
ALTER TABLE "instagram_posts" ADD CONSTRAINT "instagram_posts_sort_order_position_check" CHECK ("sort_order" >= 0 OR "sort_order" <= -1000000);
ALTER TABLE "media" ADD CONSTRAINT "media_size_non_negative_check" CHECK ("size" >= 0);
ALTER TABLE "media" ADD CONSTRAINT "media_width_non_negative_check" CHECK ("width" >= 0);
ALTER TABLE "media" ADD CONSTRAINT "media_height_non_negative_check" CHECK ("height" >= 0);
ALTER TABLE "terms_documents" ADD CONSTRAINT "terms_documents_display_order_position_check" CHECK ("display_order" >= 0 OR "display_order" <= -1000000);
ALTER TABLE "event_categories" ADD CONSTRAINT "event_categories_sort_order_position_check" CHECK ("sort_order" >= 0 OR "sort_order" <= -1000000);
ALTER TABLE "event_tickets" ADD CONSTRAINT "event_tickets_sort_order_position_check" CHECK ("sort_order" >= 0 OR "sort_order" <= -1000000);
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_ics_sequence_non_negative_check" CHECK ("ics_sequence" >= 0);
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_paid_amount_non_negative_check" CHECK ("paid_amount" >= 0);
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_revision_non_negative_check" CHECK ("revision" >= 0);
ALTER TABLE "transfer_accounts" ADD CONSTRAINT "transfer_accounts_sort_order_position_check" CHECK ("sort_order" >= 0 OR "sort_order" <= -1000000);

COMMIT;
