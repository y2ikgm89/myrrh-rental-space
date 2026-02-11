'use client'

/**
 * SplitText — Character/word/line scroll reveal animation
 *
 * Splits text into segments and animates them with stagger.
 * Uses GSAP ScrollTrigger for scroll-linked entrance.
 */

import { useRef, type ReactElement } from 'react'
import { useGSAP } from '@gsap/react'
import { gsap } from '@/public/lib/gsap-config'
import { DURATION, EASE, STAGGER } from '@/public/lib/animations'

interface SplitTextProps {
  readonly children: string
  readonly className?: string
  readonly variant?: 'chars' | 'words' | 'lines'
  readonly delay?: number
  /** Whether to use ScrollTrigger. When false, animates immediately. */
  readonly trigger?: boolean
}

export function SplitText({
  children,
  className,
  variant = 'chars',
  delay = 0,
  trigger = true,
}: SplitTextProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)

  const segments = (() => {
    if (variant === 'chars') {
      return children.split('').map((char, i) => ({
        key: `${i}-${char}`,
        content: char === ' ' ? '\u00A0' : char,
      }))
    }
    if (variant === 'words') {
      return children.split(' ').map((word, i) => ({
        key: `${i}-${word}`,
        content: word,
      }))
    }
    return children.split('\n').map((line, i) => ({
      key: `${i}-${line}`,
      content: line,
    }))
  })()

  const staggerAmount =
    variant === 'chars'
      ? STAGGER.char
      : variant === 'words'
        ? STAGGER.word
        : STAGGER.line

  useGSAP(
    () => {
      const container = containerRef.current
      if (!container) return

      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const targets = container.querySelectorAll('[data-split-segment]')
        if (targets.length === 0) return

        const fromVars: gsap.TweenVars = { y: 30, opacity: 0 }
        const toVars: gsap.TweenVars = {
          y: 0,
          opacity: 1,
          duration: DURATION.slow,
          ease: EASE.outQuart,
          stagger: staggerAmount,
          delay,
        }

        if (trigger) {
          gsap.fromTo(targets, fromVars, {
            ...toVars,
            scrollTrigger: {
              trigger: container,
              start: 'top 85%',
              toggleActions: 'play none none none',
            },
          })
        } else {
          gsap.fromTo(targets, fromVars, toVars)
        }
      })
    },
    { scope: containerRef, dependencies: [trigger, delay, staggerAmount] },
  )

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        display: variant === 'lines' ? 'block' : 'inline-flex',
        flexWrap: variant !== 'lines' ? 'wrap' : undefined,
      }}
    >
      <span className="sr-only">{children}</span>
      {segments.map((segment) => (
        <span
          key={segment.key}
          data-split-segment=""
          className="inline-block"
          aria-hidden="true"
        >
          {segment.content}
          {variant === 'words' && <span>&nbsp;</span>}
        </span>
      ))}
    </div>
  )
}
