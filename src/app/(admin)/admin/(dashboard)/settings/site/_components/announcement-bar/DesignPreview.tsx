"use client";

import {
  DEFAULT_TYPE_STYLE,
  getStripedStyle,
} from "@/shared/lib/announcement-bar-utils";
import { cn } from "@/shared/lib/cn";
import { AnnouncementBarDesignStyle } from "@/shared/db/enums";
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
  if (designStyle === AnnouncementBarDesignStyle.striped) {
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
    designStyle === AnnouncementBarDesignStyle.gradient &&
    gradientAnimation
  ) {
    customStyles = {
      ...customStyles,
      backgroundSize: "200% 100%",
      animation: "gradient-flow 3s ease infinite",
    };
  }

  // グラスアニメーション用
  if (designStyle === AnnouncementBarDesignStyle.glass && glassAnimation) {
    customStyles = {
      ...customStyles,
      position: "relative",
      overflow: "hidden",
    };
  }

  // デザインスタイル別のクラス
  function getStyleClasses(): string {
    switch (designStyle) {
      case AnnouncementBarDesignStyle.solid:
        return !bgColor ? defaultColors.bg : "";
      case AnnouncementBarDesignStyle.gradient:
        return `bg-gradient-to-r ${defaultColors.gradient}`;
      case AnnouncementBarDesignStyle.outlined:
        return "bg-transparent border-y border-border";
      case AnnouncementBarDesignStyle.glass:
        return "backdrop-blur-md bg-card/10 border-y border-card/20";
      case AnnouncementBarDesignStyle.minimal:
        return "bg-transparent border-b border-border";
      case AnnouncementBarDesignStyle.striped:
        return !bgColor ? defaultColors.bg : "";
      default:
        return "";
    }
  }

  function getTextClasses(): string {
    if (textColor) return "";
    switch (designStyle) {
      case AnnouncementBarDesignStyle.solid:
      case AnnouncementBarDesignStyle.gradient:
      case AnnouncementBarDesignStyle.glass:
      case AnnouncementBarDesignStyle.striped:
        return "text-primary-foreground";
      case AnnouncementBarDesignStyle.outlined:
      case AnnouncementBarDesignStyle.minimal:
        return "text-foreground";
      default:
        return "";
    }
  }

  return (
    <>
      {designStyle === AnnouncementBarDesignStyle.striped &&
        stripeAnimation && (
          <style>{`
          @keyframes stripe-slide {
            from { background-position: 0 0; }
            to { background-position: 28.28px 0; }
          }
        `}</style>
        )}
      {designStyle === AnnouncementBarDesignStyle.gradient &&
        gradientAnimation && (
          <style>{`
          @keyframes gradient-flow {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
        `}</style>
        )}
      {designStyle === AnnouncementBarDesignStyle.glass && glassAnimation && (
        <style>{`
          @keyframes glass-shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }
        `}</style>
      )}
      <div
        className={cn(
          "flex items-center justify-center gap-2 px-4 py-2 text-sm",
          getStyleClasses(),
          getTextClasses(),
        )}
        style={customStyles}
      >
        {/* グラスシマーオーバーレイ */}
        {designStyle === AnnouncementBarDesignStyle.glass && glassAnimation && (
          <div
            className="pointer-events-none absolute inset-0 overflow-hidden"
            aria-hidden="true"
          >
            <div
              className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-card/20 to-transparent"
              style={{ animation: "glass-shimmer 3s ease-in-out infinite" }}
            />
          </div>
        )}
        <span>{message || "サンプルお知らせメッセージ"}</span>
        {linkText && (
          <span className="underline underline-offset-2">{linkText}</span>
        )}
      </div>
    </>
  );
}
