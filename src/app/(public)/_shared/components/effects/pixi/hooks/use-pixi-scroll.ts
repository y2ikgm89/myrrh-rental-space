'use client'

import { useRef } from 'react'
import type { RefObject } from 'react'
import { useLenis } from 'lenis/react'
import type { ScrollState } from '../../core/types'

const INITIAL_SCROLL_STATE: ScrollState = {
  scroll: 0,
  limit: 0,
  velocity: 0,
  progress: 0,
  direction: 0,
  isScrolling: false,
}

/**
 * Lenis に直接購読し、mutable ref に書き込む。
 * React state を使わないため再レンダリングゼロ。
 * PixiJS ticker 内で ref.current を読み取る。
 */
export function usePixiScroll(): RefObject<ScrollState> {
  const ref = useRef<ScrollState>(INITIAL_SCROLL_STATE)

  useLenis((lenis) => {
    ref.current = {
      scroll: lenis.scroll,
      limit: lenis.limit,
      velocity: lenis.velocity,
      progress: lenis.progress,
      direction: lenis.direction === 1 ? 1 : lenis.direction === -1 ? -1 : 0,
      isScrolling: lenis.isScrolling === true,
    }
  })

  return ref
}
