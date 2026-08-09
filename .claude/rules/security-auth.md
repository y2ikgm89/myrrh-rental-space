---
paths:
  - "src/app/api/**"
  - "src/proxy.ts"
  - "src/shared/lib/crypto.ts"
  - "src/shared/lib/crypto-purposes.ts"
  - "src/shared/lib/csp/**"
  - "src/shared/lib/rate-limit.ts"
  - "src/shared/lib/cron-auth.ts"
  - "src/shared/lib/customer-auth*.ts"
  - "src/shared/lib/admin-*.ts"
  - "src/shared/domain/admin-auth/**"
  - "src/shared/lib/env/**"
---

# 認証・認可・秘密情報

## 2 つの認証系

| 対象     | 仕組み                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 管理画面 | Cloud Run direct IAP + Google Group（super-admins / admins / editors / viewers）。IAP を通っても、同じメールアドレスのスタッフ user が DB に無ければ入れない |
| 顧客     | Better Auth（`/api/customer-auth/*`）                                                                                                                        |

管理側に Better Auth の admin instance を再導入しない（ゲートで固定）。
公開サーフェスの `/admin/*` は 404 を返す（`src/proxy.ts`）。
ローカルは `ADMIN_TEST_IAP_EMAIL` で IAP を bypass する。

RBAC の SSoT は `src/shared/lib/admin-permissions.ts` の `ROLE_PERMISSIONS`
（`` `${Resource}:${Action}` `` のキー）。権限キーの実在は
`__tests__/unit/architecture/permission-keys-exist.test.ts` が検証する。
Server Action の認可は自分で書かず `executeAdminMutationResult` に載せる
（順序契約は `.claude/rules/forms-mutations.md`）。

## レート制限

`src/shared/lib/rate-limit.ts` に用途別の limiter がある
（`apiRateLimiter` / `formSubmitRateLimiter` / `reservationSubmitRateLimiter` /
`*ByEmailRateLimiter` など）。

**推測可能な ID（連番や短い token）を受け取る経路では、認証確認より前に
rate limiter を置く。** 後ろに置くと ID 総当たりの DoS ベクタになる。
E2E ではテストごとに一意の client IP を割り当てる fixture を使う。

## トークンと暗号

`src/shared/lib/crypto.ts` の `encrypt` / `decrypt` は **purpose ごとに鍵を
派生する**（HKDF）。purpose 文字列は `crypto-purposes.ts` の
`SETTINGS_CRYPTO_PURPOSES` に集約し、呼び出し側でインライン直書きしない。
重複は `__tests__/unit/architecture/crypto-purpose-registry.test.ts` が検出する。

暗号文には purpose が埋め込まれているので、**検証側で purpose を明示的に
チェックする**こと（別 purpose のトークンを流用されないため）。

ゲスト操作用トークン（予約 claim / イベント申込 claim / ステータス確認 /
waitlist offer / 決済）はそれぞれ専用の cookie 名と TTL を持つ。
一覧は `src/shared/lib/constants/*-cookie-name*.ts`。

## cron / webhook

- cron route は `src/shared/lib/cron-auth.ts` の helper 経由で **OIDC** 検証する
  （`__tests__/unit/architecture/cron-oidc-clean-break.test.ts`）。
- Cloud Scheduler の job 定義は `terraform/cloud_scheduler.tf` と
  `REQUIRED_CLOUD_SCHEDULER_CRON_JOB_IDS` が完全同期している必要がある。
- webhook はヘッダーも Zod で検証する（Google Calendar webhook route が実例）。
- Stripe の webhook 検証は **async 版のみ**。`constructEvent` /
  `generateTestHeaderString`（sync 版）は Bun の Web Crypto 環境で throw する。
  型封印は `src/shared/lib/stripe.ts` の `AsyncOnlyStripe`、機械ブロックは ESLint。

## CSP

`script-src 'self' 'nonce-…' 'strict-dynamic'`。`style-src` の
`unsafe-inline` は公式に正しい設定（再検討不要）。inline style のハッシュは
`src/shared/lib/csp/inline-style-hashes.ts`。

static prelude が空でないと本番の JS が全ブロックされる。詳細は
`.claude/rules/app-structure.md`。

## 環境変数

`@t3-oss/env-nextjs` で `src/shared/lib/env/{server,client}.ts` に集約。
`process.env` を直接読まない。`.env*` はコミット禁止（pre-commit がブロック）。
本番専用 secret（`ENCRYPTION_KEY` / `AUDIT_LOG_HMAC_KEY` / Cloudflare 本番
トークン）はローカルでは空で構わない。

## 監査ログ

`audit_logs` は DB trigger で追記専用。`resource` 文字列は kebab-case に統一
（例: `event-registration`。`eventRegistration` は不可）。
