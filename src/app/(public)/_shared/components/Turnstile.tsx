'use client'

/**
 * Cloudflare Turnstile コンポーネント
 *
 * Site KeyはDBから取得され、propsで渡されます。
 * 環境変数は不要です。
 */

import { useEffect, useRef } from 'react'
import { logger } from '@/shared/lib/logger'

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: {
          sitekey: string
          callback: (token: string) => void
          'error-callback'?: () => void
          'expired-callback'?: () => void
          theme?: 'light' | 'dark' | 'auto'
          size?: 'normal' | 'compact'
        }
      ) => string
      reset: (widgetId: string) => void
      remove: (widgetId: string) => void
    }
  }
}

type Props = {
  siteKey: string
  onVerify: (token: string) => void
  onError?: () => void
  onExpire?: () => void
  theme?: 'light' | 'dark' | 'auto'
  size?: 'normal' | 'compact'
  className?: string
}

export function Turnstile({
  siteKey,
  onVerify,
  onError,
  onExpire,
  theme = 'auto',
  size = 'normal',
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!siteKey) {
      logger.warn('Turnstile site key is not provided')
      return
    }

    // Load the Turnstile script
    const scriptId = 'cf-turnstile-script'
    let script = document.getElementById(scriptId) as HTMLScriptElement | null

    if (!script) {
      script = document.createElement('script')
      script.id = scriptId
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }

    const initWidget = () => {
      if (!containerRef.current || !window.turnstile) return

      // Remove existing widget if any
      if (widgetIdRef.current) {
        window.turnstile.remove(widgetIdRef.current)
      }

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token: string) => onVerify(token),
        'error-callback': () => onError?.(),
        'expired-callback': () => onExpire?.(),
        theme,
        size,
      })
    }

    if (window.turnstile) {
      initWidget()
    } else {
      script.addEventListener('load', initWidget)
    }

    // クリーンアップ時にリスナーとウィジェットを削除
    const scriptElement = script
    return () => {
      // イベントリスナーを削除
      scriptElement.removeEventListener('load', initWidget)

      // ウィジェットを削除
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current)
      }
    }
  }, [siteKey, onVerify, onError, onExpire, theme, size])

  return <div ref={containerRef} className={className} />
}
