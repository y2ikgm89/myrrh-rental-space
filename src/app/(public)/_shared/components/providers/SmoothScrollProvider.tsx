'use client'

/**
 * Lenis Smooth Scroll Provider
 *
 * Lenis インスタンスを直接管理し、lenis/react の LenisContext を提供。
 * 消費側は useLenis() をそのまま使用可能:
 *
 *   import { useLenis } from 'lenis/react'
 *   const lenis = useLenis()
 *   useLenis((lenis) => { ... })  // scroll callback
 *
 * Lenis 公式推奨の GSAP 統合パターン:
 *   autoRaf: false — GSAP ticker が Lenis の RAF を駆動
 *   lenis.on('scroll', ScrollTrigger.update) — ScrollTrigger との同期
 *   gsap.ticker.lagSmoothing(0) — ラグ補正無効化
 *   gsap.config({ autoSleep: 0 }) — ticker のスリープを防止
 *
 * ReactLenis は使用しない。LenisContext を直接提供し useLenis() との互換性を維持。
 */

import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import Lenis from 'lenis'
import type { ScrollCallback } from 'lenis'
import { LenisContext, type LenisContextValue } from 'lenis/react'
import { gsap, ScrollTrigger, prefersReducedMotion } from '@/public/lib/gsap-config'

interface LenisStore {
  value: LenisContextValue | null
  listeners: Set<() => void>
}

function notifyListeners(store: LenisStore): void {
  for (const listener of store.listeners) {
    listener()
  }
}

export function SmoothScrollProvider({ children }: { children: ReactNode }) {
  const callbacksRef = useRef<Array<{ callback: ScrollCallback; priority: number }>>([])
  const storeRef = useRef<LenisStore>({ value: null, listeners: new Set() })

  const subscribe = (listener: () => void) => {
    storeRef.current.listeners.add(listener)
    return () => {
      storeRef.current.listeners.delete(listener)
    }
  }

  const getSnapshot = (): LenisContextValue | null => {
    return storeRef.current.value
  }

  const getServerSnapshot = (): LenisContextValue | null => {
    return null
  }

  const contextValue = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  useEffect(() => {
    if (prefersReducedMotion()) return

    const store = storeRef.current
    const lenis = new Lenis({ duration: 1.2 })

    // ScrollTrigger との同期（Lenis 公式推奨）
    lenis.on('scroll', ScrollTrigger.update)

    // useLenis(callback) で登録されたコールバックを dispatch
    lenis.on('scroll', () => {
      for (let i = 0; i < callbacksRef.current.length; i++) {
        callbacksRef.current[i]?.callback(lenis)
      }
    })

    // GSAP ticker で Lenis の RAF を駆動（Lenis 公式推奨パターン）
    const tickerCallback = (time: number) => {
      lenis.raf(time * 1000)
    }
    gsap.ticker.add(tickerCallback)
    gsap.ticker.lagSmoothing(0)
    gsap.config({ autoSleep: 0 })

    const addCallback = (callback: ScrollCallback, priority: number) => {
      callbacksRef.current.push({ callback, priority })
      callbacksRef.current.sort((a, b) => a.priority - b.priority)
    }

    const removeCallback = (callback: ScrollCallback) => {
      callbacksRef.current = callbacksRef.current.filter((cb) => cb.callback !== callback)
    }

    store.value = { lenis, addCallback, removeCallback }
    notifyListeners(store)

    // Lenis 初期化後に ScrollTrigger のトリガー位置を再計算
    ScrollTrigger.refresh()

    // 動的コンテンツ（遅延画像・Suspense 解決等）による高さ変化を検知し
    // ScrollTrigger のトリガー位置を自動再計算（GSAP 公式推奨: refresh(true) = 安全モード）
    let refreshTimer: ReturnType<typeof setTimeout> | null = null
    const ro = new ResizeObserver(() => {
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => {
        ScrollTrigger.refresh(true)
      }, 200)
    })
    ro.observe(document.body)

    return () => {
      ro.disconnect()
      if (refreshTimer) clearTimeout(refreshTimer)
      gsap.ticker.remove(tickerCallback)
      lenis.destroy()
      store.value = null
      notifyListeners(store)
    }
  }, [])

  return (
    <LenisContext value={contextValue}>
      {children}
    </LenisContext>
  )
}
