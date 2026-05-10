---
description: Server Action のエラーパターン（executeAdminMutationResult / checkPermission / DB エラー / DomainError / withRetry）
paths:
  - src/**/actions/**
  - src/**/mutations.ts
  - src/admin/lib/admin-action.ts
  - src/admin/lib/action-auth.ts
  - src/shared/lib/action-helpers*
  - src/app/api/**
---

# Server Action エラーパターン

> 認証 / 権限 / DB エラー / ビジネスロジック (DomainError) / 一時的障害 (withRetry) を `executeAdminMutationResult` を中心に統一。

## 認証エラー（executeAdminMutationResult — 推奨パターン）

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

## 直接認証チェック（checkPermission — API Routes 専用）

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

## データベースエラー

`executeAdminMutationResult` は DomainError を自動キャッチするが、それ以外の例外（DB エラー等）は再スローされる。ドメインコマンド層で try/catch + `logError` を行い、Server Action 側で `createMutationError` を返す:

```typescript
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";

// Server Action（executeAdminMutationResult が DomainError を自動処理）
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

// ドメインコマンド層で DB エラーをハンドリング
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

## ビジネスロジックエラー（早期リターン）

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

## 一時的障害のリトライ

```typescript
import { withRetry, isTransientError } from "@/shared/lib/action-helpers";

const result = await withRetry(() => prisma.reservation.create({ data }), {
  maxRetries: 3,
  shouldRetry: isTransientError,
});
```
