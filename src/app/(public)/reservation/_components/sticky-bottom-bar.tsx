"use client";

import type { ReactNode, ReactElement } from "react";

interface StickyBottomBarProps {
  readonly children: ReactNode;
}

export function StickyBottomBar({
  children,
}: StickyBottomBarProps): ReactElement {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border
        bg-background/95 backdrop-blur-sm
        px-[var(--container-padding)] pb-[env(safe-area-inset-bottom)] pt-3
        md:hidden"
    >
      {children}
    </div>
  );
}
