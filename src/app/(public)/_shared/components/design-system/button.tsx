"use client";

import Link from "next/link";
import * as TablerIcons from "@tabler/icons-react";
import { createElement } from "react";
import type { CSSProperties, ComponentType, ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import type { AppRoute } from "@/shared/lib/typed-routes";

type ButtonVariant = "primary" | "secondary" | "ghost" | "link" | "editorial";
type ButtonSize = "sm" | "md" | "lg";

const variantClasses = {
  primary:
    "bg-accent text-accent-foreground transition-colors duration-200 hover:bg-accent/90",
  secondary:
    "border border-border text-foreground transition-colors duration-200 hover:border-foreground/30",
  ghost:
    "bg-transparent text-foreground transition-colors duration-200 hover:bg-surface",
  link: "text-accent hover:text-foreground underline-offset-4 hover:underline p-0",
  editorial:
    "border border-foreground text-foreground transition-colors duration-300 hover:bg-accent hover:text-accent-foreground",
} as const satisfies Record<ButtonVariant, string>;

// WCAG 2.5.5 Enhanced (AAA) — all sizes meet 44×44 CSS px minimum
const sizeClasses = {
  sm: "px-3 py-2 text-sm min-h-11",
  md: "px-5 py-2.5 text-base min-h-11",
  lg: "px-7 py-3 text-lg min-h-12",
} as const satisfies Record<ButtonSize, string>;

const iconSizeClasses = {
  sm: "h-3 w-3",
  md: "h-4 w-4",
  lg: "h-5 w-5",
} as const satisfies Record<ButtonSize, string>;

/**
 * Tabler icon を name 文字列から動的解決する純関数。
 *
 * Phase 2 では bundle 影響を許容して全 Tabler Icons を import 経由で参照
 * （`@tabler/icons-react` の tree-shaking はクラス参照に対しては効かないが
 * named export 単位では効く想定）。Phase 3 で allowlist 縮小予定。
 */
function resolveTablerIcon(
  name: string | undefined,
): ComponentType<{ className?: string; "aria-hidden"?: boolean }> | null {
  if (!name) return null;
  const registry: Record<string, unknown> = TablerIcons;
  const Icon = registry[name];
  if (typeof Icon === "function") {
    return Icon as ComponentType<{
      className?: string;
      "aria-hidden"?: boolean;
    }>;
  }
  return null;
}

interface ButtonBaseProps {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly children: ReactNode;
  readonly className?: string;
  /**
   * Tabler Icons 名（例: `IconArrowRight`）。
   * 未指定または不明な name の場合は何も描画しない。
   */
  readonly iconName?: string;
  /**
   * カスタム背景色（HEX）。variant 既定色を上書きする。
   */
  readonly customBackgroundColor?: string;
  /**
   * カスタム文字色（HEX）。variant 既定色を上書きする。
   */
  readonly customTextColor?: string;
}

interface ButtonAsButton extends ButtonBaseProps {
  readonly href?: undefined;
  readonly type?: "button" | "submit";
  readonly disabled?: boolean;
  readonly onClick?: () => void;
}

interface ButtonAsLink extends ButtonBaseProps {
  readonly href: AppRoute;
  readonly onClick?: () => void;
  readonly target?: "_blank" | "_self";
}

type ButtonProps = ButtonAsButton | ButtonAsLink;

export function Button(props: ButtonProps) {
  const {
    variant = "primary",
    size = "md",
    children,
    className,
    iconName,
    customBackgroundColor,
    customTextColor,
  } = props;
  const classes = cn(
    "inline-flex items-center justify-center gap-2 transition-colors duration-200",
    variantClasses[variant],
    variant !== "link" && sizeClasses[size],
    className,
  );

  // React Compiler 対応 — Object.assign 禁止、スプレッドのみ使用
  const inlineStyle: CSSProperties = {
    ...(customBackgroundColor && { backgroundColor: customBackgroundColor }),
    ...(customTextColor && { color: customTextColor }),
  };
  const hasInlineStyle =
    Boolean(customBackgroundColor) || Boolean(customTextColor);

  // createElement 経由で動的解決する（render 中の JSX <Icon /> は
  // react-hooks/static-components 違反になるため避ける）。
  const ResolvedIcon = resolveTablerIcon(iconName);
  const iconSize = variant === "link" ? "md" : size;
  const iconNode = ResolvedIcon
    ? createElement(ResolvedIcon, {
        className: iconSizeClasses[iconSize],
        "aria-hidden": true,
      })
    : null;

  if ("href" in props && typeof props.href === "string") {
    return (
      <Link
        href={props.href}
        className={classes}
        {...(hasInlineStyle && { style: inlineStyle })}
        {...(props.target && { target: props.target })}
        {...(props.onClick && { onClick: props.onClick })}
      >
        {iconNode}
        {children}
      </Link>
    );
  }

  return (
    <button
      type={props.type ?? "button"}
      disabled={props.disabled}
      onClick={props.onClick}
      className={cn(
        classes,
        "disabled:opacity-50 disabled:pointer-events-none",
      )}
      {...(hasInlineStyle && { style: inlineStyle })}
    >
      {iconNode}
      {children}
    </button>
  );
}
