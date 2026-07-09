---
name: add-cache-tag
description: 新しいキャッシュタグ (CACHE_TAGS) を追加するときの end-to-end 手順。'use cache' producer への cacheTag() 配線、Server Action / Route Handler での invalidation (updateTag / revalidateTag) の呼び分け、Cloudflare CDN 側の NEXTJS_TAG_TO_CDN_TAG マッピングまたは allowlist 明記、next.config.ts の Cache-Tag emission までを 2 つの drift gate テスト (architecture-boundaries / cdn-cache-tags) を通しながら進める。これらのテストが「producer を持たない」「neither mapped nor allowlisted」で fail したときの対処にも使う。
---

# 新しいキャッシュタグの追加 (end-to-end)

2 系統 (Next.js Data Cache / Cloudflare CDN) の設計思想・無効化ヘルパーの呼び分け・
Cache-Control 方針といった常設規約は rules の caching.md を参照。
この skill は「タグを 1 つ増やすときに触るファイルと、通すべきゲート」の手順に集中する。

## 全体像（触るファイル）

| 目的                 | 場所                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| タグ定数             | `src/shared/lib/constants/cache.ts` — `CACHE_TAGS` / `getCacheTag`                             |
| producer             | `src/shared/domain/<entity>/queries.ts` の `'use cache'` クエリ                                |
| invalidation         | admin actions（`_shared/actions/*`）/ Route Handler / cron                                     |
| CDN 定数・マッピング | `src/shared/lib/constants/cdn-cache-tags.ts`                                                   |
| CDN emission         | `next.config.ts` の `headers()`                                                                |
| drift gate           | `__tests__/unit/architecture-boundaries.test.ts` / `__tests__/unit/lib/cdn-cache-tags.test.ts` |

## Step 1: `CACHE_TAGS` へ定数追加

`src/shared/lib/constants/cache.ts` の `CACHE_TAGS` に kebab-case 値で追加する
（例: `SUPPRESSED_EMAILS: "suppressed-emails"`）。

- **タグ文字列の直書きは禁止**: `architecture-boundaries.test.ts` の
  「cache tag invalidation は CACHE_TAGS / getCacheTag を経由し、タグ文字列を直書きしない」
  テストが `cacheTag()` / `updateTag()` / `revalidateTag()` への文字列リテラル直渡しを
  src 全域で 0 件強制している（定義元 cache.ts のみ除外）。定数に一元化しないと
  producer/consumer のタグ名がズレても型・テストの両方をすり抜けるため。
- per-detail（slug/id 単位）のサブタグが必要なら、同ファイルの `getCacheTag` に
  factory を追加する（`` `${CACHE_TAGS.X}-${slug}` `` の形。既存の `posts.detail` 等に倣う）。
- 利用側の import は barrel `@/shared/lib/constants` 経由（既存 producer と同じ）。

## Step 2: producer — `'use cache'` クエリに `cacheTag()`

置き場所は `src/shared/domain/<entity>/queries.ts`（DB read の配置規約は rules の db-domain.md）。
canonical な並びは次の順:

```typescript
export async function getXxxList() {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.XXX);
  // ... Prisma query
}
```

- 実例: `src/shared/domain/posts/queries.ts` の `getPublishedPostsList`
  （`cacheTag(CACHE_TAGS.POSTS, CACHE_TAGS.POST_TAGS)` のように複数タグ可）。
- `cacheLife` / `cacheTag` は `next/cache` から import。
- `CACHE_LIFE` の選択基準（cache.ts の JSDoc が SSoT）:
  `PUBLIC_CONTENT`（hours・公開コンテンツ）/ `STATIC_SETTINGS`（days・設定系）/
  `DYNAMIC_DATA`（minutes・予約状況等）/ `METADATA`（hours・SEO）。
  `MAX` は cron/webhook での `revalidateTag` 第 2 引数（SWR profile）用。

## Step 3: invalidation の配線

呼び分けの理由・read-your-own-writes / blocking immediate-expire の意味は
rules の caching.md を参照。配線先の判断基準:

| 呼び出し元                                            | 使うもの                                                        |
| ----------------------------------------------------- | --------------------------------------------------------------- |
| Server Action（admin mutation。read-your-own-writes） | `invalidateSiteWideCache(CACHE_TAGS.X)`（`@/shared/lib/cache`） |
| Route Handler / cron（blocking immediate-expire）     | `invalidateSiteWideCacheFromRouteHandler(CACHE_TAGS.X)`         |
| cron / webhook で「次リクエストで再検証されれば良い」 | `revalidateTag(CACHE_TAGS.X, CACHE_LIFE.DYNAMIC_DATA)` 等を直接 |

- admin mutation では `executeAdminMutationResult` の `afterSuccess` 内から呼ぶ。
  `withPurgeBatch` が自動で wrap しており、複数の CDN purge が 1 回の Cloudflare API
  call に coalesce される（`src/app/(admin)/admin/(dashboard)/_shared/lib/admin-action.ts`）。
  まとめ関数の実例: `_shared/actions/post/cache-helpers.ts` の `invalidatePostCollectionCaches`。
- SWR 直接呼びの実例: `src/app/api/cron/event-import/route.ts`
  （`revalidateTag(CACHE_TAGS.EVENTS, CACHE_LIFE.PUBLIC_CONTENT)`）。
- site-wide ヘルパーのオプション（`src/shared/lib/cache/site-wide.ts` の `InvalidateOptions`）:
  - `skipCdnPurge: true` — admin-only タグ（公開面が private,no-store）で CDN 側を丸ごと省略。
  - `cdnUrlPurge` — per-detail の URL purge を並走させる
    （`purgeCloudflareDetailUrls` + `firePurgeAsync`。実例は post の `cache-helpers.ts`）。
- per-detail サブタグ（`getCacheTag.*.detail(slug)`）は `resolveCdnTag` が null を返す
  = CDN タグ purge の対象外。CDN 側は URL purge で対応するのが house pattern。

## Step 4: drift gate 1 — producer 必須 or `INVALIDATION_ONLY` 明記

`architecture-boundaries.test.ts` の
「updateTag/revalidateTag する CACHE_TAGS は cacheTag producer を持つ（または invalidation-only 許可リスト）」
テストが src 全域を走査し、**producer なしで consume されるタグの集合**をテスト内の
`INVALIDATION_ONLY` 配列（定数名の sorted 完全一致）で固定している。二択:

- (a) Step 2 で `cacheTag()` producer を足した → 何もしなくて良い（pass する）。
- (b) 意図的に invalidation-only（例: admin 一覧があえて未キャッシュで、mutation 時の
  無効化のみ前方互換として置く）→ テスト内 `INVALIDATION_ONLY` 配列に**定数名**
  （例: `"RESERVATIONS"`）を追加する。

逆方向のドリフトも検出される: 既存の invalidation-only タグに後から producer を足したら、
リストから**削除**しないと fail する（双方向 gate）。

なお producer だけ追加して consumer（updateTag/revalidateTag）が無い場合はこの gate に
かからないが、無効化されない stale キャッシュになるので通常は Step 3 とセットで入れる。

## Step 5: drift gate 2 — CDN マッピング or allowlist

`cdn-cache-tags.test.ts` の
「every CACHE_TAGS value is either mapped OR on the allowlist」が、**新タグが consume
されるか否かに関わらず全 `CACHE_TAGS` 値**に対して二択を強制する。
`src/shared/lib/constants/cdn-cache-tags.ts` で判断:

**A. 公開ページの CDN キャッシュ面に乗るタグ** → マッピング追加

1. `CDN_CACHE_TAGS` に `defineCdnTag("<kebab-name>-v1")` で定数追加。
   値の制約はテストが固定: `-v1` suffix 必須・printable ASCII・スペース/カンマ禁止・
   1024 字以内（`joinCacheTags` も違反を throw で弾く）。
2. `NEXTJS_TAG_TO_CDN_TAG` にエントリ追加。**キーは computed key `[CACHE_TAGS.X]`**
   （raw string 禁止 — cache.ts 側のリネームをコンパイルエラーとして検出させるための設計）。

**B. CDN に露出しないタグ** → `NEXTJS_TAGS_WITHOUT_CDN_MAPPING` に `CACHE_TAGS.X` を追加

該当基準（同ファイルのコメントが SSoT）: admin-only（公開面が private,no-store）/
id-keyed サブタグ方式で URL purge する（例: REVIEWS）/ server-only 消費で edge に
一切露出しない（例: SUPPRESSED_EMAILS）。**なぜ CDN 不要かのコメントを添える**。

注意: この gate は一方向（mapped OR allowlisted）。allowlist 済みタグにマッピングを
足しても fail しないので、A に昇格させたら allowlist から手動で除去すること。

## Step 6: 公開 collection の Cache-Tag emission（新しい公開 route を持つ場合のみ）

Step 5-A で CDN タグを足しても、レスポンスが Cache-Tag ヘッダーを emit しなければ
purge は空振りする。新しい公開 collection route（例: `/xxx/:path*`）を追加する場合:

1. `next.config.ts` 冒頭の定数群に `joinWithSiteWide([CDN_CACHE_TAGS.XXX, ...])` で
   Cache-Tag 値を事前計算する（sidebar 付きレイアウトなら `SIDEBAR_CDN_TAGS` も spread）。
2. `headers()` の公開 collection sources 群に
   `{ source: "/xxx/:path*", headers: [{ key: "Cache-Tag", value: XXX_CACHE_TAG }] }` を追加。
3. `architecture-boundaries.test.ts` の
   「every per-public-collection Cache-Tag value contains the full site-wide set」テスト内の
   `publicCollections` 配列に新 source を**手動で追加**する
   （hard-coded リストのため、足さないと新 source は無検査のまま素通りする）。

制約（理由・背景は rules の caching.md）: `SITE_WIDE_CDN_TAGS` 全量インライン必須
（headers() の同一キーは REPLACE）/ raw string literal は ESLint
`next-config-cache-tag-ssot`（eslint.config.mjs）が error / `PRIVATE_NO_TAG_PREFIXES`
配下の private route は Cache-Tag を emit 禁止（テスト強制）。

全公開ページで emit すべき site-wide 級のタグ（設定系）の場合は、source 追加ではなく
`cdn-cache-tags.ts` の `SITE_WIDE_CDN_TAGS` 配列に追加する（全 collection 定数と
site-wide 包含テストに自動反映される）。

## Step 7: 検証

focused 実行（runner 経由必須の理由は rules の testing-unit.md）:

```bash
bun scripts/run-tests.ts __tests__/unit/lib/cdn-cache-tags.test.ts
bun scripts/run-tests.ts __tests__/unit/architecture-boundaries.test.ts
```

通ったら完了報告前に `bun run validate`（ESLint の next-config-cache-tag-ssot もここで走る）。
next.config.ts を触った場合は `bun run build` で route 表とビルド成立も確認する。

## チェックリスト

- [ ] `CACHE_TAGS` に定数追加（タグ文字列の直書きなし・必要なら `getCacheTag` factory）
- [ ] producer の `'use cache'` クエリに `cacheTag()`（`"use cache"` → `cacheLife` → `cacheTag` → query の順）
- [ ] invalidation を正しいヘルパーで配線（Server Action / Route Handler / SWR の 3 択）
- [ ] producer を持たない場合のみ `INVALIDATION_ONLY`（architecture-boundaries.test.ts）に定数名+意図を明記
- [ ] `NEXTJS_TAG_TO_CDN_TAG` マッピング or `NEXTJS_TAGS_WITHOUT_CDN_MAPPING` allowlist（理由コメント付き）
- [ ] （新公開 collection のみ）next.config.ts の Cache-Tag emission + テストの `publicCollections` 更新
- [ ] focused テスト 2 本 → `bun run validate` 緑

## よくある fail と対処

| 症状                                                       | 原因と対処                                                                          |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `unproducedConsumed ... toEqual(INVALIDATION_ONLY)` 不一致 | producer 未配線 or リスト未更新。Step 4 の二択を適用                                |
| `CACHE_TAGS.X ... is neither mapped nor allowlisted`       | Step 5 の二択を適用                                                                 |
| `updateTag ... throws` が Route Handler で発生             | `invalidateSiteWideCacheFromRouteHandler` に差し替え（rules caching.md）            |
| ESLint `next-config-cache-tag-ssot` error                  | next.config.ts の Cache-Tag 値を `CDN_CACHE_TAGS` + `joinCacheTags` 経由に変更      |
| `${source} missing site-wide tag ...`                      | collection 定数が `joinWithSiteWide` を使っていない（site-wide 全量インライン欠落） |
