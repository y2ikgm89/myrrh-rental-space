---
paths:
  [
    "src/proxy.ts",
    "src/shared/lib/iap/**",
    "src/shared/lib/customer-auth.ts",
    "src/shared/lib/admin-auth.ts",
    "src/shared/lib/admin-permissions.ts",
    "src/shared/lib/admin-roles.ts",
    "src/shared/lib/admin-resources.ts",
    "src/shared/lib/rate-limit.ts",
    "src/shared/lib/turnstile*.ts",
    "src/shared/lib/crypto.ts",
    "src/shared/lib/cron-auth.ts",
    "src/shared/lib/e2e-runtime.ts",
    "src/shared/domain/admin-auth/**",
    "src/shared/lib/env/**",
  ]
---

# 認証・認可・セキュリティ

## 認証は 2 系統（混ぜない）

- **顧客** = Better Auth（`src/shared/lib/customer-auth.ts`、basePath `/api/customer-auth`）。
  Prisma adapter には `$extends` 前の `basePrisma` を渡す必須契約（理由は db-domain ルール参照）
- **管理** = Cloud Run IAP のみ（`x-goog-iap-jwt-assertion` JWT を audience/issuer 検証）。
  Better Auth の admin instance・管理ログインフォームの再導入はテストで禁止。
  IAP identity は Google Workspace グループ所属から Role へ同期される。
  role group env は **4 つ全設定か全未設定のみ**（部分設定は admin ログイン全滅）

## 管理 RBAC

- アクセス可否は `DASHBOARD_ROLES`（SUPER_ADMIN/ADMIN/EDITOR/VIEWER）が SSoT
- 権限は `${Resource}:${Action}` 形式の PermissionKey × ROLE_PERMISSIONS。
  EDITOR は独立 resource 権限を持たず userPageAssignment（page UUID 単位）で gate される。
  admin mutation の追加時は `executeAdminMutationResult` の permission 段を必ず通す

## rate limit / クライアント IP

- InMemory store は **Cloud Run max instance=1 前提**（`cloudbuild.yaml` の
  `_MAX_INSTANCES: "1"` で実際に固定済み。autoscale 解禁には分散 backend が必須で、
  現状は未実装 — 意図的に見送っている判断であり、autoscale 解禁時に再検討する）
- 本番のクライアント IP は `cf-connecting-ip` + `x-cloudflare-origin-secret` の
  timing-safe 比較成功時のみ信頼。XFF fallback は非本番/localhost 専用
- パス別の limiter 振分は `checkRateLimit()` が SSoT
- 予約・イベント申込作成は IP 単位（`checkActionRateLimit`）に加え、顧客(メール)
  単位の第二防壁を `checkEmailRateLimit` で重ねる。同一人物が複数IPから同じ
  メールで大量作成するケースは IP 単位だけでは防げないため

## Turnstile

- 共通入口は `validateTurnstile`（expectedAction binding・remoteip・idempotency_key）。
  action 識別子は `TURNSTILE_ACTIONS`（client-safe）が SSoT
- secret は DB（暗号化）優先 → env。**本番は未設定でも fail-closed**（dev はスキップ）。
  ローカルで通っても本番で止まり得ることに注意

## CSP / ヘッダー

- CSP nonce は proxy が生成し x-nonce で伝播。strict-dynamic のため全 route ƒ 必須
  （詳細は app-structure ルール）
- 新しい外部スクリプト/埋め込み/ビーコン先の追加は proxy.ts の CSP
  （connect-src / img-src）と `src/shared/lib/constants/frame-sources.ts`（frame-src +
  埋め込み URL 検証で共用）の**両方**を更新する

## cron 認可 / E2E ゲート / 暗号化

- cron route は Cloud Scheduler の OIDC Bearer token を検証
  （CRON_SERVICE_ACCOUNT_EMAIL / CRON_OIDC_AUDIENCE、config 欠損は fail-closed 500）
- E2E バイパス（`E2E_RUNTIME` / `NEXT_PUBLIC_ENABLE_E2E_LOGIN` / `ADMIN_TEST_IAP_EMAIL`）は
  localhost 限定 AND 条件。`validateProductionEnv()` が本番で throw する。
  **`CI=true` をバイパス条件にしない**
- 暗号化は kid 一致必須（ENCRYPTION_KEY_ID 変更で旧データ復号 throw）。
  本番必須シークレット検証は instrumentation `register()` 起動時実行が契約
  （module load 時に移すとローカル build が壊れる）
- serverEnv は module load 時 snapshot。runtime の env 動的変更は反映されない
