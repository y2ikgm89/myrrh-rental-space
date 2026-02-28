# CSP Nonce Migration Design

**Date**: 2026-02-28
**Status**: Approved
**Goal**: プロジェクト品質スコア セキュリティ 99→100 / 型安全性 99→100

---

## 背景

現状の品質スコア（`docs/plans/README.md`）:

- セキュリティ: 99/100（-1: `'unsafe-inline'` による CSP 脆弱性）
- 型安全性: 99/100（-1: `keysOf`/`entriesOf` の許可例外ドキュメント不足）

目標: 両カテゴリを 100/100 へ。

---

## アーキテクチャ概要

```
Browser Request
  ↓
src/proxy.ts              # nonce 生成 + CSP ビルド + セキュリティヘッダー適用
  ↓ x-nonce (request header)
src/app/(public)/layout.tsx (DynamicContent)  # headers() で x-nonce を読み取り
  ↓ nonce prop
AnalyticsProvider.tsx     # GoogleAnalytics / GoogleTagManager に nonce 渡し
  ↓ nonce attribute
<script nonce="...">      # CSP 'nonce-${nonce}' で許可
```

---

## 変更ファイル一覧

### 1. `src/proxy.ts`（メイン変更）

**追加: 3つのヘルパー**

```typescript
// セキュリティヘッダー（CSP 以外）
const SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ["Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload"],
  ["X-Content-Type-Options", "nosniff"],
  ["X-Frame-Options", "DENY"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"],
  ["X-DNS-Prefetch-Control", "on"],
];

// CSP ビルダー（nonce-based、'unsafe-inline' 除去）
function buildCsp(nonce: string): string {
  const isDev = serverEnv.NODE_ENV === "development";
  return `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""};
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: blob: https://*.supabase.co https://img.youtube.com https://placehold.co https://images.unsplash.com;
    font-src 'self';
    connect-src 'self' https://*.supabase.co https://api.stripe.com https://unpkg.com https://www.google-analytics.com https://analytics.google.com${isDev ? " ws://localhost:*" : ""};
    frame-src 'self' https://challenges.cloudflare.com https://js.stripe.com https://www.youtube.com https://player.vimeo.com https://open.spotify.com https://www.figma.com https://www.instagram.com;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `
    .replace(/\s{2,}/g, " ")
    .trim();
}

// セキュリティヘッダー + CSP を response に適用
function applySecurityHeaders(headers: Headers, csp: string): void {
  for (const [key, value] of SECURITY_HEADERS) {
    headers.set(key, value);
  }
  headers.set("Content-Security-Policy", csp);
}
```

**変更: `proxy()` 関数冒頭に nonce 生成を追加**

```typescript
export async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname, searchParams } = req.nextUrl

  // nonce 生成（リクエスト毎にユニーク）
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const cspValue = buildCsp(nonce)

  // 変更: createResponse は requestHeaders に x-nonce を伝播
  const createResponse = () => {
    const requestHeaders = new Headers(req.headers)
    requestHeaders.set('x-nonce', nonce)
    requestHeaders.set('x-pathname', pathname)
    requestHeaders.set('Content-Security-Policy', cspValue)

    const response = NextResponse.next({
      request: { headers: requestHeaders },
    })
    response.headers.set('x-pathname', pathname)
    applySecurityHeaders(response.headers, cspValue)
    return response
  }

  // ... 既存のルーティングロジック（rewrite/redirect も applySecurityHeaders 適用）
```

**変更: rewrite レスポンスにもヘッダー適用**

```typescript
// 例: root-level URL rewrite
if (!settings.postUrlPrefixEnabled) {
  const url = req.nextUrl.clone();
  url.pathname = `/posts${pathname}`;
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", cspValue);
  const response = NextResponse.rewrite(url, {
    request: { headers: requestHeaders },
  });
  applySecurityHeaders(response.headers, cspValue);
  return response;
}

// posts/ rewrite も同様のパターン（createRewriteResponse ヘルパー化は不要 — DRY vs 明示性のバランス）
```

**CSP ディレクティブ変更点:**

| ディレクティブ | 変更前                  | 変更後                                                         |
| -------------- | ----------------------- | -------------------------------------------------------------- |
| `script-src`   | `'unsafe-inline'`       | `'nonce-${nonce}'` + `'strict-dynamic'`                        |
| `style-src`    | `'unsafe-inline'`       | `'unsafe-inline'`（維持: inline style属性は nonce で保護不可） |
| `frame-src`    | YouTube のみ            | + Vimeo, Spotify, Figma, Instagram（Lexical embed 対応）       |
| `connect-src`  | Supabase, Stripe, unpkg | + `www.google-analytics.com`, `analytics.google.com`           |

**注記: `style-src 'unsafe-inline'` を維持する理由**
CSP の nonce はブロック要素（`<style>` タグ）のみに適用可能。インライン `style` 属性（`style={{ ... }}`）には nonce を付与できず、`'unsafe-inline'` なしでは全てブロックされる。React/Next.js のインライン style 属性はアプリ全体で使用されており、実用上 `'unsafe-inline'` の維持が必要。script-src の `'unsafe-inline'` 除去（XSS 対策の主眼）は達成する。

---

### 2. `next.config.ts`（セキュリティヘッダー削除）

**削除**: `cspDirectives`, `cspHeader` 定数および `securityHeaders` 配列（CSP + HSTS + X-Content-Type-Options + X-Frame-Options + Referrer-Policy + Permissions-Policy）を `headers()` 関数から除去。

**維持**: Cache-Control ヘッダー（パス別キャッシュ戦略は next.config.ts で管理）

```typescript
// 変更後の headers()
async headers() {
  return [
    { source: '/admin/:path*',       headers: [{ key: 'Cache-Control', value: 'private, no-cache, no-store, must-revalidate' }] },
    { source: '/reservation/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-cache, no-store, must-revalidate' }] },
    { source: '/api/:path*',         headers: [{ key: 'Cache-Control', value: 'private, no-cache' }] },
    { source: '/:path*',             headers: [{ key: 'Cache-Control', value: 'public, s-maxage=3600, stale-while-revalidate=3600' }] },
  ]
}
```

**設計理由**: セキュリティヘッダーを proxy.ts に一元化することで:

- nonce をリクエスト毎に CSP に組み込める（next.config.ts はビルド時静的）
- 全セキュリティヘッダーの管理場所が統一される

---

### 3. `src/app/(public)/layout.tsx`（nonce 読み取り）

**変更**: `DynamicContent` Server Component で `x-nonce` を読み取り `AnalyticsProvider` に渡す

```typescript
// import 追加
import { headers } from 'next/headers'

// DynamicContent: nonce を読み取って AnalyticsProvider に渡す
async function DynamicContent(): Promise<ReactElement> {
  const [cookieSettings, analyticsConfig, headersList] = await Promise.all([
    getCookieConsentSettings(),
    getAnalyticsConfig(),
    headers(),
  ])

  const nonce = headersList.get('x-nonce')

  return (
    <>
      <AnalyticsProvider config={analyticsConfig} nonce={nonce} />
      {/* ... 既存の WebVitalsReporter, CookieConsentBanner */}
    </>
  )
}
```

**なぜ `DynamicContent` か**: `<Suspense>` で既にラップ済みで PPR の動的コンテンツ境界内にある。CSP nonce はリクエスト毎に変わるため、動的境界での読み取りが必須。

---

### 4. `src/app/(public)/_shared/components/analytics/AnalyticsProvider.tsx`（nonce prop 追加）

```typescript
interface AnalyticsProviderProps {
  config: AnalyticsConfig
  nonce?: string | null  // CSP nonce を GA4/GTM に渡す
}

export function AnalyticsProvider({ config, nonce }: AnalyticsProviderProps) {
  // ...（既存の useCookieConsent, null checks）

  // GA4
  if (config.analyticsType === AnalyticsType.ga4 && config.googleAnalyticsId) {
    return <GoogleAnalytics gaId={config.googleAnalyticsId} nonce={nonce ?? undefined} />
  }

  // GTM
  if (config.analyticsType === AnalyticsType.gtm && config.googleTagManagerId) {
    return <GoogleTagManager gtmId={config.googleTagManagerId} nonce={nonce ?? undefined} />
  }
}
```

---

### 5. `.claude/rules/type-safety.md`（keysOf/entriesOf を文書化）

「許可された例外」セクションに追加:

```markdown
| `keysOf<T>(obj)` / `entriesOf<T>(obj)` | `@/shared/lib/serialize` | `Object.keys(obj) as (keyof T)[]` の型安全ラッパー。内部で `as` を使用するが、ジェネリック制約により型安全。直接 `Object.keys()` に `as` でキャストする代わりにこれを使用。 |
```

---

### 6. `docs/plans/README.md`（スコア更新）

セキュリティ 99→100、型安全性 99→100、総合スコアのコメントを更新。

---

## 実装順序

1. `.claude/rules/type-safety.md` — 最小変更、リスクゼロ
2. `next.config.ts` — ヘッダー削除（proxy.ts 変更と同時にデプロイする前提）
3. `src/proxy.ts` — メイン変更。ヘルパー追加 → `proxy()` 関数修正
4. `src/app/(public)/_shared/components/analytics/AnalyticsProvider.tsx` — prop 追加
5. `src/app/(public)/layout.tsx` — nonce 読み取り追加
6. `docs/plans/README.md` — スコア更新

---

## 技術参照

- Next.js 16.1.6 公式 CSP ガイド: context7 `/vercel/next.js/v16.1.6` → `content-security-policy.mdx`
- `proxy()` 公式パターン: `Buffer.from(crypto.randomUUID()).toString('base64')`
- CSP nonce 伝播: `NextResponse.next({ request: { headers: requestHeaders } })` で Server Components が `headers()` でアクセス可能
- `@next/third-parties/google`: `GoogleAnalytics`, `GoogleTagManager` 両方が `nonce` prop をサポート

---

## Anti-AI チェック（後方互換ハック禁止）

- ❌ `'unsafe-inline'` を `script-src` に残さない（脆弱性）
- ❌ `next.config.ts` に古い CSP を維持しない（二重管理）
- ❌ nonce を環境変数で固定しない（毎リクエストで再生成が必須）
- ✅ `'strict-dynamic'` で GTM/GA4 の動的スクリプトロードを許可（whitelist 不要）
- ✅ 全レスポンスパス（next/rewrite/redirect）で一貫したヘッダー適用
