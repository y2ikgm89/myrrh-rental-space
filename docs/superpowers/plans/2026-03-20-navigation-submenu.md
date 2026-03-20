# Navigation Submenu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 公開ヘッダーに Radix NavigationMenu ベースのサブメニュー（ドロップダウン）を実装する。

**Architecture:** Radix `@radix-ui/react-navigation-menu` をデスクトップのドロップダウンに使用。モバイルは既存フルスクリーンオーバーレイ内に useState トグルのアコーディオン展開を追加。DB/クエリ/管理画面は変更なし。

**Tech Stack:** `@radix-ui/react-navigation-menu`, React 19, GSAP (既存スクロール制御), Tailwind CSS 4

**Spec:** `docs/superpowers/specs/2026-03-20-navigation-submenu-design.md`

---

## File Structure

| ファイル                                                      | 操作    | 責務                                                       |
| ------------------------------------------------------------- | ------- | ---------------------------------------------------------- |
| `package.json`                                                | Modify  | `@radix-ui/react-navigation-menu` 追加                     |
| `src/app/(public)/_shared/components/layouts/site-header.tsx` | Rewrite | NavigationMenu ベースのヘッダー（デスクトップ + モバイル） |

**変更しない:** `queries.ts`, `commands.ts`, `schema.prisma`, 管理画面ナビゲーション全般, `site-footer.tsx`

---

### Task 1: Install Radix NavigationMenu

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Install package**

```bash
bun add @radix-ui/react-navigation-menu
```

- [ ] **Step 2: Verify installation**

```bash
grep "react-navigation-menu" package.json
```

Expected: `"@radix-ui/react-navigation-menu": "^1.x.x"` が表示される

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "chore: add @radix-ui/react-navigation-menu"
```

---

### Task 2: Rewrite site-header.tsx with NavigationMenu

**Files:**

- Rewrite: `src/app/(public)/_shared/components/layouts/site-header.tsx`

**Reference:**

- 現在のファイル: 397行。GSAP スクロール制御 + フルスクリーンモバイルオーバーレイ
- `PublicNavItem` 型: `{ id, label, url, isExternal, children: readonly PublicNavItem[] }`
- デザイントークン: `public.css` の `--color-background`, `--color-surface`, `--color-border`, `--color-muted-foreground`, `--color-accent`

- [ ] **Step 1: Read current implementation**

```bash
# 現在の site-header.tsx を読み、以下を保持する要素を確認:
# - headerRef + useGSAP + ScrollTrigger によるスクロール制御
# - ResizeObserver による --header-height CSS 変数
# - transparent/solid backgroundMode
# - auto_hide/hide_on_scroll/always_visible scrollBehavior
# - FALLBACK_NAV
# - openMenu/closeMenu GSAP アニメーション
```

Read: `src/app/(public)/_shared/components/layouts/site-header.tsx`

- [ ] **Step 2: Rewrite the full component**

`site-header.tsx` を全面書き直し。以下の構造:

```tsx
"use client";

import { useState, useRef, useEffect, useId, type ReactElement } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import * as NavigationMenuPrimitive from "@radix-ui/react-navigation-menu";
import { useGSAP } from "@gsap/react";
import { gsap, ScrollTrigger } from "@/public/lib/gsap-config";
import { useMotionPreference } from "@/public/hooks/use-motion-preference";
import { EASE } from "@/public/lib/animations";
import type { PublicNavItem } from "@/shared/domain/navigation/queries";
import { HeaderScrollBehavior, HeaderBackgroundMode } from "@/shared/db/enums";
import { cn } from "@/shared/lib/cn";
import { Button } from "../design-system/button";

// --- Props & Constants (既存を維持) ---

interface HeaderProps {
  readonly brandName?: string;
  readonly navItems?: readonly PublicNavItem[];
  readonly scrollBehavior?: HeaderScrollBehavior;
  readonly backgroundMode?: HeaderBackgroundMode;
}

const FALLBACK_NAV: readonly PublicNavItem[] = [
  { id: "home", label: "Home", url: "/", isExternal: false, children: [] },
  {
    id: "reservation",
    label: "Reservation",
    url: "/reservation",
    isExternal: false,
    children: [],
  },
  {
    id: "contact",
    label: "Contact",
    url: "/contact",
    isExternal: false,
    children: [],
  },
];

const SCROLL_THRESHOLD = 80;
const HIDE_THRESHOLD = 150;

// --- NavLink helper (子なしアイテム用) ---

function NavLink({ item }: { readonly item: PublicNavItem }) {
  const className =
    "text-xs uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-accent";

  if (item.isExternal) {
    return (
      <NavigationMenuPrimitive.Link asChild>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className={className}
        >
          {item.label}
          <span className="sr-only"> (新しいタブで開く)</span>
        </a>
      </NavigationMenuPrimitive.Link>
    );
  }

  return (
    <NavigationMenuPrimitive.Link asChild>
      <Link href={item.url} className={className}>
        {item.label}
      </Link>
    </NavigationMenuPrimitive.Link>
  );
}

// --- DropdownLink helper (子アイテム用) ---

function DropdownLink({ item }: { readonly item: PublicNavItem }) {
  const className =
    "block rounded-sm px-3 py-2 text-sm text-foreground transition-colors hover:bg-surface";

  if (item.isExternal) {
    return (
      <NavigationMenuPrimitive.Link asChild>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className={className}
        >
          {item.label}
          <span className="sr-only"> (新しいタブで開く)</span>
        </a>
      </NavigationMenuPrimitive.Link>
    );
  }

  return (
    <NavigationMenuPrimitive.Link asChild>
      <Link href={item.url} className={className}>
        {item.label}
      </Link>
    </NavigationMenuPrimitive.Link>
  );
}

// --- MobileNavItem (アコーディオン展開) ---

function MobileNavItem({
  item,
  onNavigate,
}: {
  readonly item: PublicNavItem;
  readonly onNavigate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = item.children.length > 0;
  const contentId = useId();
  const linkClassName =
    "font-heading text-2xl uppercase tracking-[0.2em] text-foreground transition-colors hover:text-accent";

  if (!hasChildren) {
    if (item.isExternal) {
      return (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          data-menu-link=""
          onClick={onNavigate}
          className={linkClassName}
        >
          {item.label}
          <span className="sr-only"> (新しいタブで開く)</span>
        </a>
      );
    }
    return (
      <Link
        href={item.url}
        data-menu-link=""
        onClick={onNavigate}
        className={linkClassName}
      >
        {item.label}
      </Link>
    );
  }

  // 子メニュー持ち: タップで展開
  return (
    <div data-menu-link="" className="flex flex-col items-center">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        aria-controls={contentId}
        className={cn(linkClassName, "flex items-center gap-2")}
      >
        {item.label}
        <ChevronDown
          className={cn(
            "h-5 w-5 transition-transform duration-200",
            expanded && "rotate-180",
          )}
        />
      </button>
      {expanded && (
        <div id={contentId} className="mt-4 flex flex-col items-center gap-3">
          {item.children.map((child) =>
            child.isExternal ? (
              <a
                key={child.id}
                href={child.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onNavigate}
                className="text-xl text-muted-foreground transition-colors hover:text-accent"
              >
                {child.label}
                <span className="sr-only"> (新しいタブで開く)</span>
              </a>
            ) : (
              <Link
                key={child.id}
                href={child.url}
                onClick={onNavigate}
                className="text-xl text-muted-foreground transition-colors hover:text-accent"
              >
                {child.label}
              </Link>
            ),
          )}
        </div>
      )}
    </div>
  );
}

// --- Header (メインコンポーネント) ---

export function Header({
  brandName = "MYRRH",
  navItems,
  scrollBehavior = HeaderScrollBehavior.always_visible,
  backgroundMode = HeaderBackgroundMode.solid,
}: HeaderProps): ReactElement {
  const items = navItems ?? FALLBACK_NAV;
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const motionOk = useMotionPreference();

  // ---- 以下、既存ロジックをそのまま維持 ----
  // menuOpenRef (ScrollTrigger 用)
  // ResizeObserver (--header-height)
  // useGSAP + ScrollTrigger (スクロール制御)
  // openMenu / closeMenu (GSAP アニメーション)
  // ---- ここまで既存コードコピー ----

  return (
    <>
      <header
        ref={headerRef}
        className={cn(
          "sticky top-[var(--announcement-bar-height,0px)] z-40 transition-[background-color,backdrop-filter,box-shadow,translate] duration-300",
          backgroundMode === HeaderBackgroundMode.transparent
            ? "bg-transparent"
            : "bg-background",
        )}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 md:px-8 md:py-5">
          <Link
            href="/"
            className="font-heading text-lg tracking-[0.15em] text-foreground"
          >
            {brandName}
          </Link>

          {/* Desktop navigation — Radix NavigationMenu */}
          <div className="hidden items-center gap-8 md:flex">
            <NavigationMenuPrimitive.Root>
              <NavigationMenuPrimitive.List className="flex items-center gap-8">
                {items.map((item) =>
                  item.children.length > 0 ? (
                    <NavigationMenuPrimitive.Item key={item.id}>
                      <NavigationMenuPrimitive.Trigger className="group flex items-center gap-1 text-xs uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-accent">
                        {item.label}
                        <ChevronDown
                          className="h-3 w-3 transition-transform duration-200 group-data-[state=open]:rotate-180"
                          aria-hidden
                        />
                      </NavigationMenuPrimitive.Trigger>
                      <NavigationMenuPrimitive.Content className="absolute top-full mt-2 min-w-[180px] rounded-md border border-border bg-background p-2 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
                        <ul className="space-y-0.5">
                          {item.children.map((child) => (
                            <li key={child.id}>
                              <DropdownLink item={child} />
                            </li>
                          ))}
                        </ul>
                      </NavigationMenuPrimitive.Content>
                    </NavigationMenuPrimitive.Item>
                  ) : (
                    <NavigationMenuPrimitive.Item key={item.id}>
                      <NavLink item={item} />
                    </NavigationMenuPrimitive.Item>
                  ),
                )}
              </NavigationMenuPrimitive.List>

              {/* Viewport — Radix がドロップダウンを描画するコンテナ */}
              <NavigationMenuPrimitive.Viewport className="absolute left-0 top-full" />
            </NavigationMenuPrimitive.Root>

            <Button variant="primary" size="sm" href="/reservation">
              予約する
            </Button>
          </div>

          {/* Hamburger (mobile) — 既存コードを維持 */}
          <button
            type="button"
            onClick={openMenu}
            className="flex h-10 w-10 items-center justify-center md:hidden"
            aria-label="メニューを開く"
            aria-expanded={menuOpen}
          >
            <div className="flex flex-col gap-1.5">
              <span className="block h-px w-5 bg-foreground" />
              <span className="block h-px w-5 bg-foreground" />
            </div>
          </button>
        </div>
      </header>

      {/* Mobile fullscreen overlay — MobileNavItem に置換 */}
      {menuOpen && (
        <div
          ref={overlayRef}
          className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-xl md:hidden"
        >
          {/* ヘッダー部分（ロゴ + 閉じるボタン）— 既存コードを維持 */}
          <div className="flex items-center justify-between px-5 py-4">
            <Link
              href="/"
              className="font-heading text-lg tracking-[0.15em] text-foreground"
              onClick={closeMenu}
            >
              {brandName}
            </Link>
            <button
              type="button"
              onClick={closeMenu}
              className="flex h-10 w-10 items-center justify-center"
              aria-label="メニューを閉じる"
            >
              <svg
                className="h-5 w-5 text-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <nav className="flex flex-1 flex-col items-center justify-center gap-8">
            <div data-menu-link="">
              <Button variant="primary" size="md" href="/reservation">
                予約する
              </Button>
            </div>
            {items.map((item) => (
              <MobileNavItem key={item.id} item={item} onNavigate={closeMenu} />
            ))}
          </nav>
        </div>
      )}
    </>
  );
}
```

**重要ポイント:**

- GSAP スクロール制御（`useGSAP`, `ScrollTrigger`, `menuOpenRef`, `ResizeObserver`）は既存コードをそのままコピー
- `openMenu` / `closeMenu` の GSAP アニメーションも既存コードをそのままコピー
- デスクトップ nav を `<nav>` → `NavigationMenuPrimitive.Root` に置換
- モバイルオーバーレイの `items.map(...)` を `MobileNavItem` コンポーネントに置換
- `aria-label="メインナビゲーション"` は Radix が `<nav>` を自動生成するため明示不要（Radix Root が `<nav>` をレンダリング）

- [ ] **Step 3: Run type-check**

```bash
bun run type-check
```

Expected: エラーなし

- [ ] **Step 4: Run lint**

```bash
bun run validate
```

Expected: エラーなし

- [ ] **Step 5: Visual verification with Playwright**

```
# Playwright MCP でブラウザを開いて確認:
1. http://localhost:3000 にアクセス
2. デスクトップ表示でヘッダーを確認
3. 子メニュー持ちアイテムにホバーしてドロップダウン表示を確認
4. モバイルビュー (375px) でハンバーガーメニューを開き、サブメニュー展開を確認
```

- [ ] **Step 6: Commit**

```bash
git add 'src/app/(public)/_shared/components/layouts/site-header.tsx'
git commit -m "feat(public): add submenu dropdowns to header with Radix NavigationMenu"
```

---

### Task 3: Final Verification

- [ ] **Step 1: Full validation**

```bash
bun run validate && bun run build
```

Expected: 型チェック・lint・ビルド全て成功

- [ ] **Step 2: Accessibility check**

Radix NavigationMenu のデフォルト動作を確認:

- Tab キーでナビゲーションアイテム間を移動
- Enter/Space でドロップダウンを開閉
- Escape でドロップダウンを閉じる
- Arrow keys でドロップダウン内を移動

- [ ] **Step 3: Cross-browser visual check (optional)**

Playwright でスクリーンショットを撮って確認。
