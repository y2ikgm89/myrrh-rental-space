"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "link";
type ButtonSize = "sm" | "md" | "lg";

const variantClasses = {
  primary:
    "bg-accent text-accent-foreground hover:bg-accent/90 rounded-lg shadow-sm",
  secondary:
    "border border-border bg-transparent text-foreground hover:bg-surface rounded-lg",
  ghost: "bg-transparent text-foreground hover:bg-surface rounded-lg",
  link: "text-accent underline underline-offset-4 hover:text-accent/80 p-0",
} as const satisfies Record<ButtonVariant, string>;

const sizeClasses = {
  sm: "px-3 py-1.5 text-sm min-h-9",
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
}

type ButtonProps = ButtonAsButton | ButtonAsLink;

export function Button(props: ButtonProps) {
  const { variant = "primary", size = "md", children, className } = props;
  const classes = cn(
    "inline-flex items-center justify-center font-medium transition-colors duration-200",
    variantClasses[variant],
    variant !== "link" && sizeClasses[size],
    className,
  );

  if ("href" in props && typeof props.href === "string") {
    return (
      <Link href={props.href} className={classes}>
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
