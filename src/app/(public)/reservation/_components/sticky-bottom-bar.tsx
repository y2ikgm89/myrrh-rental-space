import type { ReactNode, ReactElement } from "react";

interface StickyBottomBarProps {
  readonly children: ReactNode;
}

export function StickyBottomBar({
  children,
}: StickyBottomBarProps): ReactElement {
  return (
    <div className="fixed inset-x-0 bottom-16 z-40 border-t border-border bg-background/95 px-[var(--container-padding)] pb-3 pt-3 backdrop-blur-sm md:hidden">
      {children}
    </div>
  );
}
