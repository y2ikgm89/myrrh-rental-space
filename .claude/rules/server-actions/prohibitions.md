---
description: Server Action のキャッシュタグ命名規則 / 禁止事項 / ファイル配置 / Gotchas
paths:
  - src/**/_actions/**
  - src/**/actions/**
---

# Server Action — 命名規則 / 禁止事項 / 配置 / Gotchas

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
   - `updateTag('layout-settings')` → `updateTag(CACHE_TAGS.LAYOUT_SETTINGS)`
   - `revalidateTag('posts', 'hours')` → `revalidateTag(CACHE_TAGS.POSTS, CACHE_LIFE.PUBLIC_CONTENT)`
   - `cacheLife('hours')` → `cacheLife(CACHE_LIFE.PUBLIC_CONTENT)`
   - `CACHE_TAGS.SETTINGS` は廃止済み — 粒度別タグを使用（`gotchas.md` 参照）

2. **`getCacheTag.*.list()` と `CACHE_TAGS.*` の二重呼び出し禁止**
   - `getCacheTag.reservations.list()` は `CACHE_TAGS.RESERVATIONS` と同一値。ベースタグのみ使用し `.list()` は呼ばない

3. **認証チェック漏れ禁止**
   - 管理画面の変更系 Server Actions は必ず `executeAdminMutationResult` を使用
   - API Routes のみ `checkPermission()` を直接使用
   - 読み取りアクションはレイアウトの認証ガード（`verifyAdminSession()`）に依存

   ```typescript
   // NG: 認証なしで直接 DB 操作
   export async function deletePost(id: string) {
     await prisma.post.delete({ where: { id } });
     return null; // executeAdminMutationResult なしに直接返すのは NG
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

4. **エラー握りつぶし禁止**
   - `try { ... } catch {}` — 必ずエラーを `logError` で記録する
   - エラーは `logger.error` で記録する（`safeFetch` は自動記録）

5. **updateTag を Route Handlers で使用禁止**
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

6. **'use cache' 関数内での認証禁止**
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

7. **Prisma オブジェクトを Client Component に直接渡すことを禁止**
   - `toPlainObject()` / `toPlainArray()` でシリアライズ（React 19 Symbol プロパティ除去）

8. **`'use cache'` 関数内で `safeFetch()` を `await` なし・`toPlainObject()` なしで return 禁止**
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

9. **公開フォーム送信 Server Action のレート制限チェック省略禁止**
   - `submitInquiry` / `submitReservation` 等の公開フォームは `checkActionRateLimit(formSubmitRateLimiter)` を最初のステップに配置
   - `fetchAvailableSlots` 等の公開クエリは `checkActionRateLimit(publicQueryRateLimiter)` を使用
   - Turnstile と併用（Turnstile bypass 攻撃への二重防御）

---

## ファイル配置

| パス                              | 内容                                                                        |
| --------------------------------- | --------------------------------------------------------------------------- |
| `@/shared/lib/constants/cache.ts` | `CACHE_TAGS`, `CACHE_LIFE`, `getCacheTag` 定数                              |
| `@/admin/lib/admin-action.ts`     | `executeAdminMutationResult`（認証・権限・監査ログ・DomainError 一括処理）  |
| `@/admin/lib/action-auth.ts`      | `checkAdminAuth`, `checkPermission`, `checkResourceAccess`, `logAction`     |
| `@/shared/lib/mutation-result.ts` | `MutationResult<T>`, `isMutationError()`                                    |
| `@/shared/lib/action-helpers.ts`  | `createValidationMutationError`, `checkActionRateLimit`                     |
| `@/shared/lib/rate-limit.ts`      | `formSubmitRateLimiter`, `publicQueryRateLimiter`, `getClientIpFromHeaders` |
| `@/shared/lib/errors`             | `safeFetch`, `ErrorCategory`, `ErrorSeverity`                               |
| `@/shared/lib/serialize.ts`       | `toPlainObject`, `toPlainArray`                                             |

## Gotchas

- **`MagneticButton` はフォーム送信ボタンに使えない** — `type="submit"` / `disabled` prop を受け取らない。フォーム送信には `<button type="submit" className="rounded-lg bg-primary ...">` を使用
- **公開フォームの `error` prop は条件付きスプレッド** — `exactOptionalPropertyTypes: true` 下で `error={form.formState.errors.name?.message}` は `string | undefined` になり型エラー。`...(msg && { error: msg })` を使用
- **`omitUndefined` でメール通知データをラップ** — `ReservationNotificationPayload` の `notes?: string | undefined` は `ReservationEmailData` の `notes?: string` と非互換。`omitUndefined(result.notification)` で解決
- **公開フォーム Server Action に `executeAdminMutationResult` 禁止** — 認証不要。直接 Zod + `validateTurnstile` + ドメインコマンド + `fireAndForget` メール
