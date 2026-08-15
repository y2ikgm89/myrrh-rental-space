"use client";

import { useRef } from "react";
import {
  DEFAULT_TYPE_STYLE,
  getStripedStyle,
} from "@/shared/lib/announcement-bar-utils";
import { cn } from "@/shared/lib/cn";
import {
  pickImperativeStyleValues,
  useImperativeStyle,
} from "@/shared/lib/csp/use-imperative-style";
import { AnnouncementBarDesignStyle } from "@/shared/lib/validations/enums/prisma-types";
import type { DesignPreviewProps } from "./types";

export function DesignPreview({
  message,
  linkText,
  designStyle,
  bgColor,
  textColor,
  stripeColor,
  stripeAnimation,
  gradientAnimation,
  glassAnimation,
}: DesignPreviewProps) {
  const defaultColors = DEFAULT_TYPE_STYLE;

  // スタイル計算
  let customStyles: React.CSSProperties = {
    ...(bgColor ? { backgroundColor: bgColor } : {}),
    ...(textColor ? { color: textColor } : {}),
  };

  // ストライプスタイル（共通ユーティリティを使用）
  if (designStyle === AnnouncementBarDesignStyle.STRIPED) {
    const baseColor = bgColor || defaultColors.hex;
    const stripedStyles = getStripedStyle(
      baseColor,
      stripeColor,
      stripeAnimation,
    );
    customStyles = { ...customStyles, ...stripedStyles };
  }

  // グラデーションアニメーション
  if (
    designStyle === AnnouncementBarDesignStyle.GRADIENT &&
    gradientAnimation
  ) {
    customStyles = {
      ...customStyles,
      backgroundSize: "200% 100%",
      animation: "gradient-flow 3s ease infinite",
    };
  }

  // グラスアニメーション用
  if (designStyle === AnnouncementBarDesignStyle.GLASS && glassAnimation) {
    customStyles = {
      ...customStyles,
      position: "relative",
      overflow: "hidden",
    };
  }

  // デザインスタイル別のクラス
  function getStyleClasses(): string {
    switch (designStyle) {
      case AnnouncementBarDesignStyle.SOLID:
        return !bgColor ? defaultColors.bg : "";
      case AnnouncementBarDesignStyle.GRADIENT:
        return `bg-gradient-to-r ${defaultColors.gradient}`;
      case AnnouncementBarDesignStyle.OUTLINED:
        return "bg-transparent border-y border-border";
      case AnnouncementBarDesignStyle.GLASS:
        return "backdrop-blur-md bg-card/10 border-y border-card/20";
      case AnnouncementBarDesignStyle.MINIMAL:
        return "bg-transparent border-b border-border";
      case AnnouncementBarDesignStyle.STRIPED:
        return !bgColor ? defaultColors.bg : "";
      default:
        return "";
    }
  }

  function getTextClasses(): string {
    if (textColor) return "";
    switch (designStyle) {
      case AnnouncementBarDesignStyle.SOLID:
      case AnnouncementBarDesignStyle.GRADIENT:
      case AnnouncementBarDesignStyle.GLASS:
      case AnnouncementBarDesignStyle.STRIPED:
        return "text-primary-foreground";
      case AnnouncementBarDesignStyle.OUTLINED:
      case AnnouncementBarDesignStyle.MINIMAL:
        return "text-foreground";
      default:
        return "";
    }
  }

  const previewRef = useRef<HTMLDivElement>(null);
  useImperativeStyle(previewRef, pickImperativeStyleValues(customStyles));

  return (
    <div
      ref={previewRef}
      className={cn(
        "flex items-center justify-center gap-2 px-4 py-2 text-sm",
        getStyleClasses(),
        getTextClasses(),
      )}
    >
      {/* グラスシマーオーバーレイ */}
      {designStyle === AnnouncementBarDesignStyle.GLASS && glassAnimation && (
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden"
          aria-hidden="true"
        >
          <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-card/20 to-transparent announcement-bar-glass-shimmer" />
        </div>
      )}
      <span>{message || "サンプルお知らせメッセージ"}</span>
      {linkText && (
        <span className="underline underline-offset-2">{linkText}</span>
      )}
    </div>
  );
}
