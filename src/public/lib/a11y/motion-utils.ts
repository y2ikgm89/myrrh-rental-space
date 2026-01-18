/**
 * モーション設定ユーティリティ
 *
 * prefers-reduced-motion 対応のためのヘルパー関数
 */

/**
 * CSS メディアクエリ文字列
 * グローバルCSSに追加する設定
 */
export const REDUCED_MOTION_CSS = `
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
`

/**
 * クライアントサイドでreduced-motion設定を取得
 * Server Componentでは使用不可
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * reduced-motionに基づいてアニメーション時間を返す
 * @param duration - 通常のアニメーション時間（ms）
 * @returns reduced-motion時は0、それ以外は元の値
 */
export function getAnimationDuration(duration: number): number {
  if (typeof window === 'undefined') return duration
  return prefersReducedMotion() ? 0 : duration
}
