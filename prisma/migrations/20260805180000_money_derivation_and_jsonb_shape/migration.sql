-- 金額の導出関係と、jsonb 列の形状を DB に持たせる。
--
-- ## 1. 税込合計は本体 + 税
--
-- `reservations_money_non_negative_check` は名前が包括的だが、**各列が非負である
-- ことしか見ていない**。`total_price_with_tax` が `total_price + tax_amount` と
-- 一致するかは誰も検査していなかった。
--
-- 食い違うと、顧客が予約画面で見た金額と請求される金額がずれる。決済は
-- `total_price_with_tax` を使い、内訳表示は `total_price` と `tax_amount` を使うので、
-- **どちらか一方だけが正しい**状態になる。
--
-- 実データ（seed 済み test DB, 64 件）で不一致 0 件を確認済み。書込 3 経路
-- （admin-commands / customer-commands / calendar-sync-inbound-mutations）は
-- いずれも `total + tax` で組み立てている。制約はその等式を DB に固定する。
--
-- ## 2. jsonb の形状
--
-- jsonb 列 33 本のうち形状 CHECK があったのは 9 本だけで、**なぜその 9 本なのかが
-- 説明されていなかった**。配列を期待する列に文字列が入っても DB は受理する。
--
-- 分類は 3 つ。全列が必ずどれかに入る（`jsonb-column-shapes.test.ts` が強制）:
--
--   - array   … 要素の並び。`jsonb_typeof = 'array'`
--   - object  … キーつきの構造。`jsonb_typeof = 'object'`
--   - 自由形式 … 監査ログの旧値/新値。任意の JSON 値を取りうるので制約を置かない
--
-- **JSON の `null` は許さない。** 「未設定」は SQL NULL 一本にする。両方あると
-- 読み手が 2 通りを扱う必要が出る。アプリ側の `Prisma.JsonNull` は同じ PR で
-- `Prisma.DbNull` へ寄せた（監査ログだけは JSON null が実値なので対象外）。
--
-- ## 適用前に本番で流す確認クエリ
--
--   SELECT 'reservations.total_price_with_tax' AS what, count(*) FROM reservations
--    WHERE total_price_with_tax <> total_price + tax_amount
--   UNION ALL SELECT 'special_holidays が JSON null', count(*) FROM locations
--    WHERE jsonb_typeof(special_holidays) = 'null'
--   UNION ALL SELECT 'business_hours が JSON null', count(*) FROM locations
--    WHERE jsonb_typeof(business_hours) = 'null';
--
-- 0 でなければ、この migration はそこで落ちる。migration 内でデータを直すのは
-- 禁止（副作用の迂回になる）なので、落ちるのが正しい。

BEGIN;

ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_tax_total_derivation_check"
  CHECK ("total_price_with_tax" = "total_price" + "tax_amount");

-- 配列を期待する列（既に CHECK のある 9 本を除く）
ALTER TABLE "locations" ADD CONSTRAINT "locations_special_holidays_array_check" CHECK ("special_holidays" IS NULL OR jsonb_typeof("special_holidays") = 'array');
ALTER TABLE "navigation_items" ADD CONSTRAINT "navigation_items_label_array_check" CHECK (jsonb_typeof("label") = 'array');

-- `agreement_snapshot` は `AgreementSnapshotEntry[]`（同意した規約の一覧）。
-- 実データが 0 行だったので最初は名前から object と決めてしまい、series 作成の
-- 統合テストが 23514 で落ちて誤りが分かった。**データが無い列は型から確かめる。**

-- キーつきの構造を期待する列
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_metadata_object_check" CHECK ("metadata" IS NULL OR jsonb_typeof("metadata") = 'object');
ALTER TABLE "block_templates" ADD CONSTRAINT "block_templates_node_json_object_check" CHECK (jsonb_typeof("node_json") = 'object');
ALTER TABLE "events" ADD CONSTRAINT "events_description_json_object_check" CHECK (jsonb_typeof("description_json") = 'object');
ALTER TABLE "locations" ADD CONSTRAINT "locations_amenities_object_check" CHECK (jsonb_typeof("amenities") = 'object');
ALTER TABLE "locations" ADD CONSTRAINT "locations_business_hours_object_check" CHECK ("business_hours" IS NULL OR jsonb_typeof("business_hours") = 'object');
ALTER TABLE "news" ADD CONSTRAINT "news_content_json_object_check" CHECK ("content_json" IS NULL OR jsonb_typeof("content_json") = 'object');
ALTER TABLE "posts" ADD CONSTRAINT "posts_content_json_object_check" CHECK ("content_json" IS NULL OR jsonb_typeof("content_json") = 'object');
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_issuer_snapshot_object_check" CHECK (jsonb_typeof("issuer_snapshot") = 'object');
ALTER TABLE "reservation_series" ADD CONSTRAINT "reservation_series_agreement_snapshot_array_check" CHECK (jsonb_typeof("agreement_snapshot") = 'array');
ALTER TABLE "reservation_series" ADD CONSTRAINT "reservation_series_template_data_object_check" CHECK (jsonb_typeof("template_data") = 'object');
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_rate_breakdown_object_check" CHECK (jsonb_typeof("rate_breakdown_json") = 'object');
ALTER TABLE "sections" ADD CONSTRAINT "sections_config_object_check" CHECK (jsonb_typeof("config") = 'object');
ALTER TABLE "settings_commerce" ADD CONSTRAINT "settings_commerce_refund_policy_object_check" CHECK ("refund_policy" IS NULL OR jsonb_typeof("refund_policy") = 'object');
ALTER TABLE "settings_data_retention" ADD CONSTRAINT "settings_data_retention_object_check" CHECK (jsonb_typeof("data_retention") = 'object');
ALTER TABLE "settings_features" ADD CONSTRAINT "settings_features_modules_object_check" CHECK (jsonb_typeof("feature_modules") = 'object');
ALTER TABLE "settings_google_business_profile" ADD CONSTRAINT "settings_gbp_auth_object_check" CHECK ("google_business_profile_auth" IS NULL OR jsonb_typeof("google_business_profile_auth") = 'object');
ALTER TABLE "settings_organization" ADD CONSTRAINT "settings_organization_business_hours_object_check" CHECK ("business_hours" IS NULL OR jsonb_typeof("business_hours") = 'object');
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_business_hours_object_check" CHECK ("business_hours" IS NULL OR jsonb_typeof("business_hours") = 'object');
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_description_json_object_check" CHECK (jsonb_typeof("description_json") = 'object');
ALTER TABLE "terms_documents" ADD CONSTRAINT "terms_documents_content_json_object_check" CHECK (jsonb_typeof("content_json") = 'object');

COMMIT;
