"use client";

import Link from "next/link";
import type { ReactNode } from "react";

interface CardProps {
  readonly children: ReactNode;
  readonly href?: string;
  readonly className?: string;
}

export function Card({ children, href, className = "" }: CardProps) {
  const classes =
    `rounded-lg border border-border bg-card shadow-card transition-all duration-300 hover:shadow-lg hover:scale-[1.02] ${className}`.trim();

  if (href) {
    return (
      <Link href={href} className={`block ${classes}`}>
        {children}
      </Link>
    );
  }

  return <div className={classes}>{children}</div>;
}
