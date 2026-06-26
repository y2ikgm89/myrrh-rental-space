/**
 * SectionWrapper — セクション横断の layout / visibility / animation を統一適用
 *
 * 2 つの責務領域:
 *   - `layout: SectionLayoutConfig` — 外側 padding / containerWidth /
 *     hideOnMobile / hideOnDesktop / animateOnScroll
 *   - `style: SectionStylePayload` — 背景タイプ / テキスト揃え / customClass
 *
 * 両方指定時の優先順位:
 *   - padding / containerWidth は `layout` 優先
 *   - background / textAlign / customClass は `style` から
 *   - hideOnMobile / hideOnDesktop / animateOnScroll は `layout` のみ
 */

import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import { cn } from "@/shared/lib/cn";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";
import type {
  LayoutContainerWidth,
  LayoutAnimate,
  SectionLayoutConfig,
} from "@/shared/lib/sections/definitions/_shared/layout";

// =============================================================================
// Mapping tables — Layout
// =============================================================================

// セクション間の上下余白は SectionStack（親コンテナの統一 gap）が SSoT。
// SectionWrapper は内側 padding を持たない（背景塗りセクションが導入されたら
// 背景の内側余白だけここで復活させる想定）。

/** layout.containerWidth → max-w-* クラス */
const LAYOUT_CONTAINER_WIDTH_CLASSES: Record<LayoutContainerWidth, string> = {
  sm: "max-w-[var(--prose-narrow)]",
  md: "max-w-[var(--prose-medium)]",
  lg: "max-w-[var(--container-site)]",
  xl: "max-w-[var(--container-editorial)]",
  full: "max-w-none",
};

// =============================================================================
// Mapping tables — SectionStylePayload (background / typography)
// =============================================================================

const backgroundMap: Record<
  NonNullable<SectionStylePayload["background"]["type"]>,
  string
> = {
  default: "",
  surface: "bg-surface",
  muted: "bg-muted",
  gradient: "bg-accent/5",
  // image 背景は next/image fill で別途レンダリング（CSS background-image を使うと
  // AVIF/WebP 変換・srcset・device-size responsive を完全バイパスしてしまう）
  image: "",
};

const maxWidthMap: Record<
  NonNullable<SectionStylePayload["container"]["maxWidth"]>,
  string
> = {
  sm: "max-w-3xl",
  md: "max-w-4xl",
  editorial: "max-w-[var(--container-editorial)]",
  lg: "max-w-6xl",
  xl: "max-w-7xl",
  full: "max-w-full",
};

const textAlignMap: Record<
  NonNullable<SectionStylePayload["typography"]["textAlign"]>,
  string
> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

// =============================================================================
// Component
// =============================================================================

interface SectionWrapperProps {
  readonly style: SectionStylePayload;
  readonly children: ReactNode;
  readonly className?: string;
  /** 共通 layout / visibility / animation 設定 */
  readonly layout?: SectionLayoutConfig;
  /** 追加の inline style（config.backgroundColor 等） */
  readonly styleProp?: CSSProperties;
  /** コンテナ div を省略する場合に true（Hero 等の特殊レイアウト用） */
  readonly skipContainer?: boolean;
}

export function SectionWrapper({
  style,
  children,
  className,
  layout,
  styleProp,
  skipContainer,
}: SectionWrapperProps) {
  // ---- containerWidth ----
  const maxWidthClass = layout
    ? LAYOUT_CONTAINER_WIDTH_CLASSES[layout.containerWidth]
    : maxWidthMap[style.container.maxWidth];

  // ---- background / textAlign / customClass (style payload 由来、layout は触らない) ----
  const bgClass = backgroundMap[style.background.type];
  const alignClass =
    style.typography.textAlign !== "left"
      ? textAlignMap[style.typography.textAlign]
      : "";

  const bgImageUrl =
    style.background.type === "image" && style.background.imageUrl
      ? style.background.imageUrl
      : undefined;
  const hasBgImage = Boolean(bgImageUrl);
  const mergedStyle = styleProp;

  const showOverlay = hasBgImage && style.background.overlayOpacity > 0;

  // ---- visibility (layout のみ) ----
  const visibilityClass = layout
    ? cn(
        layout.hideOnMobile && "max-md:hidden",
        layout.hideOnDesktop && "md:hidden",
      )
    : "";

  const inner = skipContainer ? (
    children
  ) : (
    <div
      className={cn(
        "mx-auto ps-[var(--container-padding-start)] pe-[var(--container-padding-end)]",
        maxWidthClass,
      )}
    >
      {children}
    </div>
  );

  // ---- animation (layout のみ) ----
  const animate: LayoutAnimate = layout?.animateOnScroll ?? "none";
  const wrapped =
    animate === "none" ? (
      inner
    ) : (
      <ScrollReveal variant={animate}>{inner}</ScrollReveal>
    );

  return (
    <section
      className={cn(
        "relative",
        // 背景画像を持つときは `isolate` で stacking context を section 内に閉じ込め、
        // 内側 `-z-10` が祖先まで突き抜けないようにする（next/image fill canonical pattern）。
        hasBgImage && "isolate",
        bgClass,
        alignClass,
        visibilityClass,
        style.customClass,
        className,
      )}
      style={mergedStyle}
    >
      {bgImageUrl && (
        // next/image fill: AVIF/WebP + srcset + responsive を有効化する canonical pattern。
        // 親 <section> が `relative isolate` なので fill の position:absolute と -z-10 が
        // 正しく section 内に閉じる。
        // 公式: https://nextjs.org/docs/app/api-reference/components/image#fill
        <Image
          src={bgImageUrl}
          alt=""
          fill
          sizes="100vw"
          className="-z-10 object-cover"
          aria-hidden="true"
        />
      )}
      {showOverlay && (
        <div
          className="pointer-events-none absolute inset-0 bg-foreground"
          style={{ opacity: style.background.overlayOpacity / 100 }}
        />
      )}
      {wrapped}
    </section>
  );
}
