import type { HTMLAttributes } from "react";
import { tv, type VariantProps } from "tailwind-variants";
import { cn } from "@/shared/lib/cn";

/**
 * Alert — 案内・警告メッセージ用のコールアウト（shadcn 準拠、tv() 化）。
 *
 * `role="alert"` を Root に固定しスクリーンリーダーへ自動的にアナウンスされる。
 * `variant="info"` はセマンティックトークン `--color-info`（badge.tsx の `info`
 * variant と同じトークン）を使う。
 */
const alertVariants = tv({
  base: "relative w-full rounded-md border px-4 py-3 text-sm [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:h-4 [&>svg]:w-4 [&>svg~*]:pl-7",
  variants: {
    variant: {
      default: "border-border bg-card text-card-foreground",
      info: "border-info/50 bg-info/10 text-foreground [&>svg]:text-info",
      destructive:
        "border-destructive/50 bg-destructive/10 text-destructive [&>svg]:text-destructive",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface AlertProps
  extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {}

function Alert({ className, variant, ...props }: AlertProps) {
  return (
    <div
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h5
      className={cn("mb-1 font-medium leading-none tracking-tight", className)}
      {...props}
    />
  );
}

function AlertDescription({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "text-sm text-muted-foreground [&_p]:leading-relaxed",
        className,
      )}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription };
