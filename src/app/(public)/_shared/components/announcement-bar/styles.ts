import type { CSSProperties } from "react";
import { AnnouncementBarDesignStyle } from "@/shared/lib/validations/enums/prisma-types";
import { cn } from "@/shared/lib/cn";
import type { CarouselSettings } from "./types";

/**
 * 全バー共通のデフォルトカラー（Trust Blue 系 info トーン）。
 * バーごとの色分けは廃止し、デザイン設定の `bgColor` / `textColor` が
 * カスタム指定された場合のみ上書きされる。
 */
/**
 * `text-white` を明示するのは Lighthouse / axe の color computation で OKLCH
 * → sRGB conversion 時に `oklch(0.985 0 0)` (info-foreground token) が
 * 約 #5f91c0 相当の中間値として解析される silent bug を回避するため
 * (contrast 1.64:1 と誤判定されて a11y score 0 に落ちる)。
 * `text-white` は #fff 固定で確実に bg-info (#286cab) に対し contrast 7+:1。
 */
const DEFAULT_STYLE = {
  bg: "bg-info",
  text: "text-white",
  hover: "hover:text-white/85",
  gradient: "from-info to-info/80",
  hex: "#2563eb",
} as const;

interface DesignStyleConfig {
  container: string;
  containerWithBg: string;
  border?: string;
}

const DESIGN_STYLES: Record<AnnouncementBarDesignStyle, DesignStyleConfig> = {
  solid: {
    container: "",
    containerWithBg: DEFAULT_STYLE.bg,
  },
  gradient: {
    container: "bg-gradient-to-r",
    containerWithBg: DEFAULT_STYLE.gradient,
  },
  outlined: {
    container: "bg-transparent border-y",
    containerWithBg: "",
    border: "border-current",
  },
  glass: {
    container: "backdrop-blur-md bg-card/10 border-y border-card/20",
    containerWithBg: "",
  },
  minimal: {
    container: "bg-transparent border-b",
    containerWithBg: "",
    border: "border-current/30",
  },
  striped: {
    container: "",
    containerWithBg: DEFAULT_STYLE.bg,
  },
};

function adjustBrightness(hex: string, amount: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, Math.max(0, (n >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (n & 0xff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export interface BarStyles {
  className: string;
  style: CSSProperties;
  linkHoverClass: string;
  hasCustomText: boolean;
}

export function computeBarStyles(settings: CarouselSettings): BarStyles {
  const design = settings.designStyle;
  const config = DESIGN_STYLES[design];
  const hasCustomBg = !!settings.bgColor;
  const hasCustomText = !!settings.textColor;

  let style: CSSProperties = {};
  if (settings.bgColor) style.backgroundColor = settings.bgColor;
  if (settings.textColor) style.color = settings.textColor;

  if (design === AnnouncementBarDesignStyle.striped) {
    const baseHex = settings.bgColor ?? DEFAULT_STYLE.hex;
    const stripe = settings.stripeColor ?? adjustBrightness(baseHex, 20);
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

  if (design === AnnouncementBarDesignStyle.glass && settings.glassAnimation) {
    style = { ...style, position: "relative", overflow: "hidden" };
  }

  const needsDefaultText =
    !hasCustomText &&
    (design === AnnouncementBarDesignStyle.solid ||
      design === AnnouncementBarDesignStyle.gradient ||
      design === AnnouncementBarDesignStyle.striped);

  const className = cn(
    // edge-to-edge: 最上部要素なのでノッチ分を上 padding で確保（inset=0 で無変化）。
    // この高さは ResizeObserver で --announcement-bar-height に公開され、ヘッダーの
    // top オフセット/上 inset 補正がこれを差し引いて二重計上を防ぐ。
    "relative flex items-center gap-1 px-2 py-2 pt-[calc(0.5rem_+_env(safe-area-inset-top,0px))] text-sm",
    settings.sticky && "sticky top-0 z-41",
    config.container,
    !hasCustomBg && config.containerWithBg,
    config.border,
    needsDefaultText && DEFAULT_STYLE.text,
    !hasCustomText &&
      (design === AnnouncementBarDesignStyle.outlined ||
        design === AnnouncementBarDesignStyle.minimal) &&
      "text-foreground",
    !hasCustomText &&
      design === AnnouncementBarDesignStyle.glass &&
      "text-card",
  );

  const linkHoverClass = !hasCustomText ? DEFAULT_STYLE.hover : "";

  return { className, style, linkHoverClass, hasCustomText };
}

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
