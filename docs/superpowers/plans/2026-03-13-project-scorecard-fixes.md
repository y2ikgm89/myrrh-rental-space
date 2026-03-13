# Project Scorecard Fixes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** スコアカード分析で発見された全 Critical/Warning 問題を修正し、プロジェクトスコアを 85 → 90+ に引き上げる

**Architecture:** 7つの独立タスクを並行実行。破壊的変更許可（後方互換性不要）。

**Tech Stack:** Next.js 16, React 19, TypeScript 6, Better Auth 1.5, Zod 4

---

## Chunk 1: Security & Code Quality Fixes

### Task 1: Instagram OAuth 認証ガード追加 [P0/Security]

**Files:**

- Modify: `src/app/api/instagram/oauth/authorize/route.ts`
- Modify: `src/app/api/instagram/oauth/callback/route.ts`

- [ ] **Step 1: authorize/route.ts に認証チェック追加**

`GET()` 関数の冒頭（環境変数チェックの前）に認証ガードを追加:

```typescript
import { getSession, getRoleFromSession } from "@/shared/lib/auth-helpers";
import { isAdminRole, isSuperAdminRole } from "@/admin/lib/role-guards";

export async function GET(request: Request) {
  // 認証チェック（管理者のみ）
  const session = await getSession(request.headers);
  const role = getRoleFromSession(session);
  if (
    !session?.user ||
    !role ||
    (!isAdminRole(role) && !isSuperAdminRole(role))
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // ... existing code
}
```

注意: `GET()` のシグネチャを `GET(request: Request)` に変更（`request` が必要）。

- [ ] **Step 2: callback/route.ts に認証チェック追加**

`GET(request: NextRequest)` の冒頭（query パース前）に同様の認証ガードを追加:

```typescript
import { getSession, getRoleFromSession } from "@/shared/lib/auth-helpers";
import { isAdminRole, isSuperAdminRole } from "@/admin/lib/role-guards";

// GET 関数冒頭に追加:
const session = await getSession(request.headers);
const role = getRoleFromSession(session);
if (
  !session?.user ||
  !role ||
  (!isAdminRole(role) && !isSuperAdminRole(role))
) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

- [ ] **Step 3: 型チェック確認**

Run: `bun run type-check`

- [ ] **Step 4: コミット**

```bash
git add src/app/api/instagram/oauth/authorize/route.ts src/app/api/instagram/oauth/callback/route.ts
git commit -m "fix(security): add auth guard to Instagram OAuth routes"
```

---

### Task 2: AnnouncementBarCarousel 非null アサーション修正 [P2/Quality]

**Files:**

- Modify: `src/app/(public)/_shared/components/AnnouncementBarCarousel.tsx:122`

- [ ] **Step 1: 非null アサーション除去**

```typescript
// Before (line 122):
return now >= startAt! && now <= endAt!;

// After:
return startAt !== null && endAt !== null && now >= startAt && now <= endAt;
```

上のガード条件で `!startAt && !endAt`、`startAt && !endAt`、`!startAt && endAt` は全て返却済み。
残るケースは両方 non-null のみだが TypeScript の narrowing が届かないため明示ガード。

- [ ] **Step 2: 型チェック確認**

Run: `bun run type-check`

- [ ] **Step 3: コミット**

```bash
git add 'src/app/(public)/_shared/components/AnnouncementBarCarousel.tsx'
git commit -m "fix(type-safety): remove non-null assertion in AnnouncementBarCarousel"
```

---

## Chunk 2: Performance Fixes

### Task 3: Zod を公開ページ Client Component から除去 [P0/Performance]

**Files:**

- Create: `src/shared/lib/validations/section-parsers.ts` — Zod 不要の parse ヘルパー
- Modify: `src/shared/lib/validations/section.ts` — parse 関数を section-parsers.ts から re-export に変更
- Modify: 11 public Client Components — import 先を `section-parsers.ts` に変更

**戦略:** `section-options.ts` の `*Values` 配列（`as const`）を使った `Array.includes` ベースの parse 関数を新ファイルに作成。`section.ts` の既存 parse 関数は新ファイルからの re-export に置換（admin 側の import パスは変更不要）。

- [ ] **Step 1: section-parsers.ts を作成**

`src/shared/lib/validations/section-parsers.ts` に Zod 不使用の parse 関数群を作成。
パターン:

```typescript
import {
  contentPositionValues,
  type ContentPosition,
  // ... 全 *Values + 型
} from "./section-options";

function createParser<T extends string>(
  values: readonly T[],
  defaultValue: T,
): (value: string) => T {
  return (value: string): T =>
    (values as readonly string[]).includes(value) ? (value as T) : defaultValue;
}

export const parseContentPosition = createParser(
  contentPositionValues,
  "center",
);
export const parseOverlayStyle = createParser(overlayStyleValues, "gradient");
// ... 全 parse 関数
```

注意: 戻り型は `section.ts` の既存型（`HeroParallaxConfig["contentPosition"]` 等）と互換。
`as T` の型アサーションは `includes` チェック後なので安全（プロジェクトルールの例外対象）。

代替: `as` を避けるなら型ガードパターンを使用:

```typescript
function createParser<T extends string>(
  values: readonly T[],
  defaultValue: T,
): (value: string) => T {
  const set = new Set<string>(values);
  return (value: string): T => (set.has(value) ? (value as T) : defaultValue);
}
```

ここでの `as T` は `Set.has(value)` で検証済みのため安全。型安全性ルールでは「検証なしの `as`」を禁止しており、検証済みのナローイングは許容対象。

- [ ] **Step 2: section.ts の parse 関数を re-export に置換**

`section.ts` の parse 関数群（line 905-1044）を削除し、`section-parsers.ts` から re-export:

```typescript
// section.ts 末尾に追加（既存 parse 関数を全削除後）
export {
  parseCardStyle,
  parseBorderRadius,
  parseContainerWidth,
  parseGapSize,
  parseContentPosition,
  parseOverlayStyle,
  parseHeroParallaxHeight,
  parseFeaturesLayout,
  parseFaqInitialOpen,
  parseGalleryHoverEffect,
  parseConceptLayout,
  parseImageAspect,
  parseSpaceImageAspect,
  parsePostImageAspect,
  parseGalleryImageAspect,
  parseShowcaseImageAspect,
  parseHeroVariant,
  parseContactFormVariant,
  parseFaqVariant,
  parseImagePosition,
  parseTextAlign,
  parseHeroHeight,
  parseMaxWidth,
  parsePadding,
  parseSpaceLayout,
  parseNewsLayout,
  parsePostLayout,
  parseCtaVariant,
  parseGalleryLayout,
  parseGalleryGap,
  parseTestimonialLayout,
  parseTestimonialVariant,
  parseMapHeight,
  parseEmbedAspectRatio,
} from "./section-parsers";
```

同時に、parse 関数で使用されていた Zod enum スキーマ変数（`cardStyleOptionsSchema` 等）のうち他で使われていないものを削除。

- [ ] **Step 3: 公開ページ Client Components の import を更新**

11 ファイルの import を `@/shared/lib/validations/section` から `@/shared/lib/validations/section-parsers` に変更（parse 関数のみ）。型 import は `section` のまま。

対象ファイル:

- `HeroSection.tsx` — `parseContentPosition`, `parseOverlayStyle`, `parseHeroParallaxHeight`
- `SpaceShowcase.tsx` — `parseShowcaseImageAspect`, `parseCardStyle`, `parseBorderRadius`
- `SpaceListSection.tsx` — `parseSpaceImageAspect`, `parseCardStyle`, `parseBorderRadius`, `parseGapSize`
- `MapSection.tsx` — `parseBorderRadius`
- `InstagramSection.tsx` — `parseGapSize`
- `GallerySection.tsx` — `parseGalleryImageAspect`, `parseGalleryHoverEffect`, `parseGalleryLayout`, `parseGalleryGap`, `parseBorderRadius`
- `FeaturesSection.tsx` — `parseFeaturesLayout`
- `FaqListSection.tsx` — `parseFaqInitialOpen`, `parseContainerWidth`, `parseFaqVariant`
- `ConceptSection.tsx` — `parseConceptLayout`, `parseImagePosition`, `parseTextAlign`
- `PostListSection.tsx` — `parsePostImageAspect`
- `EmbedSection.tsx` — `parseBorderRadius`

- [ ] **Step 4: 型チェック + ビルド確認**

Run: `bun run type-check && bun run build`

ビルドで公開ページの First Load JS が減少していることを確認（Zod チャンクが公開ルートから消えること）。

- [ ] **Step 5: コミット**

```bash
git add src/shared/lib/validations/section-parsers.ts src/shared/lib/validations/section.ts 'src/app/(public)/_components/'
git commit -m "perf: remove Zod from public page client bundles

Extract parse helpers to section-parsers.ts using Array.includes
instead of Zod safeParse. Saves ~74KB gzip from all public pages."
```

---

### Task 4: Lexical barrel import tree-shaking 修正 [P1/Performance]

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/settings/_components/sections/index.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/settings/site/page.tsx` (if using barrel for Layout/Header/Footer/Sidebar)

- [ ] **Step 1: barrel から Layout 系セクションを除去**

`settings/_components/sections/index.ts` から以下4行を削除:

```typescript
// 削除:
export { LayoutSection } from "./LayoutSection";
export { HeaderSection } from "./HeaderSection";
export { FooterSection } from "./FooterSection";
export { SidebarSection } from "./SidebarSection";
```

- [ ] **Step 2: site/page.tsx で直接 import に変更**

`settings/site/page.tsx` が barrel 経由で import している場合、直接 import に変更:

```typescript
import { LayoutSection } from "../_components/sections/LayoutSection";
import { HeaderSection } from "../_components/sections/HeaderSection";
import { FooterSection } from "../_components/sections/FooterSection";
import { SidebarSection } from "../_components/sections/SidebarSection";
```

- [ ] **Step 3: 他の settings ページが影響を受けないか確認**

Run: `bun run type-check`

- [ ] **Step 4: コミット**

```bash
git add 'src/app/(admin)/admin/(dashboard)/settings/'
git commit -m "perf: remove Lexical-dependent sections from barrel import

Direct imports for LayoutSection/HeaderSection/FooterSection/SidebarSection
prevent ~239KB gzip Lexical+Prism leak into non-editor settings pages."
```

---

## Chunk 3: Route Structure Fixes

### Task 5: global-error.tsx をインラインスタイルに変更 [P1/Route]

**Files:**

- Modify: `src/app/global-error.tsx`

- [ ] **Step 1: CSS 変数依存の Tailwind クラスをインラインスタイルに置換**

`global-error.tsx` は Root Layout の外で動くため CSS 変数が存在しない。
全 Tailwind クラスをインラインスタイルに変更:

```tsx
"use client";

import { useEffect, startTransition } from "react";
import { logger } from "@/shared/lib/logger";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    logger.error("Global error boundary triggered", {
      error: error.message,
      digest: error.digest,
    });
  }, [error]);

  const handleReset = () => {
    startTransition(() => {
      reset();
    });
  };

  return (
    <html lang="ja">
      <body
        style={{
          fontFamily: '"Helvetica Neue", Arial, sans-serif',
          margin: 0,
          backgroundColor: "#fafafa",
          color: "#111",
        }}
      >
        <div
          style={{
            display: "flex",
            minHeight: "100vh",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 1rem",
          }}
        >
          <div
            style={{ width: "100%", maxWidth: "28rem", textAlign: "center" }}
          >
            <div style={{ marginBottom: "2rem" }}>
              <svg
                style={{
                  margin: "0 auto",
                  height: "6rem",
                  width: "6rem",
                  color: "#dc2626",
                }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>

            <h1
              style={{
                marginBottom: "1rem",
                fontSize: "1.5rem",
                fontWeight: "bold",
              }}
            >
              予期しないエラーが発生しました
            </h1>

            <p style={{ marginBottom: "2rem", color: "#666" }}>
              申し訳ございません。システムエラーが発生しました。
              <br />
              しばらく時間をおいてから再度お試しください。
            </p>

            {error.digest && (
              <p
                style={{
                  marginBottom: "1.5rem",
                  fontSize: "0.875rem",
                  color: "#999",
                }}
              >
                エラーID: {error.digest}
              </p>
            )}

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              <button
                onClick={handleReset}
                style={{
                  padding: "0.75rem 1.5rem",
                  borderRadius: "0.5rem",
                  border: "none",
                  backgroundColor: "#111",
                  color: "#fff",
                  fontWeight: 500,
                  cursor: "pointer",
                  fontSize: "1rem",
                }}
              >
                再試行する
              </button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/"
                style={{
                  display: "inline-block",
                  padding: "0.75rem 1.5rem",
                  borderRadius: "0.5rem",
                  border: "1px solid #ddd",
                  backgroundColor: "#fff",
                  color: "#111",
                  fontWeight: 500,
                  textDecoration: "none",
                  fontSize: "1rem",
                  textAlign: "center",
                }}
              >
                ホームに戻る
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: 型チェック確認**

Run: `bun run type-check`

- [ ] **Step 3: コミット**

```bash
git add src/app/global-error.tsx
git commit -m "fix(ui): replace CSS-variable Tailwind classes with inline styles in global-error

global-error.tsx renders outside Root Layouts where CSS variables
are unavailable. All classes were silently failing."
```

---

### Task 6: (auth)/ に error.tsx / not-found.tsx 追加 [P2/Route]

**Files:**

- Create: `src/app/(admin)/admin/(auth)/error.tsx`
- Create: `src/app/(admin)/admin/(auth)/not-found.tsx`

- [ ] **Step 1: error.tsx 作成**

認証画面用のシンプルなエラーバウンダリ（ダッシュボードリンクではなくログインリンク）:

```tsx
"use client";

import { startTransition } from "react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AuthError({ error, reset }: ErrorProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <h1 className="mb-4 text-2xl font-bold tracking-tight text-foreground">
          エラーが発生しました
        </h1>
        <p className="mb-8 text-muted-foreground">
          申し訳ございません。しばらく時間をおいてから再度お試しください。
        </p>
        {error.digest && (
          <p className="mb-6 text-sm text-muted-foreground/70">
            エラーID: {error.digest}
          </p>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            onClick={() => startTransition(() => reset())}
            className="rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            再試行する
          </button>
          <a
            href="/admin/login"
            className="rounded-lg border border-border bg-card px-6 py-3 font-medium text-card-foreground transition-colors hover:bg-accent"
          >
            ログインに戻る
          </a>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: not-found.tsx 作成**

```tsx
import Link from "next/link";

export default function AuthNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <h1 className="mb-4 text-2xl font-bold tracking-tight text-foreground">
          ページが見つかりません
        </h1>
        <p className="mb-8 text-muted-foreground">
          お探しのページは存在しないか、移動された可能性があります。
        </p>
        <Link
          href="/admin/login"
          className="rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          ログインに戻る
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 型チェック確認**

Run: `bun run type-check`

- [ ] **Step 4: コミット**

```bash
git add 'src/app/(admin)/admin/(auth)/error.tsx' 'src/app/(admin)/admin/(auth)/not-found.tsx'
git commit -m "fix(route): add error/not-found boundaries to auth route group

Prevents unauthenticated users from seeing dashboard-styled
404/error pages when accessing invalid auth paths."
```

---

### Task 7: pages/[slug] 非ルートディレクトリを \_ prefix に変更 [P2/Route]

**Files:**

- Rename: `src/app/(admin)/admin/(dashboard)/pages/[slug]/seo/` → `src/app/(admin)/admin/(dashboard)/pages/[slug]/_seo/`
- Rename: `src/app/(admin)/admin/(dashboard)/pages/[slug]/sections/` → `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/`

- [ ] **Step 1: ディレクトリ名を変更**

```bash
git mv 'src/app/(admin)/admin/(dashboard)/pages/[slug]/seo' 'src/app/(admin)/admin/(dashboard)/pages/[slug]/_seo'
git mv 'src/app/(admin)/admin/(dashboard)/pages/[slug]/sections' 'src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections'
```

- [ ] **Step 2: import パスの更新**

`pages/[slug]/` 内のファイルで `./seo/` や `./sections/` を参照している import を `_seo` / `_sections` に更新。

- [ ] **Step 3: 型チェック確認**

Run: `bun run type-check`

- [ ] **Step 4: コミット**

```bash
git add -A 'src/app/(admin)/admin/(dashboard)/pages/[slug]/'
git commit -m "refactor(route): prefix non-route dirs with _ (seo → _seo, sections → _sections)

These directories contain only components, no page.tsx.
Without _ prefix they sit in the route tree as invalid routes."
```
