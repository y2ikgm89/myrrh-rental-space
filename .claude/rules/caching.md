---
paths:
  - "src/shared/lib/cache/**"
  - "src/shared/lib/constants/cache.ts"
  - "src/shared/lib/constants/cdn-cache-tags.ts"
  - "src/shared/domain/**/queries.ts"
  - "src/shared/domain/**/*-queries.ts"
  - "src/app/**/_actions/**"
  - "src/app/api/**"
---

# キャッシュ（2 層）

| 層                 | 何                                           | タグの SSoT                                                         |
| ------------------ | -------------------------------------------- | ------------------------------------------------------------------- |
| Next.js Data Cache | `"use cache"` + `cacheTag()` / `cacheLife()` | `CACHE_TAGS` / `getCacheTag`（`src/shared/lib/constants/cache.ts`） |
| Cloudflare CDN     | HTTP `Cache-Tag` ヘッダー + purge by tag     | `CDN_CACHE_TAGS`（`src/shared/lib/constants/cdn-cache-tags.ts`）    |

**この 2 つは別物。**片方だけ無効化すると、オリジンは新しいのに CDN が古い
HTML を返し続ける。

## 書き方

```ts
async function getPosts() {
  "use cache";
  cacheTag(CACHE_TAGS.POSTS);
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  // ...
}
```

- **タグ名の文字列直書きは lint エラー。** `cacheTag` / `updateTag` /
  `revalidateTag` の第 1 引数は `CACHE_TAGS` か `getCacheTag` 経由にする。
- `cacheLife` は `CACHE_LIFE`（`PUBLIC_CONTENT` = hours / `STATIC_SETTINGS` =
  days / `DYNAMIC_DATA` = minutes / `METADATA` = hours / `MAX`）から選ぶ。
  cron や webhook の非同期再検証は `MAX`。
- `SPACE_RATE_PLANS` のように id を取るタグは関数形（`CACHE_TAGS.X(id)`）。
  この形は CDN マッピングの対象外であることが明示されている。

## 無効化

`NEXTJS_TAG_TO_CDN_TAG` に載っているタグは、raw `updateTag` /
`revalidateTag` では **Next.js 側しか消えない**。必ず

- Server Action から → `invalidateSiteWideCache([CACHE_TAGS.X])`
- Route Handler / cron から → `invalidateSiteWideCacheFromRouteHandler([...])`

を使う。ESLint `local/no-raw-updatetag-for-cdn-mapped-cache-tag` が強制し、
マッピングの drift は
`__tests__/unit/architecture/eslint-cdn-mapped-tag-rule.test.ts` が検出する。
`src/shared/lib/cache/site-wide.ts` だけが例外（このルールが誘導する先だから）。

管理画面の mutation では、無効化を `executeAdminMutationResult` の
`afterSuccess` に置く。監査ログ（fire-and-forget）より**前**に await される
契約で、逆にすると監査書き込みの失敗で公開ページが stale のまま残る。

## CDN タグのバージョン

`CDN_CACHE_TAGS` の値は全て `-v1` サフィックス付き。互換性を壊す変更をする
ときは `-v2` を併記して `s-maxage` 1 回分の窓のあいだ両方を出し、窓が過ぎたら
`-v1` を落とす。1 つの破壊的変更でサイト全体を flush しないための決まり。

Cloudflare 側の制約: タグは印字可能 ASCII のみ・空白とカンマ不可・1 タグ
1024 文字まで・`Cache-Tag` ヘッダー全体で 16 KB まで。

## `next.config.ts` の headers

`Cache-Control` の catch-all を先頭に置き、認証系・PII を含む route を
後勝ちで `no-store` にする。`Cache-Tag` の値はリテラルではなく
`joinCacheTags()` 経由（`next-config-cache-tag-ssot` の ESLint ルール）。
