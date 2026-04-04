"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "link" | "editorial";
type ButtonSize = "sm" | "md" | "lg";

const variantClasses = {
  primary:
    "bg-accent text-accent-foreground rounded-full transition-colors duration-200 hover:bg-accent/90",
  secondary:
    "border border-border text-foreground rounded-full transition-colors duration-200 hover:border-foreground/30",
  ghost:
    "bg-transparent text-foreground rounded-full transition-colors duration-200 hover:bg-surface",
  link: "text-accent hover:text-foreground underline-offset-4 hover:underline p-0",
  editorial:
    "border border-foreground text-foreground transition-colors duration-300 hover:bg-accent hover:text-accent-foreground",
} as const satisfies Record<ButtonVariant, string>;

const sizeClasses = {
  sm: "px-3 py-2 text-sm min-h-10",
  md: "px-5 py-2.5 text-base min-h-11",
  lg: "px-7 py-3 text-lg min-h-12",
} as const satisfies Record<ButtonSize, string>;

interface ButtonBaseProps {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly children: ReactNode;
  readonly className?: string;
}

interface ButtonAsButton extends ButtonBaseProps {
  readonly href?: undefined;
  readonly type?: "button" | "submit";
  readonly disabled?: boolean;
  readonly onClick?: () => void;
}

interface ButtonAsLink extends ButtonBaseProps {
  readonly href: string;
  readonly onClick?: () => void;
}

type ButtonProps = ButtonAsButton | ButtonAsLink;

export function Button(props: ButtonProps) {
  const { variant = "primary", size = "md", children, className } = props;
  const classes = cn(
    "inline-flex items-center justify-center transition-colors duration-200",
    variantClasses[variant],
    variant !== "link" && sizeClasses[size],
    className,
  );

  if ("href" in props && typeof props.href === "string") {
    return (
      <Link
        href={props.href}
        className={classes}
        {...(props.onClick && { onClick: props.onClick })}
      >
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
    >
      {children}
    </button>
  );
}
