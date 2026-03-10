# 公開ページ / 管理画面 CSS完全分離計画

> 作成日: 2026-01-28
> ステータス: **完了** ✅

## 概要

公開ページと管理画面のCSSを完全に分離し、Next.js 16の「Multiple Root Layouts」パターンを採用する。
公開ページはAI生成を前提とし、管理画面との干渉を完全に排除する。

## 背景

### 現状の問題

```
src/app/
├── layout.tsx              # 共有Root Layout（html/body）
├── globals.css             # 共有CSS（Trust Blue テーマ）
├── (admin)/...
└── (public)/...
```

1. **globals.css が両方に適用** → 公開ページが管理画面のテーマに縛られる
2. **カラー変数が共有** → 顧客ブランドに合わせたカスタマイズ困難
3. **AI生成時の混乱** → どのスタイルが公開/管理用か不明確

### 目標

- **完全分離**: 公開ページと管理画面が互いに影響しない
- **AI生成対応**: 公開ページのCSSをAIが自由に生成可能
- **公式準拠**: Next.js 16 / Tailwind CSS 4 ベストプラクティス

## 公式ベストプラクティス

### Next.js 16: Multiple Root Layouts

> To create multiple root layouts, remove the top-level `layout.js` file, and add a `layout.js` file inside each route group. This is useful for partitioning an application into sections that have a completely different UI or experience. The `<html>` and `<body>` tags need to be added to each root layout.
>
> — [Next.js Documentation](https://nextjs.org/docs/app/building-your-application/routing/route-groups#creating-multiple-root-layouts)

**注意点:**

- 異なるRoot Layout間のナビゲーションは**フルページリロード**になる
- `/admin` と `/` の遷移はフルリロード → 管理画面と公開ページの分離に最適

### Tailwind CSS 4: CSS-first Configuration

```css
@import "tailwindcss";

@theme {
  --color-primary: oklch(0.72 0.11 221.19);
  /* カスタムテーマ定義 */
}
```

各Root Layoutで独自の`@theme`を定義可能。

## 新アーキテクチャ

### ディレクトリ構造

```
src/app/
├── (admin)/
│   ├── layout.tsx              # 管理画面 ROOT Layout（html/body）
│   ├── _styles/
│   │   └── admin.css           # 管理画面専用テーマ
│   └── admin/
│       ├── layout.tsx          # 管理画面共通（Toaster）
│       ├── (auth)/
│       │   └── layout.tsx
│       └── (dashboard)/
│           └── layout.tsx
│
└── (public)/
    ├── layout.tsx              # 公開ページ ROOT Layout（html/body）
    ├── _styles/
    │   └── public.css          # 公開ページテーマ（AI生成対象）
    └── ...

# 削除
src/app/layout.tsx              # 削除
src/app/globals.css             # 削除
```

### ファイル詳細

#### 1. `(admin)/layout.tsx` - 管理画面Root Layout

```tsx
import type { Metadata } from "next";
import type { ReactElement, ReactNode } from "react";
import { Noto_Sans_JP } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import "./_styles/admin.css";

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "管理画面",
    template: "%s | 管理画面",
  },
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return (
    <html lang="ja">
      <body className={`${notoSansJP.variable} font-sans antialiased`}>
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
    </html>
  );
}
```

#### 2. `(admin)/_styles/admin.css` - 管理画面テーマ

```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";

/* ==========================================================================
 * Swiss Industrial Admin - Trust Blue パレット
 * 管理画面専用テーマ（公開ページには影響しない）
 * ========================================================================== */

@theme {
  /* カラーシステム */
  --color-background: oklch(0.98 0.01 240);
  --color-foreground: oklch(0.2 0.02 260);
  --color-primary: oklch(0.55 0.2 260);
  --color-primary-foreground: oklch(1 0 0);
  /* ... 他のカラー定義 */

  /* サイドバー専用 */
  --color-sidebar-bg: oklch(0.15 0.03 260);
  --color-sidebar-text: oklch(0.9 0.01 260);
  --color-sidebar-accent: oklch(0.55 0.2 260);

  /* シャドウ・イージング */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.03);
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
}

@layer base {
  * {
    border-color: var(--color-border);
  }

  body {
    background-color: var(--color-background);
    color: var(--color-foreground);
  }
}
```

#### 3. `(public)/layout.tsx` - 公開ページRoot Layout

```tsx
import type { Metadata } from "next";
import type { ReactElement, ReactNode } from "react";
import { Noto_Sans_JP } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { SITE_DEFAULTS } from "@/shared/lib/constants";
import "./_styles/public.css";

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: {
    default: SITE_DEFAULTS.name,
    template: `%s | ${SITE_DEFAULTS.name}`,
  },
  description: SITE_DEFAULTS.description,
};

export default async function PublicRootLayout({
  children,
}: {
  children: ReactNode;
}): Promise<ReactElement> {
  return (
    <html lang="ja">
      <head>{/* Preconnect hints */}</head>
      <body className={`${notoSansJP.variable} font-sans antialiased`}>
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
    </html>
  );
}
```

#### 4. `(public)/_styles/public.css` - 公開ページテーマ（AI生成対象）

```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";

/* ==========================================================================
 * 公開ページテーマ
 * このファイルはAI生成で顧客ブランドに合わせてカスタマイズ可能
 * ========================================================================== */

@theme {
  /* 顧客ブランドカラー（例） */
  --color-brand-primary: oklch(0.65 0.15 145);
  --color-brand-secondary: oklch(0.75 0.1 180);

  /* 基本カラー */
  --color-background: oklch(1 0 0);
  --color-foreground: oklch(0.15 0.02 260);

  /* ... 顧客要件に応じてAIが生成 */
}

@layer base {
  body {
    background-color: var(--color-background);
    color: var(--color-foreground);
  }
}
```

## 移行手順

### Phase 1: 準備（破壊的変更なし）

1. [ ] `(admin)/_styles/admin.css` 新規作成
2. [ ] `(public)/_styles/public.css` 新規作成
3. [ ] 両CSSファイルに現在のglobals.cssの内容をコピー・調整

### Phase 2: Root Layout分離

4. [ ] `(admin)/layout.tsx` を Root Layout に変更（html/body追加）
5. [ ] `(public)/layout.tsx` を Root Layout に変更（html/body追加）
6. [ ] 現在の `(admin)/admin/layout.tsx` の内容を調整
7. [ ] 現在の `(public)/layout.tsx` の内容を新しい子Layoutに移動

### Phase 3: 旧ファイル削除

8. [ ] `src/app/layout.tsx` 削除
9. [ ] `src/app/globals.css` 削除

### Phase 4: UIコンポーネント整理

10. [ ] 管理画面UIコンポーネントがadmin.cssの変数を参照していることを確認
11. [ ] 公開ページUIコンポーネントがpublic.cssの変数を参照していることを確認
12. [ ] 共有コンポーネント（`src/shared/`）の依存関係を確認

### Phase 5: ドキュメント更新

13. [ ] `CLAUDE.md` 更新
14. [ ] `.claude/rules/tailwind-patterns.md` 更新
15. [ ] `.claude/rules/ui-ux-patterns.md` 更新

## 影響範囲

### 変更ファイル

| ファイル                              | 変更内容                   |
| ------------------------------------- | -------------------------- |
| `src/app/layout.tsx`                  | **削除**                   |
| `src/app/globals.css`                 | **削除**                   |
| `src/app/(admin)/layout.tsx`          | **新規作成** (Root Layout) |
| `src/app/(admin)/_styles/admin.css`   | **新規作成**               |
| `src/app/(admin)/admin/layout.tsx`    | 簡略化                     |
| `src/app/(public)/layout.tsx`         | Root Layout化              |
| `src/app/(public)/_styles/public.css` | **新規作成**               |
| `CLAUDE.md`                           | 構造説明更新               |
| `.claude/rules/*.md`                  | 関連ルール更新             |

### 動作変更

| 操作                | Before                     | After                  |
| ------------------- | -------------------------- | ---------------------- |
| `/` → `/admin` 遷移 | クライアントナビゲーション | **フルページリロード** |
| `/admin` → `/` 遷移 | クライアントナビゲーション | **フルページリロード** |
| 公開ページ内遷移    | クライアントナビゲーション | 変更なし               |
| 管理画面内遷移      | クライアントナビゲーション | 変更なし               |

## リスクと対策

### リスク1: フルページリロードのUX影響

**対策**: 公開ページと管理画面の遷移は元々稀。ログイン/ログアウト時のみ。許容範囲。

### リスク2: 共有コンポーネントの依存関係

**対策**: `src/shared/components/` は最小限（SanitizedHtml）。CSS変数に依存しないことを確認。DiscountPriceDisplay はCSS変数依存のため public/admin 各自に配置済み。

### リスク3: 移行中の一時的な不整合

**対策**: 段階的移行。各Phaseでtype-check/lint/buildを実行。

## 検証チェックリスト

- [ ] `bun run type-check` 通過
- [ ] `bun run lint` 通過
- [ ] `bun run build` 通過
- [ ] 管理画面: ログインページ表示確認
- [ ] 管理画面: ダッシュボード表示確認
- [ ] 管理画面: サイドバースタイル確認
- [ ] 公開ページ: トップページ表示確認
- [ ] 公開ページ: Header/Footer表示確認
- [ ] 公開ページ ↔ 管理画面の遷移確認

## 参考資料

- [Next.js: Multiple Root Layouts](https://nextjs.org/docs/app/building-your-application/routing/route-groups#creating-multiple-root-layouts)
- [Next.js: Route Groups](https://nextjs.org/docs/app/building-your-application/routing/route-groups)
- [Tailwind CSS 4: Theme Configuration](https://tailwindcss.com/docs/theme)
- [Tailwind CSS 4: @theme Directive](https://tailwindcss.com/docs/functions-and-directives#theme)
