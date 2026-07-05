---
paths:
  [
    "src/shared/domain/**",
    "src/shared/lib/cache/**",
    "src/shared/lib/constants/cache.ts",
    "src/shared/lib/constants/cdn-cache-tags.ts",
    "src/shared/lib/cloudflare.ts",
    "next.config.ts",
  ]
---

# キャッシュ設計

2 系統ある: Next.js Data Cache（`CACHE_TAGS`）と Cloudflare CDN（`CDN_CACHE_TAGS`）。
どちらもタグの文字列直書きは ESLint + テストで禁止。

## Next.js 側（src/shared/lib/constants/cache.ts）

- `CACHE_TAGS` / 階層は `getCacheTag` / 期間は `CACHE_LIFE` を必ず経由
- 無効化の呼び分け（間違えると runtime throw）:
  - Server Action → `invalidateSiteWideCache`（updateTag・read-your-own-writes）
  - Route Handler / cron → `invalidateSiteWideCacheFromRouteHandler`
    （revalidateTag `{expire: 0}`）。**updateTag は Route Handler で throw する**
- 新しいタグの追加は 2 つの drift gate を通す必要がある
  （producer 必須 or INVALIDATION_ONLY リスト明記、CDN mapping or allowlist 明記）。
  手順は `add-cache-tag` skill を参照

## Cloudflare CDN 側（cdn-cache-tags.ts / next.config.ts）

- `CDN_CACHE_TAGS`（全値 `-v1` suffix）+ `joinCacheTags`（Cloudflare 制約を throw で強制）
- next.config.ts 内の `Cache-Tag` 値に raw string literal を書くと ESLint error
- per-collection の Cache-Tag には `SITE_WIDE_CDN_TAGS` 全量のインラインが必須。
  Next.js の headers() は同一キーを **REPLACE**（append 不可）するため、省略すると
  site-wide purge がその collection に届かなくなる
- purge の credential は env-only（`CLOUDFLARE_ZONE_ID` / `CLOUDFLARE_API_TOKEN`）。
  未設定時は全 purge 関数が `{success: true}` の **silent no-op**

## Cache-Control の SSoT は next.config.ts headers()

- last-match-wins 前提で blanket `/:path*` の public 値を先頭、
  /admin /reservation /mypage /login /preview /contact /api の `private, no-store` を
  後置する。**順序も値もテストで固定**されている
- blanket public は撤去不可: 公開ページは全て `await connection()` で完全動的のため
  Next.js 自身は no-store を emit し、blanket の上書きで初めて CDN キャッシュが成立する
- Route Handler の Response に書いた Cache-Control は next.config に上書きされて inert
  （precedence: proxy.ts > next.config > Route Handler、実証済み）
- private route は Cache-Tag を emit してはならない（テストで強制）

## build prerender の焼き込み防止

`'use cache'` + `safeFetch`（fallback 付き）のクエリを layout 本体・generateMetadata・
sitemap から直接呼ぶと、build 時の placeholder DATABASE_URL による fallback 値
（null / 空 Map）が静的シェルに焼き込まれ、CDN HIT で恒久汚染される。
必ず「Suspense 内の async Server Component + 冒頭 `await connection()`」に隔離する。
