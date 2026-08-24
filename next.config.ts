import type { NextConfig } from "next";
import {
  SITE_WIDE_CDN_TAGS,
  SIDEBAR_CDN_TAGS,
  CDN_CACHE_TAGS,
  CUSTOM_PAGE_HEADER_SOURCE,
  EVENT_PUBLIC_DETAIL_HEADER_SOURCE,
  joinCacheTags,
  type CdnTagValue,
} from "./src/shared/lib/constants/cdn-cache-tags";
import { SERVER_ACTION_BODY_SIZE_LIMIT_BYTES } from "./src/shared/lib/r2/inquiry-attachment";

type RemotePattern = NonNullable<
  NonNullable<NextConfig["images"]>["remotePatterns"]
>[number];

function getR2PublicUrlPattern(): RemotePattern | null {
  const publicUrl = process.env["R2_PUBLIC_URL"];
  if (!publicUrl) return null;

  try {
    const url = new URL(publicUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;

    const pathname =
      url.pathname === "/" ? "/**" : `${url.pathname.replace(/\/$/, "")}/**`;

    return {
      protocol: url.protocol === "https:" ? "https" : "http",
      hostname: url.hostname,
      port: url.port,
      pathname,
      search: "",
    };
  } catch {
    return null;
  }
}

const r2PublicUrlPattern = getR2PublicUrlPattern();

// ============================================================
// Cache-Tag values (precomputed once at startup)
//
// Per-collection sources MUST inline the full site-wide tag set because Next.js
// header overriding REPLACES same-key values (verified against next.js source
// `packages/next/src/server/lib/router-utils/resolve-routes.ts`). Append is not
// possible — the per-collection entry's Cache-Tag value supersedes the blanket.
//
// Raw string literals for Cache-Tag values are banned in this file by ESLint
// (see eslint.config.mjs no-restricted-syntax override for next.config.ts).
// ============================================================

function joinWithSiteWide(extra: readonly CdnTagValue[]): string {
  return joinCacheTags([...SITE_WIDE_CDN_TAGS, ...extra]);
}

// Marketing-aggregation pages emit HOME_MARKETING in addition to site-wide.
const HOME_PAGE_CACHE_TAG = joinCacheTags([
  ...SITE_WIDE_CDN_TAGS,
  CDN_CACHE_TAGS.HOME_MARKETING,
  // 既定構成の space-showcase が `getShowcaseSpaces` を読む。producer は
  // `cacheTag(SPACES, LOCATIONS, SPACE_CATEGORIES)` を貼っているのに emit 側に
  // 無かったため、**カテゴリ名・拠点名の変更が最大 2 時間 edge に届かない**
  // （監査 A-61。F-88 と同じ穴）。
  CDN_CACHE_TAGS.SPACE,
  CDN_CACHE_TAGS.SPACE_CATEGORY,
  CDN_CACHE_TAGS.LOCATION,
]);

const BLOG_DETAIL_CACHE_TAG = joinWithSiteWide([
  CDN_CACHE_TAGS.POST,
  // アーカイブ `/blog` の post-list セクションは `getPublishedPostsList`
  // （POSTS, POST_TAGS）と `getPostCategories`（POST_CATEGORIES）を読む。
  // POST だけだとカテゴリ名・タグ名の変更が届かない（監査 A-61 と同じ穴）。
  CDN_CACHE_TAGS.POST_CATEGORY,
  CDN_CACHE_TAGS.POST_TAG,
  ...SIDEBAR_CDN_TAGS,
]);
const CATEGORY_CACHE_TAG = joinWithSiteWide([
  CDN_CACHE_TAGS.POST,
  CDN_CACHE_TAGS.POST_CATEGORY,
  ...SIDEBAR_CDN_TAGS,
]);
const TAG_CACHE_TAG = joinWithSiteWide([
  CDN_CACHE_TAGS.POST,
  CDN_CACHE_TAGS.POST_TAG,
  ...SIDEBAR_CDN_TAGS,
]);
const SPACES_CACHE_TAG = joinWithSiteWide([
  CDN_CACHE_TAGS.SPACE,
  CDN_CACHE_TAGS.SPACE_CATEGORY,
  CDN_CACHE_TAGS.LOCATION,
]);
const NEWS_CACHE_TAG = joinWithSiteWide([
  CDN_CACHE_TAGS.NEWS,
  ...SIDEBAR_CDN_TAGS,
]);
const EVENTS_CACHE_TAG = joinWithSiteWide([
  CDN_CACHE_TAGS.EVENT,
  CDN_CACHE_TAGS.EVENT_CATEGORY,
  CDN_CACHE_TAGS.EVENT_WAITLIST,
  // イベントページは会場として Location.address と Space.name を描画する
  // (`publicEventSelect`)。producer 側は `cacheTag(EVENTS, LOCATIONS, SPACES)` を
  // 貼っているのに emit 側に無かったため、**住所変更・スペース改名が最大 2 時間
  // edge に届かず、来場者が古い住所を見る**（監査 F-88）。
  CDN_CACHE_TAGS.SPACE,
  CDN_CACHE_TAGS.LOCATION,
  ...SIDEBAR_CDN_TAGS,
]);
const FAQ_CACHE_TAG = joinWithSiteWide([CDN_CACHE_TAGS.FAQ]);
const ACCESS_CACHE_TAG = joinWithSiteWide([CDN_CACHE_TAGS.LOCATION]);
const FEED_CACHE_TAG = joinWithSiteWide([
  CDN_CACHE_TAGS.POST,
  CDN_CACHE_TAGS.POST_TAG,
]);
const TERMS_CACHE_TAG = joinWithSiteWide([
  CDN_CACHE_TAGS.TERMS_DETAIL,
  ...SIDEBAR_CDN_TAGS,
]);
const SITEMAP_CACHE_TAG = joinCacheTags([CDN_CACHE_TAGS.SITEMAP]);
/** site-wide タグのみ（/access・カスタムページ）。 */
const SITE_WIDE_ONLY_CACHE_TAG = joinWithSiteWide([]);

const nextConfig: NextConfig = {
  // Turbopack / outputFileTracing の workspace root を明示固定する。
  // 未設定だと Next.js は「最寄りの lockfile を上方向に探索」して root を推論するが、
  // `.claude/worktrees/*` の git worktree はそれぞれ bun.lock を持つため、worktree 内から
  // dev/build を起動すると lockfile が複数ヒットし「Next.js inferred your workspace root」
  // 警告と共に root が親のリポジトリルートへ解決される（= ファイル監視が全 worktree に広がる）。
  // `import.meta.dirname` は「この next.config.ts があるディレクトリ」なので、メインツリーでも
  // worktree でも常にそのツリー自身が root になる。相対パスは cwd 基準で resolve され起動場所に
  // 依存するため使わない。
  // NOTE: `outputFileTracingRoot` は Next.js 側でこの値に自動同期される（server/config.ts）。
  //       併記して値がずれると「must have the same value」警告になるため、ここだけを SSoT にする。
  turbopack: {
    root: import.meta.dirname,
  },

  // React Compiler for automatic memoization
  reactCompiler: true,

  // Standalone output for Docker / Cloud Run deployment
  // Docker ビルド時に STANDALONE=true を設定。ローカル開発では不要
  // (Windows の Turbopack が node: protocol をファイル名に含めるため standalone コピーが失敗する)
  ...(process.env["STANDALONE"] === "true" && { output: "standalone" }),

  // Receipt PDF 描画用 Noto Sans JP フォント (Japanese subset、repo 同梱 WOFF) を
  // standalone build に含める。`fileURLToPath(import.meta.url)` 経由の runtime path 解決は
  // Next.js の自動 outputFileTracing (nft static analysis) では検出できないため、明示的に include する。
  // task #7 PR#7 (2026-07-15 receipt-full-wiring)。
  outputFileTracingIncludes: {
    "/api/receipts/**": [
      "./src/shared/pdf/fonts/noto-sans-jp-japanese-400-normal.ttf",
    ],
    "/api/cron/receipt-backfill": [
      "./src/shared/pdf/fonts/noto-sans-jp-japanese-400-normal.ttf",
    ],
  },

  // Image optimization
  images: {
    remotePatterns: [
      ...(r2PublicUrlPattern ? [r2PublicUrlPattern] : []),
      {
        protocol: "https",
        hostname: "img.youtube.com",
        pathname: "/vi/**",
      },
      {
        protocol: "https",
        hostname: "*.cdninstagram.com",
      },
      {
        protocol: "https",
        hostname: "*.fbcdn.net",
      },
    ],
    formats: ["image/avif", "image/webp"],
    // deviceSizes / imageSizes は 16.3.0 の既定に任せる。
    // Next.js 16 は `imageSizes` の既定から `16` を落としており、ここで戻していたのは
    // 公式アップグレードガイドの「16px 画像が要るなら」スニペットの丸写しだった。
    // 実際には 16px 以下の画像はこのリポジトリに無い（`<Image>` の最小 width は 32）。
  },

  // Production optimizations
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,

  // Partial Prerendering (PPR) - 静的シェル + 動的コンテンツのハイブリッドレンダリング
  // use cache ディレクティブによる明示的キャッシュ制御を有効化
  cacheComponents: true,

  // Experimental features
  experimental: {
    // Turbopack のファイルシステムキャッシュは 16.3.0 で **dev / build とも**
    // 既定 true（16.3.0-preview.10 までは build 側だけ Vercel 限定で false だった）。
    // 既定に乗るので有効化の記述は置かない。
    //
    // build 側は `.next/cache` が run をまたいで保持されて初めて効く。CI 側の
    // キャッシュ設定は `.github/workflows/ci.yml`（実測値もそこに書いてある）。
    //
    // kill switch。**dev と build の両方**を落とす
    // （build だけ残ると「切ったつもりで効いている」状態になる）。
    // 用途は 2 つ: ローカルでの切り分けと、`.next/cache` を run 間で保持しない
    // ビルド環境。後者は Dockerfile の builder-base が ENV で立てている
    // （理由はそちらのコメント）。
    ...(process.env["NEXT_DISABLE_TURBOPACK_FS_CACHE"] === "1" && {
      turbopackFileSystemCacheForDev: false,
      turbopackFileSystemCacheForBuild: false,
    }),
    // **この `false` は消せない。** 16.3.0 は `cacheComponents` が有効で
    // `cachedNavigations` が未設定なら、自動で true にする
    // （`next/dist/server/config.js`: `if (config.cacheComponents && (config.experimental
    //  .cachedNavigations === undefined || …)) { config.experimental.cachedNavigations = true }`）。
    // 16.3.0-preview.10 までは既定 false だったので、ここにはコメントしか無かった。
    // その状態で 16.3.0 へ上げた結果、コメントは「有効化しない」と書いたまま実際は
    // 有効になっていた（PR #2107）。散文では止まらないので明示値に変える。
    //
    // 有効だと cacheComponents 下で searchParams のみのソフトナビ（管理タブの ?tab= 切替等）の
    // コンテンツが「一手前のタブのまま残る」stale を起こす。nuqs（shallow:false→router.replace）も
    // <Suspense key={tab}> も無罪で、原因は Next 側のルーターキャッシュ層。
    // F5（完全ナビ）では正しく表示されるのが切り分けの証左。
    // **残っている未修正は Next 側 1 件だけ**（2026-08-11 実測）:
    //   vercel/next.js#86577 "[cacheComponents] Activity component route preservation
    //   causes significant breakage in application logic, UI behavior and E2E tests" — OPEN。
    //
    // かつて併記していた 2 件は、もう根拠にならない:
    //   - 47ng/nuqs#1273 は 2026-06-25 に CLOSED。nuqs 2.9.0 の
    //     「stale URL value when revisiting a page under Next.js cacheComponents」で修正済み。
    //   - vercel/next.js#88535 は issues / pulls とも 404 で参照できない
    //     （隣接する #88533 / #88534 は取得できるので API 側の問題ではない）。
    //     辿れない番号は再評価の材料にならないので落とした。
    //
    // 上流が修正したら、消すのではなく true にして再評価する。
    // 解決後の値は `__tests__/unit/architecture/next-config-cached-navigations-off.test.ts` が見る。
    cachedNavigations: false,
    // Instant Navigations 検証の既定 (`validationLevel: 'warning'`) は Page /
    // Default セグメント全てを暗黙に検証する。このアプリは nonce CSP
    // (`strict-dynamic`) のため root layout の `generateViewport()` で
    // `await connection()` して全 route を意図的に完全動的化しており、instant
    // navigation は構造的に成立しない。暗黙検証は root の動的 viewport を
    // E1438 (`blocking-prerender-viewport-dynamic`) として診断し続ける。
    //
    // root layout の `export const instant = false` はセグメント自身と
    // static-shell 検証しか免除しない（公式:
    // https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config/instant ）。
    // ページ単位の暗黙検証は止められない。公式の根本解決は
    // `'manual-warning'`（明示的に `instant` を export したセグメントだけ検証）。
    // リポジトリに `instant = true` は無いので、この pin で検証は停止する。
    // 既定値が将来変わっても散文では止まらないので明示値にする。
    // 解決後の値は
    // `__tests__/unit/architecture/next-config-instant-insights-manual-warning.test.ts`
    // が見る。
    instantInsights: {
      validationLevel: "manual-warning",
    },
    // Multiple Root Layouts 用の global 404 ページ（app/global-not-found.tsx）
    // 公式: https://nextjs.org/docs/app/api-reference/file-conventions/not-found#global-not-foundjs
    globalNotFound: true,
    // Server Action の request body 上限。**既定は 1MB**（16.3.0 同梱 docs
    // `01-app/03-api-reference/05-config/01-next-config-js/serverActions.md`:
    // "the maximum size of the request body sent to a Server Action is 1MB"）。
    //
    // Server Action で File を受ける経路は 2 つある。どちらも既定のままだと
    // 1MB を超えた時点でフレームワークが request を弾き、action は返らないので
    // `MutationResult` も toast も出ず**無言で失敗**する。
    //
    //   - `uploadInquiryAttachment` — PDF 10MB / 画像 5MB
    //   - `uploadMedia`（`admin/actions/media.ts`）— 動画 50MB / 音声 20MB。
    //     `MediaUploadDialog` / `ImageDropPlugin` / `use-media-upload` の 3 箇所から呼ぶ
    //
    // **`/admin/api/media` の Route Handler は数えない。** 同じ機能の POST が
    // 実在するが client は GET しか叩いておらず、アップロードは Server Action 側を
    // 通る。「メディアは Route Handler だから対象外」と読むと動画が 413 になる
    // （一度そう書いて、実際に 10MB 上限のまま放置した）。
    //
    // 値は書き写さず SSoT から導出する（`MEDIA_MAX_SIZE_BYTES` **全体の最大値** +
    // multipart のオーバーヘッド）。per-MIME 上限を動かしたらここも一緒に動く。
    // **特定経路の上限から導き直さない。** それが上の取りこぼしの作り方だった。
    serverActions: {
      bodySizeLimit: SERVER_ACTION_BODY_SIZE_LIMIT_BYTES,
    },
    // NOTE: experimental.optimizePackageImports はあえて指定しない。
    // 「削除されたから」ではない — 16.3.0 にも実在する（型・zod スキーマ・docs の
    // いずれにも現存）。指定しない理由は Turbopack では不要だから。
    // 公式（16.3.0 同梱 docs / 01-app/02-guides/local-development.md）:
    //   "Turbopack automatically analyzes imports and optimizes them.
    //    It does not require this configuration."
    // 同梱 docs は node_modules/next/dist/docs 配下にあり、next のバージョンと一致する。
  },

  async headers() {
    return [
      // ============================================================
      // 公開ページ blanket: Cache-Control public のみ。Cache-Tag は EMIT しない。
      // 私的 blocklist が同一 source match 配下に入っても Cache-Tag が継承されないよう、
      // タグは per-public-source で個別に付与する。
      //
      // 4 ディレクティブの意味（公式準拠・Cloudflare canonical pattern）:
      // - public:                       共有キャッシュ (CF) と private キャッシュ (browser) 両方に保存可
      // - max-age=0, must-revalidate:   browser は毎回 CF edge へ軽量 revalidate（304 主体）
      // - s-maxage=3600:                CF edge は 1 時間キャッシュ
      // - stale-while-revalidate=3600:  CF 失効後 1 時間は stale を返しつつ背後で更新
      //
      // 旧設計（max-age 不在）はブラウザの heuristic caching（Last-Modified ベースの推測）に
      // フォールバックして予測不能だった。max-age=0+must-revalidate で「admin 編集 → CF 自動 purge →
      // 次の browser access で即時新コンテンツ」が確実に成立する（再訪問者の stale window 解消）。
      // 公式: https://developers.cloudflare.com/cache/concepts/cache-control/
      // ============================================================
      {
        source: "/:path*",
        headers: [
          {
            key: "Cache-Control",
            value:
              "public, max-age=0, must-revalidate, s-maxage=3600, stale-while-revalidate=3600",
          },
        ],
      },
      // ============================================================
      // Marketing-aggregation: home (/) + /about
      // HOME_MARKETING タグを SITE_WIDE と合わせて emit。
      // ============================================================
      {
        source: "/",
        headers: [{ key: "Cache-Tag", value: HOME_PAGE_CACHE_TAG }],
      },
      {
        source: "/about",
        headers: [{ key: "Cache-Tag", value: HOME_PAGE_CACHE_TAG }],
      },
      // ============================================================
      // 公開 collection sources。Site-wide ∪ collection ∪ sidebar をインライン。
      // ============================================================
      {
        source: "/blog/:path*",
        headers: [{ key: "Cache-Tag", value: BLOG_DETAIL_CACHE_TAG }],
      },
      {
        source: "/category/:path*",
        headers: [{ key: "Cache-Tag", value: CATEGORY_CACHE_TAG }],
      },
      {
        source: "/tag/:path*",
        headers: [{ key: "Cache-Tag", value: TAG_CACHE_TAG }],
      },
      {
        source: "/spaces/:path*",
        headers: [{ key: "Cache-Tag", value: SPACES_CACHE_TAG }],
      },
      {
        source: "/news/:path*",
        headers: [{ key: "Cache-Tag", value: NEWS_CACHE_TAG }],
      },
      {
        source: "/events",
        headers: [{ key: "Cache-Tag", value: EVENTS_CACHE_TAG }],
      },
      {
        source: EVENT_PUBLIC_DETAIL_HEADER_SOURCE,
        headers: [{ key: "Cache-Tag", value: EVENTS_CACHE_TAG }],
      },
      {
        source: "/faq/:path*",
        headers: [{ key: "Cache-Tag", value: FAQ_CACHE_TAG }],
      },
      {
        source: "/terms/:path*",
        headers: [{ key: "Cache-Tag", value: TERMS_CACHE_TAG }],
      },
      // ============================================================
      // 列挙漏れだった公開ルート（監査 F-18）。
      // どちらも site-wide タグしか要らない（コンテンツ固有の purge は
      // それぞれの URL purge が担当する）。
      // ============================================================
      {
        // `/access` の location-list は `getPublishedLocationsForAccess`
        // （`cacheTag(LOCATIONS)`）を読む。旧実装は URL purge だけで担っていたが、
        // tag を emit すれば既存の site-wide purge にそのまま乗る（監査 A-61）。
        source: "/access",
        headers: [{ key: "Cache-Tag", value: ACCESS_CACHE_TAG }],
      },
      {
        source: CUSTOM_PAGE_HEADER_SOURCE,
        headers: [{ key: "Cache-Tag", value: SITE_WIDE_ONLY_CACHE_TAG }],
      },
      // ============================================================
      // ドットを含む path の Route Handler（監査 A-63）。
      //
      // catch-all の `CUSTOM_PAGE_HEADER_SOURCE` は `[^/.]+` なので拡張子つきを
      // 意図的に除外する。ここを埋めないと、設定由来なのに Cache-Tag を
      // 1 つも持たない応答が blanket の s-maxage 3600 + SWR 3600 で
      // **最大 2 時間 stale になる**。PWA は install 時点の manifest 値を採るので、
      // サイト名変更直後に「ホーム画面に追加」した端末には旧名が残る。
      // ============================================================
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Tag", value: SITE_WIDE_ONLY_CACHE_TAG }],
      },
      {
        source: "/llms.txt",
        headers: [{ key: "Cache-Tag", value: SITE_WIDE_ONLY_CACHE_TAG }],
      },
      {
        source: "/opengraph-image",
        headers: [{ key: "Cache-Tag", value: SITE_WIDE_ONLY_CACHE_TAG }],
      },
      {
        source: "/twitter-image",
        headers: [{ key: "Cache-Tag", value: SITE_WIDE_ONLY_CACHE_TAG }],
      },
      {
        source: "/apple-icon",
        headers: [{ key: "Cache-Tag", value: SITE_WIDE_ONLY_CACHE_TAG }],
      },
      {
        source: "/icon",
        headers: [{ key: "Cache-Tag", value: SITE_WIDE_ONLY_CACHE_TAG }],
      },
      {
        // `/feed.xml` は `getPublishedPostsList`（POSTS, POST_TAGS）を読む。
        // 旧実装は URL purge 2 経路だけで担っていた（N-08）。
        source: "/feed.xml",
        headers: [{ key: "Cache-Tag", value: FEED_CACHE_TAG }],
      },
      // ============================================================
      // /sitemap.xml — site-wide auto-purge target (see site-wide.ts).
      // Cache-Control inherited from blanket public (s-maxage=3600). Every
      // admin mutation that calls invalidateSiteWideCache co-purges this tag,
      // so the s-maxage window is effectively bypassed on content updates.
      // ============================================================
      {
        source: "/sitemap.xml",
        headers: [{ key: "Cache-Tag", value: SITEMAP_CACHE_TAG }],
      },
      // ============================================================
      // private blocklist（認証 / PII。blanket より後ろ = last-match-wins で上書き）
      // Cache-Tag は EMIT しない（no-store なので CDN に乗らない＋将来 public 化したときに
      // PII URL が purgeable になるリスク防止）。
      // ============================================================
      {
        source: "/admin/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      {
        source: "/reservation/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      {
        source: "/mypage/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      {
        source: "/login/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      {
        source: "/preview/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      {
        source: "/contact/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      {
        // ゲスト向け領収書 confirm page (`/receipts/[serialNo]/download`) は
        // 署名トークン URL 経由で個別ユーザーの適格請求書 (領収書) にアクセスする
        // 経路。Cloudflare CDN / edge にキャッシュされると別ユーザーに漏洩し得るため
        // origin で `private, no-store` を強制する (defense-in-depth)。
        source: "/receipts/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      {
        // ゲスト向け予約 / イベント参加申込の claim page。署名トークン URL 経由で
        // 個別ユーザーの予約詳細 (氏名・日時・料金等) にアクセスする経路のため
        // /receipts と同様に CDN キャッシュ不可。
        source: "/claim/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      {
        // ゲスト決済 token URL / checkout-error。公開 EVENT Cache-Tag ソース
        // （`/events` / EVENT_PUBLIC_DETAIL_HEADER_SOURCE）より後ろで last-match-wins。
        // Cache-Tag は emit しない（PRIVATE_NO_TAG_PREFIXES / architecture test で固定）。
        source: "/events/registrations/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      {
        // イベント参加のキャンセル / キャンセル待ち確認ページ。同上。
        source: "/events/waitlist/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      {
        source: "/events/cancel/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
};

// Bundle analysis: Turbopack-native `next experimental-analyze --output` を使用
// （`@next/bundle-analyzer` は webpack 専用のため Turbopack プロジェクトでは
//   実態のあるレポートを生成できず削除済み。`bun run analyze` で実行）
export default nextConfig;
