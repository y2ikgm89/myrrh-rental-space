---
paths:
  - src/app/**
  - src/shared/**
---

# Server Actions ルール

> Next.js 16 / 'use cache' / PPR 対応

## 'use cache' パターン（Next.js 16 新API）

### 基本キャッシュ（関数レベル）

`'use cache'` ディレクティブで非同期関数の結果をキャッシュ:

```typescript
// NG: キャッシュなし（毎リクエストで DB アクセス）
async function getPosts() {
  return await prisma.post.findMany({ where: { isPublished: true } });
}

// OK: 関数レベルのキャッシュ
async function getPosts() {
  "use cache";
  return await prisma.post.findMany({ where: { isPublished: true } });
}
```

### cacheTag でタグ付け

`cacheTag()` で後から無効化できるようにタグを付与。**CACHE_TAGS 定数必須**（マジックストリング禁止）:

```typescript
import { cacheTag, cacheLife } from "next/cache";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";

// 単一タグ
async function getPosts() {
  "use cache";
  cacheTag(CACHE_TAGS.POSTS);
  return await prisma.post.findMany({ where: { isPublished: true } });
}

// 複数タグ（リスト + 詳細）
async function getPost(slug: string) {
  "use cache";
  cacheTag(CACHE_TAGS.POSTS, getCacheTag.posts.detail(slug));
  return await prisma.post.findUnique({ where: { slug } });
}

// 複数ドメインタグ（Settings は複数タグを付与）
async function getPublicBusinessSettings() {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.BUSINESS_SETTINGS, CACHE_TAGS.SETTINGS);
  // ...
}
```

### CACHE_LIFE 定数（プロジェクト標準）

`@/shared/lib/constants/cache.ts` の `CACHE_LIFE` を使用。cacheLife プリセット文字列を直接書かない:

```typescript
import { CACHE_LIFE } from "@/shared/lib/constants";

// NG: マジックストリング
cacheLife("hours");

// OK: CACHE_LIFE 定数
cacheLife(CACHE_LIFE.PUBLIC_CONTENT); // 'hours'
cacheLife(CACHE_LIFE.STATIC_SETTINGS); // 'days'
cacheLife(CACHE_LIFE.DYNAMIC_DATA); // 'minutes'
cacheLife(CACHE_LIFE.METADATA); // 'hours'
```

| 定数                         | プリセット  | 用途                               |
| ---------------------------- | ----------- | ---------------------------------- |
| `CACHE_LIFE.PUBLIC_CONTENT`  | `'hours'`   | ブログ・ニュース・スペース・ページ |
| `CACHE_LIFE.STATIC_SETTINGS` | `'days'`    | サイト設定・ナビゲーション         |
| `CACHE_LIFE.DYNAMIC_DATA`    | `'minutes'` | 予約状況・在庫                     |
| `CACHE_LIFE.METADATA`        | `'hours'`   | メタデータ・SEO                    |

### cacheLife プリセット一覧（参考）

| プリセット  | stale | revalidate | expire |
| ----------- | ----- | ---------- | ------ |
| `'seconds'` | 30秒  | 1秒        | 60秒   |
| `'minutes'` | 5分   | 1分        | 1時間  |
| `'hours'`   | 5分   | 1時間      | 1日    |
| `'days'`    | 5分   | 1日        | 1週間  |
| `'weeks'`   | 5分   | 1週間      | 1ヶ月  |
| `'max'`     | 5分   | 1ヶ月      | 1年    |

### カスタム有効期限

細かい制御が必要な場合のみ `{ stale, revalidate, expire }` オブジェクトを使用:

```typescript
import { toPlainArray } from "@/shared/lib/serialize";

async function getPopularPosts() {
  "use cache";
  cacheLife({
    stale: 300, // 5分間は stale でも返す
    revalidate: 60, // 60秒後にバックグラウンド再検証
    expire: 3600, // 1時間で完全失効
  });
  cacheTag(CACHE_TAGS.POSTS);
  const result = await prisma.post.findMany({
    take: 10,
    orderBy: { viewCount: "desc" },
  });
  return toPlainArray(result); // React 19: Prisma Symbol プロパティを除去（§禁止事項 item 7）
}
```

---

## キャッシュ無効化パターン

### updateTag（即時失効 — read-your-own-writes）

**Server Actions 内のみ使用可**。同一リクエスト内で変更を即座に反映させる場合に使用:

```typescript
import { updateTag } from "next/cache";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";

export async function createPost(data: CreatePostInput) {
  // ... DB 操作 ...
  const post = await prisma.post.create({ data: validated.data });

  // 即時失効（リスト + 詳細）
  updateTag(CACHE_TAGS.POSTS);
  updateTag(getCacheTag.posts.detail(post.slug));

  return createSuccess("投稿を作成しました", { id: post.id });
}

export async function deletePost(id: string) {
  // ... DB 操作 ...
  await prisma.post.delete({ where: { id } });

  // 関連タグをまとめて即時失効
  updateTag(CACHE_TAGS.POSTS);
  updateTag(CACHE_TAGS.HOMEPAGE_SECTIONS);

  return createSuccess("投稿を削除しました");
}
```

### revalidateTag（非同期再検証 — stale-while-revalidate）

即時性が不要な場合（バックグラウンド処理・Route Handlers など）:

```typescript
import { revalidateTag } from "next/cache";
import { CACHE_TAGS, CACHE_LIFE, getCacheTag } from "@/shared/lib/constants";

// Route Handler（CRON / Webhook）— 実際のプロジェクト例
// src/app/api/cron/calendar-sync/route.ts
// src/app/api/webhooks/google-calendar/route.ts
// ⚠️ Next.js 16: revalidateTag は第2引数（プロファイル）が必須
export async function GET() {
  const result = await syncFromCalendar();
  // ⚠️ updateTag は Server Actions 専用 — Route Handler では revalidateTag を使う
  revalidateTag(CACHE_TAGS.RESERVATIONS, CACHE_LIFE.DYNAMIC_DATA);
  revalidateTag(getCacheTag.reservations.calendar(), CACHE_LIFE.DYNAMIC_DATA);
  return NextResponse.json({ ok: true });
}

// 個別アイテムのみ無効化（第2引数に適切なプロファイルを指定）
revalidateTag(getCacheTag.posts.detail(slug), CACHE_LIFE.PUBLIC_CONTENT);
```

### updateTag vs revalidateTag 比較

| API             | 挙動                               | 使用場所                       | 適用シーン                          |
| --------------- | ---------------------------------- | ------------------------------ | ----------------------------------- |
| `updateTag`     | 即時失効（同一リクエスト内で反映） | **Server Actions 内のみ**      | CRUD 操作後の read-your-own-writes  |
| `revalidateTag` | 非同期再検証（次リクエストで反映） | Server Actions・Route Handlers | バックグラウンド処理・CRON・webhook |

### revalidatePath（最終手段）

タグで対応できない場合のみ。**原則 revalidateTag を優先**:

```typescript
import { revalidatePath } from "next/cache";

// 特定ページ
revalidatePath("/posts");

// レイアウト全体
revalidatePath("/admin", "layout");
```

---

## Server Action 実装パターン

### 独立クエリの Promise.all 並列化

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

### 基本構造（executeAdminMutationResult パターン）

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

### checkPermission パターン（API Routes 専用）

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

### executeAdminMutationResult のオプション

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

#### EDITOR ロールのリソースアクセス制限

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

### MutationResult 型と isMutationError

```typescript
import type { MutationResult } from "@/shared/lib/mutation-result";
import { isMutationError } from "@/shared/lib/mutation-result";

// 成功（データあり）— execute の戻り値がそのまま data になる
// { data: { id: "post-1" } }

// 失敗（エラーメッセージ）
// { error: "投稿が見つかりません" }

// 失敗（フィールドエラー付き — バリデーション）
// { error: "入力内容に誤りがあります", fieldErrors: { title: ["タイトルは必須です"] } }

// Zod バリデーションエラー → MutationResult 変換
import { createValidationMutationError } from "@/shared/lib/action-helpers";
const parsed = schema.safeParse(input);
if (!parsed.success) return createValidationMutationError(parsed.error);

// Client Component での判定
const result = await someAction(input);
if (isMutationError(result)) {
  // result.error, result.fieldErrors
} else {
  // result.data
}
```

---

## 公開データ取得パターン（'use cache' + safeFetch + toPlainObject）

認証不要の公開データ取得関数では `safeFetch` + `toPlainObject` を使用:

```typescript
import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/lib/prisma";
import { CACHE_TAGS, CACHE_LIFE } from "@/shared/lib/constants";
import { safeFetch, ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
import { toPlainObject } from "@/shared/lib/serialize";

export async function getPublicBusinessSettings() {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.BUSINESS_SETTINGS, CACHE_TAGS.SETTINGS);

  const result = await safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: "singleton" },
        select: { businessName: true, phoneNumber: true, email: true },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublicBusinessSettings",
  });

  // React 19: Prisma の Symbol プロパティを除去してシリアライズ可能にする
  return toPlainObject(result);
}
```

**なぜ `safeFetch` を使うか**: エラー時に `fallback` を返し、ページ全体のクラッシュを防ぐ。`logger.error` で記録しつつユーザーへのエラー表示を最小化。

**`safeFetch` の結果は必ず `toPlainObject()` でラップしてから返す**。`return safeFetch({...})` と直接返すと `Promise<Prisma結果>` がそのまま漏れ出す（サイレントバグ）:

```typescript
// NG: await せず直接 return（Prisma Symbol プロパティが残り React 19 シリアライゼーションエラー）
async function getSettings() {
  'use cache'
  return safeFetch({ fetch: () => prisma.settings.findUnique({ ... }), fallback: null, ... })
}

// OK: await + toPlainObject でプレーンオブジェクト化
async function getSettings() {
  'use cache'
  const result = await safeFetch({ fetch: () => prisma.settings.findUnique({ ... }), fallback: null, ... })
  return toPlainObject(result)
}
```

---

## キャッシュタグ命名規則

### CACHE_TAGS 定数（必須）

`@/shared/lib/constants/cache.ts` で一元管理。**全 API（cacheTag / updateTag / revalidateTag）で定数使用必須**:

```typescript
import { CACHE_TAGS, CACHE_LIFE, getCacheTag } from "@/shared/lib/constants";

// OK: 定数を使用（Next.js 16: revalidateTag は第2引数が必須）
cacheTag(CACHE_TAGS.POSTS);
cacheTag(CACHE_TAGS.SETTINGS, CACHE_TAGS.LAYOUT_SETTINGS);
updateTag(CACHE_TAGS.POSTS);
revalidateTag(CACHE_TAGS.POSTS, CACHE_LIFE.PUBLIC_CONTENT);

// NG: マジックストリング（禁止）
cacheTag("posts");
updateTag("settings");
revalidateTag("layout-settings", CACHE_LIFE.PUBLIC_CONTENT);
```

### getCacheTag（階層タグ）

個別アイテムのタグは `getCacheTag` ヘルパーで生成:

```typescript
// タグ付け（キャッシュ関数内）
cacheTag(CACHE_TAGS.POSTS, getCacheTag.posts.detail(slug));

// 無効化（詳細のみ）
updateTag(getCacheTag.posts.detail(slug));

// 無効化（リスト全体）
updateTag(CACHE_TAGS.POSTS);
```

| ヘルパー                              | 生成タグ例              |
| ------------------------------------- | ----------------------- |
| `getCacheTag.posts.detail(slug)`      | `posts-my-post-slug`    |
| `getCacheTag.news.detail(id)`         | `news-abc123`           |
| `getCacheTag.spaces.detail(id)`       | `spaces-xyz789`         |
| `getCacheTag.pages.detail(slug)`      | `pages-about`           |
| `getCacheTag.reservations.calendar()` | `reservations-calendar` |

---

## 禁止事項

1. **マジックストリングのタグ名禁止**
   - `cacheTag('posts')` → `cacheTag(CACHE_TAGS.POSTS)`
   - `updateTag('settings')` → `updateTag(CACHE_TAGS.SETTINGS)`
   - `revalidateTag('posts', 'hours')` → `revalidateTag(CACHE_TAGS.POSTS, CACHE_LIFE.PUBLIC_CONTENT)`
   - `cacheLife('hours')` → `cacheLife(CACHE_LIFE.PUBLIC_CONTENT)`

2. **認証チェック漏れ禁止**
   - 管理画面の変更系 Server Actions は必ず `executeAdminMutationResult` を使用
   - API Routes のみ `checkPermission()` を直接使用
   - 読み取りアクションはレイアウトの認証ガード（`verifySession()`）に依存

   ```typescript
   // NG: 認証なしで直接 DB 操作
   export async function deletePost(id: string) {
     await prisma.post.delete({ where: { id } });
     return createSuccess("削除しました");
   }
   // OK: executeAdminMutationResult で認証・権限チェック・監査ログを一括処理
   export async function deletePost(id: string): Promise<MutationResult<null>> {
     return executeAdminMutationResult({
       resource: "post",
       action: "delete",
       resourceId: id,
       execute: async () => deletePostCommand(id),
       afterSuccess: () => {
         updateTag(CACHE_TAGS.POSTS);
       },
     });
   }
   ```

3. **エラー握りつぶし禁止**
   - `try { ... } catch {}` — 必ずエラーを `logError` で記録する
   - エラーは `logger.error` で記録する（`safeFetch` は自動記録）

4. **updateTag を Route Handlers で使用禁止**
   - Route Handlers では `revalidateTag` を使用
   - `updateTag` は Server Actions 内のみ有効

   ```typescript
   // NG: Route Handler 内で updateTag
   export async function POST() {
     await syncCalendar();
     updateTag(CACHE_TAGS.RESERVATIONS); // 動作しない
     return Response.json({ ok: true });
   }
   // OK: revalidateTag を使用（Next.js 16: 第2引数に CACHE_LIFE プロファイルが必須）
   export async function POST() {
     await syncCalendar();
     revalidateTag(CACHE_TAGS.RESERVATIONS, CACHE_LIFE.DYNAMIC_DATA);
     return Response.json({ ok: true });
   }
   ```

5. **'use cache' 関数内での認証禁止**
   - キャッシュ関数はリクエストをまたいで共有される（全ユーザー共通のキャッシュ）
   - 認証が必要なデータは `'use cache'` なしで取得し、認証チェック後にキャッシュ関数を呼ぶ

   ```typescript
   // NG: 'use cache' 内でセッション取得（全ユーザーが同一キャッシュを共有する）
   async function getMyDraftPosts() {
     "use cache";
     const session = await getSession(); // 危険: キャッシュされた session が別ユーザーに返る
     return await prisma.post.findMany({
       where: { authorId: session?.user.id },
     });
   }
   // OK: 認証チェック後にキャッシュ関数を呼ぶ
   export async function getMyDraftPosts() {
     const session = await getSession();
     if (!session) return [];
     return await getCachedDraftPosts(session.user.id); // ユーザー ID をパラメータで渡す
   }
   ```

6. **Prisma オブジェクトを Client Component に直接渡すことを禁止**
   - `toPlainObject()` / `toPlainArray()` でシリアライズ（React 19 Symbol プロパティ除去）

7. **`'use cache'` 関数内で `safeFetch()` を `await` なし・`toPlainObject()` なしで return 禁止**
   - `return safeFetch({...})` はサイレントバグ（`Promise<PrismaResult>` がシリアライゼーション境界を越える）
   - 必ず `const result = await safeFetch({...}); return toPlainObject(result)` の形式で記述

   ```typescript
   // NG: safeFetch を直接 return（await なし）
   async function getData() {
     'use cache'
     return safeFetch({ fetch: () => prisma.xxx.findUnique({ ... }), fallback: null, ... })
   }

   // NG: await したが toPlainObject なし（Prisma オブジェクトそのままが cached value になる）
   async function getData() {
     'use cache'
     return await safeFetch({ fetch: () => prisma.xxx.findUnique({ ... }), fallback: null, ... })
   }

   // OK: await + toPlainObject（React 19 シリアライゼーション安全）
   async function getData() {
     'use cache'
     const result = await safeFetch({ fetch: () => prisma.xxx.findUnique({ ... }), fallback: null, ... })
     return toPlainObject(result)
   }
   ```

---

## ファイル配置

| パス                              | 内容                                                                       |
| --------------------------------- | -------------------------------------------------------------------------- |
| `@/shared/lib/constants/cache.ts` | `CACHE_TAGS`, `CACHE_LIFE`, `getCacheTag` 定数                             |
| `@/admin/lib/admin-action.ts`     | `executeAdminMutationResult`（認証・権限・監査ログ・DomainError 一括処理） |
| `@/admin/lib/action-auth.ts`      | `checkAdminAuth`, `checkPermission`, `checkResourceAccess`, `logAction`    |
| `@/shared/lib/mutation-result.ts` | `MutationResult<T>`, `isMutationError()`                                   |
| `@/shared/lib/action-helpers.ts`  | `createValidationMutationError`                                            |
| `@/shared/lib/errors`             | `safeFetch`, `ErrorCategory`, `ErrorSeverity`                              |
| `@/shared/lib/serialize.ts`       | `toPlainObject`, `toPlainArray`                                            |
