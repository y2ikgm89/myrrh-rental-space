"use client";

/**
 * MagneticButton — Mouse-following magnetic hover effect
 *
 * Subtly follows cursor when hovered, snaps back with elastic ease.
 * Supports both <a> and <button> elements.
 *
 * Phase 2 拡張: iconName / size / customBackgroundColor / customTextColor /
 * openInNewTab を受け入れて section schema の buttons[] アイテムを忠実に描画する。
 */

import {
  createElement,
  useRef,
  type CSSProperties,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from "react";
import Link from "next/link";
import * as TablerIcons from "@tabler/icons-react";
import { gsap } from "@/public/lib/gsap-config";
import { useMotionPreference } from "@/public/hooks/use-motion-preference";
import { EASE } from "@/public/lib/animations";
import { cn } from "@/shared/lib/cn";
import type { AppRoute } from "@/shared/lib/typed-routes";

type MagneticButtonSize = "sm" | "md" | "lg";

const sizeClasses = {
  sm: "px-6 py-2.5 text-[0.7rem] md:px-8 md:py-3 md:text-xs min-h-11",
  md: "px-8 py-3.5 text-xs md:px-10 md:py-4 md:text-sm min-h-11",
  lg: "px-10 py-4 text-xs md:px-12 md:py-5 md:text-sm min-h-12",
} as const satisfies Record<MagneticButtonSize, string>;

const iconSizeClasses = {
  sm: "h-3 w-3",
  md: "h-4 w-4",
  lg: "h-5 w-5",
} as const satisfies Record<MagneticButtonSize, string>;

function resolveTablerIcon(
  name: string | undefined,
): ComponentType<{ className?: string; "aria-hidden"?: boolean }> | null {
  if (!name) return null;
  const registry: Record<string, unknown> = TablerIcons;
  const Icon = registry[name];
  if (typeof Icon === "function") {
    return Icon as ComponentType<{
      className?: string;
      "aria-hidden"?: boolean;
    }>;
  }
  return null;
}

interface MagneticButtonProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly strength?: number;
  readonly onClick?: () => void;
  readonly href?: AppRoute;
  readonly size?: MagneticButtonSize;
  readonly iconName?: string;
  readonly customBackgroundColor?: string;
  readonly customTextColor?: string;
  readonly openInNewTab?: boolean;
}

export function MagneticButton({
  children,
  className = "",
  strength = 0.3,
  onClick,
  href,
  size = "md",
  iconName,
  customBackgroundColor,
  customTextColor,
  openInNewTab,
}: MagneticButtonProps): ReactElement {
  const ref = useRef<HTMLAnchorElement | HTMLButtonElement | null>(null);
  const motionOk = useMotionPreference();
  const setRef = (element: HTMLAnchorElement | HTMLButtonElement | null) => {
    ref.current = element;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!motionOk.current) return;
    const el = ref.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;

    gsap.to(el, {
      x: x * strength,
      y: y * strength,
      duration: 0.4,
      ease: EASE.outQuad,
    });
  };

  const handleMouseLeave = () => {
    const el = ref.current;
    if (!el) return;

    gsap.to(el, {
      x: 0,
      y: 0,
      duration: 0.6,
      ease: EASE.outElastic,
    });
  };

  const baseClassName = cn(
    "relative inline-flex items-center justify-center gap-2 overflow-hidden border border-accent/40 bg-transparent font-heading uppercase tracking-[0.18em] text-accent transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    sizeClasses[size],
    className,
  );

  // React Compiler 対応: スプレッド合成のみ（Object.assign 禁止）
  const inlineStyle: CSSProperties = {
    ...(customBackgroundColor && { backgroundColor: customBackgroundColor }),
    ...(customTextColor && { color: customTextColor }),
  };
  const hasInlineStyle =
    Boolean(customBackgroundColor) || Boolean(customTextColor);

  // createElement 経由で動的解決する（render 中の JSX <Icon /> は
  // react-hooks/static-components 違反になるため避ける）。
  const ResolvedIcon = resolveTablerIcon(iconName);
  const iconNode = ResolvedIcon
    ? createElement(ResolvedIcon, {
        className: iconSizeClasses[size],
        "aria-hidden": true,
      })
    : null;

  if (href) {
    return (
      <Link
        ref={setRef}
        href={href}
        className={baseClassName}
        {...(hasInlineStyle && { style: inlineStyle })}
        {...(openInNewTab && {
          target: "_blank",
          rel: "noopener noreferrer",
        })}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {iconNode}
        {children}
      </Link>
    );
  }

  return (
    <button
      ref={setRef}
      type="button"
      className={baseClassName}
      {...(hasInlineStyle && { style: inlineStyle })}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {iconNode}
      {children}
    </button>
  );
}
