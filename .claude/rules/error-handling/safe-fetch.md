---
description: 公開データ取得の safeFetch / criticalFetch パターン + fallback 値設計
paths:
  - src/**/queries.ts
  - src/**/queries/**
  - src/shared/lib/errors/server*
  - src/shared/lib/safe-fetch*
  - src/app/(public*)/**
---

# safeFetch / criticalFetch パターン（公開データ取得）

> Server Components / `'use cache'` 関数での非認証データ取得。エラー時に fallback で表示継続するか error.tsx に委譲するかの使い分け。

## safeFetch（非クリティカル — フォールバックあり）

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

## criticalFetch（クリティカル — エラーバウンダリへ委譲）

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

## fallback 値の設計

| データ種別                     | fallback 値                             |
| ------------------------------ | --------------------------------------- |
| リスト                         | `[]`                                    |
| 単一オブジェクト（必須でない） | `null`                                  |
| 数値カウント                   | `0`                                     |
| 設定オブジェクト（必須でない） | デフォルト設定定数                      |
| ページ必須データ               | `criticalFetch` を使用（fallback なし） |

**注意**: `safeFetch` の `fallback` に `undefined` 指定禁止 — `undefined` は React 19 シリアライゼーション対象外。`null` または具体的な値を使用すること。
