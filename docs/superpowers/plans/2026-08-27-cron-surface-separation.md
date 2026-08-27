# cron を public service から分離する

**目的**: Cloud Run の月額を ¥8,162 → ¥3,038 に下げる（目標 ¥3,000 以下）。

## なぜ必要か

`min_instance_count = 0` にもかかわらず public service は 7 日間 1 秒も止まって
いない（Cloud Monitoring `container/instance_count`: active が 168/168 時間、
0 になった時間は 0）。`cpu_idle = false`（instance-based billing）なので、
インスタンスが生きている間ずっと 1 vCPU + 1 GiB が課金される。

止まらない理由は **cron が自分でサービスを起こし続けている**こと。実ログ
（5,000 件 / 43.2 時間）の内訳:

| 種別       | 件数     | 備考                                      |
| ---------- | -------- | ----------------------------------------- |
| cron       | 2,104    | 毎時 47 件で一定。昼夜の差なし            |
| bot        | 約 2,600 | 8/25-26 の再帰 URL エンコード攻撃。一過性 |
| 実ユーザー | 197      | 約 4.5 件/時                              |

`cloud_scheduler.tf` の 25 本から出る理論値は毎時 47 件（`*/10`×4 + `*/15`×4 +
`*/30`×1 + 毎時×5）で、実測の下限と一致する。

## なぜ頻度削減では届かないか

実ログから keepalive 15 分でシミュレートした結果:

| 案                     | public h/月 | +admin  | 月額       |
| ---------------------- | ----------- | ------- | ---------- |
| 現状（最大 15 分間隔） | 734         | 828     | ¥8,162     |
| cron 30 分ごと         | 496         | 590     | ¥5,587     |
| cron 60 分ごと         | 372         | 466     | ¥4,252     |
| cron 120 分ごと        | 327         | 421     | ¥3,766     |
| **cron を分離**        | **260**     | **354** | **¥3,038** |

実ユーザーが 1 件でも来ればインスタンスが約 15 分起きるため、260 h/月が
構造的な床。頻度削減は 2 時間間隔まで落としても目標に届かず、その代償に
予約公開・仮押さえ解放が最大 2 時間遅れる。

## 設計

cron 専用の 3 つ目の Cloud Run service を、**同じ image**で立てる。

```
myrrh-rental-space-cron
  APP_SURFACE      = public   ← 新しい surface 値を作らない
  cpu_idle         = true     ← リクエスト課金。ここが費用の要
  min/max instance = 0 / 1
  ingress          = ALL
  IAM invoker      = scheduler SA のみ（allUsers は付けない）
  CRON_OIDC_AUDIENCE = 自分の URL
```

**`APP_SURFACE` に新しい値を足さない。** cron routes は既に public surface で
到達可能なので、`APP_SURFACE=public` のまま「Scheduler だけが到達できる
public のもう 1 台」にする。`src/proxy.ts` の blocklist も env schema も
触らずに済む。

cron の実処理は月 3.4 万リクエスト程度で、request-based の無料枠に収まる。

### 障害: in-process cache revalidation

`src/shared/lib/cache/site-wide.ts` の無効化は 2 段構え:

1. Cloudflare CDN の tag purge — **プロセスを跨いで効く**
2. `revalidateTag(tag, { expire: 0 })` — **同一プロセス内のみ**

`news-scheduled-publish` と `blog-scheduled-publish` は 2 に依存している。
cron を別プロセスに出すと public の in-process cache に届かず、予約公開の
反映が `cacheLife(PUBLIC_CONTENT)` の最大 1 時間ずれる（現在の保証は 10 分）。

**回避策**: 両 route は `slugs.length > 0` のときだけ invalidate する作りなので、
「cron service 側で検出 → 該当があるときだけ public へ再検証を依頼」にすれば、
public を起こすのは実際に公開が発生したときだけで済む。予約公開は稀なので
稼働時間への影響はほぼない。

### 障害 2: cron route 内の `fireAndForget`

`cpu_idle = true` はレスポンス送信後に CPU をスロットルする。
`src/shared/lib/async-utils.ts` の `fireAndForget` は Next.js の `after()` に
完了追跡を委ねており、その JSDoc は `--no-cpu-throttling` 環境を明示的な前提に
している。cron service を request 課金にすると、この前提が崩れる。

該当は cron route 内の 2 箇所:

- `src/app/api/cron/calendar-sync/route.ts` — webhook 更新の成否通知メール
- `src/app/api/cron/waitlist-expire/route.ts`

**cron にはレスポンス遅延の要件が無い**ので、この 2 箇所は `await` に変える。
`fireAndForget` はレスポンスをブロックしないための道具であり、cron では
そもそも不要。public / admin surface 側の 260 箇所以上は**触らない**
（あちらは `cpu_idle = false` のままで、前提が保たれる）。

## PR 分割

| #   | 内容                                                                               | 効果                   |
| --- | ---------------------------------------------------------------------------------- | ---------------------- |
| 1   | Terraform: cron service + IAM + cloudbuild の deploy step                          | 追加のみ。挙動不変     |
| 2   | App: 予約公開 2 本の再検証ハンドオフ + cron route の `fireAndForget` を `await` へ | 挙動不変（経路の追加） |
| 3   | Terraform: Scheduler 25 本を cron service へ切替 + monitoring 追従                 | **ここで費用が下がる** |
| 4   | follow-up: `imported_cron_jobs` / drift 台帳の更新                                 | state-rebuild 防御     |

PR 3 まで完了しないと費用は下がらない。PR 1 / 2 を先に入れるのは、切替の
瞬間に壊れる要素を事前に潰しておくため。

### PR 3 で追従が要る monitoring

`terraform/monitoring.tf` は service_name を直書きしている箇所が多い。
cron 系 metric は cron service を指すよう変更が要る:

- `cron_oidc_failure` / `cron_job_failure` / `cron_heartbeat` / `db_health_probe_failure`
- 正規表現 `^myrrh-rental-space(-admin)?$` を使う metric は cron を含めるか判断する
- public の SLO（`google_monitoring_slo.public_availability`）には **cron を含めない**

`db-health` は「public surface 経由で DB 到達性を見る」と description に
書かれている。cron service へ移すと probe の意味が変わるので、PR 3 で
description と監視の意図を揃える。

## 検証

- PR 1: `terraform plan` が cron service の create のみを出すこと
- PR 3: 切替後に `container/instance_count` の active が 0 になる時間帯が
  現れること（1 週間見て 260 h/月 前後に収束するか）
- 費用は Cloud Billing のレポートで実額を確認する（BigQuery export は未設定）
