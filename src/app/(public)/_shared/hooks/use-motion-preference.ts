'use client'

import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import { gsap } from '@/public/lib/gsap-config'

/**
 * useMotionPreference — Reactive reduced-motion check via gsap.matchMedia()
 *
 * Returns a ref whose `.current` is `true` when the user has no motion
 * preference (animations OK), and `false` when prefers-reduced-motion is active.
 *
 * Automatically updates if the OS setting changes mid-session.
 * Use in event handlers: `if (!motionOkRef.current) return`
 */
export function useMotionPreference(): React.RefObject<boolean> {
  const motionOkRef = useRef(true)

  useGSAP(() => {
    const mm = gsap.matchMedia()
    mm.add('(prefers-reduced-motion: reduce)', () => {
      motionOkRef.current = false
      return () => {
        motionOkRef.current = true
      }
    })
  })

  return motionOkRef
}
