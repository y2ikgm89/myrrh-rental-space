---
name: add-cron-job
description: 定期実行ジョブ (cron job) を新規追加するときに使う。src/app/api/cron/ への Route Handler 追加、Cloud Scheduler OIDC Bearer token 認可 (authorizeCronRequest・fail-closed)、feature module OFF 時の早期 return、cache invalidation (revalidateTag / invalidateSiteWideCacheFromRouteHandler)、scripts/setup-cloud-scheduler.sh による scheduler 登録、unit test・architecture gate 更新までの一連の手順とチェックリスト。
---

# cron job (定期実行ジョブ) の追加

Cloud Scheduler → Cloud Run の HTTP GET で起動する cron route を追加する手順。
既存 8 route (`src/app/api/cron/*/route.ts`) が canonical 実装。参照が最も充実して
いるのは `calendar-sync` (lock + cache) と `reservation-reminder` (feature gate +
冪等 claim)。

常設規約は rules を参照 (重複記載しない):

- cron OIDC 認可・env の位置づけ → rules の `security-auth`
- rate limit / proxy / `await connection()` → rules の `app-structure`
- キャッシュ無効化の呼び分け → rules の `caching`
- Prisma を route から直 import しない → rules の `db-domain`
- テスト実行方法 → rules の `testing-unit`

## 手順

### 1. Route Handler を作る

- 配置: `src/app/api/cron/<job-name>/route.ts`(kebab-case。Cloud Scheduler の
  ジョブ名と揃える)
- export は `GET` のみ (scheduler は `--http-method=GET` で呼ぶ)

骨格 (順序が重要。architecture テストが順序を強制する):

```ts
export async function GET(request: Request) {
  try {
    await connection(); // 必ず authorizeCronRequest より前
    const authResult = await authorizeCronRequest({
      request,
      operation: "<jobName>Cron",
    });
    if (authResult) return authResult;

    // feature module gate (該当 module がある場合)
    if (!(await isFeatureEnabled("<module>"))) {
      return jsonSuccess({ skipped: true, reason: "feature_disabled" });
    }

    // 本処理は domain layer 経由で実行
    return jsonSuccess({/* 実行結果サマリ */});
  } catch (error) {
    unstable_rethrow(error); // Next.js 内部 throw を握りつぶさない
    logError(error, {
      category: ErrorCategory.EXTERNAL_API, // or DATABASE 等
      severity: ErrorSeverity.HIGH,
      context: { operation: "<jobName>Cron" },
    });
    return jsonError("<Job> failed", 500);
  }
}
```

使うシンボル:

- `authorizeCronRequest` — `src/shared/lib/cron-auth.ts`。Cloud Scheduler の
  OIDC Bearer token を `CRON_OIDC_AUDIENCE` に対して検証し、email が
  `CRON_SERVICE_ACCOUNT_EMAIL` と一致した場合のみ `null` を返す。
  fail-closed: env 欠損 → 500 / token 無し・検証失敗・SA 不一致 → 401。
  認可失敗時は `Response` が返るので**必ず即 return** する
- `connection` — `next/server`。cacheComponents 下で runtime-only 化する
- `unstable_rethrow` — `next/navigation`。catch 節の先頭で呼ぶ (全 8 route 共通)
- `jsonSuccess` / `jsonError` — `src/shared/lib/route-responses.ts`。
  `NextResponse.json({ success: true })` 形式の boolean payload は
  `architecture-boundaries.test.ts` が禁止している
- `logError` / `ErrorCategory` / `ErrorSeverity` — `@/shared/lib/errors/server`。
  `context.operation` にジョブ名を入れる。成功サマリのログは
  `logger.info` (`@/shared/lib/errors/logger-core`) を使う (例: faq-trash-cleanup)

rate limit の追加作業は不要 — `src/proxy.ts` が `/api/cron` prefix を rate limit
から除外済み (認可は OIDC 検証が担う)。

### 2. feature module gate (該当する場合)

ジョブが feature module (reservation / events / faq 等) に属するなら:

1. route 冒頭 (認可の直後) で `isFeatureEnabled("<module>")`
   (`src/shared/lib/features/check.ts`) を確認し、OFF なら
   `jsonSuccess({ skipped: true, reason: "feature_disabled" })` で早期 return
2. `src/shared/lib/features/registry.ts` の該当 module の `cronPaths` に
   `"/api/cron/<job-name>"` を追記する (disabled 集合 `disabledCronPaths` の SSoT)

feature に属さないインフラ系ジョブ (例: notification-cleanup,
instagram-refresh) は gate 不要。ただし外部連携系は設定未構成時に
`jsonSuccess({ skipped: true, reason: ... })` でスキップする (instagram-refresh
の「token 未設定なら skip」参照)。

### 3. 本処理・冪等性・排他

- DB 読み書きは `src/shared/domain/*` の query/command 経由。`prisma` を route
  から直接 import しない
- **冪等性は必須**。Cloud Scheduler は at-least-once + retry 最大 3 回
  (setup スクリプトの `--max-retry-attempts=3`)。対象 0 件なら 0 件処理で正常終了
- 通知・メール送信を伴うジョブは二重送信防止の atomic claim を入れる。
  参照: `claimReservationReminder` / `releaseReservationReminderClaim`
  (`src/shared/domain/reservations/reminder-commands.ts`) — 送信前に claim、
  一時エラー時のみ release して次回再送、`reason: "disabled"` は claim 保持
- 長時間ジョブの並行実行排他は advisory lock helper を domain 層に置く。
  参照: `tryAcquireCalendarSyncLock` / `releaseCalendarSyncLock`
  (`src/shared/domain/calendar-sync/locks.ts`)。取得失敗は
  `skipped: true` で正常終了し、`finally` で必ず release する
- JST 依存の日付窓は `formatJstDateString` (`src/shared/lib/date-format.ts`) で
  計算する (Cloud Run は UTC 環境)

### 4. キャッシュ無効化

公開データを書き換えたら無効化する。**Route Handler では `updateTag` 系
(`invalidateSiteWideCache`) は runtime throw する**ので使わない:

- Next.js Data Cache のみ →
  `revalidateTag(CACHE_TAGS.X, CACHE_LIFE.Y)` (`next/cache` +
  `@/shared/lib/constants`)。例: event-import, instagram-sync, calendar-sync
- CDN tag purge も必要 (site-wide 系タグ) →
  `invalidateSiteWideCacheFromRouteHandler` (`@/shared/lib/cache`、実装は
  `src/shared/lib/cache/site-wide.ts`)。例: instagram-refresh
  (admin 専用タグなら `{ skipCdnPurge: true }`)

新しいタグが必要なら rules の `caching` の drift gate に従う
(`add-cache-tag` skill 参照)。

### 5. テスト

- **route 単体テスト**: `__tests__/unit/api/cron-reservation-reminder.test.ts`
  をひな型にする。`mock.module()` で `next/server` (connection)・
  `@/shared/lib/cron-auth`・domain 層・`@/shared/lib/route-responses` を差し替え、
  route は宣言後に `await import(...)`。認可 401 時に本処理が呼ばれないこと・
  skip 分岐・冪等 claim の分岐を検証する
- **認可 helper 自体のテストは追加不要**:
  `__tests__/unit/lib/cron-auth-oidc.test.ts` が `verifyToken` 注入で
  網羅済み (新 route はこの helper を呼ぶだけ)
- **architecture gate の更新 (忘れやすい)**:
  `__tests__/unit/architecture/cron-oidc-clean-break.test.ts` の
  `cronRoutePaths` 配列に新 route のパスを追記する。この gate が
  「`await connection()` が `await authorizeCronRequest` より前」を
  ファイル単位で強制する (hard-coded list のため自動では拾われない)
- 実行: `bun scripts/run-tests.ts __tests__/unit/api/<new-test>.test.ts` と
  `bun scripts/run-tests.ts __tests__/unit/architecture/cron-oidc-clean-break.test.ts`

### 6. Cloud Scheduler へ登録

`scripts/setup-cloud-scheduler.sh` の `JOBS` 配列に 1 行追記する:

```
"<job-name>|<cron式>|/api/cron/<job-name>|<運用者向け説明(英語)>"
```

- cron 式は `TIME_ZONE` (デフォルト Asia/Tokyo) で解釈される
- スクリプトは冪等 (存在すれば update / なければ create)。共通設定:
  OIDC token 発行 (`--oidc-service-account-email` / `--oidc-token-audience`)、
  `--attempt-deadline=300s`、`--max-retry-attempts=3`
- 実行 (gcloud 認証済み環境で):

```bash
PROJECT_ID=... SERVICE_URL=https://... CRON_SERVICE_ACCOUNT_EMAIL=... \
  DRY_RUN=1 bash scripts/setup-cloud-scheduler.sh   # まず dry run
```

`DRY_RUN` を外して本適用。デプロイ手順の全体像は
`docs/gcp-production-setup.md` を参照。

env は `.env.example` に記載済みの `CRON_OIDC_AUDIENCE` /
`CRON_SERVICE_ACCOUNT_EMAIL` (本番必須 — `src/shared/lib/env/server.ts` の
`validateProductionEnv` が起動時に検証)。ローカルで未設定なら
authorizeCronRequest は 500 を返す (仕様。ローカル検証は unit test で行う)。

### 7. 検証

1. `bun run validate` (type-check + lint)
2. `bun scripts/run-tests.ts __tests__/unit/api/<new-test>.test.ts`
3. `bun scripts/run-tests.ts __tests__/unit/architecture-boundaries.test.ts`
   と `__tests__/unit/architecture/cron-oidc-clean-break.test.ts`
4. `bun run build` (route 表に `/api/cron/<job-name>` が出ることを確認)

## チェックリスト

- [ ] `src/app/api/cron/<job-name>/route.ts` に GET handler
- [ ] `await connection()` → `authorizeCronRequest` → (feature gate) の順
- [ ] 認可結果が non-null なら即 return
- [ ] feature module 該当時: `isFeatureEnabled` gate + registry の `cronPaths` 追記
- [ ] 冪等 (at-least-once 前提)。通知系は atomic claim、長時間ジョブは advisory lock
- [ ] Prisma 直 import なし (domain 層経由)
- [ ] キャッシュ無効化は Route Handler 版 (`revalidateTag` /
      `invalidateSiteWideCacheFromRouteHandler`)。`updateTag` 系禁止
- [ ] レスポンスは `jsonSuccess` / `jsonError`。`{ success: boolean }` payload 禁止
- [ ] catch: `unstable_rethrow` → `logError` (category/severity/operation)
- [ ] unit test 追加 + `cron-oidc-clean-break.test.ts` の `cronRoutePaths` 追記
- [ ] `scripts/setup-cloud-scheduler.sh` の `JOBS` に追記 (登録は運用側で実行)
- [ ] `bun run validate` / 対象テスト / `bun run build` 緑
