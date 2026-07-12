import { cn } from "@/shared/lib/cn";

type DivProps = React.HTMLAttributes<HTMLDivElement> & {
  ref?: React.Ref<HTMLDivElement>;
};

type CardTitleLevel = "h2" | "h3" | "h4";

type CardTitleProps = React.HTMLAttributes<HTMLHeadingElement> & {
  ref?: React.Ref<HTMLHeadingElement>;
  /**
   * カード見出しの HTML レベル。デフォルトは `h3`（ページの H1 → セクション H2 →
   * カード H3 という一般的なドキュメントアウトラインを想定）。
   * ページ内の階層に応じて `h2` / `h4` に上書きする。
   *
   * WCAG 1.3.1 / 2.4.6: 以前の `<div>` 実装ではスクリーンリーダーの見出し
   * ナビゲーション (H キー) に一切引っかからず、カードだらけの管理画面は
   * 実質「ページに H1 が 1 つあるだけ」の構造だった。
   */
  as?: CardTitleLevel;
};

function Card({ className, ref, ...props }: DivProps) {
  return (
    <div
      ref={ref}
      className={cn(
        // Swiss Design: シャープなエッジ、控えめなシャドウ
        "rounded-md border bg-card text-card-foreground",
        "shadow-xs",
        "transition-shadow duration-200",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ref, ...props }: DivProps) {
  return (
    <div
      ref={ref}
      className={cn("flex flex-col space-y-1.5 p-6", className)}
      {...props}
    />
  );
}

function CardTitle({
  className,
  ref,
  as: Component = "h3",
  ...props
}: CardTitleProps) {
  return (
    <Component
      ref={ref}
      className={cn(
        // Swiss Typography: タイトなレタースペーシング
        "text-base font-semibold leading-none tracking-tight",
        className,
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ref, ...props }: DivProps) {
  return (
    <div
      ref={ref}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function CardContent({ className, ref, ...props }: DivProps) {
  return <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />;
}

function CardFooter({ className, ref, ...props }: DivProps) {
  return (
    <div
      ref={ref}
      className={cn("flex items-center p-6 pt-0", className)}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
};
