/**
 * Shared animation constants for public pages
 *
 * Medium intensity: SplitText + Parallax + MagneticButton (no pinning)
 */

/** Standard durations (seconds) */
export const DURATION = {
  fast: 0.3,
  normal: 0.6,
  slow: 0.8,
  xslow: 1.2,
  hero: 1.5,
} as const

/** Standard easing curves (GSAP format) */
export const EASE = {
  /** Smooth deceleration — general entrance */
  outExpo: 'expo.out',
  /** Natural deceleration — text reveals */
  outQuart: 'power4.out',
  /** Smooth entrance/exit — scroll-linked animations */
  inOutQuart: 'quart.inOut',
  /** Elastic return — magnetic button snap-back */
  outElastic: 'elastic.out(1, 0.3)',
  /** Linear — scroll-scrubbed animations */
  none: 'none',
} as const

/** Stagger presets */
export const STAGGER = {
  /** Character-by-character text reveal */
  char: 0.03,
  /** Word-by-word text reveal */
  word: 0.08,
  /** Line-by-line text reveal */
  line: 0.15,
  /** Card grid stagger */
  card: 0.12,
  /** General element stagger */
  element: 0.1,
} as const

/** ScrollTrigger preset configurations */
export const SCROLL_TRIGGER = {
  /** Standard reveal — element enters viewport */
  reveal: {
    start: 'top 85%',
    end: 'top 20%',
    toggleActions: 'play none none none' as const,
  },
  /** Scrub animation — tied to scroll position */
  scrub: {
    start: 'top bottom',
    end: 'bottom top',
    scrub: 1,
  },
} as const

/** Parallax speed presets */
export const PARALLAX = {
  /** Subtle background movement */
  subtle: 0.3,
  /** Standard parallax */
  normal: 0.5,
} as const
