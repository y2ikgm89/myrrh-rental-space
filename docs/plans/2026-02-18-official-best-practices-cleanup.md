# 公式ベストプラクティス準拠クリーンアップ — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** コードベース全体を公式ルールに完全準拠させる（約60箇所の violations を修正）

**Architecture:** 4フェーズ構成。P0（セキュリティ）→ P1b（cacheLife定数化）→ P1（Zod微修正）→ P3（Tailwind）の順に実施。各フェーズ後に `bun run validate` を実行してビルドが通ることを確認する。

**Tech Stack:** Next.js 16 `'use cache'`, `@t3-oss/env-nextjs`, TypeScript 6.0-beta, Zod 4, Tailwind CSS 4

---

## Reference Files

修正前に必ず以下を読む：

- `.claude/rules/server-actions.md` §cacheLife定数, §updateTag vs revalidateTag
- `.claude/rules/type-safety.md` §型アサーション禁止
- `.claude/rules/zod-patterns.md` §Prisma Enum バリデーション
- `.claude/rules/tailwind-patterns.md` §ハードコードカラー禁止
- `src/shared/lib/constants/cache.ts` — CACHE_LIFE 定数の定義確認
- `src/shared/lib/env/server.ts` — serverEnv スキーマ確認

---

## Task 1: serverEnv に VERCEL_URL を追加

**Files:**
- Modify: `src/shared/lib/env/server.ts`

**目的**: `VERCEL_URL` を T3 Env スキーマで管理し、ビルド時検証の対象にする。

**Step 1: ファイルを読んで現状確認**

```bash
# server.ts を確認（すでに読み込まれている場合はスキップ）
```

**Step 2: VERCEL_URL を server スキーマに追加**

`src/shared/lib/env/server.ts` の `server:` ブロックに追加。
`ADMIN_LOGIN_TOKEN` の直後（line ~83）に挿入：

```typescript
    // VERCEL_URL（Vercel 自動注入 — デプロイ環境のURL）
    VERCEL_URL: z.string().optional(),
```

`runtimeEnv:` ブロックにも追加。`ADMIN_LOGIN_TOKEN:` の直後に：

```typescript
    VERCEL_URL: process.env["VERCEL_URL"],
```

**Step 3: 検証**

```bash
bun run type-check
```

Expected: エラーなし

**Step 4: コミット**

```bash
git add src/shared/lib/env/server.ts
git commit -m "feat(env): add VERCEL_URL to serverEnv schema"
```

---

## Task 2: Instagram authorize/route.ts の process.env 直接アクセスを修正

**Files:**
- Modify: `src/app/api/instagram/oauth/authorize/route.ts`

**現状の問題箇所:**

```typescript
// line 49: process.env["NODE_ENV"] 直接アクセス
secure: process.env["NODE_ENV"] === 'production',

// lines 74-75: process.env["VERCEL_URL"] 直接アクセス
return process.env["VERCEL_URL"]
  ? `https://${process.env["VERCEL_URL"]}`
  : 'http://localhost:3000'
```

**Step 1: ファイルを読んで現状確認**

`src/app/api/instagram/oauth/authorize/route.ts` を Read ツールで読む。

**Step 2: serverEnv import を確認**

ファイルの先頭 import を確認。すでに `import { serverEnv } from '@/shared/lib/env/server'` がある。

**Step 3: 2箇所を修正**

line 49:
```typescript
// Before:
secure: process.env["NODE_ENV"] === 'production',

// After:
secure: serverEnv.NODE_ENV === 'production',
```

lines 74-75（`getBaseUrl()` 関数内）:
```typescript
// Before:
return process.env["VERCEL_URL"]
  ? `https://${process.env["VERCEL_URL"]}`
  : 'http://localhost:3000'

// After:
return serverEnv.VERCEL_URL
  ? `https://${serverEnv.VERCEL_URL}`
  : 'http://localhost:3000'
```

**Step 4: 型チェック**

```bash
bun run type-check
```

**Step 5: コミット**

```bash
git add src/app/api/instagram/oauth/authorize/route.ts
git commit -m "fix(instagram): replace process.env direct access with serverEnv"
```

---

## Task 3: Instagram callback/route.ts の process.env 直接アクセスを修正

**Files:**
- Modify: `src/app/api/instagram/oauth/callback/route.ts`

**現状の問題箇所（lines 170-171）:**

```typescript
return process.env["VERCEL_URL"]
  ? `https://${process.env["VERCEL_URL"]}`
  : 'http://localhost:3000'
```

**Step 1: ファイルを読む**

`src/app/api/instagram/oauth/callback/route.ts` を Read ツールで読む。

**Step 2: getBaseUrl() 関数を修正**

```typescript
// Before:
function getBaseUrl(): string {
  if (serverEnv.BETTER_AUTH_URL) {
    return serverEnv.BETTER_AUTH_URL
  }
  // フォールバック
  return process.env["VERCEL_URL"]
    ? `https://${process.env["VERCEL_URL"]}`
    : 'http://localhost:3000'
}

// After:
function getBaseUrl(): string {
  if (serverEnv.BETTER_AUTH_URL) {
    return serverEnv.BETTER_AUTH_URL
  }
  // フォールバック
  return serverEnv.VERCEL_URL
    ? `https://${serverEnv.VERCEL_URL}`
    : 'http://localhost:3000'
}
```

**Step 3: 検証**

```bash
bun run type-check
```

**Step 4: コミット**

```bash
git add src/app/api/instagram/oauth/callback/route.ts
git commit -m "fix(instagram): replace process.env direct access with serverEnv in callback"
```

---

## Task 4: google-calendar.ts の process.env 直接アクセスを修正

**Files:**
- Modify: `src/shared/lib/google-calendar.ts`

**現状の問題箇所（line 944）:**

```typescript
const baseUrl = process.env["NEXT_PUBLIC_APP_URL"] || process.env["VERCEL_URL"]
```

**Step 1: ファイルを読む（944行前後）**

`src/shared/lib/google-calendar.ts` の行940-950付近を Read ツールで確認。

**Step 2: clientEnv と serverEnv の import を確認**

ファイル冒頭の import を確認。`clientEnv` が import されているか確認。
もし `clientEnv` が import されていない場合、`env` または `clientEnv` を追加 import する。

`src/shared/lib/env/index.ts` を確認して利用可能な export を確認。

**Step 3: line 944 を修正**

```typescript
// Before:
const baseUrl = process.env["NEXT_PUBLIC_APP_URL"] || process.env["VERCEL_URL"]

// After（envの一元管理経由）:
import { env } from '@/shared/lib/env'
// ...
const baseUrl = env.NEXT_PUBLIC_APP_URL || (serverEnv.VERCEL_URL ? `https://${serverEnv.VERCEL_URL}` : undefined)
```

または、既存の import に合わせて最もシンプルな書き方を選択する。
`serverEnv` が既に import されていれば：

```typescript
// After:
const baseUrl = process.env["NEXT_PUBLIC_APP_URL"] || (serverEnv.VERCEL_URL ? `https://${serverEnv.VERCEL_URL}` : undefined)
```

**注意**: `NEXT_PUBLIC_APP_URL` は `clientEnv` 経由が理想だが、google-calendar.ts がサーバー専用ファイルの場合は `process.env["NEXT_PUBLIC_APP_URL"]` のままでも問題ない（NEXT_PUBLIC_ は Next.js がビルド時にインライン化するため）。`VERCEL_URL` のみを `serverEnv.VERCEL_URL` に変更する最小修正でよい。

**最小修正パターン（推奨）:**

```typescript
// Before:
const baseUrl = process.env["NEXT_PUBLIC_APP_URL"] || process.env["VERCEL_URL"]

// After:
const baseUrl = process.env["NEXT_PUBLIC_APP_URL"] || (serverEnv.VERCEL_URL ? `https://${serverEnv.VERCEL_URL}` : undefined)
```

**Step 4: serverEnv import を確認・追加**

ファイル冒頭に `serverEnv` が import されていない場合は追加：

```typescript
import { serverEnv } from '@/shared/lib/env/server'
```

**Step 5: 型チェック**

```bash
bun run validate
```

Expected: エラーなし

**Step 6: コミット**

```bash
git add src/shared/lib/google-calendar.ts
git commit -m "fix(google-calendar): replace process.env VERCEL_URL with serverEnv"
```

---

## Task 5: cacheLife マジックストリングを CACHE_LIFE 定数に置換（グループ A: public/_shared/lib）

**Files:**
- Modify: `src/app/(public)/_shared/lib/header-settings.ts`
- Modify: `src/app/(public)/_shared/lib/layout-settings.ts`
- Modify: `src/app/(public)/_shared/lib/page-metadata.ts`
- Modify: `src/app/(public)/_shared/lib/navigation.ts`
- Modify: `src/app/(public)/_shared/lib/seo/metadata-factory.ts`
- Modify: `src/app/(public)/_shared/lib/seo/json-ld-config.ts`

**背景:**

`cacheLife('hours')` は `server-actions.md` §cacheLife定数 で禁止されている。
`CACHE_LIFE.PUBLIC_CONTENT = 'hours'` 定数を使用する。

**CACHE_LIFE の値:**
```
CACHE_LIFE.PUBLIC_CONTENT = 'hours'   — ブログ・ニュース・スペース・ページ
CACHE_LIFE.STATIC_SETTINGS = 'days'  — サイト設定・ナビゲーション
CACHE_LIFE.DYNAMIC_DATA = 'minutes'  — 予約状況・動的データ
CACHE_LIFE.METADATA = 'hours'        — SEO関連
```

**Step 1: 各ファイルを読んで現状の import を確認**

各ファイルの先頭数行を読む。`CACHE_TAGS` は `@/shared/lib/constants` から import されているはずなので、同じ行に `CACHE_LIFE` を追加できる。

**Step 2: 6 ファイルを修正**

**header-settings.ts (line 9, 28):**

```typescript
// import を修正
import { CACHE_TAGS, CACHE_LIFE } from '@/shared/lib/constants'
// ...
// line 28:
cacheLife(CACHE_LIFE.STATIC_SETTINGS)  // ヘッダー設定はサイト設定カテゴリ
```

**注意**: `header-settings.ts` はサイト設定（ヘッダー）なので `STATIC_SETTINGS` ('days') が適切。`PUBLIC_CONTENT` ('hours') ではなく注意すること。

**layout-settings.ts (lines 35, 69, 99, 128):**

```typescript
// import を修正（CACHE_TAGS の import にCACHE_LIFEを追加）
import { CACHE_TAGS, CACHE_LIFE } from '@/shared/lib/constants'
// 4箇所すべて:
cacheLife(CACHE_LIFE.PUBLIC_CONTENT)  // コンテンツレイアウト設定
```

**page-metadata.ts (line 47):**

```typescript
import { CACHE_TAGS, CACHE_LIFE } from '@/shared/lib/constants'
// ...
cacheLife(CACHE_LIFE.METADATA)  // SEOメタデータ
```

**navigation.ts (line 28):**

```typescript
import { CACHE_TAGS, CACHE_LIFE } from '@/shared/lib/constants'
// ...
cacheLife(CACHE_LIFE.STATIC_SETTINGS)  // ナビゲーション（サイト設定）
```

**seo/metadata-factory.ts (line 47):**

```typescript
import { CACHE_TAGS, CACHE_LIFE } from '@/shared/lib/constants'
// ...
cacheLife(CACHE_LIFE.METADATA)  // SEO設定
```

**seo/json-ld-config.ts (lines 110, 349):**

```typescript
import { CACHE_TAGS, CACHE_LIFE } from '@/shared/lib/constants'
// 2箇所:
cacheLife(CACHE_LIFE.STATIC_SETTINGS)  // JSON-LD組織設定
```

**Step 3: 検証**

```bash
bun run type-check
```

**Step 4: コミット**

```bash
git add \
  src/app/\(public\)/_shared/lib/header-settings.ts \
  src/app/\(public\)/_shared/lib/layout-settings.ts \
  src/app/\(public\)/_shared/lib/page-metadata.ts \
  src/app/\(public\)/_shared/lib/navigation.ts \
  src/app/\(public\)/_shared/lib/seo/metadata-factory.ts \
  src/app/\(public\)/_shared/lib/seo/json-ld-config.ts
git commit -m "fix(cache): replace cacheLife magic strings with CACHE_LIFE constants (public/_shared/lib)"
```

---

## Task 6: cacheLife マジックストリングを CACHE_LIFE 定数に置換（グループ B: public/_shared/actions）

**Files:**
- Modify: `src/app/(public)/_shared/actions/section.ts`
- Modify: `src/app/(public)/_shared/actions/post.ts`
- Modify: `src/app/(public)/_shared/actions/news.ts`

**Step 1: 各ファイルを読んで現状の import を確認**

**Step 2: 3 ファイルを修正**

**section.ts (lines 32, 61, 91, 159, 184, 217, 243 — 7箇所):**

```typescript
// import を修正
import { CACHE_TAGS, getCacheTag, CACHE_LIFE } from '@/shared/lib/constants'
// 全7箇所:
cacheLife(CACHE_LIFE.PUBLIC_CONTENT)
```

**post.ts (lines 83, 128 — 2箇所):**

```typescript
import { CACHE_TAGS, getCacheTag, CACHE_LIFE } from '@/shared/lib/constants'
// 2箇所:
cacheLife(CACHE_LIFE.PUBLIC_CONTENT)
```

**news.ts (lines 51, 96 — 2箇所):**

```typescript
import { CACHE_TAGS, getCacheTag, CACHE_LIFE } from '@/shared/lib/constants'
// 2箇所:
cacheLife(CACHE_LIFE.PUBLIC_CONTENT)
```

**Step 3: 検証**

```bash
bun run type-check
```

**Step 4: コミット**

```bash
git add \
  "src/app/(public)/_shared/actions/section.ts" \
  "src/app/(public)/_shared/actions/post.ts" \
  "src/app/(public)/_shared/actions/news.ts"
git commit -m "fix(cache): replace cacheLife magic strings with CACHE_LIFE constants (public/_shared/actions)"
```

---

## Task 7: cacheLife マジックストリングを CACHE_LIFE 定数に置換（グループ C: shared/lib + admin）

**Files:**
- Modify: `src/shared/lib/settings/public.ts`
- Modify: `src/shared/lib/analytics/config.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/lib/permissions.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/layout.tsx`

**Step 1: 各ファイルを読んで現状の import を確認**

**Step 2: 4 ファイルを修正**

**shared/lib/settings/public.ts (lines 60, 90, 139, 182, 206, 240, 267):**

```typescript
// import に CACHE_LIFE を追加
import { CACHE_TAGS, CACHE_LIFE } from '@/shared/lib/constants'

// lines 60, 90, 139, 206, 240, 267: 'hours' → STATIC_SETTINGS または PUBLIC_CONTENT
// 設定データなので STATIC_SETTINGS ('days') が適切
cacheLife(CACHE_LIFE.STATIC_SETTINGS)  // 6箇所

// line 182: 'minutes' → DYNAMIC_DATA
cacheLife(CACHE_LIFE.DYNAMIC_DATA)    // 1箇所
```

**注意**: `public.ts` の各関数が何を返すかを確認して適切な定数を選ぶ。
設定データ（ビジネス設定、クッキー設定等）は `STATIC_SETTINGS`、
動的データ（在庫、空き状況等）は `DYNAMIC_DATA`。

**analytics/config.ts (line 49):**

```typescript
import { CACHE_TAGS, CACHE_LIFE } from '@/shared/lib/constants'
// ...
cacheLife(CACHE_LIFE.STATIC_SETTINGS)  // アナリティクス設定
```

**permissions.ts (lines 450, 471):**

```typescript
import { CACHE_TAGS, CACHE_LIFE } from '@/shared/lib/constants'
// 2箇所:
cacheLife(CACHE_LIFE.STATIC_SETTINGS)  // 権限設定（管理画面）
```

**layout.tsx (line 31):**

```typescript
import { CACHE_TAGS, CACHE_LIFE } from '@/shared/lib/constants'
// ...
cacheLife(CACHE_LIFE.STATIC_SETTINGS)  // 管理画面ブランディング設定
```

**Step 3: 全体検証**

```bash
bun run validate
```

Expected: type-check と lint が両方パス

**Step 4: コミット**

```bash
git add \
  src/shared/lib/settings/public.ts \
  src/shared/lib/analytics/config.ts \
  "src/app/(admin)/admin/(dashboard)/_shared/lib/permissions.ts" \
  "src/app/(admin)/admin/(dashboard)/layout.tsx"
git commit -m "fix(cache): replace cacheLife magic strings with CACHE_LIFE constants (shared + admin)"
```

---

## Task 8: Zod — section.ts の faqInitialOpen デフォルト値を定数に変更

**Files:**
- Modify: `src/shared/lib/validations/section.ts`

**背景:**

`faqInitialOpenValues = ['first', 'none', 'all']` は local const array（Prisma enum ではない）。
`.default('none')` の文字列リテラルを定数参照に変更することで型安全性を向上させる。

**Step 1: ファイルを読む**

`src/shared/lib/validations/section.ts` の line 200-210 と、
`src/shared/lib/validations/section-options.ts` の `faqInitialOpenValues` の定義（line 49）を確認。

```typescript
// section-options.ts (既存)
export const faqInitialOpenValues = ['first', 'none', 'all'] as const
```

**Step 2: section.ts の line 205 を修正**

```typescript
// Before:
initialOpen: z.enum(faqInitialOpenValues).default('none'),

// After:
initialOpen: z.enum(faqInitialOpenValues).default(faqInitialOpenValues[1]),
// faqInitialOpenValues[1] === 'none' — 型安全な定数参照
```

**コメント**: `faqInitialOpenValues[1]` は TypeScript により `'first' | 'none' | 'all'` の要素として型安全に推論される。マジックストリング `'none'` を直接書くより type-safe。

**Step 3: 検証**

```bash
bun run type-check
```

**Step 4: コミット**

```bash
git add src/shared/lib/validations/section.ts
git commit -m "fix(validation): use const reference for faqInitialOpen default value"
```

---

## Task 9: Zod — stripe.ts の inline enum array を named const に抽出

**Files:**
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/lib/validations/stripe.ts`

**現状の問題箇所（line 61）:**

```typescript
stripeCurrency: z.enum(['jpy', 'usd', 'eur']).default('jpy'),
```

**Step 1: ファイルを読む**

`src/app/(admin)/admin/(dashboard)/_shared/lib/validations/stripe.ts` の全体または line 55-70 を確認。

**Step 2: ファイルの先頭近くに named const を追加**

既存の定数定義（`MESSAGES` 等）の近くに以下を追加：

```typescript
/** サポート通貨 */
export const SUPPORTED_CURRENCIES = ['jpy', 'usd', 'eur'] as const
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]
```

**Step 3: line 61 を修正**

```typescript
// Before:
stripeCurrency: z.enum(['jpy', 'usd', 'eur']).default('jpy'),

// After:
stripeCurrency: z.enum(SUPPORTED_CURRENCIES).default('jpy'),
```

**Step 4: 検証**

```bash
bun run type-check
```

**Step 5: コミット**

```bash
git add "src/app/(admin)/admin/(dashboard)/_shared/lib/validations/stripe.ts"
git commit -m "fix(validation): extract Stripe currency enum as named constant"
```

---

## Task 10: 最終検証

**Step 1: フル検証実行**

```bash
bun run validate
```

Expected: type-check + lint 両方パス。エラーゼロ。

**Step 2: ビルド確認（オプション — 時間がある場合）**

```bash
bun run build
```

Expected: BUILD SUCCESS

**Step 3: 修正箇所のまとめコミット（必要な場合）**

全タスクのコミットが揃っていれば追加コミット不要。

---

## Optional Task 11: Tailwind — text-white 画像オーバーレイの修正

**Priority**: LOW（機能影響なし、視覚的差異も小さい）

**Files:**
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/media/MediaGrid.tsx` (8箇所)
- Modify: `src/app/(public)/_shared/components/space/SpaceDetail.tsx` (4箇所)
- Modify: `src/app/(public)/_shared/components/space/AnnouncementBarCarousel.tsx` (1箇所)

**背景:**

Tailwind ルールでは `text-white` 等のデフォルトカラー禁止。
ただし、画像オーバーレイ上のテキストは「コントラスト確保のための表示目的」に近いため、
修正の際はデザイン意図を確認してから実施すること。

**判断基準:**
- 暗いオーバーレイ（dark gradient）上の白テキスト → 修正対象（`text-primary-foreground` または CSS変数）
- 意図的にブランドカラーと無関係な白を使う → 修正対象外（exception として扱う）

**修正パターン:**

```typescript
// Before: 画像オーバーレイ上のテキスト
<span className="text-white">テキスト</span>

// After: セマンティックトークン
<span className="text-primary-foreground">テキスト</span>
// または white が意味的に正しい場合は例外コメントを付ける:
<span className="text-white /* overlay-contrast */">テキスト</span>
```

**Step 1: 各ファイルを読んで文脈を確認してから修正方針を決める**

**Step 2: 修正実施（文脈に応じて判断）**

**Step 3: 検証**

```bash
bun run validate
```

**Step 4: コミット**

```bash
git commit -m "fix(style): replace text-white with semantic tokens on image overlays"
```

---

## 実行順序サマリー

| タスク | ファイル数 | 優先度 |
|-------|---------|--------|
| Task 1: serverEnv に VERCEL_URL 追加 | 1 | P0 |
| Task 2: authorize/route.ts 修正 | 1 | P0 |
| Task 3: callback/route.ts 修正 | 1 | P0 |
| Task 4: google-calendar.ts 修正 | 1 | P0 |
| Task 5: cacheLife グループA（public/_shared/lib） | 6 | P1b |
| Task 6: cacheLife グループB（public/_shared/actions） | 3 | P1b |
| Task 7: cacheLife グループC（shared/lib + admin） | 4 | P1b |
| Task 8: section.ts Zod デフォルト値 | 1 | P1 |
| Task 9: stripe.ts inline enum | 1 | P1 |
| Task 10: 最終検証 | — | 必須 |
| Task 11: text-white（オプション） | 3 | P3 |

**合計修正ファイル**: 19〜22 ファイル
**合計修正箇所**: 約 60〜65 箇所
