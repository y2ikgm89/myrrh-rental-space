'use client'

/**
 * ScrollReveal — Scroll-triggered reveal animation
 *
 * Wraps children and animates them into view on scroll.
 * Supports stagger for child elements with data-reveal attribute.
 */

import { useRef, type ReactElement, type ReactNode } from 'react'
import { useGSAP } from '@gsap/react'
import { gsap } from '@/public/lib/gsap-config'
import { DURATION, EASE, STAGGER, SCROLL_TRIGGER } from '@/public/lib/animations'

interface ScrollRevealProps {
  readonly children: ReactNode
  readonly className?: string
  /** Animate child elements with [data-reveal] individually */
  readonly stagger?: boolean
  readonly delay?: number
  readonly distance?: number
}

export function ScrollReveal({
  children,
  className,
  stagger = false,
  delay = 0,
  distance = 40,
}: ScrollRevealProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const container = containerRef.current
      if (!container) return

      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        if (stagger) {
          const targets = container.querySelectorAll('[data-reveal]')
          if (targets.length === 0) return

          gsap.fromTo(
            targets,
            { y: distance, opacity: 0 },
            {
              y: 0,
              opacity: 1,
              duration: DURATION.slow,
              ease: EASE.outQuart,
              stagger: STAGGER.element,
              delay,
              scrollTrigger: {
                trigger: container,
                ...SCROLL_TRIGGER.reveal,
              },
            },
          )
        } else {
          gsap.fromTo(
            container,
            { y: distance, opacity: 0 },
            {
              y: 0,
              opacity: 1,
              duration: DURATION.slow,
              ease: EASE.outQuart,
              delay,
              scrollTrigger: {
                trigger: container,
                ...SCROLL_TRIGGER.reveal,
              },
            },
          )
        }
      })
    },
    { scope: containerRef, dependencies: [stagger, delay, distance] },
  )

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  )
}
