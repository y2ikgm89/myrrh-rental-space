"use client";

/**
 * MagneticButton — Mouse-following magnetic hover effect
 *
 * Subtly follows cursor when hovered, snaps back with elastic ease.
 * Supports both <a> and <button> elements.
 *
 * `label` (PortableTextSpan[]) でテキスト + アイコンの混在ラベルを描画する。
 */

import {
  useRef,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import Link from "next/link";
import { PortableTextSpans } from "@/shared/components/portable-text/PortableTextSpans";
import { gsap } from "@/public/lib/gsap-config";
import { useMotionPreference } from "@/public/hooks/use-motion-preference";
import { EASE } from "@/public/lib/animations";
import type { Route } from "next";
import { cn } from "@/shared/lib/cn";
import type { PortableTextSpan } from "@/shared/lib/portable-text";

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

interface MagneticButtonBaseProps {
  readonly className?: string;
  readonly strength?: number;
  readonly onClick?: () => void;
  readonly href?: Route;
  readonly size?: MagneticButtonSize;
  readonly customBackgroundColor?: string;
  readonly customTextColor?: string;
  readonly openInNewTab?: boolean;
}

interface LabelMode extends MagneticButtonBaseProps {
  readonly label: PortableTextSpan[];
  readonly children?: never;
}

interface ChildrenMode extends MagneticButtonBaseProps {
  readonly label?: never;
  readonly children: ReactNode;
}

type MagneticButtonProps = LabelMode | ChildrenMode;

export function MagneticButton(props: MagneticButtonProps): ReactElement {
  const {
    className = "",
    strength = 0.3,
    onClick,
    href,
    size = "md",
    customBackgroundColor,
    customTextColor,
    openInNewTab,
  } = props;
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

  // 視覚スタイルは公開ページ共通の Button variant="editorial" と一致させる
  // （border-foreground / text-foreground / sans）。マグネット動作のみ MagneticButton 固有。
  const baseClassName = cn(
    "relative inline-flex items-center justify-center gap-2 overflow-hidden border border-foreground bg-transparent text-foreground transition-colors duration-300 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    sizeClasses[size],
    className,
  );

  const inlineStyle: CSSProperties = {
    ...(customBackgroundColor && { backgroundColor: customBackgroundColor }),
    ...(customTextColor && { color: customTextColor }),
  };
  const hasInlineStyle =
    Boolean(customBackgroundColor) || Boolean(customTextColor);

  // PortableTextSpan[] の空配列 `[]` も truthy のため `props.label.length > 0`
  // で gate しないと <PortableTextSpans spans={[]}> が何も render せず button
  // text が empty になり Lighthouse link-name / WCAG 4.1.2 violation に至る。
  const content =
    "label" in props && props.label !== undefined && props.label.length > 0 ? (
      <PortableTextSpans
        spans={props.label}
        iconClassName={iconSizeClasses[size]}
      />
    ) : (
      props.children
    );

  if (href) {
    return (
      <Link
        ref={setRef}
        href={href}
        className={baseClassName}
        {...(hasInlineStyle && { style: inlineStyle })}
        {...(openInNewTab && { target: "_blank" as const })}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {content}
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
      {content}
    </button>
  );
}
