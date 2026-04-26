/**
 * SectionWrapper — SectionStylePayload の共通フィールドを CSS クラス/style に変換
 *
 * props としてコード側で決定した SectionStylePayload を受け取り、
 * spacing.paddingTop/Bottom, background.type/imageUrl/overlayOpacity,
 * container.maxWidth, typography.textAlign, customClass を処理する。
 */

import type { ReactElement, ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";

// =============================================================================
// Mapping tables
// =============================================================================

const paddingTopMap: Record<
  NonNullable<SectionStylePayload["spacing"]["paddingTop"]>,
  string
> = {
  none: "",
  sm: "pt-[var(--space-sm)]",
  md: "pt-[var(--space-md)]",
  lg: "pt-[var(--space-lg)]",
  xl: "pt-[var(--space-xl)]",
};

const paddingBottomMap: Record<
  NonNullable<SectionStylePayload["spacing"]["paddingBottom"]>,
  string
> = {
  none: "",
  sm: "pb-[var(--space-sm)]",
  md: "pb-[var(--space-md)]",
  lg: "pb-[var(--space-lg)]",
  xl: "pb-[var(--space-xl)]",
};

const backgroundMap: Record<
  NonNullable<SectionStylePayload["background"]["type"]>,
  string
> = {
  default: "",
  surface: "bg-surface",
  // TODO: Phase B.C2 — muted/gradient は暫定で surface/accent 相当に仮置き
  muted: "bg-muted",
  gradient: "bg-accent/5",
  image: "bg-cover bg-center bg-no-repeat",
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
  /** 追加の inline style（config.backgroundColor 等） */
  readonly styleProp?: React.CSSProperties;
  /** セクション固有のデフォルト padding を上書きしたくない場合に true */
  readonly skipPadding?: boolean;
  /** コンテナ div を省略する場合に true（Hero 等の特殊レイアウト用） */
  readonly skipContainer?: boolean;
}

export function SectionWrapper({
  style,
  children,
  className,
  styleProp,
  skipPadding,
  skipContainer,
}: SectionWrapperProps): ReactElement {
  const paddingClass = skipPadding
    ? ""
    : cn(
        paddingTopMap[style.spacing.paddingTop],
        paddingBottomMap[style.spacing.paddingBottom],
      );
  const bgClass = backgroundMap[style.background.type];
  const maxWidthClass = maxWidthMap[style.container.maxWidth];
  const alignClass =
    style.typography.textAlign !== "left"
      ? textAlignMap[style.typography.textAlign]
      : "";

  const hasBgImage =
    style.background.type === "image" && style.background.imageUrl;
  const bgImageStyle = hasBgImage
    ? { backgroundImage: `url(${style.background.imageUrl})` }
    : undefined;
  const mergedStyle =
    bgImageStyle || styleProp ? { ...bgImageStyle, ...styleProp } : undefined;

  const showOverlay = hasBgImage && style.background.overlayOpacity > 0;

  return (
    <section
      className={[
        "relative",
        paddingClass,
        bgClass,
        alignClass,
        style.customClass,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={mergedStyle}
    >
      {showOverlay && (
        <div
          className="pointer-events-none absolute inset-0 bg-foreground"
          style={{ opacity: style.background.overlayOpacity / 100 }}
        />
      )}
      {skipContainer ? (
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
 * - 値は SectionStylePayload.typography.titleSize と 1:1 対応
 * - `satisfies` で網羅チェック: titleSize に値追加時にコンパイルエラー
 */
export const titleSizeMap = {
  sm: "text-xl md:text-2xl",
  md: "text-2xl md:text-3xl",
  lg: "text-2xl md:text-3xl lg:text-4xl",
  xl: "text-3xl md:text-4xl lg:text-5xl",
} satisfies Record<
  NonNullable<SectionStylePayload["typography"]["titleSize"]>,
  string
>;

/**
 * style から title 用 CSS クラスを生成
 */
export function getTitleClasses(style: SectionStylePayload): string {
  return titleSizeMap[style.typography.titleSize] ?? titleSizeMap.lg;
}

/**
 * style から title 用 inline style を生成（カラー指定時のみ）
 */
export function getTitleStyle(
  style: SectionStylePayload,
): React.CSSProperties | undefined {
  return style.typography.titleColor
    ? { color: style.typography.titleColor }
    : undefined;
}

/**
 * style から body text 用 inline style を生成（カラー指定時のみ）
 */
export function getTextStyle(
  style: SectionStylePayload,
): React.CSSProperties | undefined {
  return style.typography.textColor
    ? { color: style.typography.textColor }
    : undefined;
}
