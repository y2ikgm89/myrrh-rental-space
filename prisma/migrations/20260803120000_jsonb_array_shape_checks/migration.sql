-- 配列前提の jsonb 列に「実際に配列であること」の CHECK を張る。
--
-- `@default("[]")` を宣言している jsonb 列は 9 本あるが、`jsonb_typeof = 'array'` の
-- CHECK が付いていたのは Settings 系の 2 本（sidebarWidgets / durationDiscountRules）
-- だけだった。残る 7 本は、オブジェクトでも文字列でも数値でも DB が受理する。
--
-- 型が崩れたときの壊れ方が悪い: 読み側は Zod で配列としてパースするので、
-- 配列でない値が入った行は**コレクション全体の検証が落ちて丸ごと消える**
-- （2026-08-02 に trim 強化で実際に起きた形と同じ。write/read 共用スキーマが
-- 厳しくなった瞬間に旧行が読めなくなり、無言でリストが空になる）。
-- DB 側で形だけでも固定しておけば、崩れた値は書込時点で止まる。
--
-- jsonb_typeof は NULL を返しうる（列が NULL のとき）ので、NULL 許容列は
-- `IS NULL OR` を併記する。ここでは 7 本とも NOT NULL + default '[]' なので不要だが、
-- 将来 nullable 化されたときに CHECK が黙って全通しにならないよう明示する。
--
-- 適用前の実測: dev / test の全 24 行に非 array は 0 件。

ALTER TABLE "announcement_bars"
  ADD CONSTRAINT "announcement_bars_message_array_check"
  CHECK ("message" IS NULL OR jsonb_typeof("message") = 'array');

ALTER TABLE "events"
  ADD CONSTRAINT "events_gallery_array_check"
  CHECK ("gallery" IS NULL OR jsonb_typeof("gallery") = 'array');

ALTER TABLE "locations"
  ADD CONSTRAINT "locations_accessLines_array_check"
  CHECK ("accessLines" IS NULL OR jsonb_typeof("accessLines") = 'array'),
  ADD CONSTRAINT "locations_imageUrls_array_check"
  CHECK ("imageUrls" IS NULL OR jsonb_typeof("imageUrls") = 'array');

ALTER TABLE "media"
  ADD CONSTRAINT "media_tags_array_check"
  CHECK ("tags" IS NULL OR jsonb_typeof("tags") = 'array');

ALTER TABLE "spaces"
  ADD CONSTRAINT "spaces_facilities_array_check"
  CHECK ("facilities" IS NULL OR jsonb_typeof("facilities") = 'array'),
  ADD CONSTRAINT "spaces_gallery_array_check"
  CHECK ("gallery" IS NULL OR jsonb_typeof("gallery") = 'array');
