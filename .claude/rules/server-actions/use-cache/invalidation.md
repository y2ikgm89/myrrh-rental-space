---
description: キャッシュ無効化（updateTag SA / revalidateTag SA+RH / 比較表 / 優先順位 / revalidatePath 最終手段）
paths:
  - src/**/_actions/**
  - src/**/actions/**
  - src/app/api/**
  - src/app/**/route.ts
---

# Cache Invalidation 戦略

> `updateTag` (Server Actions 即時失効 / read-your-own-writes) と `revalidateTag` (SA + Route Handlers 非同期再検証 / SWR) の使い分け + 優先順位 + `revalidatePath` 最終手段。

## updateTag（即時失効 — read-your-own-writes）

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

  return { id: post.id };
}

export async function deletePost(id: string) {
  // ... DB 操作 ...
  await prisma.post.delete({ where: { id } });

  // 関連タグをまとめて即時失効
  updateTag(CACHE_TAGS.POSTS);
  updateTag(CACHE_TAGS.SIDEBAR_DATA);

  return null;
}
```

## revalidateTag（非同期再検証 — stale-while-revalidate）

即時性が不要な場合（バックグラウンド処理・Route Handlers など）。**Next.js 16 公式: 第 2 引数は CacheLife プリセット文字列または `{ expire }` オブジェクト形式**:

```typescript
import { revalidateTag } from "next/cache";
import { CACHE_TAGS, CACHE_LIFE, getCacheTag } from "@/shared/lib/constants";

// Route Handler（CRON / Webhook）— 実際のプロジェクト例
// src/app/api/cron/calendar-sync/route.ts
// src/app/api/webhooks/google-calendar/route.ts
// ⚠️ Next.js 16: revalidateTag は第 2 引数（プロファイル）が必須
export async function GET() {
  const result = await syncFromCalendar();
  // ⚠️ updateTag は Server Actions 専用 — Route Handler では revalidateTag を使う
  revalidateTag(CACHE_TAGS.RESERVATIONS, CACHE_LIFE.DYNAMIC_DATA);
  revalidateTag(getCacheTag.reservations.calendar(), CACHE_LIFE.DYNAMIC_DATA);
  return NextResponse.json({ ok: true });
}

// 個別アイテムのみ無効化（第 2 引数に適切なプロファイルを指定）
revalidateTag(getCacheTag.posts.detail(slug), CACHE_LIFE.PUBLIC_CONTENT);

// 大量バッチ処理・非同期再構築ジョブ — 公式推奨の stale-while-revalidate
// `'max'` プリセット（stale 5分 / revalidate 1ヶ月 / expire 1年）で次回以降の
// リクエストで徐々に再検証させる。cron / webhook 等「次 tick で良い」シナリオ向け
revalidateTag(CACHE_TAGS.POSTS, CACHE_LIFE.MAX);

// 即時失効（オブジェクト形式 — 特殊ケース向け公式 API）
// Server Actions では updateTag を優先するため、Route Handler の同期的用途のみ検討
revalidateTag(CACHE_TAGS.POSTS, { expire: 0 });
```

## updateTag vs revalidateTag 比較

| API             | 挙動                               | 使用場所                       | 適用シーン                          |
| --------------- | ---------------------------------- | ------------------------------ | ----------------------------------- |
| `updateTag`     | 即時失効（同一リクエスト内で反映） | **Server Actions 内のみ**      | CRUD 操作後の read-your-own-writes  |
| `revalidateTag` | 非同期再検証（次リクエストで反映） | Server Actions・Route Handlers | バックグラウンド処理・CRON・webhook |

## キャッシュ無効化の優先順位（Next.js 16 公式推奨）

```
updateTag (SA)  >  revalidateTag(tag, CACHE_LIFE.MAX) (SA/RH, SWR)  >  revalidatePath (最終)
```

| 優先順位 | API              | 使用場所            | 選択基準                                                                                   |
| -------- | ---------------- | ------------------- | ------------------------------------------------------------------------------------------ |
| 1        | `updateTag`      | Server Actions      | CRUD 操作後の即時反映（read-your-own-writes）。タグで特定可能な場合の第一選択              |
| 2        | `revalidateTag`  | SA / Route Handlers | cron / webhook / バックグラウンド処理。`CACHE_LIFE.MAX` で stale-while-revalidate          |
| 3        | `revalidatePath` | SA / Route Handlers | タグ管理が現実的でないページ単位 invalidation のみ。原則として 1・2 で対応不可能な場合のみ |

## revalidatePath（最終手段）

タグで対応できない場合のみ。**原則 `updateTag` / `revalidateTag` を優先**:

```typescript
import { revalidatePath } from "next/cache";

// 特定ページ
revalidatePath("/posts");

// レイアウト全体
revalidatePath("/admin", "layout");
```
