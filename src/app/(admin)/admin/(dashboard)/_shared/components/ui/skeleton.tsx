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
 * 管理画面用 Skeleton primitive。
 *
 * 業界標準パターン（shadcn/ui / Carbon Design / Material 3）に準拠。
 * - `animate-pulse` で穏やかな脈動
 * - `bg-muted` で Swiss Industrial Admin テーマに調和
 * - サイズは consumer 側で Tailwind utility（`h-* w-*`）を渡す
 * - variant: `default`（rounded-md） / `circle`（avatar） / `text`（行）
 *
 * Suspense fallback / loading.tsx の SSoT。インラインの
 * `<div className="h-4 w-24 animate-pulse rounded bg-muted" />` を置き換える。
 */
export function Skeleton({
  className,
  variant = "default",
  ...props
}: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse bg-muted",
        variantClasses[variant],
        className,
      )}
      aria-hidden="true"
      {...props}
    />
  );
}
