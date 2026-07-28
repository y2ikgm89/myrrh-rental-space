/**
 * SectionWrapper — セクション横断の layout / visibility / animation を統一適用
 *
 * 2 つの責務領域:
 *   - `layout: SectionLayoutConfig` — 外側 padding / containerWidth /
 *     hideOnMobile / hideOnDesktop / animateOnScroll
 *   - `style: SectionStylePayload` — 背景タイプ / テキスト揃え / customClass
 *
 * 動的 CSS は ImperativeCssScope（style= 属性なし、CSP strict 準拠）。
 */

import type { ReactNode } from "react";
import Image from "next/image";
import { cn } from "@/shared/lib/cn";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";
import { CSS_VAR, CSS_VAR_CLASS } from "@/shared/lib/csp/css-vars";
import { ImperativeCssScope } from "@/shared/lib/csp/imperative-css-scope";
import type { ImperativeStyleValues } from "@/shared/lib/csp/use-imperative-style";
import type {
  LayoutContainerWidth,
  LayoutAnimate,
  SectionLayoutConfig,
} from "@/shared/lib/sections/definitions/_shared/layout";

// =============================================================================
// Mapping tables — Layout
// =============================================================================

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
  /** CSS custom properties（backgroundColor / overlay 等） */
  readonly cssVars?: ImperativeStyleValues;
  /** コンテナ div を省略する場合に true（Hero 等の特殊レイアウト用） */
  readonly skipContainer?: boolean;
}

export function SectionWrapper({
  style,
  children,
  className,
  layout,
  cssVars,
  skipContainer,
}: SectionWrapperProps) {
  const maxWidthClass = layout
    ? LAYOUT_CONTAINER_WIDTH_CLASSES[layout.containerWidth]
    : maxWidthMap[style.container.maxWidth];

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
  const hasCustomBg =
    cssVars !== undefined && CSS_VAR.sectionBgColor in cssVars;
  const showOverlay = hasBgImage && style.background.overlayOpacity > 0;

  const sectionCssVars: ImperativeStyleValues = {
    ...cssVars,
  };

  const overlayCssVars: ImperativeStyleValues | undefined = showOverlay
    ? { [CSS_VAR.sectionOverlayOpacity]: style.background.overlayOpacity }
    : undefined;

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

  const animate: LayoutAnimate = layout?.animateOnScroll ?? "none";
  const wrapped =
    animate === "none" ? (
      inner
    ) : (
      <ScrollReveal variant={animate}>{inner}</ScrollReveal>
    );

  return (
    <ImperativeCssScope
      as="section"
      cssVars={sectionCssVars}
      className={cn(
        "relative",
        hasBgImage && "isolate",
        bgClass,
        hasCustomBg && CSS_VAR_CLASS.sectionBgColor,
        alignClass,
        visibilityClass,
        style.customClass,
        className,
      )}
    >
      {bgImageUrl && (
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
        <ImperativeCssScope
          {...(overlayCssVars !== undefined && { cssVars: overlayCssVars })}
          className={cn(
            "pointer-events-none absolute inset-0 bg-foreground",
            CSS_VAR_CLASS.sectionOverlayOpacity,
          )}
        />
      )}
      {wrapped}
    </ImperativeCssScope>
  );
}
