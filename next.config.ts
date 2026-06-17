import type { NextConfig } from "next";

type RemotePattern = NonNullable<
  NonNullable<NextConfig["images"]>["remotePatterns"]
>[number];

function getR2PublicUrlPattern(): RemotePattern | null {
  const publicUrl = process.env["R2_PUBLIC_URL"];
  if (!publicUrl) return null;

  try {
    const url = new URL(publicUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;

    return {
      protocol: url.protocol === "https:" ? "https" : "http",
      hostname: url.hostname,
      pathname: "/**",
    };
  } catch {
    return null;
  }
}

const r2PublicUrlPattern = getR2PublicUrlPattern();

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
        hostname: "*.r2.dev",
      },
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
      {
        protocol: "https",
        hostname: "images.unsplash.com",
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
  // TypeScript は cloudbuild.yaml の test step で検証済みのため Docker ビルド内ではスキップ
  // (Docker build 内で tsc が OOM Kill される問題を回避)
  typescript: {
    ignoreBuildErrors: true,
  },

  // Partial Prerendering (PPR) - 静的シェル + 動的コンテンツのハイブリッドレンダリング
  // use cache ディレクティブによる明示的キャッシュ制御を有効化
  cacheComponents: true,

  // Better Auth: ESM module resolution fix for Turbopack
  // serverExternalPackages は Turbopack 開発サーバーで 500 エラーを起こすため transpilePackages を使用
  // turbopack.resolveAlias で next/headers.js 等のエクステンション解決済み
  transpilePackages: ["better-auth"],

  // Experimental features
  experimental: {
    // Turbopack ファイルシステムキャッシュ: 開発サーバー再起動後もビルドキャッシュを永続化
    turbopackFileSystemCacheForDev: true,
    // ナビゲーション結果をキャッシュして再訪問を即時表示（cacheComponents 必須）
    cachedNavigations: true,
    // ナビゲーション後のフォーカス管理改善（active element を blur、ブラウザ標準挙動に準拠）
    appNewScrollHandler: true,
    // Multiple Root Layouts 用の global 404 ページ（app/global-not-found.tsx）
    // 公式: https://nextjs.org/docs/app/api-reference/file-conventions/not-found#global-not-foundjs
    globalNotFound: true,
    // Optimize package imports - tree shaking for barrel exports
    optimizePackageImports: [
      // Icons (@tabler/icons-react is optimized by Next.js by default)
      // Date utilities
      "date-fns",
      // UI components (Radix)
      "@radix-ui/react-accordion",
      "@radix-ui/react-alert-dialog",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-label",
      "@radix-ui/react-select",
      "@radix-ui/react-slot",
      "@radix-ui/react-switch",
      "@radix-ui/react-tabs",
      "@radix-ui/react-tooltip",
      // Rich text editor (Lexical)
      "lexical",
      "@lexical/code",
      "@lexical/html",
      "@lexical/link",
      "@lexical/list",
      "@lexical/react",
      "@lexical/rich-text",
      "@lexical/selection",
      "@lexical/table",
      "@lexical/utils",
      // Charts
      "recharts",
      // Animation
      "gsap",
      "gsap/ScrollTrigger",
      "@gsap/react",
      "lenis",
      // DnD
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
    ],
  },

  // Legacy URL redirects（恒久 308）
  // ブログ一覧 URL を /posts → /blog に統一した移行。公開済み URL の被リンク / SEO 評価を
  // 新 URL に引き継ぐため、Google 公式推奨どおりサーバー側の恒久リダイレクトを張る。
  // 公式: https://developers.google.com/search/docs/crawling-indexing/301-redirects
  //   （permanent: true → 308。検索エンジン / クライアントに恒久キャッシュさせる）
  async redirects() {
    return [
      { source: "/posts", destination: "/blog", permanent: true },
      {
        source: "/posts/:path*",
        destination: "/blog/:path*",
        permanent: true,
      },
    ];
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
      // 公開ページ（積極的キャッシュ - Cloudflare CDN連携）。必ず先頭に置く。
      {
        source: "/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=3600, stale-while-revalidate=3600",
          },
        ],
      },
      // --- private blocklist（認証 / PII。blanket より後ろ = last-match-wins で上書き）---
      // 管理画面
      {
        source: "/admin/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      // 予約フロー（complete / cancel は予約 PII を含む）
      {
        source: "/reservation/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      // 会員マイページ（予約・プロフィール・問い合わせ等の PII）
      {
        source: "/mypage/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      // 顧客ログイン（セッション状態でリダイレクト分岐する）
      {
        source: "/login/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      // 管理者プレビュー（未公開ドラフトの閲覧）
      {
        source: "/preview/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      // お問い合わせ（ログイン顧客の PII をフォームに prefill するため公開キャッシュ不可）
      {
        source: "/contact/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      // API Routes（認証 / PII を含むレスポンスがある。origin で no-store）。
      // Next.js の precedence 上ここが API の Cache-Control の唯一の実効レイヤー＝SSoT
      // （Route Handler 側の Cache-Control は config が上書きする＝上記コメント参照）。
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
