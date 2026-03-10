# エラーハンドリングルール

> Next.js 16 Server Actions / safeFetch / criticalFetch / logger 対応

## ActionResult 型

### createSuccess / createFailure

`@/shared/types/server-actions` のヘルパーを必ず使用する。直接オブジェクトリテラルを返却しない:

```typescript
import {
  createSuccess,
  createFailure,
  type ActionResult,
} from "@/shared/types/server-actions";

// NG: オブジェクトリテラル直接返却
return { success: true, message: "保存しました" };
return { success: false, error: "エラー" };

// OK: ヘルパー使用
return createSuccess("保存しました");
return createSuccess("作成しました", { id: post.id }); // データあり
return createFailure("エラーが発生しました");
return createFailure("入力内容に誤りがあります", { email: ["無効なメール"] }); // fieldErrors付き
```

型定義:

```typescript
// 成功
type ActionSuccess<TData = void> = {
  readonly success: true;
  readonly message: string;
} & (TData extends void ? {} : { readonly data: TData });

// 失敗
type ActionFailure = {
  readonly success: false;
  readonly error: string;
  readonly fieldErrors?: Record<string, string[]>;
};

// 統合
type ActionResult<TData = void> = ActionSuccess<TData> | ActionFailure;
```

### バリデーションエラー（Zod）

`@/shared/lib/action-helpers` の `createValidationError` を使用:

```typescript
import { createValidationError } from "@/shared/lib/action-helpers";

const parsed = postSchema.safeParse(data);
if (!parsed.success) {
  return createValidationError(parsed.error);
  // => { success: false, error: '入力内容に誤りがあります', fieldErrors: { title: ['...'] } }
}
```

---

## Server Actions エラーパターン

### 認証エラー（withPermission HOF — 推奨パターン）

`withPermission` HOF は認証・認可・監査ログを自動化する。管理画面の Server Actions では必ず使用:

```typescript
"use server";

import { withPermission } from "@/admin/lib/server-action-helpers";
import { createSuccess, createFailure } from "@/admin/types/server-actions";
import { createValidationError } from "@/shared/lib/action-helpers";

export const createPost = withPermission<[CreatePostInput], { id: string }>(
  "post",
  "create",
)(async (user, data) => {
  // withPermission が認証・認可を処理済み。ここは user が保証された状態
  const parsed = createPostSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  const post = await prisma.post.create({ data: parsed.data });
  updateTag(CACHE_TAGS.POSTS);
  return createSuccess("投稿を作成しました", { id: post.id });
});
```

HOF の種類:

| HOF                                | 用途                                       |
| ---------------------------------- | ------------------------------------------ |
| `withPermission(resource, action)` | 書き込み系（create/update/delete/publish） |
| `withReadPermission(resource)`     | 読み取り系（ActionResult不要な場合）       |
| `withRole(requiredRole)`           | ロール限定アクション                       |

### 直接認証チェック（checkPermission — HOFが使いにくい場合）

```typescript
import { checkPermission } from "@/admin/lib/action-auth";

export async function deletePost(id: string): Promise<ActionResult> {
  const auth = await checkPermission("post", "delete");
  if (!auth.success) return auth.error;

  const { user } = auth;
  // ... action logic
}
```

### データベースエラー

try/catch で必ずエラーをログ + `createFailure` を返す。エラー握りつぶし禁止:

```typescript
import { logError } from "@/shared/lib/errors";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";

export const updateSpace = withPermission<[string, SpaceInput]>(
  "space",
  "update",
)(async (user, id, data) => {
  const parsed = spaceFormSchema.safeParse(data);
  if (!parsed.success) return createValidationError(parsed.error);

  try {
    await prisma.space.update({ where: { id }, data: parsed.data });
    updateTag(CACHE_TAGS.SPACES);
    return createSuccess("スペースを更新しました");
  } catch (error) {
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: "updateSpace", spaceId: id },
    });
    return createFailure("スペースの更新に失敗しました");
  }
});
```

### ビジネスロジックエラー（早期リターン）

```typescript
export const publishPost = withPermission<[string]>(
  "post",
  "publish",
)(async (user, id) => {
  const post = await prisma.post.findUnique({ where: { id } });
  if (!post) {
    return createFailure("投稿が見つかりません");
  }

  if (!post.title || !post.contentHtml) {
    return createFailure("タイトルとコンテンツが必要です");
  }

  // 競合検出（ドメイン固有エラー）
  const overlap = await checkReservationOverlap(id);
  if (overlap) {
    return createFailure("選択された時間帯は既に予約されています");
  }

  await prisma.post.update({
    where: { id },
    data: { status: PostStatus.PUBLISHED },
  });
  return createSuccess("公開しました");
});
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
import { safeFetch, ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
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
import { criticalFetch, ErrorCategory } from "@/shared/lib/errors";

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

カテゴリ・深刻度付きの構造化エラーログ。Server Actions・Server Components で使用:

```typescript
import { logError, ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";

// NG: console.log のみ
console.log("エラー:", error);

// NG: エラー握りつぶし
try {
  await action();
} catch {
  /* ignore */
}

// OK: 構造化ログ + createFailure
try {
  await action();
} catch (error) {
  logError(error, {
    category: ErrorCategory.DATABASE, // 'DATABASE' | 'EXTERNAL_API' | 'VALIDATION' | 'AUTHORIZATION' | 'CACHE' | 'UNKNOWN'
    severity: ErrorSeverity.HIGH, // 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
    context: { operation: "createReservation", userId: user.id },
  });
  return createFailure("予約の作成に失敗しました");
}
```

### logger（汎用ロガー — シンプルなログ用途）

クライアントコンポーネント・シンプルなサーバーログ:

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
    return createFailure(error.message); // '選択された時間帯は既に予約されています'
  }
  logError(error, {
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.HIGH,
  });
  return createFailure("予約の作成に失敗しました");
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
   return createFailure(error.message); // 'column "xxx" does not exist'

   // OK: ユーザー向けメッセージ
   return createFailure("操作に失敗しました");
   ```

4. **直接オブジェクトリテラルによる ActionResult 返却禁止**
   - `createSuccess()` / `createFailure()` を使用

5. **認証チェック漏れ禁止**
   - 管理画面 Server Actions は必ず `withPermission` または `checkPermission` を使用

6. **safeFetch の fallback に `undefined` 指定禁止**
   - `undefined` は React 19 シリアライゼーション対象外。`null` または具体的な値を使用

## ファイル配置

| パス                                | 内容                                                                                                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@/shared/types/server-actions`     | `ActionResult`, `createSuccess`, `createFailure`, `isActionSuccess`                                                                                             |
| `@/shared/lib/errors`               | `logError`, `createErrorLogger`, `safeFetch`, `criticalFetch`, `ErrorCategory`, `ErrorSeverity`, `normalizeError`, `getErrorMessage`, `ReservationOverlapError` |
| `@/shared/lib/logger`               | `logger`（汎用ロガー）                                                                                                                                          |
| `@/shared/lib/action-helpers`       | `createValidationError`, `withValidation`, `withTurnstile`, `withRetry`, `isTransientError`                                                                     |
| `@/admin/lib/server-action-helpers` | `withPermission`, `withReadPermission`, `withRole`（HOF群）                                                                                                     |
| `@/admin/lib/action-auth`           | `checkAdminAuth`, `checkPermission`, `checkResourceAccess`, `logAction`                                                                                         |
