'use client'

import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { useLenis } from 'lenis/react'
import type { ScrollState } from './types'

const INITIAL_STATE: ScrollState = {
  scroll: 0,
  limit: 0,
  velocity: 0,
  progress: 0,
  direction: 0,
  isScrolling: false,
}

const ScrollStateContext = createContext<ScrollState | undefined>(undefined)

/**
 * ScrollState を取得する hook。
 * ScrollOrchestratorProvider 内で使用必須。
 */
export function useScrollState(): ScrollState {
  const state = useContext(ScrollStateContext)
  if (state === undefined) {
    throw new Error('useScrollState must be used within ScrollOrchestratorProvider')
  }
  return state
}

/**
 * ScrollState を取得する hook（Provider外ではnull）。
 * エフェクトコンポーネントでオプショナルに使用。
 */
export function useScrollStateOptional(): ScrollState | null {
  return useContext(ScrollStateContext) ?? null
}

export function ScrollOrchestratorProvider({ children }: { children: ReactNode }) {
  const [scrollState, setScrollState] = useState<ScrollState>(INITIAL_STATE)

  useLenis((lenis) => {
    setScrollState({
      scroll: lenis.scroll,
      limit: lenis.limit,
      velocity: lenis.velocity,
      progress: lenis.progress,
      direction: lenis.direction,
      isScrolling: lenis.isScrolling === true,
    })
  })

  return (
    <ScrollStateContext.Provider value={scrollState}>
      {children}
    </ScrollStateContext.Provider>
  )
}
