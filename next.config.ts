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

  // Cache-Control（セキュリティヘッダーは proxy.ts に集約）
  async headers() {
    return [
      // 公開ページ（積極的キャッシュ - Cloudflare CDN連携）
      {
        source: "/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=3600, stale-while-revalidate=3600",
          },
        ],
      },
      // 管理画面（キャッシュ禁止）
      {
        source: "/admin/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-cache, no-store, must-revalidate",
          },
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
        ],
      },
    ];
  },
};

// Bundle analysis: Turbopack-native `next experimental-analyze --output` を使用
// （`@next/bundle-analyzer` は webpack 専用のため Turbopack プロジェクトでは
//   実態のあるレポートを生成できず削除済み。`bun run analyze` で実行）
export default nextConfig;
