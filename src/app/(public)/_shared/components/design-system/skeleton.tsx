import type { HTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";

type SkeletonVariant = "default" | "circle" | "text";

const variantClasses = {
  default: "rounded-md",
  circle: "rounded-full",
  text: "rounded-sm",
} as const satisfies Record<SkeletonVariant, string>;

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  readonly variant?: SkeletonVariant;
}

/**
 * 公開ページ用 Skeleton primitive。
 *
 * 業界標準パターン（Vercel / shadcn / Material 3 / NN/g）に準拠。
 * - `animate-pulse` で穏やかな脈動
 * - `bg-surface` で公開ページの Luxury White テーマと調和
 * - サイズは consumer 側で Tailwind utility（`h-* w-*`）を渡す
 * - variant: `default`（rounded-md・block placeholder） / `circle`（avatar） / `text`（行）
 *
 * 単一の spinner ではなく、実コンテンツの shape を反映した skeleton で
 * perceived wait time を短縮する（Apple HIG / NN/g 推奨）。
 */
export function Skeleton({
  className,
  variant = "default",
  ...props
}: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse bg-surface",
        variantClasses[variant],
        className,
      )}
      aria-hidden="true"
      {...props}
    />
  );
}
