# 公式ベストプラクティス準拠クリーンアップ — Design Document

> **Status**: Approved (Approach A — cacheLife優先)
> **Date**: 2026-02-18

## Goal

コードベース全体を公式ベストプラクティスに準拠させる。破壊的変更 OK、後方互換性ハック禁止。
スキャンにより発見された全違反を修正し、5 つのルールカテゴリ（P0〜P3）に完全準拠する。

## Architecture

- **スコープ**: `src/` 全体（admin / public / shared）
- **優先順**: P0(セキュリティ) → P1(型安全/cacheLife) → P3(スタイル) の順に修正
- **検証**: 各フェーズ後 `bun run validate` 実行

## Tech Stack

- Next.js 16 `'use cache'` / `cacheLife` / `cacheTag` / `updateTag`
- `@t3-oss/env-nextjs` — T3 Env スキーマ
- TypeScript 6.0-beta / Zod 4.3.6 / Tailwind CSS 4.1

---

## Phase 1: P0 — 環境変数セキュリティ（3 ファイル）

### 問題

`serverEnv` スキーマを経由せず `process.env` に直接アクセスしている箇所が 3 ファイルに存在。
T3 Env の一元管理から漏れておりビルド時検証が効かない。

### 修正対象

| ファイル                                      | 行      | 変数                                                                | 対処                                                    |
| --------------------------------------------- | ------- | ------------------------------------------------------------------- | ------------------------------------------------------- |
| `src/shared/lib/instagram/authorize/route.ts` | 49      | `process.env["NODE_ENV"]`                                           | `serverEnv.NODE_ENV`                                    |
| `src/shared/lib/instagram/authorize/route.ts` | 74-75   | `process.env["VERCEL_URL"]`                                         | `serverEnv.VERCEL_URL`                                  |
| `src/shared/lib/instagram/callback/route.ts`  | 170-171 | `process.env["VERCEL_URL"]`                                         | `serverEnv.VERCEL_URL`                                  |
| `src/shared/lib/google-calendar.ts`           | 327     | `process.env["NEXT_PUBLIC_APP_URL"] \|\| process.env["VERCEL_URL"]` | `clientEnv.NEXT_PUBLIC_APP_URL ?? serverEnv.VERCEL_URL` |

### `serverEnv` スキーマへの追加

```typescript
// src/shared/lib/env/server.ts に追加
VERCEL_URL: z.string().optional(),  // Vercel 自動注入
```

```typescript
// runtimeEnv に追加
VERCEL_URL: process.env["VERCEL_URL"],
```

---

## Phase 2: P1b — cacheLife マジックストリング（~50 箇所、~15 ファイル）

### 問題

`cacheLife('hours')` / `cacheLife('minutes')` 等の文字列リテラルを直接使用。
`server-actions.md` ルールにより `CACHE_LIFE.*` 定数使用が必須。

### 修正マッピング

| 現行                   | 修正後                                  |
| ---------------------- | --------------------------------------- |
| `cacheLife('hours')`   | `cacheLife(CACHE_LIFE.PUBLIC_CONTENT)`  |
| `cacheLife('minutes')` | `cacheLife(CACHE_LIFE.DYNAMIC_DATA)`    |
| `cacheLife('days')`    | `cacheLife(CACHE_LIFE.STATIC_SETTINGS)` |

### 対象ファイル（確認済み）

```
src/app/(public)/_shared/lib/header-settings.ts        — 1箇所
src/app/(public)/_shared/lib/layout-settings.ts        — 4箇所
src/app/(public)/_shared/lib/metadata-factory.ts       — 1箇所
src/app/(public)/_shared/lib/json-ld-config.ts         — 2箇所
src/app/(public)/_shared/lib/page-metadata.ts          — 1箇所
src/app/(public)/_shared/lib/navigation.ts             — 1箇所
src/app/(admin)/_shared/lib/permissions.ts             — 2箇所
src/app/(public)/actions/settings/public.ts            — 7箇所
src/app/(public)/actions/analytics/config.ts           — 1箇所
src/app/(public)/actions/section.ts                    — 7箇所
src/app/(public)/actions/post.ts                       — 2箇所
src/app/(public)/actions/news.ts                       — 2箇所
src/app/(admin)/admin/(dashboard)/layout.tsx            — 1箇所
```

### 必須 import 追加パターン

各ファイルで `CACHE_LIFE` が未 import の場合：

```typescript
import { CACHE_LIFE } from "@/shared/lib/constants";
```

---

## Phase 3: P1 — Zod / Stripe マイナー修正（2 ファイル）

### 問題 A: section.ts Zod デフォルト値

```typescript
// src/app/(admin)/admin/.../section.ts — 修正前
initialOpen: z.enum(faqInitialOpenValues).default("none");

// 修正後（Prisma enum 定数 or defined const を使用）
initialOpen: z.enum(faqInitialOpenValues).default(faqInitialOpenValues[0]);
// または faqInitialOpenValues の定義に合わせた enum 定数
```

### 問題 B: stripe.ts インライン enum

```typescript
// src/shared/lib/stripe.ts — 修正前
z.enum(["jpy", "usd", "eur"]).default("jpy");

// 修正後
const SUPPORTED_CURRENCIES = ["jpy", "usd", "eur"] as const;
// スキーマ内で
z.enum(SUPPORTED_CURRENCIES).default("jpy");
```

---

## Phase 4: P3 — Tailwind text-white 修正（9 箇所）

### 問題

画像オーバーレイ・カルーセル等で `text-white` ハードコード使用。
Tailwind ルールでは `gray-*` / `white` 等のデフォルトカラー禁止。

### 対象

| ファイル                      | インスタンス数 | 修正案                                                      |
| ----------------------------- | -------------- | ----------------------------------------------------------- |
| `MediaGrid.tsx`               | 8              | 画像オーバーレイ → `text-primary-foreground` または CSS変数 |
| `SpaceDetail.tsx`             | 4              | 画像オーバーレイ → `text-primary-foreground`                |
| `AnnouncementBarCarousel.tsx` | 1              | → `text-primary-foreground`                                 |

**注**: DesignPreview.tsx / ResponsiveSidebar.tsx は意図的な例外（表示目的 / ダーク背景）として修正対象外。

---

## Intentional Exceptions（修正不要）

| 箇所                                          | 理由                                            |
| --------------------------------------------- | ----------------------------------------------- |
| `HighlightPlugin.tsx` / `TextColorPlugin.tsx` | カラーピッカースウォッチ（ルール明示的例外）    |
| `WebVitalsReporter.tsx` NODE_ENV              | Client Component — `NEXT_PUBLIC_*` 経由が正しい |
| `DesignPreview.tsx` white overlay             | アナウンスバープレビュー表示目的                |
| `ResponsiveSidebar.tsx` text-white            | `bg-sidebar-accent`（濃色背景）上で視認性確保   |
| `isProduction()` の SKIP_ENV_VALIDATION       | 意図的ランタイムガード                          |

---

## Testing Strategy

- Phase 1〜4 各完了後: `bun run validate` (type-check + lint)
- 全 phase 完了後: `bun run validate && bun run build`
- 目視確認: 管理画面ログイン → ダッシュボード表示

---

## File Summary

修正ファイル数: **約 20 ファイル**
修正箇所数: **約 60〜65 箇所**
リスクレベル: **低**（定数置き換え・import追加が中心）
