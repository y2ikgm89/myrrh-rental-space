-- 外部連携の接続ステータス 6 列を、閉じた値集合に固定する。
--
-- `*ConnectionStatus` は「接続テストの結果」を保持する列で、書かれる値は
-- `"connected"` / `"error"` の 2 つだけ（未テストは NULL）。読み側も
-- `=== "connected"` で分岐している。にもかかわらず型は素の `String?` で、
-- DB は任意の文字列を受理する。
--
-- 閉じた集合を text に持つ列を CHECK で締めるのは既に本 schema の作法で、
-- `refunds_refundedByType_check` / `refunds_status_check` が同じ形をしている。
-- 6 列だけがその外にあった。
--
-- enum 型にしないのは `ALTER COLUMN ... TYPE` が計画ダウンタイムを伴うため。
-- CHECK なら additive で同じ値域保証が得られる。将来 enum 化するときも、
-- この CHECK が「実際に入っている値はこの 2 つだけ」を先に保証しておくと安全。
--
-- 適用前の実測: 6 列とも全行 NULL（接続テスト未実行）。

ALTER TABLE "settings_stripes"
  ADD CONSTRAINT "settings_stripes_connection_status_check"
  CHECK ("stripeConnectionStatus" IS NULL
         OR "stripeConnectionStatus" IN ('connected', 'error'));

ALTER TABLE "settings_resends"
  ADD CONSTRAINT "settings_resends_connection_status_check"
  CHECK ("resendConnectionStatus" IS NULL
         OR "resendConnectionStatus" IN ('connected', 'error'));

ALTER TABLE "settings_turnstiles"
  ADD CONSTRAINT "settings_turnstiles_connection_status_check"
  CHECK ("turnstileConnectionStatus" IS NULL
         OR "turnstileConnectionStatus" IN ('connected', 'error'));

ALTER TABLE "settings_google_maps"
  ADD CONSTRAINT "settings_google_maps_connection_status_check"
  CHECK ("googleMapsConnectionStatus" IS NULL
         OR "googleMapsConnectionStatus" IN ('connected', 'error'));

ALTER TABLE "settings_google_calendars"
  ADD CONSTRAINT "settings_google_calendars_connection_status_check"
  CHECK ("googleCalendarConnectionStatus" IS NULL
         OR "googleCalendarConnectionStatus" IN ('connected', 'error'));

ALTER TABLE "settings_switchbots"
  ADD CONSTRAINT "settings_switchbots_connection_status_check"
  CHECK ("switchbotConnectionStatus" IS NULL
         OR "switchbotConnectionStatus" IN ('connected', 'error'));
