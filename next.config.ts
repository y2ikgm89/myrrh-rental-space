import type { NextConfig } from "next";

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
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
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

  // Cache-Control + セキュリティヘッダー
  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ];

    return [
      // 管理画面（キャッシュ禁止）
      {
        source: "/admin/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-cache, no-store, must-revalidate",
          },
          ...securityHeaders,
        ],
      },
      // 予約ページ（キャッシュ禁止）
      {
        source: "/reservation/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-cache, no-store, must-revalidate",
          },
          ...securityHeaders,
        ],
      },
      // API Routes（キャッシュ禁止）
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-cache",
          },
          ...securityHeaders,
        ],
      },
      // 公開ページ（積極的キャッシュ - Cloudflare CDN連携）
      {
        source: "/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=3600, stale-while-revalidate=3600",
          },
          ...securityHeaders,
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

// Bundle analysis: Turbopack-native `next experimental-analyze --output` を使用
// （`@next/bundle-analyzer` は webpack 専用のため Turbopack プロジェクトでは
//   実態のあるレポートを生成できず削除済み。`bun run analyze` で実行）
export default nextConfig;
