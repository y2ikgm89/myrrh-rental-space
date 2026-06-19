-- test/live モードは API キー（sk_test_ / sk_live_）の接頭辞が唯一の決定者であり、
-- 別途 stripeTestMode トグルを持つと管理 UI の表示と実挙動が乖離する死に設定だった。
-- 列への read/write 参照は同一 PR で全除去済み（getStripeSettings の SELECT も撤去）。
-- pre-release・単一インスタンス（min0/max1）構成で旧リビジョンの参照も同デプロイで消えるため
-- big-bang DROP を許容（migrations.md 例外節）。
-- squawk-ignore ban-drop-column
ALTER TABLE "settings" DROP COLUMN "stripeTestMode";
