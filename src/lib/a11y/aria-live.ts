/**
 * ARIA ライブリージョン設定
 *
 * スクリーンリーダー向けの動的コンテンツ通知システム
 */

export type AriaLivePoliteness = 'off' | 'polite' | 'assertive'
export type AriaLiveRole = 'status' | 'alert' | 'log' | 'progressbar'

export interface AriaLiveAnnouncement {
  message: string
  politeness: AriaLivePoliteness
  role?: AriaLiveRole
}

interface AriaLivePreset {
  politeness: AriaLivePoliteness
  role: AriaLiveRole
}

/**
 * ライブリージョンの推奨設定
 */
export const ARIA_LIVE_PRESETS: Record<string, AriaLivePreset> = {
  /** 成功メッセージ（次の発話タイミングで通知） */
  success: {
    politeness: 'polite',
    role: 'status',
  },
  /** エラーメッセージ（即座に通知） */
  error: {
    politeness: 'assertive',
    role: 'alert',
  },
  /** 情報メッセージ */
  info: {
    politeness: 'polite',
    role: 'status',
  },
  /** 警告メッセージ */
  warning: {
    politeness: 'polite',
    role: 'alert',
  },
}

/**
 * ライブリージョン用CSSクラス
 * 視覚的には非表示だがスクリーンリーダーには読み上げられる
 */
export const ARIA_LIVE_REGION_CLASSES = 'sr-only'
