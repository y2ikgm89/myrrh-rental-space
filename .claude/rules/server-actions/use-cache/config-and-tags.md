---
description: 'use cache' ディレクティブ + cacheTag SSoT (CACHE_TAGS / getCacheTag) + cacheLife プリセット (CACHE_LIFE.* 定数) + カスタム有効期限
paths:
  - src/**/_actions/**
  - src/**/actions/**
  - src/**/queries.ts
  - src/**/queries/**
  - src/shared/lib/constants/cache.ts
---

# 'use cache' + cacheTag + cacheLife

> 関数レベル `'use cache'` + `cacheTag()` で SSoT 化された CACHE_TAGS / getCacheTag を付与 + `CACHE_LIFE.*` プリセットで保持期間を統一。

## 基本キャッシュ（関数レベル）

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

## cacheTag でタグ付け

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

## CACHE_LIFE 定数（プロジェクト標準）

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

## cacheLife プリセット一覧（参考）

| プリセット  | stale | revalidate | expire |
| ----------- | ----- | ---------- | ------ |
| `'seconds'` | 30 秒 | 1 秒       | 60 秒  |
| `'minutes'` | 5 分  | 1 分       | 1 時間 |
| `'hours'`   | 5 分  | 1 時間     | 1 日   |
| `'days'`    | 5 分  | 1 日       | 1 週間 |
| `'weeks'`   | 5 分  | 1 週間     | 1 ヶ月 |
| `'max'`     | 5 分  | 1 ヶ月     | 1 年   |

## カスタム有効期限

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
  return toPlainArray(result); // React 19: Prisma Symbol プロパティを除去
}
```
