"use client";

import type { ReactNode } from "react";
import { tv } from "tailwind-variants";
import { useAdminLayout } from "@/admin/contexts/admin-layout-context";

const wrapperStyles = tv({
  variants: {
    isFullscreen: {
      true: "",
      false: "lg:pl-64",
    },
  },
});

type DashboardShellProps = {
  children: ReactNode;
};

export function DashboardShell({ children }: DashboardShellProps) {
  const { isFullscreen } = useAdminLayout();
  return <div className={wrapperStyles({ isFullscreen })}>{children}</div>;
}
