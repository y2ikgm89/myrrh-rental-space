---
name: post-deploy-smoke
description: Cloud Run deploy 完了直後または deploy-affecting PR の main merge 前に、HTTP smoke check で silent regression（5xx / 404 / redirect loop / broken probe）を検出する。debug-cloud-run は post-incident、本 skill は proactive。
when_to_use: Cloud Run deploy 完了直後（Cloud Build green）、または deploy 影響のある PR を main にマージする前。
---

# Post-Deploy Smoke Test

> Cloud Run デプロイ直後に主要 endpoint の HTTP 応答を一括検証する skill。
> `debug-cloud-run` は事後分析、本 skill は事前検出。Cloud Build 緑後に走らせて silent regression を捉える。

## Overview

`smoke.sh` が curl で対象 endpoint 群の HTTP status を順番に叩き、期待値と照合した結果を表形式で出力する。

**対象範囲（11 endpoint）**:

| 分類          | パス                                                                            | 期待値              | 失敗時の意味                                                   |
| ------------- | ------------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------- |
| Probe         | `/api/live`                                                                     | 200                 | startup-probe 失敗 → コンテナ kill 連鎖（→ `debug-cloud-run`） |
| Probe         | `/api/health`                                                                   | 200 (DB 健全) / 503 | 503 なら DB 一時断・接続枯渇                                   |
| Auth (admin)  | `/api/auth/get-session`                                                         | 200                 | 未認証時も `null` セッションで 200 が正常                      |
| Auth (公開)   | `/api/customer-auth/get-session`                                                | 200                 | 同上（CUSTOMER 用 basePath）                                   |
| 公開ページ    | `/`, `/spaces`, `/events`, `/posts`, `/news`, `/faq`, `/access`, `/contact`     | 200                 | `error.tsx` 経路 = 5xx、`global-not-found` = 404               |
| SEO / Feed    | `/robots.txt`, `/sitemap.xml`, `/feed.xml`                                      | 200                 | テンプレート崩壊・cron 連動キャッシュ未生成                    |
| MEO Stub 任意 | `--gbp-stub` 付加時に `GBP_STUB_MODE=true` 想定の Settings page hint をログ出力 | (ログのみ)          | smoke 自動化の枠外（ユーザー確認）                             |

## When to Use

**使うタイミング**:

- Cloud Build deploy step が green になった直後（GitHub Actions / 手動 `gcloud builds submit` 問わず）
- main へ deploy-affecting PR を merge する前（preview env 相当の URL で実行）
- `debug-cloud-run` で起動失敗を解消した直後の sanity check
- MEO Phase 2 のような feature-flag (`GBP_STUB_MODE` 等) をフル本番に切り替える前

**使わないタイミング**:

- ローカル dev (`bun dev`) のページ確認 — Playwright MCP / ブラウザ手動で十分
- 認証付きフロー / 予約 / 決済の E2E — Playwright e2e（`bun e2e`）
- Cron / Webhook の検証 — `gcloud run services logs read` + `gcloud scheduler jobs run`

## Quick Reference

### 実行

```bash
# 環境変数で渡す場合
SMOKE_BASE_URL=https://myrrh-rental-space-xxxxx-an.a.run.app \
  bash .claude/skills/post-deploy-smoke/smoke.sh

# 引数で渡す場合
bash .claude/skills/post-deploy-smoke/smoke.sh \
  --url https://myrrh-rental-space-xxxxx-an.a.run.app

# 結果を JSON で取得（後段スクリプトに食わせる場合）
bash .claude/skills/post-deploy-smoke/smoke.sh --url https://... --json
```

### 終了コード

- `0`: 全 endpoint が期待値通り
- `1`: 1 つ以上の endpoint が期待値外 — 出力末尾の "FAIL:" 行を起点に `debug-cloud-run` で深堀り
- `2`: 引数不正 / curl 不在

### Cloud Run URL の取り方

```bash
gcloud run services describe myrrh-rental-space \
  --region=asia-northeast1 \
  --format='value(status.url)'
```

カスタムドメイン運用なら `NEXT_PUBLIC_APP_URL` の Cloud Build substitution 値を使う。

## Output Interpretation

| パターン                                | 意味                              | 次の手段                                                                                     |
| --------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------- |
| `/api/live` が timeout                  | コンテナが LISTEN していない      | `gcloud run revisions list` + `services logs read` → `debug-cloud-run` Step 2                |
| `/api/health` が 503 だが live は 200   | DB 接続失敗 / プール枯渇          | `DATABASE_POOL_MAX` / Secret 確認 → `debug-cloud-run` Step 3                                 |
| 全公開ページが 500                      | `safeFetch` fallback 経路すら失敗 | env / Prisma generate / migration 未適用を確認                                               |
| `/posts` だけ 500、他は 200             | コンテンツ層の regression         | `error.tsx` ログ + `serverEnv` 該当機能の env 確認                                           |
| `/feed.xml` だけ 200 でない             | RSS 生成 cron / cache の問題      | `getCacheTag` の関連タグ + cron Scheduler ジョブ確認                                         |
| `/robots.txt` が 404                    | `next.config.ts` headers 設定     | `app/robots.ts` の存在確認                                                                   |
| `/api/customer-auth/get-session` が 404 | `basePath` 不一致                 | `customer-auth.ts` の `basePath: "/api/customer-auth"` と Better Auth client 設定            |
| 全部 200 だが UI 確認で空白             | Prisma schema-DB drift            | `gcloud run jobs execute prisma-migrate --wait` で migrate Job 再実行（→ `cloudbuild.yaml`） |

## Common Mistakes

- **HTTPS 想定で `--url http://...` を渡す** — Cloud Run は HTTPS 強制。HTTP 指定は 301 redirect ループに見える
- **ステージング URL を取り違える** — `gcloud run services list` で `myrrh-rental-space` 以外の service URL を渡すと 404 連発
- **`/api/health` の 503 を即障害扱いしない** — DB 一時断（マイグレーション中など）でも 503。`/api/live` が 200 ならコンテナ自体は健全
- **smoke 結果が green でも UI を確認しない** — HTTP 200 でも HTML が壊れている / 公開セクションが空のケースあり（Prisma schema-DB drift / SSoT migration 未適用）。1 ページはブラウザで開く
- **MEO Stub の確認を smoke で自動化しようとする** — `GBP_STUB_MODE=true` の動作確認は Settings UI 経由（`/admin/settings/integrations`）。HTTP smoke の枠外

## Related

- `.claude/skills/debug-cloud-run/SKILL.md` — 失敗 endpoint を起点にした起動ログ・Secret・Artifact Registry の深堀り
- `.claude/rules/ops/deployment-patterns.md` — Cloud Run probe / migrate Job / NEXT*PUBLIC*\* 注入ルール
- `cloudbuild.yaml` — substitution `_NEXT_PUBLIC_APP_URL` 等の本番 URL ソース
- `src/app/api/{live,health}/route.ts` — probe 実装（liveness は DB 非依存、health は DB 疎通含む）
