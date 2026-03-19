# お知らせバー CSS Animation 再実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** お知らせバーから GSAP 依存を除去し、CSS Animation ベースでクリーンに再実装する

**Architecture:** GSAP の `fromTo` トランジションを CSS `transition` + `data-*` 属性に置き換え。インライン `<style>` キーフレームを `public.css` に集約。モジュールレベルのミュータブル変数をカスタムフックに閉じ込め。単一 517 行コンポーネントを責務ごとに分割。

**Tech Stack:** React 19, CSS Transitions/Animations, Tailwind CSS 4, useSyncExternalStore

---

## ファイル構成

### 新規作成

| ファイル                                                                     | 責務                                                        |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `src/app/(public)/_shared/components/announcement-bar/announcement-bar.tsx`  | 表示コンポーネント（UI のみ）                               |
| `src/app/(public)/_shared/components/announcement-bar/use-carousel.ts`       | カルーセルロジック（index 管理、自動切替、一時停止）        |
| `src/app/(public)/_shared/components/announcement-bar/use-dismissed-bars.ts` | dismiss 管理（useSyncExternalStore + sessionStorage）       |
| `src/app/(public)/_shared/components/announcement-bar/types.ts`              | 型定義（AnnouncementBarItem, CarouselSettings）             |
| `src/app/(public)/_shared/components/announcement-bar/styles.ts`             | スタイル計算ロジック（Tailwind クラス + inline style 生成） |
| `src/app/(public)/_shared/components/announcement-bar/index.ts`              | barrel export                                               |

### 変更

| ファイル                                                         | 変更内容                                                                                            |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `src/app/(public)/_shared/components/AnnouncementBarWrapper.tsx` | import パスを新コンポーネントに変更、`dynamic` 不要化                                               |
| `src/app/(public)/_styles/public.css`                            | `@keyframes` 追加（stripe-slide, gradient-flow, glass-shimmer, bar-fade, bar-slide-x, bar-slide-y） |
| `src/shared/lib/announcement-bar-utils.ts`                       | GSAP 関連削除、管理画面が使う定数・バリデーションのみ残す                                           |

### 削除

| ファイル                                                          | 理由                       |
| ----------------------------------------------------------------- | -------------------------- |
| `src/app/(public)/_shared/components/AnnouncementBarCarousel.tsx` | 新コンポーネントに完全置換 |

---

## Task 1: CSS キーフレームを public.css に追加

**Files:**

- Modify: `src/app/(public)/_styles/public.css:220-233`

- [ ] **Step 1: キーフレーム定義を追加**

`public.css` の Keyframes セクション（`maintenance-fade-in` の後）に以下を追加:

```css
/* Announcement Bar — carousel transitions */
@keyframes bar-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes bar-slide-x-in {
  from {
    opacity: 0;
    translate: 50px 0;
  }
  to {
    opacity: 1;
    translate: 0 0;
  }
}

@keyframes bar-slide-y-in {
  from {
    opacity: 0;
    translate: 0 -20px;
  }
  to {
    opacity: 1;
    translate: 0 0;
  }
}

/* Announcement Bar — design style animations */
@keyframes stripe-slide {
  from {
    background-position: 0 0;
  }
  to {
    background-position: 28.28px 0;
  }
}

@keyframes gradient-flow {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}

@keyframes glass-shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}
```

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`
Expected: PASS（CSS のみの変更）

- [ ] **Step 3: コミット**

```bash
git add 'src/app/(public)/_styles/public.css'
git commit -m "refactor(announcement-bar): move keyframes from inline <style> to public.css"
```

---

## Task 2: 型定義を独立ファイルに抽出

**Files:**

- Create: `src/app/(public)/_shared/components/announcement-bar/types.ts`

- [ ] **Step 1: 型定義ファイルを作成**

```typescript
import type {
  AnnouncementBarAnimation,
  AnnouncementBarDesignStyle,
} from "@/shared/db/enums";

export interface AnnouncementBarItem {
  id: string;
  message: string;
  type: string;
  linkUrl?: string | null;
  linkText?: string | null;
  bgColor?: string | null;
  textColor?: string | null;
  startAt?: string | null;
  endAt?: string | null;
}

export interface CarouselSettings {
  animation: AnnouncementBarAnimation;
  duration: number;
  autoPlay: boolean;
  pauseOnHover: boolean;
  showArrows: boolean;
  showIndicator: boolean;
  designStyle: AnnouncementBarDesignStyle;
  bgColor: string | null;
  textColor: string | null;
  stripeColor: string | null;
  stripeAnimation: boolean;
  gradientAnimation: boolean;
  glassAnimation: boolean;
  sticky: boolean;
}
```

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add 'src/app/(public)/_shared/components/announcement-bar/types.ts'
git commit -m "refactor(announcement-bar): extract type definitions"
```

---

## Task 3: dismiss 管理フックを作成

**Files:**

- Create: `src/app/(public)/_shared/components/announcement-bar/use-dismissed-bars.ts`

モジュールレベルのミュータブル変数を排除し、`useSyncExternalStore` パターンをカスタムフックに閉じ込める。

- [ ] **Step 1: フックを作成**

```typescript
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "dismissed-announcement-bars";
const CHANGE_EVENT = "announcement-bar-dismissed";

// useSyncExternalStore の参照安定性のためモジュールスコープに配置
// （React 公式パターン: subscribe/getSnapshot はコンポーネント外で定義）
let cachedIds: string[] = [];
let cachedJson = "";

function getSnapshot(): string[] {
  if (typeof window === "undefined") return cachedIds;
  try {
    const json = sessionStorage.getItem(STORAGE_KEY) ?? "";
    if (json !== cachedJson) {
      cachedJson = json;
      cachedIds = json ? JSON.parse(json) : [];
    }
    return cachedIds;
  } catch {
    return cachedIds;
  }
}

function getServerSnapshot(): string[] {
  return [];
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

export function dismissBar(id: string): void {
  try {
    const current = getSnapshot();
    if (current.includes(id)) return;
    const next = [...current, id];
    const json = JSON.stringify(next);
    sessionStorage.setItem(STORAGE_KEY, json);
    cachedJson = json;
    cachedIds = next;
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // sessionStorage unavailable
  }
}

export function useDismissedBars(): string[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
```

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add 'src/app/(public)/_shared/components/announcement-bar/use-dismissed-bars.ts'
git commit -m "refactor(announcement-bar): extract dismiss hook with useSyncExternalStore"
```

---

## Task 4: カルーセルロジックフックを作成

**Files:**

- Create: `src/app/(public)/_shared/components/announcement-bar/use-carousel.ts`

- [ ] **Step 1: フックを作成**

```typescript
import { useState, useEffect, useRef } from "react";
import type { AnnouncementBarItem } from "./types";

interface UseCarouselOptions {
  bars: readonly AnnouncementBarItem[];
  autoPlay: boolean;
  duration: number;
  isPaused: boolean;
}

interface UseCarouselReturn {
  currentIndex: number;
  currentBar: AnnouncementBarItem | undefined;
  /** true on the render immediately after currentBar changed (for CSS animation trigger) */
  isTransitioning: boolean;
  goNext: () => void;
  goPrev: () => void;
  total: number;
}

export function useCarousel({
  bars,
  autoPlay,
  duration,
  isPaused,
}: UseCarouselOptions): UseCarouselReturn {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const prevBarIdRef = useRef<string | null>(null);

  const total = bars.length;
  const safeIndex = total === 0 ? 0 : currentIndex >= total ? 0 : currentIndex;
  const currentBar = bars[safeIndex];

  // CSS animation trigger: currentBar が変わったら isTransitioning を true にし、
  // animationend で false に戻す（コンポーネント側で onAnimationEnd を設定）
  useEffect(() => {
    if (!currentBar) return;
    if (prevBarIdRef.current === null) {
      prevBarIdRef.current = currentBar.id;
      return;
    }
    if (prevBarIdRef.current === currentBar.id) return;
    prevBarIdRef.current = currentBar.id;
    setIsTransitioning(true);
  }, [currentBar]);

  // Auto-play timer
  useEffect(() => {
    if (!autoPlay || isPaused || total <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % total);
    }, duration);
    return () => clearInterval(timer);
  }, [autoPlay, duration, isPaused, total]);

  const goNext = () => {
    if (total <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % total);
  };

  const goPrev = () => {
    if (total <= 1) return;
    setCurrentIndex((prev) => (prev - 1 + total) % total);
  };

  return {
    currentIndex: safeIndex,
    currentBar,
    isTransitioning,
    goNext,
    goPrev,
    total,
  };
}

/** Call from onAnimationEnd to reset transition state */
export function useTransitionReset(
  setIsTransitioning: (v: boolean) => void,
): () => void {
  // 安定した参照を返す（React Compiler が最適化）
  return () => setIsTransitioning(false);
}
```

**注意**: `isTransitioning` は `useCarousel` 内で管理するが、リセットは `onAnimationEnd` イベントで行う。
ただし `setIsTransitioning` を外に露出するのは設計が漏れるので、`useCarousel` の戻り値に `onAnimationEnd` コールバックを含める形に修正:

```typescript
// 最終形: useCarousel の戻り値
interface UseCarouselReturn {
  currentIndex: number;
  currentBar: AnnouncementBarItem | undefined;
  isTransitioning: boolean;
  onAnimationEnd: () => void;
  goNext: () => void;
  goPrev: () => void;
  total: number;
}

// フック内で:
const onAnimationEnd = () => setIsTransitioning(false);
```

`useTransitionReset` は不要なので作成しない。

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add 'src/app/(public)/_shared/components/announcement-bar/use-carousel.ts'
git commit -m "refactor(announcement-bar): extract carousel logic hook"
```

---

## Task 5: スタイル計算ロジックを抽出

**Files:**

- Create: `src/app/(public)/_shared/components/announcement-bar/styles.ts`

旧 `announcement-bar-utils.ts` のうち公開コンポーネントが使う部分を移植。管理画面が使う定数は元ファイルに残す。

- [ ] **Step 1: スタイルモジュールを作成**

```typescript
import type { CSSProperties } from "react";
import { AnnouncementBarDesignStyle } from "@/shared/db/enums";
import { cn } from "@/shared/lib/cn";
import type { CarouselSettings, AnnouncementBarItem } from "./types";

// ---------------------------------------------------------------------------
// Type color config
// ---------------------------------------------------------------------------

interface TypeStyle {
  bg: string;
  text: string;
  hover: string;
  gradient: string;
  hex: string;
}

const DEFAULT_TYPE: TypeStyle = {
  bg: "bg-info",
  text: "text-info-foreground",
  hover: "hover:text-info-foreground/80",
  gradient: "from-info to-info/80",
  hex: "#2563eb",
};

const TYPE_STYLES: Record<string, TypeStyle> = {
  info: DEFAULT_TYPE,
  warning: {
    bg: "bg-warning",
    text: "text-warning-foreground",
    hover: "hover:text-warning-foreground/80",
    gradient: "from-warning to-warning/80",
    hex: "#f59e0b",
  },
  promo: {
    bg: "bg-success",
    text: "text-success-foreground",
    hover: "hover:text-success-foreground/80",
    gradient: "from-success to-success/80",
    hex: "#15803d",
  },
};

function getTypeStyle(type: string): TypeStyle {
  return TYPE_STYLES[type] ?? DEFAULT_TYPE;
}

// ---------------------------------------------------------------------------
// Design style → Tailwind classes
// ---------------------------------------------------------------------------

interface DesignStyleConfig {
  container: string;
  containerWithBg: (type: string) => string;
  border?: string;
}

const DESIGN_STYLES: Record<AnnouncementBarDesignStyle, DesignStyleConfig> = {
  solid: {
    container: "",
    containerWithBg: (type) => getTypeStyle(type).bg,
  },
  gradient: {
    container: "bg-gradient-to-r",
    containerWithBg: (type) => getTypeStyle(type).gradient,
  },
  outlined: {
    container: "bg-transparent border-y",
    containerWithBg: () => "",
    border: "border-current",
  },
  glass: {
    container: "backdrop-blur-md bg-card/10 border-y border-card/20",
    containerWithBg: () => "",
  },
  minimal: {
    container: "bg-transparent border-b",
    containerWithBg: () => "",
    border: "border-current/30",
  },
  striped: {
    container: "",
    containerWithBg: (type) => getTypeStyle(type).bg,
  },
};

// ---------------------------------------------------------------------------
// Striped style helper
// ---------------------------------------------------------------------------

function adjustBrightness(hex: string, amount: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, Math.max(0, (n >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (n & 0xff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BarStyles {
  className: string;
  style: CSSProperties;
  linkHoverClass: string;
  hasCustomText: boolean;
}

export function computeBarStyles(
  settings: CarouselSettings,
  bar: AnnouncementBarItem,
): BarStyles {
  const typeStyle = getTypeStyle(bar.type);
  const design = settings.designStyle;
  const config = DESIGN_STYLES[design];
  const hasCustomBg = !!settings.bgColor;
  const hasCustomText = !!settings.textColor;

  // --- inline styles ---
  let style: CSSProperties = {};
  if (settings.bgColor) style.backgroundColor = settings.bgColor;
  if (settings.textColor) style.color = settings.textColor;

  // Striped: background-image overlay
  if (design === AnnouncementBarDesignStyle.striped) {
    const baseHex = settings.bgColor || typeStyle.hex;
    const stripe = settings.stripeColor || adjustBrightness(baseHex, 20);
    style = {
      ...style,
      backgroundImage: `repeating-linear-gradient(-45deg, transparent, transparent 10px, ${stripe}20 10px, ${stripe}20 20px)`,
      ...(settings.stripeAnimation
        ? {
            backgroundSize: "28.28px 28.28px",
            animation: "stripe-slide 1s linear infinite",
          }
        : {}),
    };
  }

  // Gradient animation
  if (
    design === AnnouncementBarDesignStyle.gradient &&
    settings.gradientAnimation
  ) {
    style = {
      ...style,
      backgroundSize: "200% 100%",
      animation: "gradient-flow 3s ease infinite",
    };
  }

  // Glass shimmer (container needs relative + overflow-hidden)
  if (design === AnnouncementBarDesignStyle.glass && settings.glassAnimation) {
    style = { ...style, position: "relative", overflow: "hidden" };
  }

  // --- Tailwind class name ---
  const needsDefaultText =
    !hasCustomText &&
    (design === AnnouncementBarDesignStyle.solid ||
      design === AnnouncementBarDesignStyle.gradient ||
      design === AnnouncementBarDesignStyle.striped);

  const className = cn(
    "relative flex items-center justify-center px-4 py-2 text-sm",
    settings.sticky && "sticky top-0 z-41",
    config.container,
    !hasCustomBg && config.containerWithBg(bar.type),
    config.border,
    needsDefaultText && typeStyle.text,
    !hasCustomText &&
      (design === AnnouncementBarDesignStyle.outlined ||
        design === AnnouncementBarDesignStyle.minimal) &&
      "text-foreground",
    !hasCustomText &&
      design === AnnouncementBarDesignStyle.glass &&
      "text-card",
  );

  const linkHoverClass = !hasCustomText ? typeStyle.hover : "";

  return { className, style, linkHoverClass, hasCustomText };
}

/** CSS animation name for the carousel transition */
export function getTransitionAnimation(
  animation: CarouselSettings["animation"],
): string {
  const map = {
    fade: "bar-fade-in",
    slideX: "bar-slide-x-in",
    slideY: "bar-slide-y-in",
  } as const;
  return `${map[animation]} 0.3s ease-out`;
}
```

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add 'src/app/(public)/_shared/components/announcement-bar/styles.ts'
git commit -m "refactor(announcement-bar): extract style computation module"
```

---

## Task 6: メインコンポーネントを作成

**Files:**

- Create: `src/app/(public)/_shared/components/announcement-bar/announcement-bar.tsx`
- Create: `src/app/(public)/_shared/components/announcement-bar/index.ts`

- [ ] **Step 1: コンポーネントを作成**

```typescript
"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { AnnouncementBarDesignStyle } from "@/shared/db/enums";
import { useCarousel } from "./use-carousel";
import { useDismissedBars, dismissBar } from "./use-dismissed-bars";
import { computeBarStyles, getTransitionAnimation } from "./styles";
import type { AnnouncementBarItem, CarouselSettings } from "./types";

function isWithinDisplayPeriod(bar: AnnouncementBarItem): boolean {
  const now = new Date();
  const startAt = bar.startAt ? new Date(bar.startAt) : null;
  const endAt = bar.endAt ? new Date(bar.endAt) : null;
  if (!startAt && !endAt) return true;
  if (startAt && !endAt) return now >= startAt;
  if (!startAt && endAt) return now <= endAt;
  return startAt !== null && endAt !== null && now >= startAt && now <= endAt;
}

interface AnnouncementBarProps {
  readonly bars: AnnouncementBarItem[];
  readonly settings: CarouselSettings;
}

export function AnnouncementBar({ bars, settings }: AnnouncementBarProps) {
  const [isPaused, setIsPaused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dismissedIds = useDismissedBars();

  const visibleBars = bars.filter(
    (bar) => !dismissedIds.includes(bar.id) && isWithinDisplayPeriod(bar),
  );

  const { currentIndex, currentBar, isTransitioning, onAnimationEnd, goNext, goPrev, total } =
    useCarousel({
      bars: visibleBars,
      autoPlay: settings.autoPlay,
      duration: settings.duration,
      isPaused,
    });

  // Sticky: publish height as CSS custom property
  useEffect(() => {
    if (!settings.sticky) return;
    const el = containerRef.current;
    if (!el) return;

    if (visibleBars.length === 0) {
      document.documentElement.style.setProperty("--announcement-bar-height", "0px");
      return;
    }

    const update = () => {
      document.documentElement.style.setProperty(
        "--announcement-bar-height",
        `${el.getBoundingClientRect().height}px`,
      );
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();

    return () => {
      ro.disconnect();
      document.documentElement.style.setProperty("--announcement-bar-height", "0px");
    };
  }, [settings.sticky, visibleBars.length]);

  if (visibleBars.length === 0 || !currentBar) return null;

  const { className, style, linkHoverClass, hasCustomText } = computeBarStyles(settings, currentBar);
  const showNav = total > 1;

  return (
    <div
      ref={containerRef}
      className={className}
      style={style}
      role="alert"
      onMouseEnter={() => settings.pauseOnHover && setIsPaused(true)}
      onMouseLeave={() => settings.pauseOnHover && setIsPaused(false)}
    >
      {/* Glass shimmer overlay */}
      {settings.designStyle === AnnouncementBarDesignStyle.glass && settings.glassAnimation && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div
            className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-card/20 to-transparent"
            style={{ animation: "glass-shimmer 3s ease-in-out infinite" }}
          />
        </div>
      )}

      {/* Prev arrow */}
      {settings.showArrows && showNav && (
        <button
          type="button"
          onClick={goPrev}
          className={cn("absolute left-2 rounded-full p-1 transition-colors", !hasCustomText && "hover:bg-foreground/10")}
          aria-label="前のお知らせ"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}

      {/* Content with CSS transition */}
      <div className="mx-8 flex min-h-[1.5rem] items-center justify-center gap-2 overflow-hidden">
        <div
          className="flex items-center gap-2"
          style={isTransitioning ? { animation: getTransitionAnimation(settings.animation) } : undefined}
          onAnimationEnd={onAnimationEnd}
        >
          <span className="text-center">{currentBar.message}</span>
          {currentBar.linkUrl && currentBar.linkText && (
            <Link
              href={currentBar.linkUrl}
              className={cn(
                "ml-1 whitespace-nowrap underline underline-offset-2 transition-colors",
                linkHoverClass,
              )}
              target={currentBar.linkUrl.startsWith("http") ? "_blank" : undefined}
              rel={currentBar.linkUrl.startsWith("http") ? "noopener noreferrer" : undefined}
            >
              {currentBar.linkText}
            </Link>
          )}
        </div>
      </div>

      {/* Indicator */}
      {settings.showIndicator && showNav && (
        <span className="absolute right-12 text-xs">
          {currentIndex + 1}/{total}
        </span>
      )}

      {/* Next arrow */}
      {settings.showArrows && showNav && (
        <button
          type="button"
          onClick={goNext}
          className={cn("absolute right-6 rounded-full p-1 transition-colors", !hasCustomText && "hover:bg-foreground/10")}
          aria-label="次のお知らせ"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}

      {/* Dismiss */}
      <button
        type="button"
        onClick={() => dismissBar(currentBar.id)}
        className={cn("absolute right-2 rounded-full p-1 transition-colors", !hasCustomText && "hover:bg-foreground/10")}
        aria-label="閉じる"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: barrel を作成**

```typescript
// index.ts
export { AnnouncementBar } from "./announcement-bar";
export type { AnnouncementBarItem, CarouselSettings } from "./types";
```

- [ ] **Step 3: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add 'src/app/(public)/_shared/components/announcement-bar/'
git commit -m "feat(announcement-bar): create CSS-based announcement bar component"
```

---

## Task 7: Wrapper を新コンポーネントに接続

**Files:**

- Modify: `src/app/(public)/_shared/components/AnnouncementBarWrapper.tsx`

- [ ] **Step 1: import パスを変更**

`AnnouncementBarWrapper.tsx` を書き換え:

- `dynamic` import を通常 import に変更（GSAP 除去で遅延読み込みの必要なし）
- 型 import を新 `types.ts` から取得
- `validateAnimation` / `validateDesignStyle` は `announcement-bar-utils.ts` にそのまま残っているので import 維持

```typescript
import {
  AnnouncementBar,
  type CarouselSettings,
} from "./announcement-bar";
import {
  getActiveAnnouncementBars,
  getAnnouncementBarCarouselSettings,
} from "@/shared/domain/settings/announcement-bar";
import type { ReactElement } from "react";
import {
  validateAnimation,
  validateDesignStyle,
} from "@/shared/lib/announcement-bar-utils";
import { toISOString } from "@/shared/lib/serialize";

export async function AnnouncementBarWrapper(): Promise<ReactElement | null> {
  const [bars, dbSettings] = await Promise.all([
    getActiveAnnouncementBars(),
    getAnnouncementBarCarouselSettings(),
  ]);

  if (bars.length === 0) return null;

  const settings: CarouselSettings = {
    animation: validateAnimation(dbSettings.announcementBarAnimation),
    duration: dbSettings.announcementBarDuration,
    autoPlay: dbSettings.announcementBarAutoPlay,
    pauseOnHover: dbSettings.announcementBarPauseOnHover,
    showArrows: dbSettings.announcementBarShowArrows,
    showIndicator: dbSettings.announcementBarShowIndicator,
    designStyle: validateDesignStyle(dbSettings.announcementBarDesignStyle),
    bgColor: dbSettings.announcementBarBgColor,
    textColor: dbSettings.announcementBarTextColor,
    stripeColor: dbSettings.announcementBarStripeColor,
    stripeAnimation: dbSettings.announcementBarStripeAnimation,
    gradientAnimation: dbSettings.announcementBarGradientAnimation,
    glassAnimation: dbSettings.announcementBarGlassAnimation,
    sticky: dbSettings.announcementBarSticky,
  };

  return (
    <AnnouncementBar
      bars={bars.map((bar) => ({
        id: bar.id,
        message: bar.message,
        type: bar.type,
        linkUrl: bar.linkUrl,
        linkText: bar.linkText,
        bgColor: bar.bgColor,
        textColor: bar.textColor,
        startAt: toISOString(bar.startAt) ?? null,
        endAt: toISOString(bar.endAt) ?? null,
      }))}
      settings={settings}
    />
  );
}
```

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add 'src/app/(public)/_shared/components/AnnouncementBarWrapper.tsx'
git commit -m "refactor(announcement-bar): connect wrapper to new CSS-based component"
```

---

## Task 8: 旧コンポーネントを削除

**Files:**

- Delete: `src/app/(public)/_shared/components/AnnouncementBarCarousel.tsx`

- [ ] **Step 1: 旧ファイルを削除**

```bash
git rm 'src/app/(public)/_shared/components/AnnouncementBarCarousel.tsx'
```

- [ ] **Step 2: 旧ファイルへの参照がないことを確認**

Grep で `AnnouncementBarCarousel` を検索し、残存 import がないことを確認。

- [ ] **Step 3: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 4: コミット**

```bash
git commit -m "refactor(announcement-bar): remove old GSAP-based carousel component"
```

---

## Task 9: announcement-bar-utils.ts を整理

**Files:**

- Modify: `src/shared/lib/announcement-bar-utils.ts`

管理画面（`DesignPreview.tsx`, `AnnouncementBarManager.tsx`）が使う以下のみ残す:

- `TYPE_STYLES`, `DEFAULT_TYPE_STYLE`, `DESIGN_STYLE_CLASSES` — `DesignPreview.tsx` が import
- `getStripedStyle`, `getTypeHexColor`, `getGradientAnimationStyle`, `getGlassShimmerStyle` — `DesignPreview.tsx` / `AnnouncementBarManager.tsx` が import
- `validateAnimation`, `validateDesignStyle` — `AnnouncementBarWrapper.tsx` が import
- `TypeColorConfig` 型 — `DesignPreview.tsx` が import

つまり現状の `announcement-bar-utils.ts` は **全て管理画面から参照されている**。変更不要。

- [ ] **Step 1: import 状況を grep で確認**

管理画面側からの import が壊れていないことを確認。

- [ ] **Step 2: 型チェック + lint**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 3: コミット（変更がある場合のみ）**

---

## Task 10: 全体検証

**Files:** なし（検証のみ）

- [ ] **Step 1: validate**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 2: build**

Run: `bun run build`
Expected: PASS

- [ ] **Step 3: ブラウザで動作確認**

Playwright で `http://localhost:3000` を開き、お知らせバーのスクリーンショットを撮影:

- テキストが白で読めること
- 矢印クリックでバーが切り替わること（CSS アニメーション）
- 閉じるボタンで非表示になること

- [ ] **Step 4: 最終コミット（修正がある場合）**
