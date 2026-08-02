-- シングルトン行モデルの「2 行目」を DB で禁止する。
--
-- 対象は id が `@default("singleton")` の 21 モデル（Settings 系 20 + ReceiptSequence）。
-- 書込はすべて `upsert({ where: { id: "singleton" } })` を通るが、それは規律であって
-- 制約ではない。素の `create()` を 1 箇所書けば 2 行目が入り、id を指定せず読む
-- 6 箇所（settings/queries/tax.ts・queries/organization.ts・public-queries.ts・
-- events/calendar-sync.ts・settings/admin-queries.ts・media/references.ts）の
-- `findFirst` / `findFirstOrThrow` が物理行順でどちらかを返す — どちらが返るかは
-- UPDATE のたびに変わりうるため、設定が無言で切り替わる形の壊れ方をする。
--
-- id は主キー（= 一意）なので `id = 'singleton'` を強制すれば行数は最大 1 になる。
-- Prisma DSL は CHECK 制約を表現できないため raw SQL で定義する。`prisma db pull` は
-- これらを黙って落とすので、baseline を作り直す際は必ず保全すること。
--
-- 全テーブルとも既存行は 0〜1 行（実測: dev 20 行 / test 21 行、違反 0）なので
-- 検証スキャンは即時に終わる。NOT VALID → VALIDATE の分割は不要。

ALTER TABLE "settings_announcement_carousels" ADD CONSTRAINT "settings_announcement_carousels_singleton_check" CHECK ("id" = 'singleton');
ALTER TABLE "settings_systems" ADD CONSTRAINT "settings_systems_singleton_check" CHECK ("id" = 'singleton');
ALTER TABLE "settings_seos" ADD CONSTRAINT "settings_seos_singleton_check" CHECK ("id" = 'singleton');
ALTER TABLE "settings_analytics" ADD CONSTRAINT "settings_analytics_singleton_check" CHECK ("id" = 'singleton');
ALTER TABLE "settings_layouts" ADD CONSTRAINT "settings_layouts_singleton_check" CHECK ("id" = 'singleton');
ALTER TABLE "settings_sidebars" ADD CONSTRAINT "settings_sidebars_singleton_check" CHECK ("id" = 'singleton');
ALTER TABLE "settings_organizations" ADD CONSTRAINT "settings_organizations_singleton_check" CHECK ("id" = 'singleton');
ALTER TABLE "settings_commerces" ADD CONSTRAINT "settings_commerces_singleton_check" CHECK ("id" = 'singleton');
ALTER TABLE "settings_notifications" ADD CONSTRAINT "settings_notifications_singleton_check" CHECK ("id" = 'singleton');
ALTER TABLE "settings_reservations" ADD CONSTRAINT "settings_reservations_singleton_check" CHECK ("id" = 'singleton');
ALTER TABLE "settings_stripes" ADD CONSTRAINT "settings_stripes_singleton_check" CHECK ("id" = 'singleton');
ALTER TABLE "settings_resends" ADD CONSTRAINT "settings_resends_singleton_check" CHECK ("id" = 'singleton');
ALTER TABLE "settings_turnstiles" ADD CONSTRAINT "settings_turnstiles_singleton_check" CHECK ("id" = 'singleton');
ALTER TABLE "settings_google_maps" ADD CONSTRAINT "settings_google_maps_singleton_check" CHECK ("id" = 'singleton');
ALTER TABLE "settings_google_calendars" ADD CONSTRAINT "settings_google_calendars_singleton_check" CHECK ("id" = 'singleton');
ALTER TABLE "settings_google_business_profiles" ADD CONSTRAINT "settings_google_business_profiles_singleton_check" CHECK ("id" = 'singleton');
ALTER TABLE "settings_instagrams" ADD CONSTRAINT "settings_instagrams_singleton_check" CHECK ("id" = 'singleton');
ALTER TABLE "settings_switchbots" ADD CONSTRAINT "settings_switchbots_singleton_check" CHECK ("id" = 'singleton');
ALTER TABLE "settings_features" ADD CONSTRAINT "settings_features_singleton_check" CHECK ("id" = 'singleton');
ALTER TABLE "settings_data_retentions" ADD CONSTRAINT "settings_data_retentions_singleton_check" CHECK ("id" = 'singleton');
ALTER TABLE "receipt_sequences" ADD CONSTRAINT "receipt_sequences_singleton_check" CHECK ("id" = 'singleton');
