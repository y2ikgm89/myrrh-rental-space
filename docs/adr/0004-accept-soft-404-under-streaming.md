# ADR 0004: streaming 下の soft 404（存在しないページが HTTP 200）を受け入れる

Status: Accepted (2026-08-11)

## Context

公開サイトの死活監視（`.github/workflows/uptime.yml`）を組む過程で、**存在しない
パスが HTTP 200 を返す**ことが分かった。本文は正しく「ページが見つかりません」で、
`notFound()` も呼ばれているのに、ステータスだけが 200 になる。

実測（2026-08-11、本番）。公開側の動的ルート全件を叩いた結果:

| パス              | ステータス | robots meta         |
| ----------------- | ---------- | ------------------- |
| `/blog/__x__`     | 200        | `noindex, nofollow` |
| `/category/__x__` | 200        | `noindex, nofollow` |
| `/events/__x__`   | 200        | `noindex`           |
| `/news/__x__`     | 200        | `noindex, nofollow` |
| `/spaces/__x__`   | 200        | `noindex`           |
| `/tag/__x__`      | 200        | `noindex, nofollow` |
| `/terms/__x__`    | 200        | `noindex`           |
| `/receipts/__x__` | 200        | `noindex, nofollow` |
| `/__x__`          | 200        | `noindex, nofollow` |
| `/a/b/c`          | 200        | `noindex, nofollow` |

**10/10 で例外なく `noindex` が入っている。**

原因は `next.config.ts` の `cacheComponents: true`（Partial Prerendering）と、
公開側に 32 個ある `loading.tsx`。バージョン一致の一次資料
（`node_modules/next/dist/docs/01-app/02-guides/streaming.md`、Next.js 16.3.0 同梱）
が挙動を明記している:

> Once streaming begins, the HTTP response headers (including the status code) have
> already been sent to the client. **You cannot change the status code or headers
> after streaming starts.**

> If a `notFound()` fires mid-stream, Next.js cannot go back and change the status
> to 404. Instead, it injects `<meta name="robots" content="noindex">` into the
> streamed HTML so that search engines don't index the page.

さらに `03-file-conventions/loading.md` は SEO 上の帰結まで明示している:

> Some crawlers may label these responses as "soft 404s". **In the streaming case,
> this does not lead to indexation because the page is explicitly marked `noindex`
> in the HTML.**

同ドキュメントは、HTML しか読まない bot / crawler に対しては Next.js が
user agent で判別し、**`generateMetadata` の解決を待ってから**本文を stream すると
述べている。つまり `noindex` は crawler に確実に届く。

## Decision

**soft 404 を受け入れ、ステータスコードのために描画アーキテクチャを変えない。**

- `cacheComponents: true`（PPR）を維持する
- 公開側の `loading.tsx` を撤去しない
- 動的ルートの `notFound()` 呼び出し位置を変えない

## Rationale

- **フレームワークの意図された挙動であり、緩和策も設計に含まれている。** 一次資料が
  「streaming 下では indexation に至らない」と明言しており、その前提となる `noindex`
  注入が実際に効いていることを 10/10 のルートで確認済み。
- **直すコストが釣り合わない。** 公式の回避策は「`notFound()` を Suspense 境界より
  **前**に置く」で、そのためには公開側 32 個の `loading.tsx` を撤去し、16 個の動的
  ルートを再構成する必要がある。これは **PPR を実質的に捨てる**ことを意味し、
  `cacheComponents: true` を入れた目的（静的シェルの即時配信）そのものを失う。
- **残る実害が小さい。** indexation は起きない。残るのは Search Console の
  「ソフト 404」レポート上のノイズと、クローラー以外の消費者（リンクチェッカー等）が
  200 を見ること。現時点でそれらに依存する連携先は無い。
- **監視側は既に影響を受けない設計にしてある。** `uptime.yml` は
  `/api/live`（`Cache-Control: private, no-store` / `cf-cache-status: DYNAMIC`）
  だけを叩く。公開ページを叩くと、この soft 404 と Cloudflare のキャッシュ
  （`s-maxage=3600` + `stale-while-revalidate=3600`）の両方で偽の緑が出るため。

## Migration Triggers (re-evaluate すべき条件)

- Next.js が **PPR を維持したまま**ストリーム開始前にステータスを確定する手段を
  提供したとき（`notFound()` の hoisting、shell 生成時のステータス確定など）
- Search Console で、not-found の URL が**実際に index されている**ことを確認した
  とき（一次資料の主張と食い違う = 前提が崩れる）
- リンクチェッカー / 外部連携 / パートナー API など、**404 のセマンティクスに依存する
  消費者**が現れたとき
- 公開側で `loading.tsx` を持たない動的ルートを新設し、そこだけ本物の 404 を
  返せると分かったとき（部分適用の是非を判断する）

## Rejected Alternatives

- **公開側の `loading.tsx` を全撤去して `notFound()` を Suspense 境界より前に置く**
  — 公式の回避策そのものだが、32 ファイルの撤去と 16 ルートの再構成を伴い、
  PPR の利点（静的シェルの即時配信）を全ページで失う。得られるのはステータス
  コードの正しさだけで、indexation の挙動は変わらない。
- **`generateStaticParams` + `dynamicParams: false`** — 未登録パスは本物の 404 に
  なる（一次資料 `migrating-to-cache-components.md` に明記）。しかし公開ページは
  管理画面から実行時に作成される CMS 管理のため、**新規ページが次のデプロイまで
  404 になる**。CMS として成立しない。
- **`proxy` file convention で未知パスを事前に弾く** — 一次資料が「page 描画前に
  走るのでステータスコードが使える」と述べる正規手段。しかし有効な slug の判定に
  **全リクエストで DB 参照**が要り、ルーティングを DB に結合させる。soft 404 の
  実害に対して代償が大きすぎる。
- **`notFound()` をやめて明示的に 404 を返す route handler を書く** — App Router の
  規約から外れ、`not-found.tsx` の UI 資産を捨てることになる。

## Related

- [`../../next.config.ts`](../../next.config.ts) — `cacheComponents: true`
- [`../../src/app/(public)/[...segments]/page.tsx`](<../../src/app/(public)/[...segments]/page.tsx>)
  — 未知パスを受ける catch-all。`notFound()` を呼んでおり、コード側に誤りは無い
- [`../../.github/workflows/uptime.yml`](../../.github/workflows/uptime.yml)
  — 公開ページではなく `/api/live` を叩く理由が本 ADR と対応する
- 一次資料は同梱 docs（`node_modules/next/dist/docs/`）がバージョン一致。
  公開版は <https://nextjs.org/docs/app/guides/streaming> の "The HTTP contract"
