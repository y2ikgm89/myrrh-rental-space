import type { NextConfig } from 'next'

const isDev = process.env["NODE_ENV"] === 'development'

// Content Security Policy 設定
// https://developer.mozilla.org/ja/docs/Web/HTTP/CSP
const cspDirectives: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': [
    "'self'",
    "'unsafe-inline'", // Next.js inline scripts
    ...(isDev ? ["'unsafe-eval'"] : []), // 開発環境のみ: HMR用
    'https://challenges.cloudflare.com', // Turnstile
    'https://js.stripe.com', // Stripe
  ],
  'style-src': ["'self'", "'unsafe-inline'"], // Tailwind CSS / styled-jsx
  'img-src': [
    "'self'",
    'data:',
    'blob:',
    'https://*.supabase.co', // Supabase Storage
    'https://img.youtube.com', // YouTube thumbnails
    'https://placehold.co', // Placeholder images
    'https://images.unsplash.com', // Unsplash images
  ],
  'font-src': ["'self'"],
  'connect-src': [
    "'self'",
    'https://*.supabase.co', // Supabase API
    'https://api.stripe.com', // Stripe API
    'https://unpkg.com', // detect-gpu benchmarks
    ...(isDev ? ['ws://localhost:*'] : []), // 開発環境: WebSocket HMR
  ],
  'frame-src': [
    "'self'",
    'https://challenges.cloudflare.com', // Turnstile widget
    'https://js.stripe.com', // Stripe Elements
    'https://www.youtube.com', // YouTube embeds
  ],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
  'upgrade-insecure-requests': [],
}

const cspHeader = Object.entries(cspDirectives)
  .map(([key, values]) =>
    values.length > 0 ? `${key} ${values.join(' ')}` : key
  )
  .join('; ')

const nextConfig: NextConfig = {
  // React Compiler for automatic memoization
  reactCompiler: true,

  // Turbopack configuration (default bundler in Next.js 16)
  turbopack: {
    // Resolve alias for ESM module resolution compatibility
    // better-auth imports 'next/headers' without .js extension
    resolveAlias: {
      'next/headers': 'next/headers.js',
      'next/navigation': 'next/navigation.js',
      'next/server': 'next/server.js',
    },
  },

  // Standalone output for Docker / Cloud Run deployment
  // Docker ビルド時に STANDALONE=true を設定。ローカル開発では不要
  // (Windows の Turbopack が node: protocol をファイル名に含めるため standalone コピーが失敗する)
  ...(process.env["STANDALONE"] === 'true' && { output: 'standalone' }),

  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'img.youtube.com',
        pathname: '/vi/**',
      },
      {
        protocol: 'https',
        hostname: 'placehold.co',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
    formats: ['image/avif', 'image/webp'],
    // placehold.co等のSVGプレースホルダー画像を許可（開発/シード用）
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  // Production optimizations
  reactStrictMode: true,
  poweredByHeader: false,

  // Partial Prerendering (PPR) - 静的シェル + 動的コンテンツのハイブリッドレンダリング
  // use cache ディレクティブによる明示的キャッシュ制御を有効化
  cacheComponents: true,

  // Transpile packages that need ESM module resolution fixes
  // better-auth uses dynamic import("next/headers") without .js extension
  transpilePackages: ['better-auth'],

  // Native Node.js modules that cannot be bundled by Next.js
  // bcrypt has C++ bindings requiring native require() at runtime
  serverExternalPackages: ['bcrypt'],

  // Experimental features
  experimental: {
    // Turbopack ファイルシステムキャッシュ: 開発サーバー再起動後もビルドキャッシュを永続化
    turbopackFileSystemCacheForDev: true,
    // Optimize package imports - tree shaking for barrel exports
    optimizePackageImports: [
      // Icons
      'lucide-react',
      // Date utilities
      'date-fns',
      // UI components (Radix)
      '@radix-ui/react-accordion',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-label',
      '@radix-ui/react-select',
      '@radix-ui/react-slot',
      '@radix-ui/react-switch',
      '@radix-ui/react-tabs',
      '@radix-ui/react-tooltip',
      // Rich text editor (Lexical)
      'lexical',
      '@lexical/code',
      '@lexical/html',
      '@lexical/link',
      '@lexical/list',
      '@lexical/react',
      '@lexical/rich-text',
      '@lexical/selection',
      '@lexical/table',
      '@lexical/utils',
      // Charts
      'recharts',
      // Animation
      'gsap',
      'gsap/ScrollTrigger',
      '@gsap/react',
      'lenis',
      // Three.js / React Three Fiber
      'three',
      '@react-three/fiber',
      '@react-three/drei',
      // PixiJS
      'pixi.js',
      // GPU detection
      'detect-gpu',
      // DnD
      '@dnd-kit/core',
      '@dnd-kit/sortable',
      '@dnd-kit/utilities',
    ],
  },

  // Security headers and Cache-Control
  async headers() {
    // 共通セキュリティヘッダー
    const securityHeaders = [
      {
        key: 'X-DNS-Prefetch-Control',
        value: 'on',
      },
      {
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
      },
      {
        key: 'X-Content-Type-Options',
        value: 'nosniff',
      },
      {
        key: 'X-Frame-Options',
        value: 'DENY',
      },
      {
        key: 'X-XSS-Protection',
        value: '1; mode=block',
      },
      {
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin',
      },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
      },
      {
        key: 'Content-Security-Policy',
        value: cspHeader,
      },
    ]

    return [
      // 管理画面（キャッシュ禁止）
      {
        source: '/admin/:path*',
        headers: [
          ...securityHeaders,
          {
            key: 'Cache-Control',
            value: 'private, no-cache, no-store, must-revalidate',
          },
        ],
      },
      // 予約ページ（キャッシュ禁止）
      {
        source: '/reservation/:path*',
        headers: [
          ...securityHeaders,
          {
            key: 'Cache-Control',
            value: 'private, no-cache, no-store, must-revalidate',
          },
        ],
      },
      // API Routes（キャッシュ禁止）
      {
        source: '/api/:path*',
        headers: [
          ...securityHeaders,
          {
            key: 'Cache-Control',
            value: 'private, no-cache',
          },
        ],
      },
      // 公開ページ（積極的キャッシュ - Cloudflare CDN連携）
      {
        source: '/:path*',
        headers: [
          ...securityHeaders,
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=3600, stale-while-revalidate=3600',
          },
        ],
      },
    ]
  },
}

export default nextConfig
