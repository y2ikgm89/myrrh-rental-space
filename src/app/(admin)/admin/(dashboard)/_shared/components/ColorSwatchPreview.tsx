"use client";

import type { ReactElement } from "react";
import { cn } from "@/shared/lib/cn";
import { CSS_VAR, CSS_VAR_CLASS } from "@/shared/lib/csp/css-vars";
import { ImperativeCssScope } from "@/shared/lib/csp/imperative-css-scope";

interface ColorSwatchPreviewProps {
  readonly color: string;
  readonly className?: string;
}

/** Admin UI color preview — CSP-safe via imperative CSS custom property. */
export function ColorSwatchPreview({
  color,
  className,
}: ColorSwatchPreviewProps): ReactElement {
  return (
    <ImperativeCssScope
      cssVars={{ [CSS_VAR.colorSwatch]: color }}
      className={cn("rounded border", CSS_VAR_CLASS.colorSwatch, className)}
    />
  );
}
