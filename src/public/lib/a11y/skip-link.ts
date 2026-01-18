/**
 * スキップリンク設定
 *
 * キーボードナビゲーション改善のためのスキップリンク定義
 */

export interface SkipLinkTarget {
  id: string
  label: string
}

/**
 * デフォルトのスキップリンクターゲット
 */
export const DEFAULT_SKIP_TARGETS: SkipLinkTarget[] = [
  { id: 'main-content', label: 'メインコンテンツへスキップ' },
]

/**
 * スキップリンクのスタイルクラス
 * - 通常: スクリーンリーダー専用（視覚的に非表示）
 * - フォーカス時: 表示されて操作可能
 */
export const SKIP_LINK_CLASSES = {
  base: [
    'sr-only',
    'focus:not-sr-only',
    'focus:absolute',
    'focus:top-4',
    'focus:left-4',
    'focus:z-[100]',
    'focus:px-4',
    'focus:py-2',
    'focus:bg-primary',
    'focus:text-primary-foreground',
    'focus:rounded-md',
    'focus:shadow-lg',
    'focus:outline-none',
    'focus:ring-2',
    'focus:ring-ring',
    'focus:ring-offset-2',
  ].join(' '),
}
