"use client";

/**
 * MagneticButton — Mouse-following magnetic hover effect
 *
 * Subtly follows cursor when hovered, snaps back with elastic ease.
 * Supports both <a> and <button> elements.
 */

import { useRef, type ReactElement, type ReactNode } from "react";
import { gsap } from "@/public/lib/gsap-config";
import { useMotionPreference } from "@/public/hooks/use-motion-preference";
import { EASE } from "@/public/lib/animations";

interface MagneticButtonProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly strength?: number;
  readonly onClick?: () => void;
  readonly href?: string;
}

export function MagneticButton({
  children,
  className = "",
  strength = 0.3,
  onClick,
  href,
}: MagneticButtonProps): ReactElement {
  const ref = useRef<HTMLButtonElement & HTMLAnchorElement>(null);
  const motionOk = useMotionPreference();

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

  const baseClassName = `relative inline-flex items-center justify-center overflow-hidden border border-accent/40 bg-transparent px-8 py-3.5 font-heading text-xs uppercase tracking-[0.18em] text-accent transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background md:px-10 md:py-4 md:text-sm ${className}`;

  if (href) {
    return (
      <a
        ref={ref}
        href={href}
        className={baseClassName}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      ref={ref}
      type="button"
      className={baseClassName}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </button>
  );
}
