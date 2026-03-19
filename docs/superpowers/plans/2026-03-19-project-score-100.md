# Project Score 100 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** スコアレポートの全問題点を解消し、全観点で 100/100 を達成する

**Architecture:** 7つの独立した改善領域を並列実行可能なタスクに分解。破壊的変更を許容し、後方互換性ハックを排除してクリーンな実装にする。パフォーマンス改善は `@next/bundle-analyzer` による可視化後に Phase 2 で実施。

**Tech Stack:** Next.js 16.1.6, React 19.2, TypeScript 6.0, nuqs 2.8.8, Zod 4.3

---

## Chunk 1: Code Quality + Accessibility (Tasks 1-7)

### Task 1: filter-bar.tsx — nuqs パターン準拠に書き換え

**Files:**

- Modify: `src/app/(public)/_shared/components/ui/filter-bar.tsx`
- Modify: `src/app/(public)/_shared/lib/search-params.ts`

**問題:** `new URLSearchParams` + `router.push` の直接操作は `nuqs-patterns.md` 違反

- [ ] **Step 1: search-params.ts にカテゴリパーサーを追加**

```typescript
// src/app/(public)/_shared/lib/search-params.ts
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server";

export const spaceSearchParams = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  category: parseAsString,
});

// 既存を維持（他ページが使用中）
export const paginationSearchParams = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
});
```

- [ ] **Step 2: filter-bar.tsx を nuqs useQueryState に書き換え**

```typescript
"use client";

import { useQueryState, parseAsString } from "nuqs";
import { useTransition } from "react";

interface FilterOption {
  readonly id: string;
  readonly name: string;
}

interface FilterBarProps {
  readonly categories: readonly FilterOption[];
}

export function FilterBar({ categories }: FilterBarProps) {
  const [activeCategory, setActiveCategory] = useQueryState(
    "category",
    parseAsString.withOptions({ history: "push", shallow: false }),
  );
  const [isPending, startTransition] = useTransition();

  function handleFilter(categoryId: string | null) {
    startTransition(() => {
      void setActiveCategory(categoryId);
    });
  }

  return (
    <div
      className="flex flex-wrap gap-2"
      role="group"
      aria-label="カテゴリフィルタ"
    >
      <button
        type="button"
        onClick={() => handleFilter(null)}
        className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
          !activeCategory
            ? "bg-accent text-accent-foreground"
            : "bg-surface text-muted-foreground hover:text-foreground"
        }`}
      >
        すべて
      </button>
      {categories.map((cat) => (
        <button
          key={cat.id}
          type="button"
          onClick={() => handleFilter(cat.id)}
          className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            activeCategory === cat.id
              ? "bg-accent text-accent-foreground"
              : "bg-surface text-muted-foreground hover:text-foreground"
          }`}
        >
          {cat.name}
        </button>
      ))}
      {isPending ? (
        <span className="text-sm text-muted-foreground">読み込み中...</span>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: spaces/page.tsx が spaceSearchParams を使用しているか確認し、必要なら更新**

`spaces/page.tsx` が `searchParams` から `category` を読んでいる箇所を `spaceSearchParams.parse(searchParams)` に統一する。

- [ ] **Step 4: type-check 実行**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 5: Commit**

```
feat(public): replace URLSearchParams with nuqs in FilterBar
```

---

### Task 2: page-hero.tsx — text-white をセマンティックトークンに置換

**Files:**

- Modify: `src/app/(public)/_shared/components/layouts/page-hero.tsx`
- Modify: `src/app/(public)/_styles/public.css`

**問題:** `text-white` はハードコードカラー。overlay 上テキスト用のセマンティックトークンが必要。

- [ ] **Step 1: public.css に overlay-foreground トークンを追加**

`@theme` ブロック内に追加:

```css
--color-overlay-foreground: oklch(0.985 0 0);
```

- [ ] **Step 2: page-hero.tsx の text-white を置換**

```diff
- <h1 className="... text-white">
+ <h1 className="... text-overlay-foreground">

- <p className="... text-white/80">
+ <p className="... text-overlay-foreground/80">
```

- [ ] **Step 3: type-check 実行**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 4: Commit**

```
fix(public): replace hardcoded text-white with semantic overlay-foreground token
```

---

### Task 3: image-gallery.tsx — WCAG 2.4.3 フォーカス管理の実装

**Files:**

- Modify: `src/app/(public)/_shared/components/ui/image-gallery.tsx`

**問題:** LightboxOverlay にフォーカストラップ・自動フォーカス・Escape キー処理が不十分。

- [ ] **Step 1: LightboxOverlay にフォーカス管理を追加**

```typescript
function LightboxOverlay({
  currentImage,
  alt,
  hasMultiple,
  onClose,
  onPrev,
  onNext,
  onKeyDown,
}: {
  readonly currentImage: string;
  readonly alt: string;
  readonly hasMultiple: boolean;
  readonly onClose: () => void;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly onKeyDown: (e: KeyboardEvent) => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    // ダイアログ開幕時にフォーカスを移動
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // フォーカストラップ
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    function handleFocusTrap(e: globalThis.KeyboardEvent) {
      if (e.key !== "Tab") return;
      const focusable = dialog!.querySelectorAll<HTMLElement>(
        'button, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleFocusTrap);
    return () => document.removeEventListener("keydown", handleFocusTrap);
  }, []);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-label="画像ギャラリー"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay"
      onClick={onClose}
      onKeyDown={onKeyDown}
      tabIndex={-1}
    >
      <div
        className="relative max-h-[90vh] max-w-[90vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <Image
          src={currentImage}
          alt={alt}
          width={1200}
          height={800}
          className="max-h-[90vh] w-auto rounded-lg object-contain"
        />
      </div>
      <button
        ref={closeButtonRef}
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-background/80 p-2 text-foreground"
        aria-label="閉じる"
      >
        <X className="h-6 w-6" />
      </button>
      {hasMultiple ? (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPrev();
            }}
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 text-foreground"
            aria-label="前の画像"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNext();
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 text-foreground"
            aria-label="次の画像"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: import に useRef を追加**

```diff
- import { useState, useEffect } from "react";
+ import { useState, useEffect, useRef } from "react";
```

- [ ] **Step 3: type-check 実行**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 4: Commit**

```
fix(a11y): add focus trap and auto-focus to lightbox dialog
```

---

### Task 4: Pagination.tsx — hover コントラスト修正

**Files:**

- Modify: `src/app/(public)/_shared/components/Pagination.tsx`

**問題:** `hover:bg-accent` + `text-muted-foreground` でホバー時コントラスト不足（WCAG AA 4.5:1 未満の可能性）。

- [ ] **Step 1: hover 時に text-foreground を追加**

全ての `hover:bg-accent` に `hover:text-accent-foreground` を追加:

```diff
- className="... text-muted-foreground transition-colors hover:bg-accent"
+ className="... text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
```

該当箇所（5箇所）:

- Line 37: 「前へ」リンク
- Line 47: ページ1リンク
- Line 64: 非アクティブページリンク
- Line 79: 最終ページリンク
- Line 89: 「次へ」リンク

- [ ] **Step 2: type-check 実行**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```
fix(a11y): ensure WCAG AA contrast ratio on pagination hover state
```

---

### Task 5: error.tsx / not-found.tsx — hover コントラスト + button type 修正

**Files:**

- Modify: `src/app/(public)/error.tsx`
- Modify: `src/app/(public)/not-found.tsx`

**問題:**

1. `error.tsx:86` の `<button>` に `type` 属性がない
2. 両ファイルの `hover:bg-accent` にもコントラスト修正が必要

- [ ] **Step 1: error.tsx に type="button" と hover テキスト色を追加**

```diff
- <button
-   onClick={handleReset}
-   className="rounded-full border border-accent bg-transparent px-6 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent ..."
+ <button
+   type="button"
+   onClick={handleReset}
+   className="rounded-full border border-accent bg-transparent px-6 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground ..."
```

`Link` (line 92-96) にも同様の hover 修正:

```diff
- className="... text-muted-foreground transition-colors hover:bg-accent ..."
+ className="... text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground ..."
```

- [ ] **Step 2: not-found.tsx の hover テキスト色を修正**

Line 43 と 49 の `hover:bg-accent` に `hover:text-accent-foreground` を追加。

- [ ] **Step 3: type-check 実行**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 4: Commit**

```
fix(a11y): add type="button" and fix hover contrast in error/not-found pages
```

---

### Task 6: SpaceGrid.tsx (PascalCase) — デッドコード削除

**Files:**

- Delete: `src/app/(public)/spaces/_components/SpaceGrid.tsx`

**問題:** `spaces/page.tsx` は `space-grid.tsx`（Server Component版）を使用。PascalCase の Client Component版は未使用。

- [ ] **Step 1: SpaceGrid.tsx がどこからも import されていないことを確認**

`Grep` で `SpaceGrid` の import を検索。`space-grid.tsx`（kebab-case）のみ使用されていることを確認。

- [ ] **Step 2: ファイルを削除**

```bash
git rm 'src/app/(public)/spaces/_components/SpaceGrid.tsx'
```

- [ ] **Step 3: type-check 実行**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 4: Commit**

```
chore: remove unused SpaceGrid.tsx (PascalCase dead code)
```

---

### Task 7: LenisProvider.tsx — subscribe/getSnapshot 参照安定化

**Files:**

- Modify: `src/app/(public)/_shared/components/providers/LenisProvider.tsx`

**問題:** `subscribe` と `getSnapshot` が毎レンダーで新しい関数参照を作成。`useSyncExternalStore` が不要な再サブスクライブを行う可能性。

- [ ] **Step 1: subscribe と getSnapshot を useCallback でラップ**

React Compiler が通常は自動メモ化するが、`useSyncExternalStore` の `subscribe` は参照安定性が必須（react-patterns.md の例外事項）。

```diff
+ import { useEffect, useRef, useSyncExternalStore, useCallback } from "react";

- const subscribe = (listener: () => void) => {
-   storeRef.current.listeners.add(listener);
-   return () => {
-     storeRef.current.listeners.delete(listener);
-   };
- };
+ const subscribe = useCallback((listener: () => void) => {
+   storeRef.current.listeners.add(listener);
+   return () => {
+     storeRef.current.listeners.delete(listener);
+   };
+ }, []);

- const getSnapshot = (): LenisContextValue | null => {
-   return storeRef.current.value;
- };
+ const getSnapshot = useCallback((): LenisContextValue | null => {
+   return storeRef.current.value;
+ }, []);

- const getServerSnapshot = (): LenisContextValue | null => {
-   return null;
- };
+ const getServerSnapshot = useCallback((): LenisContextValue | null => {
+   return null;
+ }, []);
```

- [ ] **Step 2: type-check 実行**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```
fix: stabilize useSyncExternalStore callbacks in LenisProvider
```

---

## Chunk 2: Security + Cache + Route Structure (Tasks 8-14)

### Task 8: bulkDeleteMedia — UUID バリデーション追加

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/media.ts`

**問題:** `ids: string[]` を UUID スキーマでバリデーションしていない。

- [ ] **Step 1: Zod バリデーションを追加**

```typescript
import { z } from "zod/v4";

const bulkDeleteSchema = z.array(z.string().uuid()).min(1);

export async function bulkDeleteMedia(
  ids: string[],
): Promise<MutationResult<{ deleted: number }>> {
  const parsed = bulkDeleteSchema.safeParse(ids);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "media",
    action: "delete",
    execute: async () => bulkDeleteMediaCommand(parsed.data),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.MEDIA);
    },
  });
}
```

- [ ] **Step 2: import を確認・追加**

`z` と `createValidationMutationError` の import が存在するか確認。

- [ ] **Step 3: type-check 実行**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 4: Commit**

```
fix(security): add UUID validation to bulkDeleteMedia
```

---

### Task 9: announcement-bar クエリにキャッシュ追加

**Files:**

- Modify: `src/shared/domain/settings/announcement-bar.ts`

**問題:** `getAnnouncementBars()` と `getAnnouncementBarById()` に `'use cache'` がない。

**注意:** これらは管理画面から呼ばれる関数。`safeFetch` ではなく `prisma` を直接使用でよいが、`'use cache'` + `cacheTag` + `cacheLife` は追加すべき。ただし管理画面のクエリは頻繁に更新されるため `CACHE_LIFE.DYNAMIC_DATA` を使用。

- [ ] **Step 1: getAnnouncementBars に use cache を追加**

```typescript
export async function getAnnouncementBars(): Promise<
  Serialized<AnnouncementBarData>[]
> {
  "use cache";
  cacheLife(CACHE_LIFE.DYNAMIC_DATA);
  cacheTag(CACHE_TAGS.ANNOUNCEMENT_BAR);

  const items = await safeFetch({
    fetch: () =>
      prisma.announcementBar.findMany({
        select: announcementBarSelect,
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getAnnouncementBars",
  });

  return toPlainArray(items);
}
```

- [ ] **Step 2: getAnnouncementBarById に use cache を追加**

```typescript
export async function getAnnouncementBarById(
  id: string,
): Promise<Serialized<AnnouncementBarData> | null> {
  "use cache";
  cacheLife(CACHE_LIFE.DYNAMIC_DATA);
  cacheTag(CACHE_TAGS.ANNOUNCEMENT_BAR);

  return toPlainObject(
    await safeFetch({
      fetch: () =>
        prisma.announcementBar.findUnique({
          where: { id },
          select: announcementBarSelect,
        }),
      fallback: null,
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      operationName: "getAnnouncementBarById",
    }),
  );
}
```

- [ ] **Step 3: 必要な import の追加**

`cacheLife`, `cacheTag`, `safeFetch`, `ErrorCategory`, `ErrorSeverity`, `CACHE_LIFE`, `CACHE_TAGS` が import されているか確認し、不足分を追加。

- [ ] **Step 4: type-check 実行**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 5: Commit**

```
feat(cache): add 'use cache' to announcement-bar admin queries
```

---

### Task 10: locations/ — error.tsx 追加 + 孤立 loading.tsx 対応

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/locations/error.tsx`

**問題:** `locations/` ディレクトリに `error.tsx` がない。他の全リソースは持っている。`loading.tsx` はリスト一覧ページ（`page.tsx`）がなくても `[id]/page.tsx` と `new/page.tsx` の共通 Suspense boundary として機能するため維持。

- [ ] **Step 1: 他リソースの error.tsx をテンプレートとして確認**

`spaces/error.tsx` の内容を確認し、同パターンで作成。

- [ ] **Step 2: locations/error.tsx を作成**

```typescript
"use client";

export { default } from "../../_shared/components/ResourceError";
```

（他リソースが `ResourceError` re-export パターンを使用している場合。直接実装の場合はそのパターンに従う。）

- [ ] **Step 3: type-check 実行**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 4: Commit**

```
fix(admin): add missing error.tsx for locations route
```

---

### Task 11: space-categories/ → \_space-categories/ リネーム

**Files:**

- Rename: `src/app/(admin)/admin/(dashboard)/space-categories/` → `src/app/(admin)/admin/(dashboard)/_space-categories/`
- Modify: `space-categories` を import している全ファイル

**問題:** `space-categories/` は `page.tsx` を持たないコンポーネント専用ディレクトリだが、`_` プレフィックスがない。Next.js がルートとして解釈する可能性がある。

- [ ] **Step 1: space-categories/ からの import パスを全検索**

`Grep` で `space-categories/_components` を含む import を検索。

- [ ] **Step 2: ディレクトリをリネーム**

```bash
git mv 'src/app/(admin)/admin/(dashboard)/space-categories' 'src/app/(admin)/admin/(dashboard)/_space-categories'
```

- [ ] **Step 3: import パスを一括更新**

全ての `space-categories/_components` → `_space-categories/_components` に置換。

- [ ] **Step 4: type-check 実行**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 5: Commit**

```
refactor(admin): rename space-categories/ to _space-categories/ (private folder)
```

---

### Task 12: faq ディレクトリ構造の整理（情報整備）

**Files:**

- 確認: `src/app/(admin)/admin/(dashboard)/faq/categories/[id]/`
- 確認: `src/app/(admin)/admin/(dashboard)/faq/items/[id]/`

**問題:** `[id]/page.tsx` がなく、`[id]/edit/` のみ存在。URL `/admin/faq/categories/:id` が 404。

**対応方針:** `[id]/page.tsx` なしは意図的（編集パスのコンテナのみ）。この構造は Next.js で合法であり、URL にアクセスされることもないため修正不要。ただしドキュメントに記載する。

- [ ] **Step 1: 確認のみ — 修正不要と判断**

この Task はスキップ可能。route-structure-reviewer の INFO として記録のみ。

---

### Task 13: staging CRON_SECRET 必須化のドキュメント

**Files:**

- Modify: 既存のデプロイドキュメントまたは gotchas.md

**問題:** staging 環境で `CRON_SECRET` が未設定だとエンドポイントが無認証になる。

- [ ] **Step 1: gotchas.md にデプロイセクション追記**

```markdown
- **staging 環境にも `CRON_SECRET` を設定必須** — `proxy.ts` の cron 認証は `CRON_SECRET` が未設定の場合スキップされる。本番は起動時チェックで保護されるが、staging（Internet 公開の Cloud Run インスタンス等）は明示設定が必要
```

- [ ] **Step 2: Commit**

```
docs: document CRON_SECRET requirement for staging environments
```

---

### Task 14: settings/schemas.ts のドメイン別分割

**Files:**

- Split: `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/schemas.ts` (529行)
- Create: `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/schemas/` ディレクトリ

**問題:** 単一ファイルが 500 行を超えている。

**対応:** `/split-action-file` スキルの適用、またはドメイン別に手動分割。

- [ ] **Step 1: schemas.ts の構造を分析**

各スキーマのドメインを特定（basic, discount, email, google-calendar, stripe 等）。

- [ ] **Step 2: ドメイン別ファイルに分割**

```
schemas/
├── basic.ts          # BusinessSettings, LocationSettings
├── discount.ts       # CouponSettings, TaxSettings
├── email.ts          # EmailSettings
├── google-calendar.ts # GoogleCalendarSettings
├── stripe.ts         # StripeSettings
└── index.ts          # barrel re-export（既存 import パス維持）
```

- [ ] **Step 3: barrel index.ts で全スキーマを re-export**

既存の import パス `from "./schemas"` が `from "./schemas/index"` として解決されるため、変更なし。

- [ ] **Step 4: type-check 実行**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 5: Commit**

```
refactor(admin): split settings/schemas.ts into domain-specific files
```

---

## Chunk 3: Performance — Bundle Analysis + Optimization (Tasks 15-17)

### Task 15: @next/bundle-analyzer セットアップと分析

**Files:**

- Modify: `next.config.ts`

**問題:** 5.8MB の Shared First Load JS の内訳が不明。

- [ ] **Step 1: next.config.ts に bundle-analyzer を追加**

```typescript
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env["ANALYZE"] === "true",
});

// ... existing config ...

export default withBundleAnalyzer(nextConfig);
```

- [ ] **Step 2: 分析ビルドを実行**

```bash
ANALYZE=true SKIP_ENV_VALIDATION=true bun run build
```

ブラウザで `.next/analyze/client.html` を確認し、各チャンクの内容を特定。

- [ ] **Step 3: 結果を記録**

チャンク内容のメモを取り、Task 16-17 の対応方針を決定。

- [ ] **Step 4: Commit**

```
chore: add @next/bundle-analyzer for build analysis
```

---

### Task 16: 大型ライブラリの dynamic import 化

**Files:**

- 対象は Task 15 の分析結果に依存

**想定される対応（分析結果で確定）:**

1. **Lexical エディタ** — 管理画面のみ使用。公開ページにバンドルされていないか確認
2. **Recharts** — 管理画面ダッシュボードのみ。`next/dynamic({ ssr: false })` 化
3. **GSAP / Lenis** — 公開ページのみ使用。管理画面にバンドルされていないか確認
4. **three / @react-three/fiber / pixi.js** — 実際に使用箇所がなければ `optimizePackageImports` から削除

- [ ] **Step 1: 未使用パッケージを optimizePackageImports から削除**

Three.js / PixiJS が実際にどこからも import されていなければ削除:

```diff
- "three",
- "@react-three/fiber",
- "@react-three/drei",
- "pixi.js",
```

- [ ] **Step 2: admin/public のクロスバンドルを確認**

`@/admin` コンポーネントが `(public)/layout.tsx` の依存ツリーに含まれていないか確認。

- [ ] **Step 3: 確認された問題に対して dynamic import を適用**

該当コンポーネントに `next/dynamic` を適用。

- [ ] **Step 4: ビルド後のサイズを確認**

```bash
SKIP_ENV_VALIDATION=true bun run build
```

First Load JS の変化を記録。

- [ ] **Step 5: Commit**

```
perf: optimize bundle size with dynamic imports and unused package removal
```

---

### Task 17: 最終検証

**Files:** None (verification only)

- [ ] **Step 1: validate 実行**

```bash
bun run validate
```

Expected: PASS

- [ ] **Step 2: build 実行**

```bash
SKIP_ENV_VALIDATION=true bun run build
```

Expected: PASS

- [ ] **Step 3: テスト実行**

```bash
bun run test
```

Expected: PASS

- [ ] **Step 4: lint 警告の確認**

24件の `@eslint-react/purity` 警告が残っているか確認。これらは Server Component の `new Date()` で false positive のため修正不要（warn レベル）。

- [ ] **Step 5: Final Commit**

全変更がコミット済みであることを確認。
