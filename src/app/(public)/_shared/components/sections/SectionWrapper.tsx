/**
 * SectionWrapper — design JSON の共通フィールドを適用するセクションラッパー
 *
 * paddingTop/Bottom, background, maxWidth, backgroundImageUrl,
 * backgroundOverlayOpacity, textAlign, customClass を CSS クラス/style に変換。
 *
 * design が未設定（デフォルト値）の場合は各コンポーネントの既存見た目を維持。
 */

import type { ReactElement, ReactNode } from "react";
import type { SectionDesign } from "@/shared/lib/validations/section-design";

// =============================================================================
// Mapping tables
// =============================================================================

const paddingTopMap = {
  none: "",
  sm: "pt-8 md:pt-12",
  md: "pt-16 md:pt-24",
  lg: "pt-24 md:pt-32 lg:pt-40",
  xl: "pt-32 md:pt-40 lg:pt-48",
} satisfies Record<NonNullable<SectionDesign["paddingTop"]>, string>;

const paddingBottomMap = {
  none: "",
  sm: "pb-8 md:pb-12",
  md: "pb-16 md:pb-24",
  lg: "pb-24 md:pb-32 lg:pb-40",
  xl: "pb-32 md:pb-40 lg:pb-48",
} satisfies Record<NonNullable<SectionDesign["paddingBottom"]>, string>;

const backgroundMap = {
  default: "",
  surface: "bg-surface",
  accent: "bg-accent",
  primary: "bg-accent text-accent-foreground",
  dark: "bg-foreground text-background",
  image: "bg-cover bg-center bg-no-repeat",
  gradient: "bg-gradient-to-b from-surface to-background",
} satisfies Record<NonNullable<SectionDesign["background"]>, string>;

const maxWidthMap = {
  sm: "max-w-3xl",
  md: "max-w-4xl",
  lg: "max-w-6xl",
  xl: "max-w-7xl",
  full: "max-w-full",
} satisfies Record<NonNullable<SectionDesign["maxWidth"]>, string>;

const textAlignMap = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
} satisfies Record<NonNullable<SectionDesign["textAlign"]>, string>;

// =============================================================================
// Component
// =============================================================================

interface SectionWrapperProps {
  readonly design: SectionDesign;
  readonly children: ReactNode;
  readonly className?: string;
  /** 追加の inline style（config.backgroundColor 等） */
  readonly style?: React.CSSProperties;
  /** セクション固有のデフォルト padding を上書きしたくない場合に true */
  readonly skipPadding?: boolean;
  /** コンテナ div を省略する場合に true（Hero 等の特殊レイアウト用） */
  readonly skipContainer?: boolean;
}

export function SectionWrapper({
  design,
  children,
  className,
  style: styleProp,
  skipPadding,
  skipContainer,
}: SectionWrapperProps): ReactElement {
  const paddingClass = skipPadding
    ? ""
    : `${paddingTopMap[design.paddingTop]} ${paddingBottomMap[design.paddingBottom]}`;
  const bgClass = backgroundMap[design.background];
  const maxWidthClass = maxWidthMap[design.maxWidth];
  const alignClass =
    design.textAlign !== "left" ? textAlignMap[design.textAlign] : "";

  const hasBgImage = design.background === "image" && design.backgroundImageUrl;
  const bgImageStyle = hasBgImage
    ? { backgroundImage: `url(${design.backgroundImageUrl})` }
    : undefined;
  const mergedStyle =
    bgImageStyle || styleProp ? { ...bgImageStyle, ...styleProp } : undefined;

  const showOverlay = hasBgImage && design.backgroundOverlayOpacity > 0;

  return (
    <section
      className={[
        "relative",
        paddingClass,
        bgClass,
        alignClass,
        design.customClass,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={mergedStyle}
    >
      {showOverlay && (
        <div
          className="pointer-events-none absolute inset-0 bg-foreground"
          style={{ opacity: design.backgroundOverlayOpacity / 100 }}
        />
      )}
      {skipContainer ? (
        children
      ) : (
        <div className={`mx-auto px-5 md:px-8 ${maxWidthClass}`}>
          {children}
        </div>
      )}
    </section>
  );
}

// =============================================================================
// Text style helpers (for use within section components)
// =============================================================================

/**
 * titleSize → レスポンシブ CSS クラスのマッピング
 *
 * - 値は `titleSizeValues`（section-design.ts）と 1:1 対応
 * - `satisfies` で網羅チェック: titleSizeValues に値追加時にコンパイルエラー
 * - 新サイズ追加時: section-design.ts の titleSizeValues → ここに追加 → DesignPanel の titleSizeLabels
 */
export const titleSizeMap = {
  sm: "text-xl md:text-2xl",
  md: "text-2xl md:text-3xl",
  lg: "text-2xl md:text-3xl lg:text-4xl",
  xl: "text-3xl md:text-4xl lg:text-5xl",
  "2xl": "text-4xl md:text-5xl lg:text-6xl",
  "3xl": "text-3xl sm:text-4xl md:text-5xl lg:text-7xl",
} satisfies Record<NonNullable<SectionDesign["titleSize"]>, string>;

/**
 * design から title 用 CSS クラスを生成
 */
export function getTitleClasses(design: SectionDesign): string {
  return titleSizeMap[design.titleSize] ?? titleSizeMap.lg;
}

/**
 * design から title 用 inline style を生成（カラー指定時のみ）
 */
export function getTitleStyle(
  design: SectionDesign,
): React.CSSProperties | undefined {
  return design.titleColor ? { color: design.titleColor } : undefined;
}

/**
 * design から body text 用 inline style を生成（カラー指定時のみ）
 */
export function getTextStyle(
  design: SectionDesign,
): React.CSSProperties | undefined {
  return design.textColor ? { color: design.textColor } : undefined;
}
