/**
 * Shared animation constants for public pages
 *
 * Medium intensity: SplitText + Parallax + MagneticButton (no pinning)
 */

// ---------------------------------------------------------------------------
// Duration
// ---------------------------------------------------------------------------

/** Standard durations (seconds) */
export const DURATION = {
  fast: 0.3,
  normal: 0.6,
  slow: 0.8,
  /** Hero entrance — Page-First / Hero 系で統一 */
  hero: 1.2,
} as const;

// ---------------------------------------------------------------------------
// Easing
// ---------------------------------------------------------------------------

/** Standard easing curves (GSAP format) */
export const EASE = {
  // Simplified aliases (preferred for new Page-First pages)
  out: "power3.out",
  inOut: "power2.inOut",
  elastic: "elastic.out(1, 0.3)",

  // Full set（ScrollReveal / セクション演出のバリエーション用）
  /** Smooth deceleration — general entrance */
  outExpo: "expo.out",
  /** Medium deceleration — UI interactions, overlays */
  outQuad: "power2.out",
  /** Medium acceleration — exit animations */
  inQuad: "power2.in",
  /** Strong deceleration — staggered element entrance */
  outCubic: "power3.out",
  /** Natural deceleration — text reveals */
  outQuart: "power4.out",
  /** Smooth entrance/exit — scroll-linked animations */
  inOutQuart: "quart.inOut",
  /** Gentle oscillation — looping indicators */
  inOutSine: "sine.inOut",
  /** Elastic return — magnetic button snap-back */
  outElastic: "elastic.out(1, 0.3)",
  /** Linear — scroll-scrubbed animations */
  none: "none",
} as const;

// ---------------------------------------------------------------------------
// Stagger
// ---------------------------------------------------------------------------

/** Stagger presets */
export const STAGGER = {
  /** Character-by-character text reveal */
  char: 0.03,
  /** Word-by-word text reveal (new: 0.06) */
  word: 0.08,
  /** Line-by-line text reveal */
  line: 0.15,
  /** Card grid stagger */
  card: 0.12,
  /** General element stagger */
  element: 0.1,
} as const;

// ---------------------------------------------------------------------------
// ScrollTrigger
// ---------------------------------------------------------------------------

/** ScrollTrigger preset configurations */
export const SCROLL_TRIGGER = {
  /** Standard reveal — element enters viewport */
  reveal: {
    start: "top 85%",
    toggleActions: "play none none none",
  },
  /** Scrub animation — tied to scroll position */
  scrub: {
    start: "top bottom",
    end: "bottom top",
    scrub: 1,
  },
} as const;

// ---------------------------------------------------------------------------
// Parallax
// ---------------------------------------------------------------------------

/** Parallax speed presets */
export const PARALLAX = {
  /** Subtle background movement */
  subtle: 0.3,
  /** Standard parallax */
  normal: 0.5,
} as const;

// ---------------------------------------------------------------------------
// Reveal
// ---------------------------------------------------------------------------

/** Reveal animation presets */
export const REVEAL = {
  /** Image clip-path reveal */
  clipPath: {
    from: "inset(0 100% 0 0)",
    to: "inset(0 0% 0 0)",
  },
  /** Scroll-triggered fade up */
  fadeUp: {
    y: 40,
    opacity: 0,
  },
} as const;

// ---------------------------------------------------------------------------
// Magnetic
// ---------------------------------------------------------------------------

/** Magnetic button interaction presets */
export const MAGNETIC = {
  strength: 0.3,
  ease: "elastic.out(1, 0.3)",
} as const;

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

export type Duration = (typeof DURATION)[keyof typeof DURATION];
export type Ease = (typeof EASE)[keyof typeof EASE];
