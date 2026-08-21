# デプロイ後の実行時検証

`workflow_dispatch` の Deploy Production が終わったあとに確認する。自動テストは
実 Cloudflare / 実 Stripe money API / SwitchBot webhook 実配信を叩かない
（意図設計）。ここがその穴を埋める。

前提: 本番 URL は `docs/gcp-production-setup.md`。公開面は Cloudflare 経由。

## 自動 post-deploy smoke

`deploy-production.yml` の `post-deploy-smoke` job が deploy 成功後に走る。
Cloud Run の startup / liveness probe（`/api/live`、DB なし）とは別物。

| 対象                          | 期待                                  | 失敗の意味                                                   |
| ----------------------------- | ------------------------------------- | ------------------------------------------------------------ |
| `PUBLIC_DOMAIN/api/live`      | 200                                   | 公開面プロセスが応答していない                               |
| `PUBLIC_DOMAIN/` と `/spaces` | 200 かつ `cf-cache-status` ヘッダあり | 公開ページが描画できない、または Cloudflare を経由していない |
| `ADMIN_DOMAIN/`               | 302 または 401（リダイレクトなし）    | IAP が外れている（200 は公開事故）か、LB が落ちている        |

失敗しても **revision は既に出ている**。workflow が赤になるのは「検証 NG」の
明示であり、自動 rollback はしない。`deploy-result` Issue の本文も同じ切り分け
を書く。

再実行: Actions → Deploy Production。smoke だけを単独 dispatch する入口は無い。

## Cloudflare — `/feed.xml`（N-08）

記事 CRUD は `purgeCloudflareDetailUrls(["/feed.xml"])` する。スケジュール公開
cron（`/api/cron/blog-scheduled-publish`）も同じ URL purge を併発する。

1. 管理画面で `publishedAt` が数分後の記事を 1 本用意する。
2. cron 間隔を待ってから公開面で記事が出ることを確認する。
3. 直後と 1 時間後に RSS を測る:

```sh
curl -sI "https://<public-host>/feed.xml" | grep -iE "cf-cache-status|age|cache-control"
```

期待:

- cron 成功直後は `cf-cache-status: MISS` または `EXPIRED`、本文に新記事が含まれる。
- その後の HIT でも `Age` が `s-maxage=3600` を大きく超えて stale のままではない。
- 記事 CRUD 直後も同じ URL を purge するので、手動公開でも HIT が残らない。

`cf-cache-status` が常に `DYNAMIC` なら、その path は edge cache 対象外。その場合は
本手順の TTL 検証は適用外で、本文に新記事が出ることだけ確認する。

## Stripe — `tok_refundFail` 再試行（N-02）

自動テストは `mock.module("@/shared/lib/stripe")` で HTTP を叩かない。失敗後の
再試行は test mode で 1 回見る。

1. Stripe test mode の Checkout / PaymentIntent を 1 件用意する。
2. 返金を `tok_refundFail`（[Testing async refunds](https://docs.stripe.com/testing?testing-method=tokens)）で失敗させる。
3. 管理画面から同額を再試行する。
4. Stripe Dashboard の Refund が **新しいオブジェクト** になること（初回失敗の
   replay ではない）。idempotency key は
   `reservation-refund-{id}-{newCumulative}-{excludedAttemptCount}`。

本番 live key ではやらない。

## SwitchBot — 本番導入チェックリスト（B-2）

公開 URL が無いと webhook は届かない。localhost は対象外。手順の本体は
[`switchbot-webhook.md`](switchbot-webhook.md)。導入時に次を消化する:

- [ ] 管理画面「Webhookを登録」後、実機 createKey が `handled: true` で処理される
- [ ] payload の `eventName` / `commandId` / `keyName` / `timeOfSample` が
      Cloud Logging で Zod スキーマの範囲内
- [ ] `X-RateLimit-*` と 429 非発生（`infraEndpointRateLimiter` 300/min/IP）
- [ ] deleteKey の webhook 相関（commandId 一致 → REVOKED）が実ログで確認できる
- [ ] keyList 出現が 45 秒を超えても CONFIRMED になる（webhook poll / stale
      confirm）。30 分後に live key が誤 revoke されない

実機の createKey / deleteKey 遅延だけを測るときは本番コードを import しない
プローブを使う:

```sh
# PowerShell
$env:SWITCHBOT_OPEN_TOKEN="..."
$env:SWITCHBOT_SECRET_KEY="..."
bun scripts/switchbot-live-probe.ts --list-only
bun scripts/switchbot-live-probe.ts --device <MAC>
bun scripts/switchbot-live-probe.ts --cleanup --device <MAC>
```

`probe-` 接頭辞の key だけを作る。既存顧客鍵には触れない。

## Secret Manager — `CLOUDFLARE_ORIGIN_HEADER_SECRET` 旧 version（F-01）

pin は version 3（`terraform/variables.tf` の `cloud_run_secret_versions`）。
漏洩値は受理対象外。2026-08-21 の `gcloud secrets versions list` 実測:

| NAME | STATE     | DESTROYED            |
| ---- | --------- | -------------------- |
| 3    | enabled   | —                    |
| 2    | destroyed | 2026-08-14T00:54:50Z |
| 1    | destroyed | 2026-08-14T00:54:46Z |

DESTROYED は不可逆。`versions disable 1` / `2` は
`FAILED_PRECONDITION: SecretVersion.state is DESTROYED` になる（作業不要）。
誤って 3 を disable / destroy しない。

確認コマンド:

```sh
gcloud secrets versions list CLOUDFLARE_ORIGIN_HEADER_SECRET --project=myrrh-rental-space
```

## 参照

- 監査: `docs/audits/2026-08-20-codebase-audit.md`（N-02 / N-08 / N-03）
- SwitchBot 実機: `docs/audits/2026-08-16-switchbot-official-compliance-audit.md` B-2
- Stripe idempotency: https://docs.stripe.com/api/idempotent_requests
