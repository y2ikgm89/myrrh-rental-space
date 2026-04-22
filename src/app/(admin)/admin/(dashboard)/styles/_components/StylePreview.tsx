"use client";

/**
 * Style リアルタイムプレビュー（Client Component）。
 * SectionStylePayload の spacing/background/container/typography/animation を
 * 簡易的な CSS 変換で表示。
 */

import { cn } from "@/shared/lib/cn";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";

const PADDING_CLASS: Record<string, string> = {
  none: "py-0",
  sm: "py-4",
  md: "py-8",
  lg: "py-12",
  xl: "py-16",
};

const MAXWIDTH_CLASS: Record<string, string> = {
  sm: "max-w-sm",
  md: "max-w-xl",
  editorial: "max-w-2xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
  full: "max-w-full",
};

const BG_CLASS: Record<string, string> = {
  default: "bg-background",
  surface: "bg-surface",
  muted: "bg-muted/30",
  image: "bg-muted/50",
  gradient: "bg-gradient-to-b from-surface to-muted/30",
};

const TITLE_SIZE_CLASS: Record<string, string> = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-3xl",
  xl: "text-4xl",
};

const TEXT_ALIGN_CLASS: Record<string, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

export function StylePreview({ payload }: { payload: SectionStylePayload }) {
  const paddingTop = PADDING_CLASS[payload.spacing.paddingTop] ?? "py-8";
  const paddingBottom = PADDING_CLASS[payload.spacing.paddingBottom] ?? "py-8";
  const bg = BG_CLASS[payload.background.type] ?? "bg-background";
  const maxWidth = MAXWIDTH_CLASS[payload.container.maxWidth] ?? "max-w-5xl";
  const titleSize =
    TITLE_SIZE_CLASS[payload.typography.titleSize] ?? "text-2xl";
  const textAlign =
    TEXT_ALIGN_CLASS[payload.typography.textAlign] ?? "text-left";

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="border-b bg-muted/40 px-4 py-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
        プレビュー
      </div>
      <div className={cn("flex w-full justify-center", bg)}>
        <div
          className={cn(
            "w-full px-4",
            paddingTop.replace("py-", "pt-"),
            paddingBottom.replace("py-", "pb-"),
            maxWidth,
            textAlign,
            payload.customClass,
          )}
        >
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Section Label
          </p>
          <h2 className={cn("mt-2 font-semibold text-foreground", titleSize)}>
            サンプル見出し
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            本文のサンプルです。このプレビューは spacing / background /
            container / typography の設定を反映します。
          </p>
        </div>
      </div>
    </div>
  );
}
