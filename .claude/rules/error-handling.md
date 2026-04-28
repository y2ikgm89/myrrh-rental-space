---
paths:
  - src/**/actions/**
  - src/**/mutations.ts
  - src/**/queries.ts
  - src/app/api/**
  - src/shared/lib/**
---

# エラーハンドリングルール

> Next.js 16.2 Server Actions / safeFetch / criticalFetch / logger 対応

## MutationResult<T> 型

### createMutationError / isMutationError

`@/shared/lib/mutation-result` のヘルパーを必ず使用する。直接オブジェクトリテラルを返却しない:

```typescript
import {
  createMutationError,
  isMutationError,
  type MutationResult,
  type MutationError,
} from "@/shared/lib/mutation-result";

// NG: オブジェクトリテラル直接返却
return { error: "エラー" };
return { error: "...", fieldErrors: { ... } };

// OK: ヘルパー使用 (failure path)
return createMutationError("エラーが発生しました");
return createMutationError("入力内容に誤りがあります", { email: ["無効なメール"] }); // fieldErrors付き

// OK: success path は T を直接返す (ラッパー不要)
return { id: post.id };
```

型定義:

```typescript
// 失敗
type MutationError = {
  readonly error: string;
  readonly code?: string;
  readonly fieldErrors?: Record<string, string[]>;
};

// 統合 (success: T | failure: MutationError)
type MutationResult<T = null> = T | MutationError;

// 判定
function isMutationError(result: unknown): result is MutationError;
```

`executeAdminMutationResult` は `MutationResult<TData>` を返す。`execute` の戻り値 `TData` が success path（ラッパーなし）、`DomainError` throw が `MutationError` に自動変換される（failure path）。

### バリデーションエラー（Zod）

`@/shared/lib/action-helpers` の `createValidationMutationError` を使用:

```typescript
import { createValidationMutationError } from "@/shared/lib/action-helpers";

const parsed = postSchema.safeParse(data);
if (!parsed.success) {
  return createValidationMutationError(parsed.error);
  // => { error: '入力内容に誤りがあります', code: 'VALIDATION', fieldErrors: { title: ['...'] } }
}
```

---

## Server Actions エラーパターン

### 認証エラー（executeAdminMutationResult — 推奨パターン）

`executeAdminMutationResult` は認証・認可・DomainError ハンドリング・監査ログを一括処理する。管理画面の書き込み系 Server Actions では必ず使用:

```typescript
"use server";

import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";

export const createPost = async (input: CreatePostInput) => {
  const parsed = createPostSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "post",
    action: "create",
    execute: async () => createPostCommand(parsed.data),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.POSTS);
    },
    resolveAuditResourceId: (data) => data.id,
  });
};
```

`executeAdminMutationResult` が自動処理する内容:

- 認証チェック（`checkPermission` / `checkResourceAccess`）
- 権限チェック（resource + action ベース）
- DomainError のキャッチ → `MutationError ({ error: error.message, code: error.code })` に自動変換
- 監査ログ記録（`fireAndForget(logAction)` で非ブロッキング）

関数の種類:

| 関数                         | 用途                                                        |
| ---------------------------- | ----------------------------------------------------------- |
| `executeAdminMutationResult` | 書き込み系 Server Actions（`MutationResult<TData>` を返す） |

オプション:

| オプション               | 型                                     | 必須 | 説明                                    |
| ------------------------ | -------------------------------------- | ---- | --------------------------------------- |
| `resource`               | `Resource`                             | Yes  | 権限チェック対象リソース                |
| `action`                 | `Action`                               | Yes  | 権限チェック対象アクション              |
| `resourceId`             | `string`                               | No   | リソースアクセスチェック・監査ログ用 ID |
| `checkResourceAccess`    | `boolean`                              | No   | `true` で `checkResourceAccess` を使用  |
| `execute`                | `(user: User) => Promise<TData>`       | Yes  | ビジネスロジック実行関数                |
| `afterSuccess`           | `(data: TData) => void \| Promise`     | No   | キャッシュ無効化等の後処理              |
| `resolveAuditResourceId` | `(data: TData) => string \| undefined` | No   | 実行結果から監査ログ用 ID を解決        |

### 直接認証チェック（checkPermission — API Routes 専用）

`checkPermission` を直接使用するのは API Routes のみ。Server Actions では `executeAdminMutationResult` を使用する:

```typescript
// API Route でのみ使用
import { checkPermission } from "@/admin/lib/action-auth";

export async function DELETE(req: Request) {
  const auth = await checkPermission("post", "delete");
  if (!auth.success) return new Response(null, { status: 403 });

  const { user } = auth;
  // ... API route logic
}
```

### データベースエラー

`executeAdminMutationResult` は DomainError を自動キャッチするが、それ以外の例外（DB エラー等）は再スローされる。ドメインコマンド層で try/catch + `logError` を行い、Server Action 側で `createMutationError` を返す:

```typescript
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";

// Server Action（executeAdminMutationResult がDomainErrorを自動処理）
export const updateSpace = async (id: string, input: SpaceInput) => {
  const parsed = spaceFormSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "space",
    action: "update",
    resourceId: id,
    execute: async () => updateSpaceCommand(id, parsed.data),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.SPACES);
    },
  });
};

// ドメインコマンド層でDBエラーをハンドリング
async function updateSpaceCommand(id: string, data: SpaceData) {
  try {
    await prisma.space.update({ where: { id }, data });
  } catch (error) {
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: "updateSpace", spaceId: id },
    });
    throw error; // executeAdminMutationResult に再スローされ、呼び出し元でハンドリング
  }
}
```

### ビジネスロジックエラー（早期リターン）

```typescript
export const publishPost = async (id: string) => {
  return executeAdminMutationResult({
    resource: "post",
    action: "publish",
    resourceId: id,
    execute: async () => publishPostCommand(id),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.POSTS);
    },
  });
};

// ドメインコマンド層で DomainError を throw → executeAdminMutationResult が自動キャッチ
async function publishPostCommand(id: string) {
  const post = await prisma.post.findUnique({ where: { id } });
  if (!post) {
    throw new DomainError("投稿が見つかりません");
  }

  if (!post.title || !post.contentHtml) {
    throw new DomainError("タイトルとコンテンツが必要です");
  }

  await prisma.post.update({
    where: { id },
    data: { status: PostStatus.PUBLISHED },
  });
}
```

### 一時的障害のリトライ

```typescript
import { withRetry, isTransientError } from "@/shared/lib/action-helpers";

const result = await withRetry(() => prisma.reservation.create({ data }), {
  maxRetries: 3,
  shouldRetry: isTransientError,
});
```

---

## safeFetch / criticalFetch パターン（公開データ取得）

Server Components / `'use cache'` 関数での非認証データ取得に使用する。

### safeFetch（非クリティカル — フォールバックあり）

DB 取得に失敗してもページをレンダリング続けたい場合:

```typescript
import {
  safeFetch,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { cacheLife, cacheTag } from "next/cache";
import { toPlainObject } from "@/shared/lib/serialize";

async function getNavigationItems() {
  "use cache";
  cacheLife("hours");
  cacheTag(CACHE_TAGS.NAVIGATION);

  const result = await safeFetch({
    fetch: () => prisma.navigationItem.findMany({ orderBy: { order: "asc" } }),
    fallback: [], // エラー時の安全な初期値
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.MEDIUM,
    operationName: "getNavigationItems",
  });

  return toPlainObject(result);
}
```

### criticalFetch（クリティカル — エラーバウンダリへ委譲）

ページレンダリングに必須のデータ（なければ表示できない）:

```typescript
import { criticalFetch, ErrorCategory } from "@/shared/lib/errors/server";

async function getPublishedPost(slug: string) {
  "use cache";
  cacheTag(CACHE_TAGS.POSTS, getCacheTag.posts.detail(slug));

  return await criticalFetch({
    fetch: () =>
      prisma.post.findUnique({ where: { slug, status: PostStatus.PUBLISHED } }),
    category: ErrorCategory.DATABASE,
    operationName: "getPublishedPost",
    context: { slug },
    // エラー時は例外を再スロー → error.tsx（エラーバウンダリ）が処理
  });
}
```

### fallback 値の設計

| データ種別                     | fallback 値                            |
| ------------------------------ | -------------------------------------- |
| リスト                         | `[]`                                   |
| 単一オブジェクト（必須でない） | `null`                                 |
| 数値カウント                   | `0`                                    |
| 設定オブジェクト（必須でない） | デフォルト設定定数                     |
| ページ必須データ               | `criticalFetch` を使用（fallbackなし） |

---

## logger の使用

### logError（サーバーサイドエラーログ — 主用途）

GCP Cloud Logging / Cloud Error Reporting 対応の構造化エラーログ。
本番では `severity`（GCP LogSeverity）・`stack_trace`・`serviceContext`・`@type` を含む JSON を出力。
ERROR 以上で Cloud Error Reporting が自動グループ化する。Server Actions・Server Components で使用:

```typescript
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";

// NG: console.log のみ
console.log("エラー:", error);

// NG: エラー握りつぶし
try {
  await action();
} catch {
  /* ignore */
}

// OK: 構造化ログ + createMutationError
import { createMutationError } from "@/shared/lib/mutation-result";

try {
  await action();
} catch (error) {
  logError(error, {
    category: ErrorCategory.DATABASE, // 'DATABASE' | 'EXTERNAL_API' | 'VALIDATION' | 'AUTHORIZATION' | 'CACHE' | 'UNKNOWN'
    severity: ErrorSeverity.HIGH, // 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
    context: { operation: "createReservation", userId: user.id },
  });
  return createMutationError("予約の作成に失敗しました");
}
```

### logger（汎用ロガー — シンプルなログ用途）

クライアントコンポーネント・シンプルなサーバーログ。
本番環境では GCP Cloud Logging 対応の構造化 JSON（`severity` フィールド付き）を出力:

```typescript
import { logger } from "@/shared/lib/logger";

// NG: console.log
console.log("User logged in:", userId);

// OK: logger
logger.info("User logged in", { userId });
logger.warn("Deprecated API called", { endpoint: "/old-api" });
logger.error("Failed to sync calendar", { error: e.message, calendarId });
logger.debug("Processing item", { itemId }); // 開発環境のみ出力
```

### ErrorCategory・ErrorSeverity 選択ガイド

| Category        | 使用場面                                              |
| --------------- | ----------------------------------------------------- |
| `DATABASE`      | Prisma クエリエラー                                   |
| `EXTERNAL_API`  | Stripe / Instagram / Google Calendar / Cloudflare API |
| `VALIDATION`    | データ整合性エラー（Zod以外）                         |
| `AUTHORIZATION` | 権限チェック失敗                                      |
| `CACHE`         | `revalidateTag` / CDN パージ失敗                      |
| `UNKNOWN`       | 分類不明なエラー                                      |

| Severity   | 使用場面                               |
| ---------- | -------------------------------------- |
| `CRITICAL` | システム障害、ユーザー続行不可         |
| `HIGH`     | 機能障害、フォールバック利用可能       |
| `MEDIUM`   | 部分的障害（ナビゲーション取得失敗等） |
| `LOW`      | 軽微な問題（CDNパージ失敗等）          |

### エラー正規化

catch 句の `unknown` 型を安全に扱う:

```typescript
import { normalizeError, getErrorMessage } from '@/shared/lib/errors'

// getErrorMessage: メッセージ文字列のみ必要な場合
catch (error) {
  logger.error('Failed', { error: getErrorMessage(error) })
}

// normalizeError: Error オブジェクトが必要な場合
catch (error) {
  const err = normalizeError(error)
  logError(err, { category: ErrorCategory.DATABASE, severity: ErrorSeverity.HIGH })
}
```

### ドメイン固有エラー（ReservationOverlapError）

```typescript
import {
  ReservationOverlapError,
  isReservationOverlapError,
} from "@/shared/lib/errors";

try {
  await prisma.$transaction(async (tx) => {
    const overlap = await tx.reservation.findFirst({
      /* 重複チェック */
    });
    if (overlap) throw new ReservationOverlapError();
    await tx.reservation.create({ data });
  });
} catch (error) {
  if (isReservationOverlapError(error)) {
    return createMutationError(error.message); // '選択された時間帯は既に予約されています'
  }
  logError(error, {
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.HIGH,
  });
  return createMutationError("予約の作成に失敗しました");
}
```

---

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
   - failure path: `createMutationError()` を使用
   - success path: domain command の戻り値 `T` を直接 return（ラッパー不要）

5. **認証チェック漏れ禁止**
   - 管理画面 Server Actions は必ず `executeAdminMutationResult` を使用。`checkPermission` の直接使用は API Routes のみ

6. **safeFetch の fallback に `undefined` 指定禁止**
   - `undefined` は React 19 シリアライゼーション対象外。`null` または具体的な値を使用

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
