'use client'

/**
 * ARIAライブリージョンContext
 *
 * スクリーンリーダー向けの動的コンテンツ通知システム
 * フォーム送信結果などをスクリーンリーダーに伝達する
 */

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  type ReactElement,
} from 'react'
import type { AriaLivePoliteness } from '@/lib/a11y'

interface AriaLiveContextValue {
  message: string
  politeness: AriaLivePoliteness
  announce: (message: string, politeness?: AriaLivePoliteness) => void
  clear: () => void
}

const AriaLiveContext = createContext<AriaLiveContextValue | undefined>(
  undefined
)

interface AriaLiveProviderProps {
  children: ReactNode
}

/**
 * ARIAライブリージョンProvider
 *
 * React 19: FC型は非推奨。通常の関数コンポーネントを使用
 */
export function AriaLiveProvider({ children }: AriaLiveProviderProps): ReactElement {
  const [message, setMessage] = useState('')
  const [politeness, setPoliteness] = useState<AriaLivePoliteness>('polite')

  const announce = (
    newMessage: string,
    newPoliteness: AriaLivePoliteness = 'polite'
  ) => {
    // 一度クリアしてから設定することで、同じメッセージでも再読み上げされる
    setMessage('')
    // 次のフレームで設定（スクリーンリーダーに確実に通知するため）
    requestAnimationFrame(() => {
      setMessage(newMessage)
      setPoliteness(newPoliteness)
    })
  }

  const clear = () => {
    setMessage('')
  }

  return (
    <AriaLiveContext.Provider value={{ message, politeness, announce, clear }}>
      {children}
    </AriaLiveContext.Provider>
  )
}

/**
 * ARIAライブリージョンHook
 * @throws AriaLiveProvider外で使用した場合にエラー
 */
export function useAriaLive(): AriaLiveContextValue {
  const context = useContext(AriaLiveContext)
  if (!context) {
    throw new Error('useAriaLive must be used within AriaLiveProvider')
  }
  return context
}

/**
 * ARIAライブリージョンHook（オプショナル）
 * Provider外で使用してもエラーにならない
 */
export function useAriaLiveOptional(): AriaLiveContextValue | null {
  return useContext(AriaLiveContext) ?? null
}
