"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRef, type ReactNode } from "react";
import { PortableTextSpans } from "@/shared/components/portable-text/PortableTextSpans";
import { cn } from "@/shared/lib/cn";
import { CSS_VAR, CSS_VAR_CLASS } from "@/shared/lib/csp/css-vars";
import {
  useImperativeCssVars,
  type ImperativeStyleValues,
} from "@/shared/lib/csp/use-imperative-style";
import type { PortableTextSpan } from "@/shared/lib/portable-text";

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
  readonly customBackgroundColor?: string;
  readonly customTextColor?: string;
}

interface LabelProps extends ButtonBaseProps {
  readonly label: PortableTextSpan[];
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
  readonly href: Route;
  readonly onClick?: () => void;
  readonly target?: "_blank" | "_self";
}

type ButtonProps = ButtonContentProps & (AsButton | AsLink);

function resolveIconSize(size: ButtonSize, variant: ButtonVariant): ButtonSize {
  return variant === "link" ? "md" : size;
}

function buildCustomColorVars(
  customBackgroundColor?: string,
  customTextColor?: string,
): ImperativeStyleValues {
  return {
    ...(customBackgroundColor
      ? { [CSS_VAR.customBg]: customBackgroundColor }
      : {}),
    ...(customTextColor ? { [CSS_VAR.customText]: customTextColor } : {}),
  };
}

export function Button(props: ButtonProps) {
  const {
    variant = "primary",
    size = "md",
    className,
    customBackgroundColor,
    customTextColor,
  } = props;
  const ref = useRef<HTMLButtonElement & HTMLAnchorElement>(null);
  const colorVars = buildCustomColorVars(
    customBackgroundColor,
    customTextColor,
  );
  useImperativeCssVars(ref, colorVars);

  const classes = cn(
    "inline-flex items-center justify-center gap-2 transition-colors duration-200",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
    variantClasses[variant],
    variant !== "link" && sizeClasses[size],
    className,
  );

  const hasCustomColors =
    Boolean(customBackgroundColor) || Boolean(customTextColor);
  const customColorClasses = cn(
    customBackgroundColor && CSS_VAR_CLASS.customBg,
    customTextColor && CSS_VAR_CLASS.customText,
  );

  const content =
    "label" in props && props.label !== undefined && props.label.length > 0 ? (
      <PortableTextSpans
        spans={props.label}
        iconClassName={iconSizeClasses[resolveIconSize(size, variant)]}
      />
    ) : (
      props.children
    );

  if ("href" in props && typeof props.href === "string") {
    return (
      <Link
        ref={ref}
        href={props.href}
        className={cn(classes, hasCustomColors && customColorClasses)}
        {...("target" in props && props.target && { target: props.target })}
        {...(props.onClick && { onClick: props.onClick })}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      ref={ref}
      type={"type" in props ? (props.type ?? "button") : "button"}
      disabled={"disabled" in props ? props.disabled : undefined}
      onClick={props.onClick}
      className={cn(
        classes,
        "disabled:opacity-50 disabled:pointer-events-none",
        hasCustomColors && customColorClasses,
      )}
    >
      {content}
    </button>
  );
}
