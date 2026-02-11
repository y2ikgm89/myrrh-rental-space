'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { DeviceCapabilities, EffectLevel, PerformanceBudget } from './types'
import { PERFORMANCE_BUDGETS, toEffectLevel } from './types'
import { detectDeviceCapabilities } from './device-capabilities'

interface VisualEffectsContextValue {
  capabilities: DeviceCapabilities | null
  effectLevel: EffectLevel
  budget: PerformanceBudget
  isReady: boolean
  degradeTo: (level: EffectLevel) => void
}

const VisualEffectsContext = createContext<VisualEffectsContextValue | undefined>(undefined)

/**
 * VisualEffects context を取得する hook。
 * VisualEffectsProvider 内で使用必須。
 */
export function useVisualEffects(): VisualEffectsContextValue {
  const ctx = useContext(VisualEffectsContext)
  if (ctx === undefined) {
    throw new Error('useVisualEffects must be used within VisualEffectsProvider')
  }
  return ctx
}

/**
 * VisualEffects context を取得する hook（Provider外ではnull）。
 */
export function useVisualEffectsOptional(): VisualEffectsContextValue | null {
  return useContext(VisualEffectsContext) ?? null
}

/** デフォルトレベル（GPU検出完了前） */
const DEFAULT_LEVEL: EffectLevel = 2

export function VisualEffectsProvider({ children }: { children: ReactNode }) {
  const [capabilities, setCapabilities] = useState<DeviceCapabilities | null>(null)
  const [effectLevel, setEffectLevel] = useState<EffectLevel>(DEFAULT_LEVEL)
  const [isReady, setIsReady] = useState(false)

  // GPU検出
  useEffect(() => {
    let cancelled = false

    detectDeviceCapabilities().then((caps) => {
      if (cancelled) return
      setCapabilities(caps)
      setEffectLevel(caps.effectLevel)
      setIsReady(true)
    })

    return () => {
      cancelled = true
    }
  }, [])

  // prefers-reduced-motion の動的監視
  useEffect(() => {
    if (typeof window === 'undefined') return

    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')

    const handleChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setEffectLevel(1)
        setCapabilities((prev) =>
          prev ? { ...prev, prefersReducedMotion: true, effectLevel: 1 } : null,
        )
      }
    }

    mql.addEventListener('change', handleChange)
    return () => mql.removeEventListener('change', handleChange)
  }, [])

  // 下方向のみレベル劣化（Math.min）
  const degradeTo = (level: EffectLevel) => {
    setEffectLevel((current) => toEffectLevel(Math.min(current, level)))
  }

  const value: VisualEffectsContextValue = {
    capabilities,
    effectLevel,
    budget: PERFORMANCE_BUDGETS[effectLevel],
    isReady,
    degradeTo,
  }

  return (
    <VisualEffectsContext.Provider value={value}>
      {children}
    </VisualEffectsContext.Provider>
  )
}
