"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { CuratedIcon } from "@/shared/components/icon-curation/CuratedIcon";
import { cn } from "@/shared/lib/cn";
import type { AppRoute } from "@/shared/lib/typed-routes";
import {
  isIconToken,
  isTextToken,
  type ButtonLabelToken,
} from "@/shared/lib/sections/definitions/_shared/button-label";

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

interface ButtonBaseProps {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly className?: string;
  /** カスタム背景色（HEX）。variant 既定色を上書きする。 */
  readonly customBackgroundColor?: string;
  /** カスタム文字色（HEX）。variant 既定色を上書きする。 */
  readonly customTextColor?: string;
}

/**
 * `label` は Sanity Portable Text 互換のトークン配列。
 * text トークンはテキストとして、icon トークンは curation icon として
 * 順次描画する。`children` と排他（discriminated union）。
 */
interface LabelProps extends ButtonBaseProps {
  readonly label: ButtonLabelToken[];
  readonly children?: never;
}

interface ChildrenProps extends ButtonBaseProps {
  readonly label?: never;
  readonly children: ReactNode;
}

type ButtonContentProps = LabelProps | ChildrenProps;

interface AsButton {
  readonly href?: undefined;
  readonly type?: "button" | "submit";
  readonly disabled?: boolean;
  readonly onClick?: () => void;
}

interface AsLink {
  readonly href: AppRoute;
  readonly onClick?: () => void;
  readonly target?: "_blank" | "_self";
}

type ButtonProps = ButtonContentProps & (AsButton | AsLink);

function renderTokens(
  tokens: ButtonLabelToken[],
  size: ButtonSize,
  variant: ButtonVariant,
): ReactNode {
  const iconSize = variant === "link" ? "md" : size;
  return tokens.map((token, i) => {
    if (isTextToken(token)) {
      return <span key={i}>{token.value}</span>;
    }
    if (isIconToken(token)) {
      return (
        <CuratedIcon
          key={i}
          name={token.name}
          className={iconSizeClasses[iconSize]}
          aria-hidden="true"
        />
      );
    }
    return null;
  });
}

export function Button(props: ButtonProps) {
  const {
    variant = "primary",
    size = "md",
    className,
    customBackgroundColor,
    customTextColor,
  } = props;
  const classes = cn(
    "inline-flex items-center justify-center gap-2 transition-colors duration-200",
    variantClasses[variant],
    variant !== "link" && sizeClasses[size],
    className,
  );

  const inlineStyle: CSSProperties = {
    ...(customBackgroundColor && { backgroundColor: customBackgroundColor }),
    ...(customTextColor && { color: customTextColor }),
  };
  const hasInlineStyle =
    Boolean(customBackgroundColor) || Boolean(customTextColor);

  const content =
    "label" in props && props.label !== undefined
      ? renderTokens(props.label, size, variant)
      : props.children;

  if ("href" in props && typeof props.href === "string") {
    return (
      <Link
        href={props.href}
        className={classes}
        {...(hasInlineStyle && { style: inlineStyle })}
        {...("target" in props && props.target && { target: props.target })}
        {...(props.onClick && { onClick: props.onClick })}
      >
        {content}
      </Link>
    );
  }

  const buttonProps = props as AsButton & ButtonContentProps;
  return (
    <button
      type={buttonProps.type ?? "button"}
      disabled={buttonProps.disabled}
      onClick={buttonProps.onClick}
      className={cn(
        classes,
        "disabled:opacity-50 disabled:pointer-events-none",
      )}
      {...(hasInlineStyle && { style: inlineStyle })}
    >
      {content}
    </button>
  );
}
