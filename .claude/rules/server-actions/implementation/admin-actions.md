---
description: Admin Server Action 実装パターン（Promise.all 並列 / executeAdminMutationResult / checkPermission API only / 実行順序契約）
paths:
  - src/**/_actions/**
  - src/**/actions/**
  - src/app/(admin)/**/_shared/lib/admin-action.ts
  - src/app/(admin)/**/_shared/lib/action-auth.ts
---

# Admin Server Action 実装パターン

> Promise.all 並列化 / `executeAdminMutationResult` 標準パターン / `checkPermission` API Routes 専用 / オプション + EDITOR `checkResourceAccess` / 実行順序契約 7 ステップ。

## 独立クエリの Promise.all 並列化

結果が互いに依存しない複数の DB クエリは `Promise.all` で並列実行する:

```typescript
// NG: 独立したクエリを順次 await（無駄な直列実行）
const post = await prisma.post.findUnique({ where: { id } });
const latestVersion = await prisma.postVersion.findFirst({
  where: { postId: id },
  orderBy: { versionNumber: "desc" },
});

// OK: Promise.all で並列実行
const [post, latestVersion] = await Promise.all([
  prisma.post.findUnique({ where: { id } }),
  prisma.postVersion.findFirst({
    where: { postId: id },
    orderBy: { versionNumber: "desc" },
  }),
]);
```

> **注意**: `prisma.$transaction` 内では順次実行が必要なケースがある。

## 基本構造（executeAdminMutationResult パターン）

`executeAdminMutationResult` は認証・認可・監査ログ・DomainError ハンドリングを一括処理する。**全 Server Actions で必須のパターン**:

```typescript
"use server";

import { updateTag } from "next/cache";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  postFormSchema,
  type PostFormInput,
} from "@/shared/lib/validations/post";
import { createPostCommand } from "@/shared/domain/posts/commands";

export async function createPost(
  input: PostFormInput,
): Promise<MutationResult<{ id: string }>> {
  // 1. バリデーション（executeAdminMutationResult の外で実施）
  const parsed = postFormSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  // 2. executeAdminMutationResult で認証・権限チェック・監査ログ・実行を一括処理
  return executeAdminMutationResult({
    resource: "post",
    action: "create",
    execute: async () => createPostCommand(parsed.data),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.POSTS);
    },
    resolveAuditResourceId: (data) => data.id,
  });
}
```

## checkPermission パターン（API Routes 専用）

`checkPermission` を直接使用するのは **API Routes のみ**。Server Actions では `executeAdminMutationResult` を使用する:

```typescript
// API Route（src/app/(admin)/admin/api/...）での使用例
import { checkPermission } from "@/admin/lib/action-auth";

export async function POST(request: Request) {
  const auth = await checkPermission("media", "create");
  if (!auth.success) return new Response("Unauthorized", { status: 401 });

  const { user } = auth;
  // ... API Route の処理
}
```

## executeAdminMutationResult のオプション

```typescript
type ExecuteAdminMutationResultOptions<TData> = {
  resource: Resource; // リソース種別（'post' | 'page' | 'reservation' 等）
  action: Action; // アクション種別（'create' | 'update' | 'delete' | 'publish' | 'read'）
  resourceId?: string; // リソースID（EDITOR ロールのアクセス制限・監査ログに使用）
  checkResourceAccess?: boolean; // true で EDITOR ロールのリソースアクセス制限を有効化
  execute: (user: User) => Promise<TData>; // DB 操作等の実行関数（認証済みユーザーを受け取る）
  afterSuccess?: (data: TData) => Promise<void> | void; // 成功後の副作用（キャッシュ無効化等）
  resolveAuditResourceId?: (data: TData) => string | undefined; // 監査ログ用リソースID（create 時に使用）
};
```

戻り値は `MutationResult<TData>` — 成功時は `{ data: TData }`、失敗時は `{ error, fieldErrors? }` で `isMutationError()` で判別。

### EDITOR ロールのリソースアクセス制限

`checkResourceAccess: true` を指定すると、EDITOR ロールが他ユーザーのリソースを操作できないよう制限する:

```typescript
export async function updatePage(
  id: string,
  input: PageFormInput,
): Promise<MutationResult<null>> {
  const parsed = pageFormSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "page",
    action: "update",
    resourceId: id, // リソースIDを指定
    checkResourceAccess: true, // EDITOR アクセス制限を有効化
    execute: async (user) => updatePageCommand(id, parsed.data),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.PAGES);
    },
  });
}
```

## executeAdminMutationResult 実行順序契約（不変条件）

`executeAdminMutationResult` は以下の順序で実行する。**順序を変更してはならない**:

```
1. checkAdminAuth() — 認証（DB lookup より前に必ず）
2. resolveResourceId(user) — 認証後に resourceId を解決（callback 指定時のみ）
3. hasPermission() — RBAC ロールベース認可
4. userHasResourceAccess() — EDITOR の userPageAssignment チェック（checkResourceAccess: true 時のみ）
5. execute(user) — DB mutation（DomainError は catch で `{ error: message }` に変換）
6. await afterSuccess(data) — クリティカル副作用（cache invalidation / 通知生成 / email fireAndForget）
7. fireAndForget(logAction(...)) — 監査ログ（非ブロッキング）
```

**禁止**:

- `await logAction(...)` でクリティカルパスに入れる。監査書き込み失敗時に catch で rethrow され `afterSuccess` がスキップ → `updateTag` が呼ばれず公開ページが stale のままになる silent bug（同一ユーザーが次回リクエストで古い値を見る + 再試行すると P2002 等で再度失敗する連鎖）。
- 認証 (1) より前に DB lookup を置く（未認証 request が DB に到達 = DoS / cache-layer poisoning 経路）。`sectionId → pageId` のような認可キー解決は `resolveResourceId` callback を使い、認証後に呼ばせる。`resourceId` (静的) と `resolveResourceId` (認証後 DB lookup) は discriminated union で型レベル排他化されている。

監査失敗は `fireAndForget` が内部で `logError`（category: `DATABASE`, severity: `MEDIUM`）で記録するため observability は保たれ、コンプライアンス監査でも欠損を検出できる。

参照実装: `@/admin/lib/admin-action.ts`。reviewer は `await logAction(` の grep hit をすべて regression として扱う（`checkAdminAuth` / `checkPermission` 内部の `await` は別経路のため対象外）。
