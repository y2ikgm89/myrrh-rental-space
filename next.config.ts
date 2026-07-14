import type { NextConfig } from "next";
import {
  SITE_WIDE_CDN_TAGS,
  SIDEBAR_CDN_TAGS,
  CDN_CACHE_TAGS,
  joinCacheTags,
  type CdnTagValue,
} from "./src/shared/lib/constants/cdn-cache-tags";

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
]);

const BLOG_DETAIL_CACHE_TAG = joinWithSiteWide([
  CDN_CACHE_TAGS.POST,
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
  CDN_CACHE_TAGS.EVENT_WAITLIST,
  ...SIDEBAR_CDN_TAGS,
]);
const FAQ_CACHE_TAG = joinWithSiteWide([CDN_CACHE_TAGS.FAQ]);
const TERMS_CACHE_TAG = joinWithSiteWide([
  CDN_CACHE_TAGS.TERMS_DETAIL,
  ...SIDEBAR_CDN_TAGS,
]);
const SITEMAP_CACHE_TAG = joinCacheTags([CDN_CACHE_TAGS.SITEMAP]);

const nextConfig: NextConfig = {
  // React Compiler for automatic memoization
  reactCompiler: true,

  // Turbopack configuration (default bundler in Next.js 16)
  turbopack: {
    // Resolve alias for ESM module resolution compatibility
    // better-auth imports 'next/headers' without .js extension
    resolveAlias: {
      "next/headers": "next/headers.js",
      "next/navigation": "next/navigation.js",
      "next/server": "next/server.js",
    },
  },

  // Standalone output for Docker / Cloud Run deployment
  // Docker ビルド時に STANDALONE=true を設定。ローカル開発では不要
  // (Windows の Turbopack が node: protocol をファイル名に含めるため standalone コピーが失敗する)
  ...(process.env["STANDALONE"] === "true" && { output: "standalone" }),

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
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  // Production optimizations
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,

  // Partial Prerendering (PPR) - 静的シェル + 動的コンテンツのハイブリッドレンダリング
  // use cache ディレクティブによる明示的キャッシュ制御を有効化
  cacheComponents: true,

  // Better Auth: ESM module resolution fix for Turbopack
  // serverExternalPackages は Turbopack 開発サーバーで 500 エラーを起こすため transpilePackages を使用
  // turbopack.resolveAlias で next/headers.js 等のエクステンション解決済み
  transpilePackages: ["better-auth"],

  // Experimental features
  experimental: {
    // Turbopack ファイルシステムキャッシュは Next.js 16 でデフォルト true。
    // ローカル切り分け時のみ NEXT_DISABLE_TURBOPACK_FS_CACHE=1 で opt-out できるよう
    // kill switch 経路のみ明示的に false を設定する (常時 true 設定は default と重複)。
    ...(process.env["NEXT_DISABLE_TURBOPACK_FS_CACHE"] === "1" && {
      turbopackFileSystemCacheForDev: false,
    }),
    // NOTE: experimental.cachedNavigations はあえて有効化しない（cacheComponents 必須の opt-in 実験機能）。
    // 有効化すると cacheComponents 下で searchParams のみのソフトナビ（管理タブの ?tab= 切替等）の
    // コンテンツが「一手前のタブのまま残る」stale を起こす。これは Next.js 16 の既知 OPEN
    // フレームワークバグで、nuqs（shallow:false→router.replace）も <Suspense key={tab}> も無罪、
    // 原因は Next 側のルーターキャッシュ層。F5（完全ナビ）では正しく表示されるのが切り分けの証左。
    // 参照（いずれも未修正 OPEN）: vercel/next.js#86577 / #88535, 47ng/nuqs#1273
    // 上流修正（Vercel 担当者が next@canary で類似ルータバグ修正済と言及）が安定版に入ったら再評価する。
    // ナビゲーション後のフォーカス管理改善（active element を blur、ブラウザ標準挙動に準拠）
    appNewScrollHandler: true,
    // Multiple Root Layouts 用の global 404 ページ（app/global-not-found.tsx）
    // 公式: https://nextjs.org/docs/app/api-reference/file-conventions/not-found#global-not-foundjs
    globalNotFound: true,
    // NOTE: experimental.optimizePackageImports は Next.js 16 で削除済み。
    // Next.js 16 から Turbopack が dev/build 両方で安定版デフォルト化し、
    // Turbopack は import を自動解析・最適化するため本設定は完全に inert。
    // 公式: "if you are using Turbopack, it automatically analyzes and optimizes
    //        imports, so this configuration is not required"
    // 公式: "Starting with Next.js 16, Turbopack is stable and used by default
    //        for both `next dev` and `next build`"
  },

  // Cache-Control（セキュリティヘッダーは proxy.ts に集約）
  //
  // 設計（公式準拠・defense-in-depth）:
  // - Next.js headers() は last-match-wins（同一パス × 同一ヘッダーキーは配列で後の定義が
  //   前を上書きする。公式 "Header Overriding Behavior"）。blanket public を必ず先頭に置き、
  //   認証 / PII を含む private ルートを後ろに列挙して上書きする。配列順がそのまま仕様。
  // - blanket public は撤去不可: 公開ページは全て `await connection()` で完全動的のため
  //   Next.js 自身は no-store を emit する。blanket がそれを上書きすることで初めて Cloudflare の
  //   エッジキャッシュが成立する（公開 CMS スラッグは [...segments] catch-all で列挙不能なため
  //   "public 既定 + private blocklist" が唯一の構成）。
  // - private 値は canonical な `private, no-store`（RFC 9111 §5.2.2.5 / MDN: no-store が共有・
  //   ブラウザ両キャッシュへの保存を禁止。`no-cache` / `must-revalidate` の併記は冗長）。origin で
  //   no-store を返すことで、保護が Cloudflare 除外ルールのみに依存する単一障害点を排除する。
  // - レイヤー間 precedence（実証済 / Next.js 16.2.9・Node runtime・next start）:
  //   proxy.ts > next.config headers() > Route Handler の Response ヘッダー。
  //   つまり Route Handler に Cache-Control を書いても next.config が上書きするため、
  //   API も含め Cache-Control 方針は next.config を SSoT とする（per-route はここに一致させる
  //   defense-in-depth に留める）。公式 "Execution order"（headers → proxy → filesystem routes）と整合。
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
        source: "/events/:path*",
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
