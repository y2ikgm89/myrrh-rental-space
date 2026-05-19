---
paths:
  - src/**/actions/**
  - src/**/mutations.ts
  - src/**/queries.ts
  - src/app/api/**
  - src/shared/lib/**
---

# エラーハンドリングルール

> Server Actions / safeFetch / criticalFetch / logger SSoT。Next.js バージョンは `package.json`。

## 禁止事項

1. **エラー握りつぶし禁止**

   ```typescript
   // NG
   try {
     await action();
   } catch {
     /* ignore */
   }
   try {
     await action();
   } catch (e) {}
   ```

2. **console.log のみのエラーログ禁止**

   ```typescript
   // NG
   catch (e) { console.log(e) }

   // OK
   catch (error) { logError(error, { category: ErrorCategory.DATABASE, severity: ErrorSeverity.HIGH }) }
   ```

3. **エラーメッセージの内部情報露出禁止**

   ```typescript
   // NG: DB エラー詳細をユーザーに返す
   return createMutationError(error.message); // 'column "xxx" does not exist'

   // OK: ユーザー向けメッセージ
   return createMutationError("操作に失敗しました");
   ```

4. **直接オブジェクトリテラルによる MutationResult 返却禁止**
   - failure path: `createMutationError()` を使用（→ `error-handling/mutation-result.md`）
   - success path: domain command の戻り値 `T` を直接 return（ラッパー不要）

5. **認証チェック漏れ禁止**
   - 管理画面 Server Actions は必ず `executeAdminMutationResult` を使用。`checkPermission` の直接使用は API Routes のみ（→ `error-handling/server-actions.md`）

6. **safeFetch の fallback に `undefined` 指定禁止**
   - `undefined` は React 19 シリアライゼーション対象外。`null` または具体的な値を使用（→ `error-handling/safe-fetch.md`）

7. **インラインエラーメッセージ変換禁止**

   ```typescript
   // NG: インライン変換（冗長）
   catch (error) {
     logger.error('Failed', { error: error instanceof Error ? error.message : String(error) })
   }

   // OK: getErrorMessage() を使用
   import { getErrorMessage } from '@/shared/lib/errors'
   catch (error) {
     logger.error('Failed', { error: getErrorMessage(error) })
   }
   ```

8. **ユーザー向け error formatter の `return error.message` fallback 禁止**
   - 既知パターンマップ + 未知 fallback で `return error.message` する formatter（`formatGoogleApiError` 等）は GCP project ID / service account email / API endpoint URL 等のインフラ詳細を UI / API レスポンスに露出させる経路
   - 未知 fallback は **generic message を return + `logError(category: EXTERNAL_API)` で server-side に詳細を保持**。運用調査は Cloud Logging 経由で `category=EXTERNAL_API operation=<formatter-name>` を辿る
   - 実例: 2026-05-07 `formatGoogleApiError` clean-break（`return error.message` を `logError + GENERIC_MESSAGE` に置換）

## ファイル配置

| パス                           | 内容                                                                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@/shared/lib/mutation-result` | `MutationResult<T>`, `isMutationError()`                                                                                                                                              |
| `@/shared/lib/errors`          | `ErrorCategory`, `ErrorSeverity`, `normalizeError`, `getErrorMessage`, `ReservationOverlapError`, `isReservationOverlapError`（クライアントセーフ — Client Component から import 可） |
| `@/shared/lib/errors/server`   | `logError`, `createErrorLogger`, `safeFetch`, `criticalFetch`（サーバー専用）+ 上記を全て re-export。Server Actions / API Routes / `'use cache'` 関数で使用                           |
| `@/shared/lib/logger`          | `logger`（汎用ロガー）                                                                                                                                                                |
| `@/shared/lib/action-helpers`  | `createValidationMutationError`, `withValidation`, `withTurnstile`, `withRetry`, `isTransientError`                                                                                   |
| `@/admin/lib/admin-action`     | `executeAdminMutationResult`（認証・権限・監査ログ・DomainError 一括処理）                                                                                                            |
| `@/admin/lib/action-auth`      | `checkAdminAuth`, `checkPermission`, `checkResourceAccess`, `logAction`                                                                                                               |

## Gotchas

- **`ErrorSeverity` と `severity` は異なる値** — `logError` 出力 JSON の `severity` は GCP LogSeverity にマッピングされる（`HIGH` → `"ERROR"`, `MEDIUM` → `"WARNING"`, `LOW` → `"INFO"`）。テストで `parsed.severity` を検証する際は GCP LogSeverity を期待すること
- **`stack_trace` は ERROR 以上のみ** — `severity` が `"ERROR"` / `"CRITICAL"` の場合のみ `stack_trace` と `@type`（Cloud Error Reporting 用）が出力される。WARNING 以下ではスタックトレースなし
- **`K_SERVICE` / `K_REVISION`** — Cloud Run が自動設定する環境変数。`serviceContext.service` / `serviceContext.version` に使用。ローカルでは `"myrrh-rental-space"` / `"local"` にフォールバック
- **モジュールレベルで `process.env` をキャッシュしない** — `const isDev = process.env["NODE_ENV"] !== "production"` はテスト時に `process.env` を上書きしても反映されない。`process.env["NODE_ENV"]` をインライン評価すること
