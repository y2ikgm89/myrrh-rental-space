/**
 * Section typography color wrappers — CSS var + Tailwind class（CSP strict）。
 * ImperativeCssScope で style= 属性を使わない。
 */

import type { ReactElement, ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";
import { ImperativeCssScope } from "@/shared/lib/csp/imperative-css-scope";
import {
  buildTextCssVars,
  buildTitleCssVars,
  getTextColorClass,
  getTitleColorClass,
} from "./section-style-helpers";

interface SectionColorBoxProps {
  readonly style: SectionStylePayload;
  readonly className?: string;
  readonly children: ReactNode;
}

export function SectionTitleBox({
  style,
  className,
  children,
}: SectionColorBoxProps): ReactElement {
  const cssVars = buildTitleCssVars(style);
  return (
    <ImperativeCssScope
      {...(cssVars !== undefined && { cssVars })}
      className={cn(getTitleColorClass(style), className)}
    >
      {children}
    </ImperativeCssScope>
  );
}

export function SectionTextBox({
  style,
  className,
  children,
}: SectionColorBoxProps): ReactElement {
  const cssVars = buildTextCssVars(style);
  return (
    <ImperativeCssScope
      {...(cssVars !== undefined && { cssVars })}
      className={cn(getTextColorClass(style), className)}
    >
      {children}
    </ImperativeCssScope>
  );
}
