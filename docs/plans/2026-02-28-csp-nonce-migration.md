# CSP Nonce Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** `script-src 'unsafe-inline'` を除去し nonce-based CSP に移行、型安全性ドキュメントを補完して品質スコアを 100/100 にする。

**Architecture:** `src/proxy.ts` でリクエスト毎に nonce を生成し CSP + セキュリティヘッダーを全レスポンスに付与。`next.config.ts` のヘッダー定義は Cache-Control のみに削減。`DynamicContent` サーバーコンポーネントが `x-nonce` を `headers()` で読み取り `AnalyticsProvider` に渡す。

**Tech Stack:** Next.js 16.1.6 proxy.ts, `Buffer.from(crypto.randomUUID()).toString('base64')`, `@next/third-parties/google` (nonce prop), `next/headers` (`headers()`)

---

## Task 1: `type-safety.md` に keysOf/entriesOf の許可注記を追加

**Files:**

- Modify: `.claude/rules/type-safety.md:121-127`（「許可例外（4種のみ）」見出し直後）

**Step 1: 現在の「許可例外」セクション見出しを読む**

`.claude/rules/type-safety.md` の L121-127 を確認（既に読み済み）:

```
## 型アサーション（`as`）禁止
### 許可例外（4種のみ）
```

**Step 2: 許可例外セクションの末尾（TS 6.0 条件型の後）に5番目の例外を追加**

`type-safety.md` L177-184（4番目の例外「TypeScript 6.0 条件型」ブロック）の直後、「### 禁止パターンと代替手段」の前に挿入:

````markdown
**5. `keysOf()` / `entriesOf()` 内部実装（`@/shared/lib/serialize` のみ）**

```typescript
// OK: keysOf / entriesOf の実装内部のみ許可（呼び出し側では as 不要）
// @/shared/lib/serialize.ts
export function keysOf<T extends object>(obj: T): (keyof T)[] {
  return Object.keys(obj) as (keyof T)[];
}
export function entriesOf<T extends object>(obj: T): [keyof T, T[keyof T]][] {
  return Object.entries(obj) as [keyof T, T[keyof T]][];
}
// 呼び出し側: keysOf(config) と書くだけで as 不要
```
````

> ジェネリック制約 `T extends object` によりキーが `keyof T` に限定されるため型安全。
> 呼び出し側で `Object.keys(obj) as ConfigKey[]` と書くことは禁止。`keysOf(obj)` を使う。

````

**Step 3: 型チェック実行**

```bash
bun run type-check
````

Expected: エラーなし（`.md` ファイルの変更のため型チェックは不要だが確認）

**Step 4: コミット**

```bash
git add .claude/rules/type-safety.md
git commit -m "docs(type-safety): document keysOf/entriesOf as permitted as-assertion exceptions"
```

---

## Task 2: `next.config.ts` からセキュリティヘッダーを削除（Cache-Control のみ維持）

**Files:**

- Modify: `next.config.ts`

**Step 1: 現在の `next.config.ts` を読む（実装前に必須）**

既に読み済みの内容を確認:

- L3: `const isDev = ...`
- L6-51: `cspDirectives` オブジェクト + `cspHeader` 定数（削除対象）
- L175-253: `headers()` 関数（`securityHeaders` 配列 + path別 `Cache-Control`）

**Step 2: `cspDirectives` と `cspHeader` 定数を削除し、`headers()` を Cache-Control のみに変更**

削除対象の全文:

- `const isDev = process.env["NODE_ENV"] === "development"` (L3) — proxy.ts に移動するため削除
- `const cspDirectives: Record<string, string[]> = { ... }` (L7-45)
- `const cspHeader = ...` (L47-51)
- `headers()` 関数内の `securityHeaders` 配列 (L177-206) と、各ルートから `...securityHeaders,` を除去

変更後の `headers()`:

```typescript
async headers() {
  return [
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
  ];
},
```

**Step 3: 型チェック実行**

```bash
bun run type-check
```

Expected: エラーなし

**Step 4: コミット**

```bash
git add next.config.ts
git commit -m "refactor(config): move security headers to proxy.ts, keep Cache-Control only"
```

---

## Task 3: `src/proxy.ts` にヘルパー関数を追加

**Files:**

- Modify: `src/proxy.ts`（L39 の `POST_RESERVED_SUBPATHS` 定数の前にヘルパーを挿入）

**Step 1: `src/proxy.ts` の先頭部分を再確認**

読み済みの内容:

- L1-18: コメント + imports
- L39: `const POST_RESERVED_SUBPATHS = new Set(["category", "tag"])`

**Step 2: `POST_RESERVED_SUBPATHS` の前（L39直前）にヘルパー定数と関数を追加**

```typescript
// =============================================================================
// CSP / Security Headers
// =============================================================================

/**
 * セキュリティヘッダー（CSP以外）
 * proxy.ts に一元化 — next.config.ts からは移動済み
 */
const SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ["Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload"],
  ["X-Content-Type-Options", "nosniff"],
  ["X-Frame-Options", "DENY"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"],
  ["X-DNS-Prefetch-Control", "on"],
];

/**
 * CSP ヘッダー値をビルド（リクエスト毎に nonce を埋め込む）
 *
 * script-src: 'unsafe-inline' → 'nonce-${nonce}' + 'strict-dynamic'
 * - 'strict-dynamic': nonce 付きスクリプトから動的にロードされるスクリプトも許可（GTM/GA4 対応）
 * - 開発環境のみ 'unsafe-eval' を追加（HMR/devtools 用）
 *
 * style-src: 'unsafe-inline' を維持
 * - インライン style 属性（style={{ ... }}）は nonce で保護不可のため維持
 *
 * @see https://nextjs.org/docs/app/guides/content-security-policy
 */
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

/**
 * セキュリティヘッダー（HSTS, X-Content-Type-Options, CSP 等）を response に適用
 */
function applySecurityHeaders(headers: Headers, csp: string): void {
  for (const [key, value] of SECURITY_HEADERS) {
    headers.set(key, value);
  }
  headers.set("Content-Security-Policy", csp);
}
```

**Step 3: 型チェック実行**

```bash
bun run type-check
```

Expected: エラーなし

**Step 4: コミット（ヘルパー追加のみ、proxy() 関数はまだ変更しない）**

```bash
git add src/proxy.ts
git commit -m "feat(proxy): add CSP nonce builder and security headers helpers"
```

---

## Task 4: `src/proxy.ts` の `proxy()` 関数を修正（nonce + ヘッダー適用）

**Files:**

- Modify: `src/proxy.ts`

**Step 1: `proxy()` 関数の冒頭（L124-132）を修正**

変更前:

```typescript
export async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname, searchParams } = req.nextUrl;

  // ヘッダーにパス名を設定（Server Componentで使用）
  const createResponse = () => {
    const response = NextResponse.next();
    response.headers.set("x-pathname", pathname);
    return response;
  };
```

変更後:

```typescript
export async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname, searchParams } = req.nextUrl;

  // nonce 生成（リクエスト毎にユニーク）
  // Buffer.from(uuid).toString('base64') は Next.js 16 公式推奨パターン
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const cspValue = buildCsp(nonce);

  // パス名と nonce を Server Components に伝播し、セキュリティヘッダーを付与
  const createResponse = () => {
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("x-pathname", pathname);
    requestHeaders.set("Content-Security-Policy", cspValue);

    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });
    response.headers.set("x-pathname", pathname);
    applySecurityHeaders(response.headers, cspValue);
    return response;
  };
```

**Step 2: root-level URL rewrite（L159-164）を修正**

変更前:

```typescript
if (!settings.postUrlPrefixEnabled) {
  // プレフィックス無効時: /posts/ にリライト
  const url = req.nextUrl.clone();
  url.pathname = `/posts${pathname}`;
  return NextResponse.rewrite(url);
}
```

変更後:

```typescript
if (!settings.postUrlPrefixEnabled) {
  // プレフィックス無効時: /posts/ にリライト
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
```

**Step 3: posts/ category_name rewrite（L188-192）を修正**

変更前:

```typescript
if (segments.length === 3 && seg2) {
  const url = req.nextUrl.clone();
  url.pathname = `/posts/${seg2}`;
  return NextResponse.rewrite(url);
}
```

変更後:

```typescript
if (segments.length === 3 && seg2) {
  const url = req.nextUrl.clone();
  url.pathname = `/posts/${seg2}`;
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", cspValue);
  const response = NextResponse.rewrite(url, {
    request: { headers: requestHeaders },
  });
  applySecurityHeaders(response.headers, cspValue);
  return response;
}
```

**Step 4: posts/ date_name rewrite（L207-214）を修正**

変更前:

```typescript
const url = req.nextUrl.clone();
url.pathname = `/posts/${slug}`;
return NextResponse.rewrite(url);
```

変更後:

```typescript
const url = req.nextUrl.clone();
url.pathname = `/posts/${slug}`;
const requestHeaders = new Headers(req.headers);
requestHeaders.set("x-nonce", nonce);
requestHeaders.set("Content-Security-Policy", cspValue);
const response = NextResponse.rewrite(url, {
  request: { headers: requestHeaders },
});
applySecurityHeaders(response.headers, cspValue);
return response;
```

**Step 5: 型チェック実行**

```bash
bun run type-check
```

Expected: エラーなし

**Step 6: コミット**

```bash
git add src/proxy.ts
git commit -m "feat(proxy): integrate nonce-based CSP into all response paths"
```

---

## Task 5: `AnalyticsProvider.tsx` に nonce prop を追加

**Files:**

- Modify: `src/app/(public)/_shared/components/analytics/AnalyticsProvider.tsx`

**Step 1: 現在のファイルを読む（実装前に必須）**

既に読み済み。Props: `{ config: AnalyticsConfig }`。`GoogleAnalytics`, `GoogleTagManager` を使用。

**Step 2: `nonce` prop を追加して GA4/GTM に渡す**

変更前:

```typescript
interface AnalyticsProviderProps {
  config: AnalyticsConfig
}

export function AnalyticsProvider({ config }: AnalyticsProviderProps) {
  // ...
  if (config.analyticsType === AnalyticsType.ga4 && config.googleAnalyticsId) {
    return <GoogleAnalytics gaId={config.googleAnalyticsId} />
  }

  if (config.analyticsType === AnalyticsType.gtm && config.googleTagManagerId) {
    return <GoogleTagManager gtmId={config.googleTagManagerId} />
  }
```

変更後:

```typescript
interface AnalyticsProviderProps {
  config: AnalyticsConfig
  nonce?: string | null
}

export function AnalyticsProvider({ config, nonce }: AnalyticsProviderProps) {
  // ...
  if (config.analyticsType === AnalyticsType.ga4 && config.googleAnalyticsId) {
    return <GoogleAnalytics gaId={config.googleAnalyticsId} nonce={nonce ?? undefined} />
  }

  if (config.analyticsType === AnalyticsType.gtm && config.googleTagManagerId) {
    return <GoogleTagManager gtmId={config.googleTagManagerId} nonce={nonce ?? undefined} />
  }
```

**Step 3: 型チェック実行**

```bash
bun run type-check
```

Expected: `layout.tsx` で `nonce` prop の型エラーが発生する（次タスクで修正）

> **Note:** 型エラーが出ても正常。Task 6 で `layout.tsx` を修正して解消する。

**Step 4: コミット（型エラーがある状態でも OK — 次タスクで解消）**

```bash
git add 'src/app/(public)/_shared/components/analytics/AnalyticsProvider.tsx'
git commit -m "feat(analytics): add nonce prop to AnalyticsProvider for CSP compliance"
```

---

## Task 6: `layout.tsx` の `DynamicContent` で nonce を読み取り

**Files:**

- Modify: `src/app/(public)/layout.tsx`

**Step 1: 現在のファイルを読む（実装前に必須）**

既に読み済み。`DynamicContent` (L87-107) は `connection`, `getCookieConsentSettings`, `getAnalyticsConfig` を使用。

**Step 2: `headers` を import に追加**

変更前（L21）:

```typescript
import { connection } from "next/server";
```

変更後:

```typescript
import { connection } from "next/server";
import { headers } from "next/headers";
```

**Step 3: `DynamicContent` で nonce を取得して `AnalyticsProvider` に渡す**

変更前:

```typescript
async function DynamicContent(): Promise<ReactElement> {
  const [cookieSettings, analyticsConfig] = await Promise.all([
    getCookieConsentSettings(),
    getAnalyticsConfig(),
  ]);

  return (
    <>
      <AnalyticsProvider config={analyticsConfig} />
```

変更後:

```typescript
async function DynamicContent(): Promise<ReactElement> {
  const [cookieSettings, analyticsConfig, headersList] = await Promise.all([
    getCookieConsentSettings(),
    getAnalyticsConfig(),
    headers(),
  ]);

  const nonce = headersList.get("x-nonce");

  return (
    <>
      <AnalyticsProvider config={analyticsConfig} nonce={nonce} />
```

**Step 4: 型チェック + lint 実行**

```bash
bun run validate
```

Expected: エラーなし（Task 5 で発生していた型エラーが解消）

**Step 5: コミット**

```bash
git add 'src/app/(public)/layout.tsx'
git commit -m "feat(layout): pass CSP nonce from x-nonce header to AnalyticsProvider"
```

---

## Task 7: ビルド検証と CSP 動作確認

**Step 1: 完全検証実行**

```bash
bun run validate && bun run build
```

Expected: 型エラーなし、lint エラーなし、ビルド成功

**Step 2: 開発サーバーで CSP ヘッダーを確認**

```bash
bun dev
```

ブラウザで開発者ツールを開き:

1. `http://localhost:3000` にアクセス
2. Network タブ → 最初の HTML リクエスト → Response Headers を確認
3. `Content-Security-Policy` ヘッダーに `nonce-` が含まれていること
4. `X-Content-Type-Options: nosniff` が存在すること
5. `Strict-Transport-Security` が存在すること

**CSP 確認ポイント:**

- `script-src` に `'nonce-XXXXXX'` + `'strict-dynamic'` が含まれる
- `script-src` に `'unsafe-inline'` が含まれないこと
- `style-src` に `'unsafe-inline'` が含まれること（維持）
- Console に CSP エラーがないこと

**Step 3: コンソールエラーがあれば調査・修正**

CSP エラーが出た場合:

- `Refused to execute inline script` → スクリプト要素にノンスが付いていない可能性 → `proxy.ts` の `buildCsp` を確認
- `Refused to load` → `frame-src` / `connect-src` などのドメイン未登録 → `buildCsp` に追加

---

## Task 8: `docs/plans/README.md` のスコアを更新

**Files:**

- Modify: `docs/plans/README.md`（先頭付近のプロジェクト品質スコアセクション）

**Step 1: README の品質スコアセクションを更新**

品質スコア表の「セキュリティ」と「型安全性」を 99 → 100 に変更。
コメント（`-1: ...`）を削除し、各項目のスコアが 100/100 である旨に更新。

```markdown
| セキュリティ | 100 | nonce-based CSP（script-src: strict-dynamic + nonce、unsafe-inline 除去）|
| 型安全性 | 100 | keysOf/entriesOf 型安全ラッパー文書化済み、as 禁止ルール完全準拠 |
```

また、今回の計画を「完了した計画」セクションに追加:

```markdown
- ✅ [2026-02-28] CSP nonce 移行 + 型安全性ドキュメント整備（品質スコア 100/100 達成）
```

**Step 2: 最終コミット**

```bash
git add docs/plans/README.md
git commit -m "docs(plans): update quality scores to 100/100 after CSP nonce migration"
```

---

## 完了チェックリスト

- [ ] Task 1: `type-safety.md` に `keysOf`/`entriesOf` 許可注記追加
- [ ] Task 2: `next.config.ts` からセキュリティヘッダー削除（Cache-Control のみ維持）
- [ ] Task 3: `proxy.ts` にヘルパー（`SECURITY_HEADERS`, `buildCsp`, `applySecurityHeaders`）追加
- [ ] Task 4: `proxy.ts` の `proxy()` 関数を nonce 生成 + 全レスポンスパスにヘッダー適用で修正
- [ ] Task 5: `AnalyticsProvider.tsx` に `nonce?: string | null` prop 追加
- [ ] Task 6: `layout.tsx` の `DynamicContent` で `x-nonce` 読み取りと prop 渡し
- [ ] Task 7: `bun run validate && bun run build` でビルド検証 + CSP 動作確認
- [ ] Task 8: `docs/plans/README.md` のスコアを 100/100 に更新

---

## 参考

- 設計ドキュメント: `docs/plans/2026-02-28-csp-nonce-migration-design.md`
- Next.js 16 公式 CSP ガイド: https://nextjs.org/docs/app/guides/content-security-policy
- context7 確認済みパターン: `/vercel/next.js/v16.1.6` → `content-security-policy.mdx`
- `@next/third-parties/google` `nonce` prop: `GoogleAnalytics` と `GoogleTagManager` 両方でサポート確認済み
