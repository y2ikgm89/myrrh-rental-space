'use client'

/**
 * ParallaxImage — Parallax scrolling image
 *
 * Image moves at a different rate than scroll, creating depth.
 * Uses GSAP ScrollTrigger scrub for smooth motion.
 * Overflow-hidden container clips the oversized image.
 */

import { useRef, type ReactElement } from 'react'
import Image from 'next/image'
import { useGSAP } from '@gsap/react'
import { gsap } from '@/public/lib/gsap-config'
import { PARALLAX, SCROLL_TRIGGER } from '@/public/lib/animations'

interface ParallaxImageProps {
  readonly src: string
  readonly alt: string
  readonly className?: string
  readonly speed?: number
}

export function ParallaxImage({
  src,
  alt,
  className = '',
  speed = PARALLAX.normal,
}: ParallaxImageProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const container = containerRef.current
      const image = imageRef.current
      if (!container || !image) return

      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        // Scale up slightly to allow room for parallax movement
        gsap.set(image, { scale: 1.15 })

        const yDistance = speed * 100

        gsap.fromTo(
          image,
          { y: -yDistance },
          {
            y: yDistance,
            ease: 'none',
            scrollTrigger: {
              trigger: container,
              ...SCROLL_TRIGGER.scrub,
            },
          },
        )
      })
    },
    { scope: containerRef, dependencies: [speed] },
  )

  return (
    <div ref={containerRef} className={`overflow-hidden ${className}`}>
      <div ref={imageRef} className="h-full w-full">
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-cover"
        />
      </div>
    </div>
  )
}
